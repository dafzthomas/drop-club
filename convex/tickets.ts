import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { assertServiceSecret } from "./security";

function inventoryError(status: number, message: string): never {
  throw new Error("TICKET_ERROR:" + status + ":" + message);
}

async function ensureUser(
  ctx: MutationCtx,
  email: string,
): Promise<Doc<"users"> | null> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("users", {
    email,
    isAdmin: false,
    createdAt: Date.now(),
  });
  return ctx.db.get(id);
}

async function insertAudit(
  ctx: MutationCtx,
  event: {
    actorUserId?: Id<"users">;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, string | number>;
  },
) {
  await ctx.db.insert("auditEvents", {
    actorUserId: event.actorUserId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
    createdAt: Date.now(),
  });
}

export const reserveTicket = mutation({
  args: {
    roomId: v.id("rooms"),
    email: v.string(),
    secret: v.string(),
  },
  returns: v.object({
    ticketId: v.id("tickets"),
    ticketNumber: v.number(),
    roomTitle: v.string(),
    roomPricePence: v.number(),
  }),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      inventoryError(400, "A valid email is required");
    }

    const room = await ctx.db.get(args.roomId);
    if (
      !room ||
      (room.state !== "open" && room.state !== "closing") ||
      room.closesAt <= Date.now()
    ) {
      inventoryError(409, "This room is not open for tickets");
    }

    const user = await ensureUser(ctx, email);
    if (!user) inventoryError(500, "Could not reserve a ticket");

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(10001);
    if (tickets.length >= room.capacity) {
      inventoryError(409, "This room is full");
    }
    const highestTicketNumber = tickets.reduce(
      (max: number, ticket) => Math.max(max, ticket.ticketNumber),
      0,
    );
    const ticketNumber = highestTicketNumber + 1;
    const ticketId = await ctx.db.insert("tickets", {
      roomId: args.roomId,
      userId: user._id,
      ticketNumber,
      status: "pending_payment",
      createdAt: Date.now(),
    });

    await insertAudit(ctx, {
      actorUserId: user._id,
      action: "ticket.reserved",
      entityType: "ticket",
      entityId: ticketId,
      metadata: { roomId: args.roomId, ticketNumber },
    });

    return {
      ticketId,
      ticketNumber,
      roomTitle: room.title,
      roomPricePence: room.pricePence,
    };
  },
});

async function settlePayment(ctx: MutationCtx, args: {
  ticketId: Id<"tickets">;
  provider: string;
  providerRef: string;
  amountPence: number;
  currency: string;
  verifyAmount: boolean;
}) {
  const ticket = await ctx.db.get(args.ticketId);
  if (!ticket) inventoryError(400, "Checkout ticket was not found");
  const room = await ctx.db.get(ticket.roomId);
  if (!room) inventoryError(400, "Checkout room was not found");

  const existing = await ctx.db
    .query("payments")
    .withIndex("by_provider_ref", (q) =>
      q.eq("provider", args.provider).eq("providerRef", args.providerRef),
    )
    .unique();
  if (existing && existing.ticketId === args.ticketId) {
    return {
      paymentId: existing._id,
      ticketId: args.ticketId,
      ticketStatus: ticket.status,
    };
  }
  if (existing) {
    inventoryError(409, "Payment reference belongs to another ticket");
  }
  if (args.verifyAmount && args.amountPence !== room.pricePence) {
    inventoryError(500, "Checkout amount does not match the room");
  }

  const paymentId = await ctx.db.insert("payments", {
    ticketId: args.ticketId,
    userId: ticket.userId,
    amountPence: args.amountPence,
    currency: args.currency.toLowerCase(),
    provider: args.provider,
    providerRef: args.providerRef,
    status: "succeeded",
    createdAt: Date.now(),
  });
  if (ticket.status === "pending_payment") {
    await ctx.db.patch(args.ticketId, { status: "active" });
  }

  await insertAudit(ctx, {
    actorUserId: ticket.userId,
    action: "ticket.payment_succeeded",
    entityType: "ticket",
    entityId: args.ticketId,
    metadata: { provider: args.provider, providerRef: args.providerRef },
  });
  return {
    paymentId,
    ticketId: args.ticketId,
    ticketStatus: "active",
  };
}

const settledPaymentReturns = v.object({
  paymentId: v.id("payments"),
  ticketId: v.id("tickets"),
  ticketStatus: v.string(),
});

export const settleStripeCheckout = mutation({
  args: {
    ticketId: v.id("tickets"),
    provider: v.string(),
    providerRef: v.string(),
    amountPence: v.number(),
    currency: v.string(),
    verifyAmount: v.boolean(),
    secret: v.string(),
  },
  returns: settledPaymentReturns,
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    return settlePayment(ctx, args);
  },
});

export const settleDevPayment = mutation({
  args: {
    ticketId: v.id("tickets"),
    secret: v.string(),
  },
  returns: settledPaymentReturns,
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    return settlePayment(ctx, {
      ticketId: args.ticketId,
      provider: "dev-checkout",
      providerRef: "dev_" + args.ticketId,
      amountPence: 0,
      currency: "gbp",
      verifyAmount: false,
    });
  },
});
