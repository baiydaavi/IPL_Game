"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { UserRow } from "@/lib/db-types";

/**
 * Admin widget for editing the pre-app head-to-head offset. Reads the
 * initial value off the server, lets the admin punch in wins per user,
 * POSTs to /api/admin/h2h-offset, and refreshes the page so the home-screen
 * H2H card picks up the new value.
 */
export function H2hOffsetEditor({
  users,
  initialOffset,
}: {
  users: UserRow[];
  initialOffset: Record<string, number>;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const u of users) out[u.id] = String(initialOffset[u.id] ?? 0);
    return out;
  });

  function submit() {
    const offset: Record<string, number> = {};
    for (const [userId, raw] of Object.entries(values)) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) offset[userId] = n;
    }
    startSave(async () => {
      setStatus(null);
      try {
        const res = await fetch("/api/admin/h2h-offset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ offset }),
        });
        if (res.ok) {
          setStatus("Saved.");
          router.refresh();
        } else {
          const parsed = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          setStatus(parsed.message ?? parsed.error ?? `Failed (${res.status})`);
        }
      } catch {
        setStatus("Network error.");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted">
        H2H offset
      </div>
      <p className="mt-1 text-sm text-muted">
        Pre-app wins added to each player&apos;s in-app tally on the home
        screen.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {users.map((u) => (
          <label
            key={u.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="truncate">{u.display_name}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values[u.id] ?? "0"}
              onChange={(e) =>
                setValues((v) => ({ ...v, [u.id]: e.target.value }))
              }
              disabled={saving}
              className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1 text-right font-mono text-sm tabular-nums"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium hover:bg-surface-3 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save offset"}
        </button>
        {status ? <span className="text-[11px] text-muted">{status}</span> : null}
      </div>
    </section>
  );
}
