"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

export function RefreshFixturesButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function onClick() {
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/fixtures/refresh", { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as {
          count?: number;
          message?: string;
        };
        if (res.ok) {
          setStatus(`Pulled ${body.count ?? 0} fixtures.`);
          router.refresh();
        } else {
          setStatus(body.message ?? "Failed.");
        }
      } catch {
        setStatus("Network error.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
        {isPending ? "Refreshing..." : "Refresh"}
      </button>
      {status ? <span className="text-[11px] text-muted">{status}</span> : null}
    </div>
  );
}
