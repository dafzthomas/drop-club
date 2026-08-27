import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    isAdmin: v.boolean(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  rooms: defineTable({
    title: v.string(),
    prizeDescription: v.string(),
    perkDescription: v.string(),
    capacity: v.number(),
    pricePence: v.number(),
    state: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("closing"),
      v.literal("drawn"),
      v.literal("settled"),
    ),
    closesAt: v.number(),
    serverSeedHash: v.optional(v.string()),
    serverSeed: v.optional(v.string()),
    blockHash: v.optional(v.string()),
    winningTicketId: v.optional(v.id("tickets")),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_creation", ["createdAt"]),

  tickets: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),
    ticketNumber: v.number(),
    status: v.union(
      v.literal("pending_payment"),
      v.literal("active"),
      v.literal("void"),
    ),
    createdAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_and_number", ["roomId", "ticketNumber"])
    .index("by_user", ["userId"]),

  payments: defineTable({
    ticketId: v.id("tickets"),
    userId: v.id("users"),
    amountPence: v.number(),
    currency: v.string(),
    provider: v.string(),
    providerRef: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("refunded"),
    ),
    createdAt: v.number(),
  })
    .index("by_provider_ref", ["provider", "providerRef"])
    .index("by_ticket", ["ticketId"]),

  perks: defineTable({
    roomId: v.id("rooms"),
    ticketId: v.id("tickets"),
    userId: v.id("users"),
    description: v.string(),
    claimed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_ticket", ["ticketId"]),

  draws: defineTable({
    roomId: v.id("rooms"),
    serverSeed: v.string(),
    serverSeedHash: v.string(),
    blockHash: v.string(),
    entrantsDigest: v.string(),
    hmacOutput: v.string(),
    winningIndex: v.number(),
    verifierCode: v.optional(v.string()),
    executedAt: v.number(),
  }).index("by_room", ["roomId"]),

  auditEvents: defineTable({
    actorUserId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_entity", ["entityType", "entityId"]),

  magicLinks: defineTable({
    email: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_token_hash", ["tokenHash"]),
});
