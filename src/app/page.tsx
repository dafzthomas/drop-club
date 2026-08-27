import Link from "next/link";

import { api, convex, requireConvexApiSecret } from "@/src/lib/convex";
import { getCurrentUser } from "@/src/lib/auth";
import { formatPricePence } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [roomsList, user] = await Promise.all([
    convex.query(api.rooms.listRoomsWithStats, {
      secret: requireConvexApiSecret(),
    }),
    getCurrentUser(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Drop Club
          </p>
          <h1 className="text-3xl font-bold">Live rooms</h1>
        </div>
        {user ? (
          <form action="/api/auth/logout" method="post">
            <button className="rounded-md border px-3 py-1.5 text-sm" type="submit">
              Sign out
            </button>
          </form>
        ) : (
          <Link className="text-sm font-medium underline" href="/login">
            Sign in
          </Link>
        )}
      </header>

      <section aria-label="Rooms" className="mt-10 grid gap-4">
        {roomsList.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-500">
            No rooms yet.
          </p>
        ) : (
          roomsList.map((room) => (
            <Link
              className="block rounded-lg border p-5 transition hover:border-neutral-400"
              href={"/rooms/" + room.id}
              key={room.id}
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold">{room.title}</h2>
                <span className="text-sm font-medium">{formatPricePence(room.pricePence)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{room.prizeDescription}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
                <span className="font-mono">
                  {room.ticketsSold}/{room.capacity}
                </span>
                <span aria-hidden="true">·</span>
                <span>{room.state}</span>
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
