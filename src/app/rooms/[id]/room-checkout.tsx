"use client";

import { useState } from "react";

type RoomCheckoutProps = {
  roomId: string;
};

export function RoomCheckout({ roomId }: RoomCheckoutProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, roomId }),
      });
      const payload = (await response.json()) as {
        error?: string;
        url?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Could not start checkout");
      }

      window.location.assign(payload.url);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not start checkout",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border p-4">
      <h2 className="font-semibold">Buy a ticket</h2>
      <form
        className="mt-3 flex flex-col gap-3 sm:flex-row"
        onSubmit={handleSubmit}
      >
        <input
          aria-label="Email"
          autoComplete="email"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          disabled={isSubmitting}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        <button
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || email.length === 0}
          type="submit"
        >
          {isSubmitting ? "Starting checkout…" : "Buy ticket"}
        </button>
      </form>
      {error ? (
        <p
          className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
