import { NextResponse } from "next/server";

import { requireAdmin } from "@/src/lib/admin";
import { closeAndDrawRoom, CloseDrawError } from "@/src/lib/draw-service";

type CloseRoomPayload = {
  blockHash?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!(admin instanceof Response)) {
    const { id } = await context.params;

    let body: CloseRoomPayload = {};
    try {
      body = (await request.json()) as CloseRoomPayload;
    } catch {
      // An empty JSON object is valid for this MVP because blockHash remains
      // required; the service reports the precise validation error below.
    }

    try {
      const result = await closeAndDrawRoom(id, {
        actorUserId: admin.id,
        blockHash:
          typeof body.blockHash === "string" ? body.blockHash : "",
      });

      return NextResponse.json({
        entrantCount: result.entrantCount,
        perksCreated: result.perksCreated,
        proof: result.proof,
        roomId: result.roomId,
        winningIndex: result.winningIndex,
        winningTicketId: result.winningTicketId,
        winningTicketNumber: result.winningTicketNumber,
      });
    } catch (error) {
      if (error instanceof CloseDrawError) {
        return NextResponse.json(
          { code: error.code, error: error.message },
          { status: error.code === "room_not_found" ? 404 : 400 },
        );
      }

      throw error;
    }
  }
}
