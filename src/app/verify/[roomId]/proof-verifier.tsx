"use client";

import { useState } from "react";

import type { DrawProof } from "@/src/app/api/draws/[roomId]/verify/draw-engine";

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_DIGEST = /^[0-9a-f]{1,2048}$/;
// 2^256 as decimal, avoiding BigInt literals for the ES2017 build target.
const LIMIT_256 = BigInt(
  "115792089237316195423570985008687907853269984665640564039457584007913129639936",
);

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function assertHex(value: string, label: string): boolean {
  return HEX_DIGEST.test(value) || (console.warn(label + " is not a valid hex digest."), false);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function drawHmac(
  revealedSeed: string,
  blockHash: string,
  entrantDigests: readonly string[],
  nonce?: bigint,
): Promise<string> {
  let message = blockHash + ":" + [...entrantDigests].join(",");
  if (nonce !== undefined) {
    message += ":" + nonce.toString(16);
  }
  const key = await crypto.subtle.importKey("raw", hexToBytes(revealedSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyProofClient(proof: DrawProof): Promise<boolean> {
  try {
    if (
      !proof ||
      typeof proof !== "object" ||
      typeof proof.revealedSeed !== "string" ||
      typeof proof.blockHash !== "string" ||
      typeof proof.hmacDigest !== "string" ||
      typeof proof.winningIndex !== "number" ||
      !Number.isSafeInteger(proof.winningIndex) ||
      proof.winningIndex < 0 ||
      !Array.isArray(proof.entrantDigests) ||
      proof.entrantDigests.length === 0
    ) {
      return false;
    }
    if (!assertHex(proof.revealedSeed, "revealedSeed") || !assertHex(proof.blockHash, "blockHash") || !assertHex(proof.hmacDigest, "hmacDigest")) {
      return false;
    }
    if (new Set(proof.entrantDigests).size !== proof.entrantDigests.length) {
      return false;
    }
    for (const entrantDigest of proof.entrantDigests) {
      if (!assertHex(entrantDigest, "entrantDigest")) {
        return false;
      }
    }
    if (proof.seedHash !== undefined && (!HEX_64.test(proof.seedHash) || (await sha256Hex(proof.revealedSeed)) !== proof.seedHash.toLowerCase())) {
      return false;
    }

    const expectedDigest = await drawHmac(proof.revealedSeed, proof.blockHash, proof.entrantDigests);
    if (expectedDigest !== proof.hmacDigest) {
      return false;
    }

    const usableRange = LIMIT_256 - (LIMIT_256 % BigInt(proof.entrantDigests.length));
    const value = BigInt("0x" + expectedDigest);
    if (value >= usableRange) {
      return false;
    }
    return value % BigInt(proof.entrantDigests.length) === BigInt(proof.winningIndex);
  } catch {
    return false;
  }
}

export function ProofVerifier({ proof }: { proof: DrawProof }) {
  const [result, setResult] = useState<null | "failed" | "verified">(null);
  const [running, setRunning] = useState(false);

  async function runVerification() {
    setRunning(true);
    setResult(null);

    try {
      // Browser-native WebCrypto replay of the same algorithm the server ran,
      // so no Node-only crypto module enters the client bundle.
      const verified = await verifyProofClient(proof);
      setResult(verified ? "verified" : "failed");
    } catch {
      setResult("failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border p-5">
      <h2 className="font-semibold">Re-run proof verification</h2>
      <p className="mt-2 text-sm text-neutral-600">
        This independently replays the draw in your browser using WebCrypto.
      </p>
      <button
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        disabled={running}
        onClick={runVerification}
        type="button"
      >
        {running ? "Verifying..." : "Verify proof"}
      </button>
      {result ? (
        <p
          aria-live="polite"
          className={
            result === "verified"
              ? "mt-3 text-sm font-medium text-emerald-700"
              : "mt-3 text-sm font-medium text-red-700"
          }
        >
          {result === "verified" ? "Proof verified locally." : "Proof failed local verification."}
        </p>
      ) : null}
    </section>
  );
}
