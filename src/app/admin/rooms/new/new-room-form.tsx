"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewRoomForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/rooms", {
        body: JSON.stringify({
          capacity: Number(formData.get("capacity")),
          closesAt: String(formData.get("closesAt")),
          perkDescription: String(formData.get("perkDescription") || ""),
          pricePence: Number(formData.get("pricePence")),
          prizeDescription: String(formData.get("prizeDescription")),
          title: String(formData.get("title")),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Failed to create room.");
        setStatus("error");
        return;
      }
      const data = await response.json();
      router.push("/rooms/" + data.id);
    } catch {
      setError("Network error.");
      setStatus("error");
    }
  }

  return (
    <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-1 text-sm font-medium">
        Title
        <input className="rounded-md border px-3 py-2 text-sm" name="title" required type="text" />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Prize description
        <textarea
          className="rounded-md border px-3 py-2 text-sm"
          name="prizeDescription"
          required
          rows={3}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Guaranteed perk description
        <textarea className="rounded-md border px-3 py-2 text-sm" name="perkDescription" rows={2} />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1 text-sm font-medium">
          Capacity
          <input
            className="rounded-md border px-3 py-2 text-sm"
            min={1}
            name="capacity"
            required
            type="number"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Price (pence)
          <input
            className="rounded-md border px-3 py-2 text-sm"
            min={1}
            name="pricePence"
            required
            type="number"
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        Closes at
        <input
          className="rounded-md border px-3 py-2 text-sm"
          name="closesAt"
          required
          type="datetime-local"
        />
      </label>
      <button
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? "Creating..." : "Create room"}
      </button>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </form>
  );
}
