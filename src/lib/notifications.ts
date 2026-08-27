import "server-only";

export type RoomResultParticipant = {
  userId: string;
  email: string;
  ticketNumber: number;
  isWinner: boolean;
  perkCode?: string;
};

export type RoomResultPayload = {
  roomId: string;
  roomTitle: string;
  prizeDescription: string;
  participants: RoomResultParticipant[];
};

export type SendRoomResultOutput = {
  sent: number;
  provider: "dev-stub";
};

const WINNER_SUBJECT = (roomTitle: string) =>
  "You won " + roomTitle + " - next steps";

const LOSER_SUBJECT = (roomTitle: string) =>
  roomTitle + " result and your perk credit";

function winnerBody(input: {
  prizeDescription: string;
  roomTitle: string;
  ticketNumber: number;
}): string {
  return [
    "Your ticket #" + input.ticketNumber + " won " + input.roomTitle + ".",
    "",
    "Fulfilment instructions:",
    "1. We will contact you at this email address to confirm delivery details.",
    "2. Reply within 7 days to arrange collection or dispatch.",
    "3. Keep your ticket number for identity checks.",
    "",
    "Prize: " + input.prizeDescription,
  ].join("\n");
}

function loserBody(input: {
  perkCode: string | undefined;
  roomTitle: string;
  ticketNumber: number;
}): string {
  const code = input.perkCode ?? "PENDING";
  return [
    "Your ticket #" + input.ticketNumber + " did not win " + input.roomTitle + ".",
    "",
    "You have earned a guaranteed perk credit:",
    "Perk code: " + code,
    "Value: £5.00 off your next room.",
    "",
    "Enter the perk code when you buy a future room.",
  ].join("\n");
}

/**
 * Development notification stub. Messages go to the server console in a
 * structured shape so a real provider can replace the send loop without
 * changing callers. No database migration is required for this MVP.
 */
export async function sendRoomResult(
  payload: RoomResultPayload,
): Promise<SendRoomResultOutput> {
  if (payload.participants.length === 0) {
    return { provider: "dev-stub", sent: 0 };
  }

  for (const participant of payload.participants) {
    const subject = participant.isWinner
      ? WINNER_SUBJECT(payload.roomTitle)
      : LOSER_SUBJECT(payload.roomTitle);
    const body = participant.isWinner
      ? winnerBody({
          prizeDescription: payload.prizeDescription,
          roomTitle: payload.roomTitle,
          ticketNumber: participant.ticketNumber,
        })
      : loserBody({
          perkCode: participant.perkCode,
          roomTitle: payload.roomTitle,
          ticketNumber: participant.ticketNumber,
        });

    console.info("[notifications] dev-stub", {
      body,
      email: participant.email,
      roomId: payload.roomId,
      status: "sent",
      subject,
      userId: participant.userId,
    });
  }

  return { provider: "dev-stub", sent: payload.participants.length };
}
