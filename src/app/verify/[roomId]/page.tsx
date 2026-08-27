import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { notFound } from "next/navigation";

import { api, convex, requireConvexApiSecret } from "@/src/lib/convex";
import { verifyRoomDraw } from "@/src/lib/draw-service";
import { ProofVerifier } from "./proof-verifier";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ roomId: string }>;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 break-all font-mono text-sm">{value}</dd>
    </div>
  );
}

export default async function VerifyRoomPage({ params }: PageProps) {
  const { roomId } = await params;

  if (!roomId.trim()) {
    notFound();
  }

  const secret = requireConvexApiSecret();
  let room;
  try {
    room = await convex.query(api.rooms.getRoomWithStats, {
      roomId: roomId as Id<"rooms">,
      secret,
    });
  } catch {
    notFound();
  }

  if (!room) {
    notFound();
  }

  const verification = await verifyRoomDraw(roomId);
  const proof = verification.proof;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link className="text-sm text-neutral-500 hover:underline" href="/">
        ← All rooms
      </Link>
      <div className="mt-4 flex items-center gap-3">
        <h1 className="text-3xl font-bold">Public draw verification</h1>
        {verification.verified ? (
          <span
            aria-label="Draw proof verified"
            className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800"
          >
            Verified
          </span>
        ) : room.state === "drawn" ? (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
            Not verified
          </span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-600">
            Awaiting draw
          </span>
        )}
      </div>

      {room.serverSeedHash ? (
        <dl className="mt-8 grid gap-5 rounded-lg border p-5">
          <Field label="Server seed hash commitment" value={room.serverSeedHash} />
          <Field label="Revealed server seed" value={room.serverSeed ?? "Not revealed yet"} />
          <Field label="Block hash" value={room.blockHash ?? "Not selected yet"} />
          <Field label="Entrant count" value={String(proof?.entrantDigests.length ?? 0)} />
          <Field label="Winning index" value={proof ? String(proof.winningIndex) : "-"} />
          <Field label="HMAC output" value={proof?.hmacDigest ?? "-"} />
        </dl>
      ) : (
        <p className="mt-8 rounded-lg border border-dashed p-6 text-sm text-neutral-500">
          This room does not yet have a published server seed commitment.
        </p>
      )}

      {proof ? (
        <>
          <ProofVerifier proof={proof} />
          <section className="mt-6 rounded-lg border p-5 text-sm leading-relaxed text-neutral-600">
            <h2 className="font-semibold text-neutral-900">How to verify independently</h2>
            <p className="mt-2">
              The entrant digests are sorted lexicographically. HMAC-SHA256 uses the revealed
              server seed as its key and the message{" "}
              <code className="rounded bg-neutral-100 px-1 font-mono">blockHash:digest,digest</code>.
              The winning index uses rejection sampling, exactly as the shared draw engine.
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
