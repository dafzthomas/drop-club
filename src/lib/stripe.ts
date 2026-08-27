import Stripe from "stripe";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function requireSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  return secretKey;
}

export function getStripeClient(): Stripe {
  return new Stripe(requireSecretKey());
}

type CreateTicketCheckoutInput = {
  roomId: string;
  ticketId: string;
  title: string;
  pricePence: number;
  email: string;
  origin: string;
};

export async function createTicketCheckout(
  input: CreateTicketCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    client_reference_id: input.ticketId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: input.pricePence,
          product_data: { name: input.title },
        },
      },
    ],
    metadata: { room_id: input.roomId, ticket_id: input.ticketId },
    success_url: [
      input.origin,
      "/rooms/",
      input.roomId,
      "?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    ].join(""),
    cancel_url: input.origin + "/rooms/" + input.roomId + "?checkout=cancelled",
  });
}
