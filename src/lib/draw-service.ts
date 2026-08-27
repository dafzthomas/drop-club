import type { Id } from "@/convex/_generated/dataModel";

import {
  verifyProof,
  type DrawProof,
} from "@/src/app/api/draws/[roomId]/verify/draw-engine";
import { api, convex, requireConvexApiSecret } from "@/src/lib/convex";
import { sendRoomResult } from "@/src/lib/notifications";

export const PERK_TYPE = "discount_credit";
export const PERK_VALUE_PENCE = 500;

const BLOCK_HASH_PATTERN = /^[0-9a-f]{64}$/;

type ConvexRoomId = Id<"rooms">;
type ConvexUserId = Id<"users">;

export type CloseDrawErrorCode =
  | "invalid_room_id"
  | "room_not_open"
  | "room_not_found"
  | "no_paid_tickets"
  | "missing_seed_commitment"
  | "invalid_block_hash"
  | "duplicate_entrant";

export class CloseDrawError extends Error {
  readonly code: CloseDrawErrorCode;

  constructor(code: CloseDrawErrorCode, message: string) {
    super(message);
    this.name = "CloseDrawError";
    this.code = code;
  }
}

export type CloseDrawResult = {
  roomId: string;
  state: "drawn";
  winningTicketId: string;
  winningTicketNumber: number;
  entrantCount: number;
  winningIndex: number;
  proof: DrawProof;
  perksCreated: number;
  notificationsSent: number;
};

export type VerificationResult = {
  verified: boolean;
  proof: DrawProof | null;
};

type ConvexCloseDrawResponse = {
  roomId: ConvexRoomId;
  state: "drawn";
  winningTicketId: Id<"tickets">;
  winningTicketNumber: number;
  entrantCount: number;
  winningIndex: number;
  proof: DrawProof;
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

type ConvexVerificationResponse = {
  proof: DrawProof | null;
};

function assertValidRoomId(roomId: string): void {
  // Convex IDs are opaque strings, not UUIDs. Keep the route-level validation
  // for missing IDs while allowing valid Convex IDs through to the validator.
  if (!roomId.trim()) {
    throw new CloseDrawError("invalid_room_id", "Room ID must be provided.");
  }
}

function normalizeBlockHash(blockHash: string): string {
  const normalized = blockHash.trim().toLowerCase();
  if (!BLOCK_HASH_PATTERN.test(normalized)) {
    throw new CloseDrawError(
      "invalid_block_hash",
      "blockHash must be a 64-character hexadecimal Bitcoin or Ethereum block hash.",
    );
  }
  return normalized;
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return "";
  const record = error as Record<string, unknown>;
  return typeof record.message === "string" ? record.message : "";
}

function closeDrawFailure(error: unknown): CloseDrawError | null {
  const message = errorMessage(error);
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : undefined;
  const data =
    record?.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : undefined;
  const code = typeof data?.code === "string" ? data.code : undefined;
  const dataMessage = typeof data?.message === "string" ? data.message : undefined;
  const detail = dataMessage ?? message;

  const knownErrors: Array<{
    code: CloseDrawErrorCode;
    message: string;
    needles: string[];
  }> = [
    {
      code: "room_not_open",
      message: "Room is not open.",
      needles: ["room_not_open", "Room is not open", "room is not open"],
    },
    {
      code: "room_not_found",
      message: "Room not found.",
      needles: ["room_not_found", "Room not found", "room not found"],
    },
    {
      code: "no_paid_tickets",
      message: "Cannot draw a room without paid tickets.",
      needles: [
        "no_paid_tickets",
        "Cannot draw a room without paid tickets",
        "cannot draw a room without paid tickets",
      ],
    },
    {
      code: "missing_seed_commitment",
      message: "Room cannot be drawn without a pre-created seed commitment.",
      needles: [
        "missing_seed_commitment",
        "Room cannot be drawn without a pre-created seed commitment",
        "room cannot be drawn without a pre-created seed commitment",
      ],
    },
    {
      code: "invalid_block_hash",
      message:
        "blockHash must be a 64-character hexadecimal Bitcoin or Ethereum block hash.",
      needles: ["invalid_block_hash"],
    },
    {
      code: "duplicate_entrant",
      message: "Paid tickets produced duplicate entrant digests.",
      needles: ["duplicate_entrant", "duplicate entrant"],
    },
  ];

  const known = knownErrors.find(
    (candidate) =>
      code === candidate.code || candidate.needles.some((needle) => detail.includes(needle)),
  );
  return known ? new CloseDrawError(known.code, known.message) : null;
}

function throwMappedCloseDrawError(error: unknown): never {
  const mapped = closeDrawFailure(error);
  if (mapped) throw mapped;
  throw error;
}

/**
 * Close and draw a room through Convex. Convex owns the transaction, entrant
 * snapshot, proof generation, and public draw/perk writes; this service keeps
 * the existing application result and error contracts for the HTTP route.
 */
export async function closeAndDrawRoom(
  roomId: string,
  options: { actorUserId?: string; blockHash: string },
): Promise<CloseDrawResult> {
  assertValidRoomId(roomId);
  const blockHash = normalizeBlockHash(options.blockHash);
  const secret = requireConvexApiSecret();

  let roomForNotifications: { title: string; prizeDescription: string } | null;
  try {
    const room = await convex.query(api.rooms.getRoomWithStats, {
      roomId: roomId as ConvexRoomId,
      secret,
    });
    roomForNotifications = room
      ? { prizeDescription: room.prizeDescription, title: room.title }
      : null;
  } catch {
    throw new CloseDrawError("room_not_found", "Room not found.");
  }
  if (!roomForNotifications) {
    throw new CloseDrawError("room_not_found", "Room not found.");
  }

  let result: ConvexCloseDrawResponse;
  try {
    const args: {
      roomId: ConvexRoomId;
      blockHash: string;
      secret: string;
      actorUserId?: ConvexUserId;
    } = {
      blockHash,
      roomId: roomId as ConvexRoomId,
      secret,
    };
    if (options.actorUserId) {
      args.actorUserId = options.actorUserId as ConvexUserId;
    }

    result = await convex.action(api.roomActions.closeDraw, args);
  } catch (error) {
    throwMappedCloseDrawError(error);
  }

  const notifications = await sendRoomResult({
    participants: result.participants,
    prizeDescription: roomForNotifications.prizeDescription,
    roomId: String(result.roomId),
    roomTitle: roomForNotifications.title,
  });

  return {
    entrantCount: result.entrantCount,
    notificationsSent: notifications.sent,
    perksCreated: result.perksCreated,
    proof: result.proof,
    roomId: result.roomId,
    state: "drawn",
    winningIndex: result.winningIndex,
    winningTicketId: result.winningTicketId,
    winningTicketNumber: result.winningTicketNumber,
  };
}

/**
 * Fetch the stored proof and replay it locally with the canonical browser
 * verifier. The Convex response is not trusted merely because it says that it
 * is verified.
 */
export async function verifyRoomDraw(roomId: string): Promise<VerificationResult> {
  if (!roomId.trim()) {
    return { proof: null, verified: false };
  }

  let result: ConvexVerificationResponse;
  try {
    result = await convex.query(api.rooms.verifyRoomDraw, {
      roomId: roomId as ConvexRoomId,
      secret: requireConvexApiSecret(),
    });
  } catch {
    return { proof: null, verified: false };
  }

  const proof = result.proof;
  return {
    proof,
    verified: proof !== null && verifyProof(proof),
  };
}
