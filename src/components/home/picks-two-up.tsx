"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

import type {
  BowlerDesignationRow,
  GameMemberRow,
  PickRow,
  ScoreRow,
  UserRow,
} from "@/lib/db-types";
import { accentFor } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Two side-by-side cards showing each player's picks + running points.
 * Used by the locked-pre-match, live, and finished states.
 */
export function PicksTwoUp({
  members,
  picks,
  scores,
  currentUserId,
  showPoints,
  highlightWinner,
  bowlerDesignations,
  footerRight,
}: {
  members: Array<GameMemberRow & { user: UserRow }>;
  picks: PickRow[];
  scores?: ScoreRow[];
  currentUserId: string;
  showPoints: boolean;
  highlightWinner?: string | null;
  /**
   * If provided, a dagger (†) is rendered next to the player each user
   * designated as their bowler commitment, with a matching legend below
   * the two-up grid.
   */
  bowlerDesignations?: BowlerDesignationRow[];
  /**
   * Optional node rendered on the right side of the footer row, sharing
   * the line with the "† Designated bowler" legend. Used by the
   * locked-pre-match state to tuck the countdown in next to the legend.
   */
  footerRight?: ReactNode;
}) {
  const p1 = members.find((m) => m.slot === "P1");
  const p2 = members.find((m) => m.slot === "P2");
  if (!p1 || !p2) return null;

  function breakdownFor(userId: string) {
    const score = scores?.find((s) => s.user_id === userId);
    const breakdown = (score?.breakdown ?? {}) as {
      players?: Array<{
        player_id: string;
        player_name: string;
        runs: number;
        wickets: number;
        total: number;
        /** True when the player bowled at least one ball in the match. */
        bowled?: boolean;
        /**
         * Forward redirect: this contribution is the IN player credited
         * to the slot of a drafted player who was subbed OUT. References
         * the drafted (OUT) player.
         */
        impact_sub_from?: { player_id: string; player_name: string };
        /**
         * Reverse redirect: this contribution is the OUT player's pre-sub
         * stats credited backward to the slot of a drafted player who
         * came IN as the impact sub. References the drafted (IN) player.
         */
        impact_sub_to?: { player_id: string; player_name: string };
      }>;
      team_pick?: string | null;
      team_bonus?: number;
      team_won?: boolean;
    };
    return { score, breakdown };
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
      {[p1, p2].map((m) => {
        const accent = accentFor(m.slot);
        const userPicks = picks
          .filter((p) => p.user_id === m.user_id)
          .sort((a, b) => a.turn_index - b.turn_index);
        const { score, breakdown } = breakdownFor(m.user_id);
        const isWinner = highlightWinner === m.user_id;

        const teamPick = userPicks.find((p) => p.pick_type === "team");
        const playerPicks = userPicks.filter((p) => p.pick_type === "player");
        const designatedPlayerId =
          bowlerDesignations?.find((d) => d.user_id === m.user_id)?.player_id ??
          null;
        // Two flavors of impact-sub extra contributions, both rendered as
        // a separate row beneath the drafted picks:
        //   - impact_sub_from: IN player credited because OUR drafted
        //     player was subbed OUT (forward redirect, "▲ subbed in").
        //   - impact_sub_to:   OUT player's pre-sub stats credited
        //     because OUR drafted player came IN as the sub
        //     (reverse redirect, "▼ replaced").
        const impactInRows = (breakdown.players ?? []).filter(
          (x) => x.impact_sub_from,
        );
        const impactOutRows = (breakdown.players ?? []).filter(
          (x) => x.impact_sub_to,
        );
        // Drafted players whose slots got an IN-redirect (i.e. they were
        // subbed out). The ▼ glyph next to their name flags it.
        const subbedOutIds = new Set(
          impactInRows
            .map((x) => x.impact_sub_from?.player_id)
            .filter((id): id is string => Boolean(id)),
        );
        // Drafted players who came IN as a sub (reverse redirect). The
        // ▲ glyph next to their name flags it.
        const cameInIds = new Set(
          impactOutRows
            .map((x) => x.impact_sub_to?.player_id)
            .filter((id): id is string => Boolean(id)),
        );

        return (
          <div
            key={m.user_id}
            className={cn(
              "rounded-xl p-3",
              accent.bgSoft,
              isWinner && "ring-2",
              isWinner && (m.slot === "P1" ? "ring-p1" : "ring-p2"),
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div
                className={cn(
                  "text-xs font-medium uppercase tracking-wider truncate",
                  accent.text,
                )}
              >
                {m.user.display_name}
                {m.user.id === currentUserId ? " (you)" : ""}
                {isWinner ? " · won" : ""}
              </div>
              {showPoints && score ? (
                <div className="font-mono text-2xl font-semibold tabular-nums">
                  {score.total}
                </div>
              ) : null}
            </div>

            {teamPick ? (
              <div className="mt-2 flex items-baseline justify-between gap-2 border-b border-border/50 pb-2 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {teamPick.team_code} to win
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted/70">
                    Team pick
                  </span>
                </span>
                {showPoints ? (
                  <span className="font-mono text-xs tabular-nums text-muted">
                    +{breakdown.team_bonus ?? 0}
                  </span>
                ) : null}
              </div>
            ) : null}

            <ul className="mt-2 flex flex-col gap-1 text-sm">
              <AnimatePresence initial={false}>
                {playerPicks.map((p) => {
                  // The drafted contribution row is the one whose
                  // player_id matches the pick AND isn't itself a redirect
                  // row (both impact_sub_from and impact_sub_to rows live
                  // alongside the drafted row in `breakdown.players`).
                  const playerLine = breakdown.players?.find(
                    (x) =>
                      x.player_id === p.player_id &&
                      !x.impact_sub_from &&
                      !x.impact_sub_to,
                  );
                  const wasSubbedOut =
                    p.player_id != null && subbedOutIds.has(p.player_id);
                  const cameInAsSub =
                    p.player_id != null && cameInIds.has(p.player_id);
                  return (
                    <motion.li
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-start justify-between gap-2"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          {wasSubbedOut ? (
                            <span
                              title="Subbed out (impact player)"
                              aria-label="Subbed out"
                              className="font-mono text-[10px] leading-none text-red-400"
                            >
                              ▼
                            </span>
                          ) : null}
                          {cameInAsSub ? (
                            <span
                              title="Came in as impact sub"
                              aria-label="Came in as impact sub"
                              className="font-mono text-[10px] leading-none text-emerald-400"
                            >
                              ▲
                            </span>
                          ) : null}
                          <span className="truncate">{p.player_name}</span>
                          {p.player_id != null &&
                          p.player_id === designatedPlayerId ? (
                            <span
                              title="Designated bowler"
                              aria-label="Designated bowler"
                              className={cn(
                                "font-mono text-xs leading-none",
                                accent.text,
                              )}
                            >
                              †
                            </span>
                          ) : null}
                          {showPoints && playerLine?.bowled ? (
                            <span
                              title="Bowled in this match"
                              aria-label="Bowled in this match"
                              className="text-[11px] leading-none"
                            >
                              ⚾
                            </span>
                          ) : null}
                        </span>
                        {showPoints ? (
                          <span className="font-mono text-[10px] tabular-nums text-muted/70">
                            {playerLine?.runs ?? 0} runs · {playerLine?.wickets ?? 0} wkts
                          </span>
                        ) : null}
                      </span>
                      {showPoints ? (
                        <span className="font-mono text-xs tabular-nums text-muted">
                          +{playerLine?.total ?? 0}
                        </span>
                      ) : null}
                    </motion.li>
                  );
                })}
                {showPoints
                  ? impactInRows.map((imp) => (
                      <motion.li
                        key={`impact-in-${imp.player_id}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start justify-between gap-2"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <span
                              title="Subbed in (impact player)"
                              aria-label="Subbed in"
                              className="font-mono text-[10px] leading-none text-emerald-400"
                            >
                              ▲
                            </span>
                            <span className="truncate">{imp.player_name}</span>
                            {imp.bowled ? (
                              <span
                                title="Bowled in this match"
                                aria-label="Bowled in this match"
                                className="text-[11px] leading-none"
                              >
                                ⚾
                              </span>
                            ) : null}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-muted/70">
                            {imp.runs} runs · {imp.wickets} wkts
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted">
                          +{imp.total}
                        </span>
                      </motion.li>
                    ))
                  : null}
                {showPoints
                  ? impactOutRows.map((imp) => (
                      <motion.li
                        key={`impact-out-${imp.player_id}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start justify-between gap-2"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <span
                              title="Replaced (impact player)"
                              aria-label="Replaced"
                              className="font-mono text-[10px] leading-none text-red-400"
                            >
                              ▼
                            </span>
                            <span className="truncate">{imp.player_name}</span>
                            {imp.bowled ? (
                              <span
                                title="Bowled in this match"
                                aria-label="Bowled in this match"
                                className="text-[11px] leading-none"
                              >
                                ⚾
                              </span>
                            ) : null}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-muted/70">
                            {imp.runs} runs · {imp.wickets} wkts
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted">
                          +{imp.total}
                        </span>
                      </motion.li>
                    ))
                  : null}
              </AnimatePresence>
            </ul>
          </div>
        );
      })}
      </div>
      {(bowlerDesignations && bowlerDesignations.length > 0) || footerRight ? (
        <div className="flex items-center justify-between gap-2">
          {bowlerDesignations && bowlerDesignations.length > 0 ? (
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
              <span className="font-mono text-muted">†</span>
              <span>Designated bowler</span>
            </div>
          ) : (
            <span />
          )}
          {footerRight ? <div>{footerRight}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
