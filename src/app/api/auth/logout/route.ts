import { NextResponse } from "next/server";

import { endSession } from "@/src/lib/auth";

export async function POST(request: Request) {
  await endSession();
  return NextResponse.redirect(new URL("/", request.url));
}
