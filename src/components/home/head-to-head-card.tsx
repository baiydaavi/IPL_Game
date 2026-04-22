"use client";

import { accentFor } from "@/lib/theme";
import type { UserRow } from "@/lib/db-types";
import { cn } from "@/lib/utils";

/**
 * Two-up head-to-head tally ("YOU 7 — 5 FRIEND") plus a last-5 form row
 * ("W W L W L"). Colored by player slot; the current user is always
 * highlighted with their P1/P2 accent.
 */
export function HeadToHeadCard({
  byUser,
  totalGames,
  recentForm,
  currentUserId,
  slotByUserId,
}: {
  byUser: Array<{ user: UserRow; wins: number }>;
  totalGames: number;
  recentForm: Array<{ gameId: string; winnerUserId: string | null; date: string }>;
  currentUserId: string;
  slotByUserId: Record<string, "P1" | "P2">;
}) {
  if (totalGames === 0 || byUser.length < 2) return null;

  const [a, b] = byUser;
  const slotA = slotByUserId[a.user.id] ?? "P1";
  const slotB = slotByUserId[b.user.id] ?? "P2";
  const accentA = accentFor(slotA);
  const accentB = accentFor(slotB);

  return (
    <div className="rounded-2xl border border-border bg-surface-1 px-4 py-4">
      <div className="flex items-stretch justify-between gap-3">
        <div className="flex-1">
          <div className={cn("text-xs font-medium uppercase tracking-wider truncate", accentA.text)}>
            {a.user.id === currentUserId ? "You" : a.user.display_name}
          </div>
          <div className="font-mono text-3xl font-semibold tabular-nums">{a.wins}</div>
        </div>
        <div className="flex flex-col">
          <div aria-hidden className="text-xs font-medium uppercase tracking-wider">&nbsp;</div>
          <div className="flex flex-1 items-center font-mono text-3xl font-semibold text-muted">—</div>
        </div>
        <div className="flex-1 text-right">
          <div className={cn("text-xs font-medium uppercase tracking-wider truncate", accentB.text)}>
            {b.user.id === currentUserId ? "You" : b.user.display_name}
          </div>
          <div className="font-mono text-3xl font-semibold tabular-nums">{b.wins}</div>
        </div>
      </div>
      {recentForm.length > 0 ? (
        <div className="mt-3 flex items-center gap-1 text-[11px] text-muted">
          <span>last {recentForm.length}:</span>
          <div className="flex items-center gap-1">
            {recentForm.map((f) => {
              const won = f.winnerUserId === currentUserId;
              return (
                <span
                  key={f.gameId}
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-sm font-mono text-[10px] font-semibold",
                    f.winnerUserId === null
                      ? "bg-surface-2 text-muted"
                      : won
                        ? "bg-p1-soft text-p1"
                        : "bg-p2-soft text-p2",
                  )}
                >
                  {f.winnerUserId === null ? "T" : won ? "W" : "L"}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
