"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

export function RefreshLiveButton({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function onClick() {
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/games/${gameId}/refresh`, {
          method: "POST",
        });
        if (res.status === 429) {
          const body = (await res.json().catch(() => ({}))) as {
            retry_in_seconds?: number;
          };
          setStatus(
            `Hold on — try again in ${body.retry_in_seconds ?? 60}s.`,
          );
          return;
        }
        if (!res.ok) {
          setStatus("Couldn't refresh. Try again shortly.");
          return;
        }
        router.refresh();
      } catch {
        setStatus("Network error. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
        {isPending ? "Refreshing..." : "Refresh now"}
      </button>
      {status ? (
        <span className="text-[11px] text-muted">{status}</span>
      ) : null}
    </div>
  );
}
