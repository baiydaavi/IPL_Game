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
  leagueGamesRemaining,
}: {
  byUser: Array<{ user: UserRow; wins: number }>;
  totalGames: number;
  recentForm: Array<{ gameId: string; winnerUserId: string | null; date: string }>;
  currentUserId: string;
  slotByUserId: Record<string, "P1" | "P2">;
  /**
   * Number of IPL matches in the current season that haven't ended yet
   * (upcoming + live). `null` means the source is unavailable — in that
   * case we silently skip the pill rather than show a misleading "0".
   */
  leagueGamesRemaining?: number | null;
}) {
  if (totalGames === 0 || byUser.length < 2) return null;

  const [a, b] = byUser;
  const slotA = slotByUserId[a.user.id] ?? "P1";
  const slotB = slotByUserId[b.user.id] ?? "P2";
  const accentA = accentFor(slotA);
  const accentB = accentFor(slotB);

  const aLeads = a.wins > b.wins;
  const bLeads = b.wins > a.wins;
  const delta = Math.abs(a.wins - b.wins);

  // Contrast strategy: the leader's score stays at full foreground weight,
  // the trailer's number dims to muted. A single caption under the center
  // em-dash spells out the lead in plain language ("You lead by 3") in the
  // leader's accent color. Avoids a negative "-N" on the losing side.
  const leaderLabel = aLeads
    ? a.user.id === currentUserId
      ? "You lead"
      : `${a.user.display_name} leads`
    : bLeads
      ? b.user.id === currentUserId
        ? "You lead"
        : `${b.user.display_name} leads`
      : null;
  const leaderAccent = aLeads ? accentA : bLeads ? accentB : null;

  const hasFooter =
    recentForm.length > 0 ||
    (leagueGamesRemaining != null && leagueGamesRemaining > 0);

  return (
    <div className="rounded-2xl border border-border bg-surface-1 px-4 py-4">
      {/* Row 1: names + scores. The em-dash column holds nothing below the
          number; the lead caption lives on its own centered row below. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div
            className={cn(
              "text-xs font-medium uppercase tracking-wider truncate",
              accentA.text,
            )}
          >
            {a.user.id === currentUserId ? "You" : a.user.display_name}
          </div>
          <div
            className={cn(
              "font-mono text-3xl font-semibold tabular-nums transition-colors",
              bLeads && "text-muted/70",
            )}
          >
            {a.wins}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div aria-hidden className="text-xs font-medium uppercase tracking-wider">&nbsp;</div>
          <div className="font-mono text-3xl font-semibold text-muted">—</div>
        </div>
        <div className="flex-1 text-right">
          <div
            className={cn(
              "text-xs font-medium uppercase tracking-wider truncate",
              accentB.text,
            )}
          >
            {b.user.id === currentUserId ? "You" : b.user.display_name}
          </div>
          <div
            className={cn(
              "font-mono text-3xl font-semibold tabular-nums transition-colors",
              aLeads && "text-muted/70",
            )}
          >
            {b.wins}
          </div>
        </div>
      </div>

      {/* Row 2: centered verdict. Reads like a caption for the whole
          row above rather than a floating annotation on the em-dash. */}
      {leaderLabel && leaderAccent && delta > 0 ? (
        <div
          className={cn(
            "mt-2 text-center text-[10px] font-medium uppercase tracking-wider",
            leaderAccent.text,
          )}
        >
          {leaderLabel} by {delta}
        </div>
      ) : null}

      {/* Row 3: season-context footer, separated by a thin divider so it
          reads as a different tier of info ("this match" vs "the season"). */}
      {hasFooter ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-[11px] text-muted">
          {recentForm.length > 0 ? (
            <div className="flex items-center gap-1">
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
          ) : (
            <span aria-hidden />
          )}
          {leagueGamesRemaining != null && leagueGamesRemaining > 0 ? (
            <span className="tabular-nums">
              <span className="font-mono font-medium text-foreground">
                {leagueGamesRemaining}
              </span>{" "}
              {leagueGamesRemaining === 1 ? "game" : "games"} remaining
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
