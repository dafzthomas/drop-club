"use node";

import { createHash, randomBytes } from "node:crypto";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertServiceSecret } from "./security";
import { computeWinner, generateSeed } from "./drawEngine";

const drawProof = v.object({
  revealedSeed: v.string(),
  seedHash: v.optional(v.string()),
  blockHash: v.string(),
  entrantDigests: v.array(v.string()),
  hmacDigest: v.string(),
  winningIndex: v.number(),
});

const participant = v.object({
  userId: v.id("users"),
  email: v.string(),
  ticketNumber: v.number(),
  isWinner: v.boolean(),
  perkCode: v.optional(v.string()),
});

function closeError(code: string, message: string): Error {
  return new Error("CLOSE_ERROR:" + code + ":" + message);
}

type CloseEntrant = {
  ticketId: Id<"tickets">;
  ticketNumber: number;
  userId: Id<"users">;
  userEmail: string;
};

type CloseStart = {
  status: string;
  entrants: CloseEntrant[];
  serverSeed?: string;
  serverSeedHash?: string;
  roomTitle?: string;
  prizeDescription?: string;
  perkDescription?: string;
};

type CloseResult = {
  roomId: Id<"rooms">;
  state: "drawn";
  winningTicketId: Id<"tickets">;
  winningTicketNumber: number;
  entrantCount: number;
  winningIndex: number;
  proof: {
    revealedSeed: string;
    seedHash?: string;
    blockHash: string;
    entrantDigests: string[];
    hmacDigest: string;
    winningIndex: number;
  };
  perksCreated: number;
  notificationsSent: number;
  participants: Array<{
    userId: Id<"users">;
    email: string;
    ticketNumber: number;
    isWinner: boolean;
    perkCode?: string;
  }>;
};

export const createRoom = action({
  args: {
    title: v.string(),
    prizeDescription: v.string(),
    perkDescription: v.string(),
    capacity: v.number(),
    pricePence: v.number(),
    closesAt: v.number(),
    createdBy: v.id("users"),
    secret: v.string(),
  },
  returns: v.object({ id: v.id("rooms") }),
  handler: async (ctx, args): Promise<{ id: Id<"rooms"> }> => {
    assertServiceSecret(args.secret);
    const seed = generateSeed();
    return ctx.runMutation(internal.roomData.createRoomRecord, {
      title: args.title,
      prizeDescription: args.prizeDescription,
      perkDescription: args.perkDescription,
      capacity: args.capacity,
      pricePence: args.pricePence,
      closesAt: args.closesAt,
      createdBy: args.createdBy,
      serverSeed: seed.seed,
      serverSeedHash: seed.seedHash,
    });
  },
});

export const closeDraw = action({
  args: {
    roomId: v.id("rooms"),
    actorUserId: v.optional(v.id("users")),
    blockHash: v.string(),
    secret: v.string(),
  },
  returns: v.object({
    roomId: v.id("rooms"),
    state: v.literal("drawn"),
    winningTicketId: v.id("tickets"),
    winningTicketNumber: v.number(),
    entrantCount: v.number(),
    winningIndex: v.number(),
    proof: drawProof,
    perksCreated: v.number(),
    notificationsSent: v.number(),
    participants: v.array(participant),
  }),
  handler: async (ctx, args): Promise<CloseResult> => {
    assertServiceSecret(args.secret);
    const blockHash = args.blockHash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(blockHash)) {
      throw closeError(
        "invalid_block_hash",
        "blockHash must be a 64-character hexadecimal Bitcoin or Ethereum block hash.",
      );
    }

    const started: CloseStart = await ctx.runMutation(internal.roomData.beginClose, {
      roomId: args.roomId,
      actorUserId: args.actorUserId,
      blockHash,
    });
    if (started.status !== "ok") {
      const messages: Record<string, string> = {
        room_not_found: "Room not found.",
        room_not_open: "Room is not open.",
        no_paid_tickets: "Cannot draw a room without paid tickets.",
        missing_seed_commitment:
          "Room cannot be drawn without a pre-created seed commitment.",
      };
      throw closeError(
        started.status,
        messages[started.status] ?? "Room could not be closed.",
      );
    }

    try {
      const withDigests = started.entrants.map((entry) => ({
        ...entry,
        digest: createHash("sha256")
          .update(String(entry.ticketId) + ":" + entry.userEmail, "utf8")
          .digest("hex"),
      }));
      const proof = computeWinner({
        blockHash,
        entrantDigests: withDigests.map((entry) => entry.digest),
        expectedSeedHash: started.serverSeedHash,
        revealedSeed: started.serverSeed!,
      });
      const byDigest = new Map(
        withDigests.map((entry) => [entry.digest, entry]),
      );
      const winner = byDigest.get(proof.entrantDigests[proof.winningIndex]);
      if (!winner) {
        throw closeError("duplicate_entrant", "Draw proof is inconsistent.");
      }

      const losing = started.entrants.filter(
        (entry) => entry.ticketId !== winner.ticketId,
      );
      const perkCodes = new Map<string, string>();
      const perks = losing.map((entry) => {
        const code = randomBytes(8).toString("hex").toUpperCase();
        perkCodes.set(String(entry.ticketId), code);
        return {
          ticketId: entry.ticketId,
          userId: entry.userId,
          description:
            "discount_credit:value_pence=500|code=" +
            code +
            "|" +
            started.perkDescription,
        };
      });

      await ctx.runMutation(internal.roomData.finalizeClose, {
        roomId: args.roomId,
        actorUserId: args.actorUserId,
        blockHash: proof.blockHash,
        entrantsDigest: proof.entrantDigests.join(","),
        hmacOutput: proof.hmacDigest,
        winningIndex: proof.winningIndex,
        verifierCode: JSON.stringify(proof),
        revealedSeed: proof.revealedSeed,
        seedHash: proof.seedHash ?? started.serverSeedHash!,
        winningTicketId: winner.ticketId,
        perks,
      });

      const participants = started.entrants.map((entry) => {
        const isWinner = entry.ticketId === winner.ticketId;
        const code = perkCodes.get(String(entry.ticketId));
        return {
          userId: entry.userId,
          email: entry.userEmail,
          ticketNumber: entry.ticketNumber,
          isWinner,
          ...(code ? { perkCode: code } : {}),
        };
      });

      return {
        roomId: args.roomId,
        state: "drawn" as const,
        winningTicketId: winner.ticketId,
        winningTicketNumber: winner.ticketNumber,
        entrantCount: started.entrants.length,
        winningIndex: proof.winningIndex,
        proof,
        perksCreated: perks.length,
        notificationsSent: 0,
        participants,
      };
    } catch (error) {
      try {
        await ctx.runMutation(internal.roomData.abortClose, {
          roomId: args.roomId,
        });
      } catch {
        // Preserve the original draw failure if cleanup itself races.
      }
      throw error;
    }
  },
});
