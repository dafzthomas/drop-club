import { NextResponse } from "next/server";

import { createTicketCheckout, isStripeConfigured } from "@/src/lib/stripe";
import {
  reserveTicket,
  settleDevPayment,
  TicketInventoryError,
} from "@/src/lib/ticket-inventory";

type CheckoutRequest = {
  email?: unknown;
  roomId?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: CheckoutRequest;

  try {
    body = (await request.json()) as CheckoutRequest;
  } catch {
    return errorResponse("A JSON body is required", 400);
  }

  if (typeof body.roomId !== "string" || typeof body.email !== "string") {
    return errorResponse("roomId and email are required", 400);
  }

  try {
    const reservation = await reserveTicket({
      email: body.email,
      roomId: body.roomId,
    });
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;

    if (!isStripeConfigured()) {
      await settleDevPayment(reservation.ticket.id);
      return NextResponse.json({
        developmentOnly: true,
        message:
          "DEV_MODE_CHECKOUT: STRIPE_SECRET_KEY is unset, so this ticket was marked paid without taking payment.",
        ticketId: reservation.ticket.id,
        ticketNumber: reservation.ticket.ticketNumber,
        url:
          origin +
          "/rooms/" +
          reservation.room.id +
          "?checkout=development-only",
      });
    }

    const session = await createTicketCheckout({
      email: reservation.user.email,
      origin,
      pricePence: reservation.room.pricePence,
      roomId: reservation.room.id,
      title: reservation.room.title,
      ticketId: reservation.ticket.id,
    });

    if (!session.url) {
      return errorResponse("Stripe did not return a checkout URL", 500);
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    if (error instanceof TicketInventoryError) {
      return errorResponse(error.message, error.status);
    }

    console.error("Checkout failed", error);
    return errorResponse("Could not start checkout", 500);
  }
}
