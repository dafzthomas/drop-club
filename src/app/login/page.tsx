"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setMagicLink(data.devMagicLink);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
    setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-bold">Sign in to Drop Club</h1>
      <p className="mt-2 text-sm text-neutral-500">
        We&apos;ll email you a magic link. No password needed.
      </p>
      <form className="mt-8 grid gap-3" onSubmit={handleSubmit}>
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="rounded-md border px-3 py-2 text-sm"
          id="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        <button
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Sending..." : "Send magic link"}
        </button>
      </form>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {magicLink && (
        <div className="mt-6 rounded-lg border border-dashed p-4 text-sm">
          <p className="font-medium">Dev-mode magic link</p>
          <p className="mt-1 text-neutral-500">
            No email provider is configured; open this link directly:
          </p>
          <a className="mt-2 block break-all underline" href={magicLink}>
            {magicLink}
          </a>
        </div>
      )}
    </main>
  );
}
