import type { Id } from "@/convex/_generated/dataModel";

import { api, convex, requireConvexApiSecret } from "@/src/lib/convex";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const roomId = id.trim() as Id<"rooms">;
  const secret = requireConvexApiSecret();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (data: unknown) => {
        if (!closed) {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
        }
      };

      const poll = async () => {
        try {
          const state = await convex.query(api.rooms.getLiveRoomState, {
            roomId,
            secret,
          });
          send({ ticketsSold: state.ticketsSold, state: state.state });
        } catch {
          send({ error: "poll_failed" });
        }
      };

      await poll();
      const interval = setInterval(poll, 2000);
      const close = () => {
        clearInterval(interval);
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by client disconnect; nothing to do.
        }
      };
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
