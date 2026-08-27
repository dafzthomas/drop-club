import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { assertServiceSecret } from "./security";

const roomState = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closing"),
  v.literal("drawn"),
  v.literal("settled"),
);

const roomWithStats = v.object({
  id: v.id("rooms"),
  title: v.string(),
  prizeDescription: v.string(),
  perkDescription: v.string(),
  capacity: v.number(),
  pricePence: v.number(),
  state: roomState,
  closesAt: v.number(),
  serverSeedHash: v.optional(v.string()),
  serverSeed: v.optional(v.string()),
  blockHash: v.optional(v.string()),
  winningTicketId: v.optional(v.id("tickets")),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  ticketsSold: v.number(),
});

type PublicRoom = {
  id: Id<"rooms">;
  title: string;
  prizeDescription: string;
  perkDescription: string;
  capacity: number;
  pricePence: number;
  state: Doc<"rooms">["state"];
  closesAt: number;
  serverSeedHash?: string;
  serverSeed?: string;
  blockHash?: string;
  winningTicketId?: Id<"tickets">;
  createdBy?: Id<"users">;
  createdAt: number;
  ticketsSold: number;
};

function publicRoom(room: Doc<"rooms">, ticketsSold: number): PublicRoom {
  const result: PublicRoom = {
    id: room._id,
    title: room.title,
    prizeDescription: room.prizeDescription,
    perkDescription: room.perkDescription,
    capacity: room.capacity,
    pricePence: room.pricePence,
    state: room.state,
    closesAt: room.closesAt,
    createdAt: room.createdAt,
    ticketsSold,
  };
  if (room.serverSeedHash !== undefined) result.serverSeedHash = room.serverSeedHash;
  if (room.blockHash !== undefined) result.blockHash = room.blockHash;
  if (room.winningTicketId !== undefined) result.winningTicketId = room.winningTicketId;
  if (room.createdBy !== undefined) result.createdBy = room.createdBy;
  if (room.state === "drawn" || room.state === "settled") {
    if (room.serverSeed !== undefined) result.serverSeed = room.serverSeed;
  }
  return result;
}

async function ticketCount(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
): Promise<number> {
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(10001);
  return tickets.length;
}

export const listRoomsWithStats = query({
  args: { secret: v.string() },
  returns: v.array(roomWithStats),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_creation")
      .order("desc")
      .take(100);
    const result: PublicRoom[] = [];
    for (const room of rooms) {
      result.push(publicRoom(room, await ticketCount(ctx, room._id)));
    }
    return result;
  },
});

export const getRoomWithStats = query({
  args: { roomId: v.id("rooms"), secret: v.string() },
  returns: v.union(roomWithStats, v.null()),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    const room = await ctx.db.get(args.roomId);
    if (!room) return null;
    return publicRoom(room, await ticketCount(ctx, room._id));
  },
});

export const getLiveRoomState = query({
  args: { roomId: v.id("rooms"), secret: v.string() },
  returns: v.object({ ticketsSold: v.number(), state: v.string() }),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    const room = await ctx.db.get(args.roomId);
    return {
      ticketsSold: room ? await ticketCount(ctx, args.roomId) : 0,
      state: room?.state ?? "unknown",
    };
  },
});

export const verifyRoomDraw = query({
  args: { roomId: v.id("rooms"), secret: v.string() },
  returns: v.object({ proof: v.any() }),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    const draw = await ctx.db
      .query("draws")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .unique();
    if (!draw?.verifierCode) return { proof: null };
    try {
      return { proof: JSON.parse(draw.verifierCode) };
    } catch {
      return { proof: null };
    }
  },
});
