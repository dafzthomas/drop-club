import type { Id } from "@/convex/_generated/dataModel";

import { api, convex, requireConvexApiSecret } from "@/src/lib/convex";

export class TicketInventoryError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "TicketInventoryError";
    this.status = status;
  }
}

const EMAIL_PATTERN = new RegExp("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

type ConvexRoomId = Id<"rooms">;
type ConvexTicketId = Id<"tickets">;
type ConvexPaymentId = Id<"payments">;

type ReserveTicketResponse = {
  ticketId: ConvexTicketId;
  ticketNumber: number;
  roomTitle: string;
  roomPricePence: number;
};

type SettlementResponse = {
  paymentId: ConvexPaymentId;
  ticketId: ConvexTicketId;
  ticketStatus: string;
};

/**
 * Convex serializes errors thrown by a mutation before they reach this
 * process, so `instanceof TicketInventoryError` cannot be relied on here.
 * Recover the stable application messages/statuses at this boundary so the
 * HTTP routes retain their existing error mapping.
 */
function asTicketInventoryError(error: unknown): TicketInventoryError | null {
  if (error instanceof TicketInventoryError) return error;

  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : undefined;
  const rawMessage =
    typeof record?.message === "string"
      ? record.message
      : typeof error === "string"
        ? error
        : "";
  const data =
    record?.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : undefined;
  const code = typeof data?.code === "string" ? data.code : undefined;
  const dataMessage = typeof data?.message === "string" ? data.message : undefined;
  const message = dataMessage ?? rawMessage;

  const knownErrors: Array<{
    code: string;
    message: string;
    status: number;
  }> = [
    {
      code: "invalid_email",
      message: "A valid email is required",
      status: 400,
    },
    {
      code: "room_not_open",
      message: "This room is not open for tickets",
      status: 409,
    },
    { code: "room_full", message: "This room is full", status: 409 },
    {
      code: "ticket_not_found",
      message: "Checkout ticket was not found",
      status: 400,
    },
    {
      code: "room_not_found",
      message: "Checkout room was not found",
      status: 400,
    },
    {
      code: "payment_reference_conflict",
      message: "Payment reference belongs to another ticket",
      status: 409,
    },
    {
      code: "amount_mismatch",
      message: "Checkout amount does not match the room",
      status: 500,
    },
    {
      code: "reserve_failed",
      message: "Could not reserve a ticket",
      status: 500,
    },
    {
      code: "payment_record_failed",
      message: "Could not record payment",
      status: 500,
    },
  ];

  const known = knownErrors.find(
    (candidate) => code === candidate.code || message.includes(candidate.message),
  );
  return known
    ? new TicketInventoryError(known.message, known.status)
    : null;
}

function throwMappedTicketError(error: unknown): never {
  const mapped = asTicketInventoryError(error);
  if (mapped) throw mapped;
  throw error;
}

/**
 * Reserve one pending-payment ticket through the Convex transaction.
 *
 * The Convex mutation owns the room-capacity check and sequential ticket
 * number allocation. This adapter keeps the shape consumed by the existing
 * checkout route while exposing no database-specific records.
 */
export async function reserveTicket(input: { roomId: string; email: string }) {
  const roomId = input.roomId.trim();
  const email = input.email.trim().toLowerCase();

  if (!roomId) {
    throw new TicketInventoryError("A valid roomId is required", 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new TicketInventoryError("A valid email is required", 400);
  }

  let result: ReserveTicketResponse;
  try {
    result = await convex.mutation(api.tickets.reserveTicket, {
      email,
      roomId: roomId as ConvexRoomId,
      secret: requireConvexApiSecret(),
    });
  } catch (error) {
    throwMappedTicketError(error);
  }

  return {
    room: {
      id: roomId,
      pricePence: result.roomPricePence,
      title: result.roomTitle,
    },
    ticket: {
      id: result.ticketId,
      ticketNumber: result.ticketNumber,
    },
    user: { email },
  };
}

type SettlePaymentInput = {
  ticketId: string;
  provider: string;
  providerRef: string;
  amountPence: number;
  currency?: string;
  verifyAmount: boolean;
};

async function settlePayment(input: SettlePaymentInput) {
  if (!input.ticketId.trim()) {
    throw new TicketInventoryError(
      "The checkout did not identify a ticket",
      400,
    );
  }

  let result: SettlementResponse;
  try {
    result = await convex.mutation(api.tickets.settleStripeCheckout, {
      amountPence: input.amountPence,
      currency: (input.currency ?? "gbp").toLowerCase(),
      provider: input.provider,
      providerRef: input.providerRef,
      secret: requireConvexApiSecret(),
      ticketId: input.ticketId as ConvexTicketId,
      verifyAmount: input.verifyAmount,
    });
  } catch (error) {
    throwMappedTicketError(error);
  }

  return {
    payment: { id: result.paymentId },
    ticket: {
      id: result.ticketId,
      status: result.ticketStatus,
    },
  };
}

export function settleStripeCheckout(input: {
  ticketId: string;
  providerRef: string;
  amountPence: number;
  currency?: string;
}) {
  return settlePayment({
    amountPence: input.amountPence,
    currency: input.currency,
    provider: "stripe-checkout",
    providerRef: input.providerRef,
    ticketId: input.ticketId,
    verifyAmount: true,
  });
}

export async function settleDevPayment(ticketId: string) {
  if (!ticketId.trim()) {
    throw new TicketInventoryError(
      "The checkout did not identify a ticket",
      400,
    );
  }

  let result: SettlementResponse;
  try {
    result = await convex.mutation(api.tickets.settleDevPayment, {
      secret: requireConvexApiSecret(),
      ticketId: ticketId as ConvexTicketId,
    });
  } catch (error) {
    throwMappedTicketError(error);
  }

  return {
    payment: { id: result.paymentId },
    ticket: {
      id: result.ticketId,
      status: result.ticketStatus,
    },
  };
}
