import { requireAdmin } from "@/src/lib/admin";

import { NewRoomForm } from "./new-room-form";

export const dynamic = "force-dynamic";

export default async function NewRoomPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-2xl font-bold">Create a new drop room</h1>
      <NewRoomForm />
    </main>
  );
}
