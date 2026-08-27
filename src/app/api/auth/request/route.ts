import { NextResponse } from "next/server";

import { createMagicLinkToken } from "@/src/lib/auth";

export async function POST(request: Request) {
  let email = "";
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = (await request.json()) as { email?: unknown };
      email = typeof body.email === "string" ? body.email.trim() : "";
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
  } else {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "").trim();
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const linkPath = await createMagicLinkToken(email);
  const origin = new URL(request.url).origin;

  // Dev-mode only: no email provider is wired up. The magic link is returned in
  // the response so it can be opened directly during local development.
  // TODO(auth): replace this response with a real transactional email send.
  return NextResponse.json({
    ok: true,
    devMagicLink: origin + linkPath,
  });
}
