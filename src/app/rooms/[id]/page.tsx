import Link from "next/link";
import { notFound } from "next/navigation";

import type { Id } from "@/convex/_generated/dataModel";
import { api, convex, requireConvexApiSecret } from "@/src/lib/convex";
import { formatCountdown, formatPricePence } from "@/src/lib/format";
import { RoomLive } from "./room-live";
import { RoomCheckout } from "./room-checkout";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RoomPage({ params }: PageProps) {
  const { id } = await params;
  const room = await convex.query(api.rooms.getRoomWithStats, {
    roomId: id as Id<"rooms">,
    secret: requireConvexApiSecret(),
  });

  if (!room) {
    notFound();
  }

  const fillPercent = Math.min(
    100,
    Math.round((room.ticketsSold / room.capacity) * 100),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link className="text-sm text-neutral-500 hover:underline" href="/">
        ← All rooms
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{room.title}</h1>
      <p className="mt-2 text-sm text-neutral-500">{room.prizeDescription}</p>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Ticket price
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatPricePence(room.pricePence)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Capacity
          </p>
          <p className="mt-1 text-xl font-semibold">{room.capacity}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Closes in
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatCountdown(new Date(room.closesAt))}
          </p>
        </div>
      </section>

      <section aria-label="Tickets sold" className="mt-6 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Tickets sold</h2>
          <RoomLive
            capacity={room.capacity}
            initial={room.ticketsSold}
            roomId={room.id}
          />
        </div>
        <div
          aria-label={"Tickets sold fill bar at " + fillPercent + " percent"}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={fillPercent}
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-neutral-200"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-emerald-600 transition-all duration-500"
            style={{ width: fillPercent + "%" }}
          />
        </div>
      </section>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="font-semibold">Provably fair draw</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Before the room opened we published a SHA-256 hash of a secret server
          seed. At close, that seed is revealed and combined with a public block
          hash at closing time plus the ordered entrant list. The HMAC-SHA256
          output picks the winning index using unbiased modular reduction, so
          anyone can independently verify the result.
        </p>
        <p className="mt-4 text-xs uppercase tracking-wide text-neutral-500">
          Published seed commitment
        </p>
        {room.serverSeedHash ? (
          <p className="mt-1 break-all rounded-md bg-neutral-100 p-3 font-mono text-xs leading-relaxed text-neutral-800">
            {room.serverSeedHash}
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-600">No commitment is available.</p>
        )}
      </section>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="font-semibold">Guaranteed perk</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Every non-winning ticket receives a guaranteed perk, win or lose:
        </p>
        <p className="mt-2 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
          {room.perkDescription}
        </p>
      </section>

      <RoomCheckout roomId={room.id} />
    </main>
  );
}
