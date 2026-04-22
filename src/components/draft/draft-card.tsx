"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PlayerSearch, type SquadPlayer } from "@/components/draft/player-search";
import { TeamPicker } from "@/components/draft/team-picker";
import { TurnBoard } from "@/components/draft/turn-board";
import type { GameMemberRow, GameRow, PickRow, UserRow } from "@/lib/db-types";
import {
  deriveTurnState,
  partitionMembers,
  slotForTurn,
  type DraftMembers,
} from "@/lib/draft";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { accentFor } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type DraftCardProps = {
  currentUserId: string;
  fixture: { match_id: string; team_a: string; team_b: string };
  game: GameRow;
  members: Array<GameMemberRow & { user: UserRow }>;
  initialPicks: PickRow[];
};

export function DraftCard({
  currentUserId,
  fixture,
  game,
  members: membersWithUsers,
  initialPicks,
}: DraftCardProps) {
  const [picks, setPicks] = useState<PickRow[]>(initialPicks);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build lookup from user_id -> display_name + slot.
  const bySlot: DraftMembers = useMemo(
    () => partitionMembers(membersWithUsers),
    [membersWithUsers],
  );
  const usersBySlot = useMemo(() => {
    const p1 = membersWithUsers.find((m) => m.slot === "P1")!;
    const p2 = membersWithUsers.find((m) => m.slot === "P2")!;
    return { P1: p1.user, P2: p2.user };
  }, [membersWithUsers]);
  const myMember = membersWithUsers.find((m) => m.user_id === currentUserId);
  const mySlot = myMember?.slot ?? null;

  const firstPickerSlot: "P1" | "P2" =
    game.first_picker_user_id === usersBySlot.P1.id ? "P1" : "P2";

  const turnState = useMemo(
    () => deriveTurnState(game, bySlot, picks),
    [game, bySlot, picks],
  );
  const isMyTurn = turnState.nextUserId === currentUserId;
  const upNextName =
    turnState.nextSlot === "P1"
      ? usersBySlot.P1.display_name
      : turnState.nextSlot === "P2"
        ? usersBySlot.P2.display_name
        : null;

  // Realtime subscription to picks for this game. When the browser client
  // can't be initialised (e.g. env vars not available in the bundle yet),
  // we silently skip — the polling fallback below keeps state fresh.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`picks:${game.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "picks",
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          const next = payload.new as PickRow;
          setPicks((prev) => {
            if (prev.some((p) => p.id === next.id)) return prev;
            return [...prev, next].sort((a, b) => a.turn_index - b.turn_index);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game.id]);

  // Poll for picks every 3s while the draft is active. Belt-and-braces
  // for the realtime subscription: if the publication isn't wired on the
  // Supabase project or the socket drops, the UI still catches up within
  // a few seconds. Stops polling once all 8 picks are in or the tab is
  // hidden.
  useEffect(() => {
    if (turnState.isComplete) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(poll, 5000);
        return;
      }
      try {
        const res = await fetch(`/api/games/${game.id}/pick`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (res.ok) {
          const data = (await res.json()) as { picks: PickRow[] };
          if (!cancelled && Array.isArray(data.picks)) {
            setPicks((prev) => {
              if (prev.length === data.picks.length) {
                const prevLastId = prev[prev.length - 1]?.id ?? null;
                const nextLastId =
                  data.picks[data.picks.length - 1]?.id ?? null;
                if (prevLastId === nextLastId) return prev;
              }
              return [...data.picks].sort(
                (a, b) => a.turn_index - b.turn_index,
              );
            });
          }
        }
      } catch {
        // Network blips are fine — next tick will retry.
      } finally {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    };

    timer = setTimeout(poll, 3000);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        if (timer) clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [game.id, turnState.isComplete]);

  const submit = useCallback(
    async (body: object) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/games/${game.id}/pick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown };
          const msg = humanizePickError(data.error, data.detail);
          setError(msg);
          return;
        }
        const data = (await res.json()) as { pick: PickRow };
        setPicks((prev) => {
          if (prev.some((p) => p.id === data.pick.id)) return prev;
          return [...prev, data.pick].sort((a, b) => a.turn_index - b.turn_index);
        });
      } catch (err) {
        console.error("[DraftCard] submit failed", err);
        setError("Network error. Try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [game.id],
  );

  const onPickPlayer = useCallback(
    (player: SquadPlayer) => {
      void submit({
        pick_type: "player",
        player_id: player.id,
        player_name: player.name,
      });
    },
    [submit],
  );

  const onPickTeam = useCallback(
    (teamCode: string) => {
      void submit({ pick_type: "team", team_code: teamCode });
    },
    [submit],
  );

  const disabledPlayerIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of picks) {
      if (p.pick_type === "player" && p.player_id) set.add(p.player_id);
    }
    return set;
  }, [picks]);

  // Picks grouped by slot for the "Already picked" summary.
  const picksByUser = useMemo(() => {
    const p1: PickRow[] = [];
    const p2: PickRow[] = [];
    for (const pick of picks) {
      if (pick.user_id === usersBySlot.P1.id) p1.push(pick);
      else p2.push(pick);
    }
    return { p1, p2 };
  }, [picks, usersBySlot]);

  return (
    <div className="flex flex-col gap-4">
      {/* Turn progress */}
      <div className="flex items-center gap-3">
        <TurnBoard
          picks={picks}
          nextTurnIndex={turnState.nextTurnIndex}
          getSlotForTurn={(i) => slotForTurn(firstPickerSlot, i)}
        />
        <span className="ml-auto text-xs uppercase tracking-wider text-muted">
          Turn {Math.min(turnState.nextTurnIndex + 1, 8)} / 8
        </span>
      </div>

      {/* Whose turn / instruction */}
      {turnState.isComplete ? (
        <div className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm">
          Draft complete. Waiting for match to start.
        </div>
      ) : isMyTurn ? (
        <div className={cn("rounded-xl border px-3 py-3", mySlot && accentFor(mySlot).border, mySlot && accentFor(mySlot).bgSoft)}>
          <div className={cn("text-xs font-medium uppercase tracking-wider", mySlot && accentFor(mySlot).text)}>
            Your turn
          </div>
          <div className="mt-0.5 text-sm text-muted">
            Pick a {turnState.nextPickType}.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-muted">
          Waiting for <span className="font-medium text-foreground">{upNextName}</span>...
        </div>
      )}

      {/* Already picked summary */}
      <div className="grid grid-cols-2 gap-3">
        {(["P1", "P2"] as const).map((slot) => {
          const user = usersBySlot[slot];
          const myPicks = slot === "P1" ? picksByUser.p1 : picksByUser.p2;
          const accent = accentFor(slot);
          return (
            <div key={slot} className={cn("rounded-xl p-3", accent.bgSoft)}>
              <div className={cn("text-xs font-medium uppercase tracking-wider", accent.text)}>
                {user.display_name}
                {user.id === currentUserId ? " (you)" : ""}
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                <AnimatePresence initial={false}>
                  {myPicks.map((p) => (
                    <motion.li
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="truncate"
                    >
                      {p.pick_type === "player" ? p.player_name : `${p.team_code} to win`}
                    </motion.li>
                  ))}
                </AnimatePresence>
                {myPicks.length === 0 ? (
                  <li className="text-xs text-muted">—</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Input */}
      {!turnState.isComplete && isMyTurn ? (
        turnState.nextPickType === "player" ? (
          <PlayerSearch
            matchId={fixture.match_id}
            disabledPlayerIds={disabledPlayerIds}
            onPick={onPickPlayer}
            isSubmitting={isSubmitting}
          />
        ) : (
          <TeamPicker
            teamA={fixture.team_a}
            teamB={fixture.team_b}
            onPick={onPickTeam}
            isSubmitting={isSubmitting}
          />
        )
      ) : null}

      {error ? (
        <div className="rounded-lg border border-live/30 bg-live/10 px-3 py-2 text-xs text-live">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function humanizePickError(code?: string, detail?: unknown): string {
  switch (code) {
    case "unauthorized":
      return "Please sign in again.";
    case "game_not_found":
      return "This game no longer exists.";
    case "game_not_drafting":
      return "The draft has already been locked.";
    case "not_a_member":
      return "You aren't a member of this game.";
    case "invalid_pick": {
      const d = detail as { kind?: string } | undefined;
      switch (d?.kind) {
        case "not-your-turn":
          return "It's not your turn right now.";
        case "wrong-pick-type":
          return "That pick type isn't allowed for this turn.";
        case "duplicate-player":
          return "That player has already been picked.";
        case "draft-complete":
          return "The draft is already complete.";
        default:
          return "That pick isn't valid.";
      }
    }
    case "insert_failed":
      return "Pick collided with your friend's pick. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}
