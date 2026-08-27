import { NextResponse } from "next/server";

import { verifyRoomDraw } from "@/src/lib/draw-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const result = await verifyRoomDraw(roomId);

  if (!result.proof) {
    return NextResponse.json({ error: "Draw not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}
