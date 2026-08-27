import type Stripe from "stripe";
import { NextResponse } from "next/server";

import { getStripeClient } from "@/src/lib/stripe";
import {
  TicketInventoryError,
  settleStripeCheckout,
} from "@/src/lib/ticket-inventory";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;

  try {
    event = await getStripeClient().webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
    );
  } catch (error) {
    console.error("Invalid Stripe webhook signature", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ handled: false, type: event.type });
  }

  const session = event.data.object;

  try {
    if (session.payment_status !== "paid") {
      return NextResponse.json({
        handled: false,
        paymentStatus: session.payment_status,
      });
    }

    const ticketId = session.client_reference_id ?? session.metadata?.ticket_id;

    if (!ticketId) {
      throw new TicketInventoryError(
        "Checkout session has no ticket reference",
        400,
      );
    }

    if (typeof session.amount_total !== "number") {
      throw new TicketInventoryError("Checkout session has no amount", 400);
    }

    const result = await settleStripeCheckout({
      amountPence: session.amount_total,
      currency: session.currency ?? undefined,
      providerRef: session.id,
      ticketId,
    });

    return NextResponse.json({
      handled: true,
      paymentId: result.payment.id,
      ticketId: result.ticket.id,
      ticketStatus: result.ticket.status,
    });
  } catch (error) {
    if (error instanceof TicketInventoryError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Stripe webhook settlement failed", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
