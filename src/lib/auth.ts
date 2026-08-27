import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";

import type { Id } from "@/convex/_generated/dataModel";
import { api, convex, requireConvexApiSecret } from "@/src/lib/convex";

const SESSION_COOKIE = "drop_club_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAGIC_PEPPER = process.env.MAGIC_LINK_PEPPER ?? "dev-only-pepper";

type SessionPayload = { userId: string };

function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHash("sha256").update(body + MAGIC_PEPPER).digest("base64url");
  return body + "." + sig;
}

function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHash("sha256").update(body + MAGIC_PEPPER).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
  } catch {
    return null;
  }
}

export async function createMagicLinkToken(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const rawToken = nanoid(32);
  const tokenHash = createHash("sha256")
    .update(rawToken + MAGIC_PEPPER)
    .digest("hex");
  await convex.mutation(api.auth.createMagicLinkToken, {
    email: normalized,
    tokenHash,
    secret: requireConvexApiSecret(),
  });
  return "/api/auth/verify?token=" + encodeURIComponent(rawToken);
}

export async function consumeMagicLinkToken(
  rawToken: string,
): Promise<{ email: string } | null> {
  const tokenHash = createHash("sha256")
    .update(rawToken + MAGIC_PEPPER)
    .digest("hex");
  return convex.mutation(api.auth.consumeMagicLinkToken, {
    tokenHash,
    secret: requireConvexApiSecret(),
  });
}

export async function ensureUser(email: string) {
  const normalized = email.trim().toLowerCase();
  return convex.mutation(api.auth.ensureUser, {
    email: normalized,
    secret: requireConvexApiSecret(),
  });
}

export async function startSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signSession({ userId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  try {
    return await convex.query(api.auth.getUserById, {
      secret: requireConvexApiSecret(),
      userId: session.userId as Id<"users">,
    });
  } catch {
    return null;
  }
}
