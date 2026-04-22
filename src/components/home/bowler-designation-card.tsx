"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";

import type { BowlerDesignationRow, PickRow } from "@/lib/db-types";
import { cn } from "@/lib/utils";

/**
 * Shown after the draft locks and before the match starts. Each user must
 * pick one of their 3 drafted players as their "bowler" commitment — a bet
 * that at least one of their three will actually bowl a ball in the match.
 *
 * If neither/nobody from a user's 3 picks bowls, the scoring engine zeros
 * all of that user's player points (team bonus still counts). The
 * designation itself is not strictly used in that math, but it forces the
 * user to think about bowling coverage.
 *
 * Both users can set their own designation asynchronously. Locked once the
 * match has started (enforced server-side too).
 */
export function BowlerDesignationCard({
  gameId,
  currentUserId,
  picks,
  designations,
  matchStartIso,
}: {
  gameId: string;
  currentUserId: string;
  picks: PickRow[];
  designations: BowlerDesignationRow[];
  matchStartIso: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Tracked in state so we don't call Date.now() during render (keeps the
  // component pure). Recomputed once on mount and every 30s.
  const [matchStarted, setMatchStarted] = useState(false);
  useEffect(() => {
    const startMs = new Date(matchStartIso).getTime();
    const check = () => setMatchStarted(startMs <= Date.now());
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [matchStartIso]);

  const myPicks = picks.filter(
    (p) =>
      p.user_id === currentUserId &&
      p.pick_type === "player" &&
      p.player_id !== null,
  );
  const myDesignation = designations.find((d) => d.user_id === currentUserId);

  function designate(playerId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/games/${gameId}/designate-bowler`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player_id: playerId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Failed to save.");
        return;
      }
      router.refresh();
    });
  }

  // Once the current user has designated, hide the card entirely — the
  // target icon rendered on their drafted player in `PicksTwoUp` above
  // communicates the choice. Show a short locked-out notice only if the
  // match started before they picked.
  if (myDesignation) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-p1" />
        <span className="text-xs font-medium uppercase tracking-wider text-p1">
          Designate bowler
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Pick one of your 3 players.{" "}
        <span className="text-foreground">This choice is final.</span> If none
        of your picks bowls a ball, all your player points go to 0. Team
        bonus still counts.
      </p>

      {myPicks.length < 3 ? (
        <div className="mt-3 text-xs text-muted">
          Finish your 3 player picks first.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {myPicks.map((p) => {
            const locked = matchStarted || isPending;
            return (
              <button
                key={p.id}
                type="button"
                disabled={locked}
                onClick={() => designate(p.player_id!)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
                  "border-border bg-surface hover:bg-surface-3",
                )}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[9px]" />
                <span className="flex-1 truncate">
                  {p.player_name ?? "Unknown"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <div className="mt-2 text-[11px] text-live">{error}</div>
      ) : null}
      {matchStarted ? (
        <div className="mt-2 text-[11px] text-live">
          Match started — designation locked.
        </div>
      ) : null}
    </div>
  );
}
