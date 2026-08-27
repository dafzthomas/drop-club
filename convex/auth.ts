import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { assertServiceSecret } from "./security";

export const createMagicLinkToken = mutation({
  args: {
    email: v.string(),
    tokenHash: v.string(),
    secret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    await ctx.db.insert("magicLinks", {
      email: args.email.trim().toLowerCase(),
      tokenHash: args.tokenHash,
      expiresAt: Date.now() + 10 * 60 * 1000,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const consumeMagicLinkToken = mutation({
  args: {
    tokenHash: v.string(),
    secret: v.string(),
  },
  returns: v.union(v.object({ email: v.string() }), v.null()),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    const link = await ctx.db
      .query("magicLinks")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!link || link.usedAt !== undefined || link.expiresAt <= Date.now()) {
      return null;
    }
    await ctx.db.patch(link._id, { usedAt: Date.now() });
    return { email: link.email };
  },
});

export const ensureUser = mutation({
  args: {
    email: v.string(),
    secret: v.string(),
  },
  returns: v.object({
    id: v.id("users"),
    email: v.string(),
    isAdmin: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    const normalized = args.email.trim().toLowerCase();
    const devAdminEmails = (process.env.DEV_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = devAdminEmails.includes(normalized);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (existing) {
      if (existing.isAdmin !== isAdmin) {
        await ctx.db.patch(existing._id, { isAdmin });
      }
      return { id: existing._id, email: existing.email, isAdmin };
    }
    const id = await ctx.db.insert("users", {
      email: normalized,
      isAdmin,
      createdAt: Date.now(),
    });
    return { id, email: normalized, isAdmin };
  },
});

export const getUserById = query({
  args: {
    userId: v.id("users"),
    secret: v.string(),
  },
  returns: v.union(
    v.object({
      id: v.id("users"),
      email: v.string(),
      isAdmin: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    assertServiceSecret(args.secret);
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return { id: user._id, email: user.email, isAdmin: user.isAdmin };
  },
});
