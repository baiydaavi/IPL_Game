"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Compact floating pill shown in BETA_MODE that lets the caller flip
 * between the two fake identities. Unlike `DemoPanel`, there are no
 * match-state / scenario controls — the beta build uses real CricAPI data.
 */
export function BetaIdentitySwitcher({
  activeName,
  otherEmail,
  otherName,
}: {
  activeName: string;
  otherEmail: string;
  otherName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function become() {
    setErr(null);
    startTransition(async () => {
      const res = await fetch("/api/demo/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: otherEmail }),
      });
      if (!res.ok) {
        setErr("Couldn't switch. Try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1">
      {err ? (
        <div className="rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-300">
          {err}
        </div>
      ) : null}
      <button
        type="button"
        onClick={become}
        disabled={isPending}
        className={cn(
          "flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur",
          "hover:bg-surface-3 transition disabled:opacity-60",
        )}
        title={`Currently: ${activeName}. Click to become ${otherName}.`}
      >
        <UserCog className="h-3.5 w-3.5" />
        <span className="tabular-nums">
          {isPending ? "Switching…" : `You: ${activeName} · Become ${otherName}`}
        </span>
      </button>
    </div>
  );
}
