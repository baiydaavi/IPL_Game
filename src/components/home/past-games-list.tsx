"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { iplTeamCode } from "@/lib/ipl-teams";
import { parseMatchDate } from "@/lib/match-time";
import type { PastGame } from "@/lib/past-games";
import { cn } from "@/lib/utils";

/**
 * Past-games list for the home screen. Each row shows the date, the
 * matchup (e.g. "CSK vs MI"), who won, and the two user totals. Clicking
 * a row navigates to /history#game-<id> to see the full breakdown.
 */
export function PastGamesList({
  games,
  currentUserId,
  showSeeAll = true,
}: {
  games: PastGame[];
  currentUserId: string;
  showSeeAll?: boolean;
}) {
  if (games.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface-1 px-4 py-6 text-center">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Past games
        </div>
        <p className="mt-1 text-sm text-muted">
          No finished games yet. Your first result will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Past games
        </div>
        {showSeeAll ? (
          <Link
            href="/history"
            className="inline-flex items-center gap-0.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            see all
            <ChevronRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {games.map(({ game, match, members, scores }) => {
          const winner = members.find((m) => m.user_id === game.winner_user_id);
          const p1 = members.find((m) => m.slot === "P1");
          const p2 = members.find((m) => m.slot === "P2");
          const s1 = scores.find((s) => s.user_id === p1?.user_id);
          const s2 = scores.find((s) => s.user_id === p2?.user_id);
          const winnerLabel = winner
            ? winner.user_id === currentUserId
              ? "You won"
              : `${winner.user.display_name} won`
            : "Tie";
          const youWon = winner?.user_id === currentUserId;
          const teamA = iplTeamCode(match.team_a);
          const teamB = iplTeamCode(match.team_b);

          return (
            <li key={game.id}>
              <Link
                href={`/history#game-${game.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <div className="min-w-[56px] text-[11px] uppercase tracking-wider text-muted">
                  {formatShortDate(match.date)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {teamA} vs {teamB}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] uppercase tracking-wider",
                      winner ? (youWon ? "text-p1" : "text-p2") : "text-muted",
                    )}
                  >
                    {winnerLabel}
                  </div>
                </div>
                <div className="font-mono text-sm tabular-nums text-muted">
                  {s1?.total ?? 0} · {s2?.total ?? 0}
                </div>
                <ChevronRight className="h-4 w-4 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatShortDate(iso: string): string {
  try {
    const d = parseMatchDate(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
