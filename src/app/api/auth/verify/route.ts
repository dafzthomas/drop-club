import { NextResponse } from "next/server";

import { consumeMagicLinkToken, ensureUser, startSession } from "@/src/lib/auth";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const result = await consumeMagicLinkToken(token);
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=invalid_or_expired", request.url));
  }

  const user = await ensureUser(result.email);
  await startSession(user.id);
  return NextResponse.redirect(new URL("/", request.url));
}
