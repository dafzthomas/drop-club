import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const entrant = v.object({
  ticketId: v.id("tickets"),
  ticketNumber: v.number(),
  userId: v.id("users"),
  userEmail: v.string(),
});

type CloseEntrant = {
  ticketId: Id<"tickets">;
  ticketNumber: number;
  userId: Id<"users">;
  userEmail: string;
};

export const createRoomRecord = internalMutation({
  args: {
    title: v.string(),
    prizeDescription: v.string(),
    perkDescription: v.string(),
    capacity: v.number(),
    pricePence: v.number(),
    closesAt: v.number(),
    createdBy: v.id("users"),
    serverSeed: v.string(),
    serverSeedHash: v.string(),
  },
  returns: v.object({ id: v.id("rooms") }),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("rooms", {
      title: args.title,
      prizeDescription: args.prizeDescription,
      perkDescription: args.perkDescription,
      capacity: args.capacity,
      pricePence: args.pricePence,
      state: "open",
      closesAt: args.closesAt,
      serverSeed: args.serverSeed,
      serverSeedHash: args.serverSeedHash,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });
    await ctx.db.insert("auditEvents", {
      actorUserId: args.createdBy,
      action: "room.created",
      entityType: "room",
      entityId: id,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const beginClose = internalMutation({
  args: {
    roomId: v.id("rooms"),
    actorUserId: v.optional(v.id("users")),
    blockHash: v.string(),
  },
  returns: v.object({
    status: v.string(),
    entrants: v.array(entrant),
    serverSeed: v.optional(v.string()),
    serverSeedHash: v.optional(v.string()),
    roomTitle: v.optional(v.string()),
    prizeDescription: v.optional(v.string()),
    perkDescription: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return { status: "room_not_found", entrants: [] };
    if (room.state !== "open") return { status: "room_not_open", entrants: [] };
    if (!room.serverSeed || !room.serverSeedHash) {
      return { status: "missing_seed_commitment", entrants: [] };
    }

    const roomTickets = await ctx.db
      .query("tickets")
      .withIndex("by_room_and_number", (q) => q.eq("roomId", args.roomId))
      .order("asc")
      .take(10001);
    const entrants: CloseEntrant[] = [];
    for (const ticket of roomTickets) {
      if (ticket.status !== "active") continue;
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
        .take(10);
      if (!payments.some((payment) => payment.status === "succeeded")) continue;
      const user = await ctx.db.get(ticket.userId);
      if (!user) continue;
      entrants.push({
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        userId: user._id,
        userEmail: user.email,
      });
    }
    if (entrants.length === 0) {
      return { status: "no_paid_tickets", entrants: [] };
    }

    await ctx.db.patch(args.roomId, { state: "closing" });
    await ctx.db.insert("auditEvents", {
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
      action: "room.closing",
      entityType: "room",
      entityId: args.roomId,
      metadata: { blockHash: args.blockHash },
      createdAt: Date.now(),
    });

    return {
      status: "ok",
      entrants,
      serverSeed: room.serverSeed,
      serverSeedHash: room.serverSeedHash,
      roomTitle: room.title,
      prizeDescription: room.prizeDescription,
      perkDescription: room.perkDescription,
    };
  },
});

export const abortClose = internalMutation({
  args: { roomId: v.id("rooms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (room?.state === "closing") {
      await ctx.db.patch(args.roomId, { state: "open" });
    }
    return null;
  },
});

export const finalizeClose = internalMutation({
  args: {
    roomId: v.id("rooms"),
    actorUserId: v.optional(v.id("users")),
    blockHash: v.string(),
    entrantsDigest: v.string(),
    hmacOutput: v.string(),
    winningIndex: v.number(),
    verifierCode: v.string(),
    revealedSeed: v.string(),
    seedHash: v.string(),
    winningTicketId: v.id("tickets"),
    perks: v.array(
      v.object({
        ticketId: v.id("tickets"),
        userId: v.id("users"),
        description: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.state !== "closing") {
      throw new Error("CLOSE_ERROR:room_not_open:Room is not closing.");
    }
    const existingDraw = await ctx.db
      .query("draws")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .unique();
    if (existingDraw) {
      throw new Error("CLOSE_ERROR:room_already_drawn:Room has already been drawn.");
    }

    await ctx.db.insert("draws", {
      roomId: args.roomId,
      serverSeed: args.revealedSeed,
      serverSeedHash: args.seedHash,
      blockHash: args.blockHash,
      entrantsDigest: args.entrantsDigest,
      hmacOutput: args.hmacOutput,
      winningIndex: args.winningIndex,
      verifierCode: args.verifierCode,
      executedAt: Date.now(),
    });
    await ctx.db.patch(args.roomId, {
      blockHash: args.blockHash,
      serverSeed: args.revealedSeed,
      serverSeedHash: args.seedHash,
      state: "drawn",
      winningTicketId: args.winningTicketId,
    });
    for (const perk of args.perks) {
      await ctx.db.insert("perks", {
        roomId: args.roomId,
        ticketId: perk.ticketId,
        userId: perk.userId,
        description: perk.description,
        claimed: false,
        createdAt: Date.now(),
      });
    }
    await ctx.db.insert("auditEvents", {
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
      action: "room.drawn",
      entityType: "room",
      entityId: args.roomId,
      metadata: {
        entrantCount: args.perks.length + 1,
        hmacOutput: args.hmacOutput,
        winningIndex: args.winningIndex,
        winningTicketId: args.winningTicketId,
      },
      createdAt: Date.now(),
    });
    return null;
  },
});
