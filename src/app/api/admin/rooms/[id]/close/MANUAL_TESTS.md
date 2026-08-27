# Manual test steps: close-and-draw happy path

The committed runtime harness runs this flow against the configured Convex
development deployment:

```bash
npm run runtime-e2e
```

It starts the real production Next.js bundle, then drives:

1. Admin magic-link request and one-time verification.
2. Room creation with a server seed commitment.
3. Guest development checkout.
4. Admin close/draw with a 64-character block hash.
5. Public API and browser proof verification.
6. Live-room SSE polling and magic-link single-use enforcement.

## Manual HTTP checks

Set NEXT_PUBLIC_CONVEX_URL, CONVEX_API_SECRET, and DEV_ADMIN_EMAILS in the
environment, then start the app with npm run dev. Use an email in
DEV_ADMIN_EMAILS to request a development magic link, follow it with cookies
enabled, and create a room at /admin/rooms/new.

Post a block hash to POST /api/admin/rooms/<roomId>/close. The response must
include entrantCount, winningIndex, winningTicketId, winningTicketNumber,
and a proof containing revealedSeed, seedHash, blockHash, sorted
entrantDigests, and hmacDigest.

Convex should show the room in drawn state, one draw record, a perk for every
non-winning ticket, and room.closing followed by room.drawn audit events.
The Next.js server console emits one development notification-stub record per
participant.

GET /api/draws/<roomId>/verify must return verified: true, and
/verify/<roomId> must show the Verified badge. The Verify proof button
replays the same algorithm in browser WebCrypto.

## Required error paths

- Re-closing a drawn room returns 400 with code room_not_open.
- An unknown room returns 404 with code room_not_found.
- A room without both pre-created seed fields returns 400 with code
  missing_seed_commitment and remains open.
- A missing or malformed block hash returns 400 with code invalid_block_hash.
- An open room with no succeeded payment returns 400 with code
  no_paid_tickets.
