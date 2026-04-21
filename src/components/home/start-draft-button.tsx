"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { startDraft } from "@/app/actions/start-draft";

export function StartDraftButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await startDraft({ matchId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-p1 px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Starting..." : "Start draft"}
      </button>
      {error ? (
        <div className="rounded-lg border border-live/30 bg-live/10 px-3 py-2 text-xs text-live">
          {error}
        </div>
      ) : null}
    </div>
  );
}
