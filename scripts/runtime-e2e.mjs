#!/usr/bin/env node

/**
 * Drop Club runtime evidence harness.
 *
 * Drives the real Next.js HTTP server against the configured Convex
 * development deployment. The harness intentionally uses the public HTTP
 * boundaries used by a browser: magic-link auth, admin room creation, guest
 * checkout, close/draw, and public proof verification.
 */

import { spawn } from "node:child_process";

const port = 3127;
const base = "http://127.0.0.1:" + port;
const children = [];
const evidence = [];

function record(step, status, extra = {}) {
  evidence.push({ step, status, ...extra });
}

async function fetchJson(path, options = {}) {
  const response = await fetch(base + path, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // The caller can still inspect the status for redirects or empty bodies.
  }
  return { body, response };
}

async function waitForServer(child) {
  const deadline = Date.now() + 60000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Next.js exited before becoming ready: " + child.exitCode);
    }
    try {
      const response = await fetch(base + "/login");
      if (response.status === 200) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js did not become ready: " + lastError);
}

function startServer() {
  const child = spawn("npm", ["run", "start", "--", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

async function buildApp() {
  const child = spawn("npm", ["run", "build"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Next.js build failed with code " + code + "\n" + output.slice(-4000)));
    });
  });
}

try {
  await buildApp();
  const server = startServer();
  await waitForServer(server);

  const adminAuth = await fetchJson("/api/auth/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com" }),
  });
  if (adminAuth.response.status !== 200 || !adminAuth.body?.devMagicLink) {
    throw new Error("Magic-link request failed");
  }
  record("magic-link-request", "passed", { status: adminAuth.response.status });

  const authVerify = await fetch(adminAuth.body.devMagicLink, {
    redirect: "manual",
  });
  const cookie = (authVerify.headers.get("set-cookie") ?? "").split(";")[0];
  if (authVerify.status !== 307 || !cookie) {
    throw new Error("Magic-link verification failed");
  }
  record("magic-link-verify", "passed", {
    status: authVerify.status,
    sessionCookie: true,
  });

  const roomCreate = await fetchJson("/api/admin/rooms", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Convex runtime room " + Date.now(),
      prizeDescription: "Runtime verification prize",
      perkDescription: "Guaranteed runtime perk credit",
      capacity: 3,
      pricePence: 100,
      closesAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  });
  if (roomCreate.response.status !== 201 || !roomCreate.body?.id) {
    throw new Error("Room creation failed");
  }
  const roomId = roomCreate.body.id;
  record("room-create", "passed", {
    status: roomCreate.response.status,
    roomId,
  });

  const roomPage = await fetch(base + "/rooms/" + roomId);
  const roomHtml = await roomPage.text();
  if (roomPage.status !== 200 || !roomHtml.includes("Published seed commitment")) {
    throw new Error("Room page did not expose the seed commitment");
  }
  record("seed-commitment-visible", "passed", { status: roomPage.status });

  const checkout = await fetchJson("/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomId,
      email: "guest-" + Date.now() + "@example.com",
    }),
  });
  if (
    checkout.response.status !== 200 ||
    !checkout.body?.developmentOnly ||
    !checkout.body?.ticketId
  ) {
    throw new Error("Development checkout failed");
  }
  record("dev-checkout", "passed", {
    status: checkout.response.status,
    ticketNumber: checkout.body.ticketNumber,
  });

  const close = await fetchJson("/api/admin/rooms/" + roomId + "/close", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ blockHash: "ab".repeat(32) }),
  });
  if (
    close.response.status !== 200 ||
    !close.body?.proof ||
    close.body.winningTicketId !== checkout.body.ticketId
  ) {
    throw new Error("Close/draw failed");
  }
  record("close-and-draw", "passed", {
    status: close.response.status,
    entrantCount: close.body.entrantCount,
    winningTicketNumber: close.body.winningTicketNumber,
  });

  const publicVerify = await fetchJson("/api/draws/" + roomId + "/verify");
  if (
    publicVerify.response.status !== 200 ||
    publicVerify.body?.verified !== true
  ) {
    throw new Error("Public proof verification failed");
  }
  record("public-proof-verification", "passed", {
    status: publicVerify.response.status,
    verified: publicVerify.body.verified,
    winningIndex: publicVerify.body.proof.winningIndex,
  });

  const verifyPage = await fetch(base + "/verify/" + roomId);
  const verifyHtml = await verifyPage.text();
  if (verifyPage.status !== 200 || !verifyHtml.includes("Verified")) {
    throw new Error("Verification page failed");
  }
  record("verify-page", "passed", { status: verifyPage.status });

  const live = await fetch(base + "/api/rooms/" + roomId + "/live");
  const liveReader = live.body.getReader();
  const firstChunk = await liveReader.read();
  await liveReader.cancel();
  const liveText = new TextDecoder().decode(
    firstChunk.value ?? new Uint8Array(),
  );
  if (live.status !== 200 || !liveText.includes("ticketsSold")) {
    throw new Error("Live room SSE failed");
  }
  record("live-room-sse", "passed", { status: live.status });

  const reused = await fetch(adminAuth.body.devMagicLink, {
    redirect: "manual",
  });
  if (reused.status !== 307) {
    throw new Error("Magic-link single-use check failed");
  }
  record("magic-link-single-use", "passed", { status: reused.status });

  console.log(JSON.stringify({ status: "passed", evidence }));
} finally {
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}
