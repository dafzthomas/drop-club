"use client";

import { useEffect, useState } from "react";

type RoomLiveProps = {
  roomId: string;
  initial: number;
  capacity: number;
};

export function RoomLive({ roomId, initial, capacity }: RoomLiveProps) {
  const [ticketsSold, setTicketsSold] = useState(initial);

  useEffect(() => {
    const source = new EventSource("/api/rooms/" + roomId + "/live");

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (typeof payload.ticketsSold === "number") {
          setTicketsSold(payload.ticketsSold);
        }
      } catch {
        // Ignore malformed frames; next poll will correct the value.
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [roomId]);

  return (
    <span className="font-mono text-sm">
      {ticketsSold}/{capacity}
    </span>
  );
}
