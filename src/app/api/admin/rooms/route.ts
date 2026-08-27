import type { Id } from "@/convex/_generated/dataModel";
import { NextResponse } from "next/server";

import { api, convex, requireConvexApiSecret } from "@/src/lib/convex";
import { getCurrentUser } from "@/src/lib/auth";

type CreateRoomPayload = {
  title?: unknown;
  prizeDescription?: unknown;
  perkDescription?: unknown;
  capacity?: unknown;
  pricePence?: unknown;
  closesAt?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: CreateRoomPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const prizeDescription =
    typeof body.prizeDescription === "string" ? body.prizeDescription.trim() : "";
  const perkDescription =
    typeof body.perkDescription === "string" && body.perkDescription.trim().length > 0
      ? body.perkDescription.trim()
      : "Guaranteed perk credit for a future room.";
  const capacity = Number(body.capacity);
  const pricePence = Number(body.pricePence);
  const closesAtRaw = typeof body.closesAt === "string" ? body.closesAt : "";
  const closesAt = closesAtRaw ? new Date(closesAtRaw) : null;

  if (!title || !prizeDescription) {
    return NextResponse.json(
      { error: "Title and prize description are required." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    return NextResponse.json(
      { error: "Capacity must be a positive integer." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(pricePence) || pricePence < 1) {
    return NextResponse.json(
      { error: "Price must be a positive integer number of pence." },
      { status: 400 },
    );
  }
  if (!closesAt || Number.isNaN(closesAt.getTime())) {
    return NextResponse.json({ error: "A valid close time is required." }, { status: 400 });
  }

  const result = await convex.action(api.roomActions.createRoom, {
    capacity,
    closesAt: closesAt.getTime(),
    createdBy: user.id as Id<"users">,
    perkDescription,
    pricePence,
    prizeDescription,
    secret: requireConvexApiSecret(),
    title,
  });

  return NextResponse.json({ id: result.id }, { status: 201 });
}
