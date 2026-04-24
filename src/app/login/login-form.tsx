"use client";

import { use, useState, useTransition } from "react";

import { normalizeDisplayName, normalizeEmail } from "@/lib/user-profile";

import { sendMagicLink } from "./actions";

export function LoginForm({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ next?: string; sent?: string; error?: string }>;
}) {
  const searchParams = use(searchParamsPromise);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [sent, setSent] = useState(searchParams.sent === "1");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    // Normalize client-side so what the user sees (in the "sent to" line
    // after submit, for example) matches what we'll persist server-side.
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeDisplayName(displayName);
    if (!normalizedEmail) {
      setLocalError("Enter your email.");
      return;
    }
    if (!normalizedName) {
      setLocalError("Enter your name.");
      return;
    }
    startTransition(async () => {
      const result = await sendMagicLink({
        email: normalizedEmail,
        displayName: normalizedName,
        next: searchParams.next ?? "/",
      });
      if (result.ok) {
        setSent(true);
      } else {
        setLocalError(result.error);
      }
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="text-sm font-medium">Check your inbox.</div>
        <p className="text-sm text-muted">
          We just emailed a sign-in link to <span className="font-medium text-foreground">{email || "you"}</span>. Open it
          on this device to continue.
        </p>
        <button
          type="button"
          className="mt-2 text-left text-xs font-medium text-muted underline hover:text-foreground"
          onClick={() => setSent(false)}
        >
          Use a different email
        </button>
      </div>
    );
  }

  const errorMessage = localError ?? searchParams.error;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          Name
        </span>
        <input
          type="text"
          autoComplete="name"
          required
          disabled={isPending}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Avinash"
          maxLength={40}
          className="h-12 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-p1 focus:ring-2 focus:ring-p1/40 disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          Email
        </span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          disabled={isPending}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-12 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-p1 focus:ring-2 focus:ring-p1/40 disabled:opacity-50"
        />
      </label>

      {errorMessage ? (
        <div className="rounded-lg border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 h-12 rounded-xl bg-p1 text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Sending..." : "Send magic link"}
      </button>
    </form>
  );
}
