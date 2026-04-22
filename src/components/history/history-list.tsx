"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { PicksTwoUp } from "@/components/home/picks-two-up";
import { iplTeamCode } from "@/lib/ipl-teams";
import type { PastGame } from "@/lib/past-games";
import { cn } from "@/lib/utils";

type Filters = {
  month: string | "all";
  winner: string | "all";
};

export function HistoryList({
  games,
  currentUserId,
  page,
  hasNextPage,
}: {
  games: PastGame[];
  currentUserId: string;
  page: number;
  hasNextPage: boolean;
}) {
  const [filters, setFilters] = useState<Filters>({ month: "all", winner: "all" });
  const [openId, setOpenId] = useState<string | null>(null);

  // Deep-link to ?game=id from home-screen list
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.startsWith("#game-")) {
      setOpenId(hash.slice("#game-".length));
    }
  }, []);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      const d = new Date(g.match.date);
      if (!Number.isNaN(d.getTime())) {
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    }
    return Array.from(set).sort().reverse();
  }, [games]);

  const winners = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of games) {
      for (const m of g.members) seen.set(m.user_id, m.user.display_name);
    }
    return Array.from(seen.entries());
  }, [games]);

  const filtered = useMemo(() => {
    return games.filter((g) => {
      if (filters.month !== "all") {
        const d = new Date(g.match.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key !== filters.month) return false;
      }
      if (filters.winner !== "all") {
        if (g.game.winner_user_id !== filters.winner) return false;
      }
      return true;
    });
  }, [games, filters]);

  if (games.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface-1 px-4 py-10 text-center">
        <p className="text-sm text-muted">No past games yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs">
        <FilterSelect
          label="Month"
          value={filters.month}
          onChange={(v) => setFilters((f) => ({ ...f, month: v }))}
          options={[
            { value: "all", label: "All months" },
            ...months.map((m) => ({
              value: m,
              label: new Date(m + "-01").toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              }),
            })),
          ]}
        />
        <FilterSelect
          label="Winner"
          value={filters.winner}
          onChange={(v) => setFilters((f) => ({ ...f, winner: v }))}
          options={[
            { value: "all", label: "Anyone" },
            ...winners.map(([id, name]) => ({
              value: id,
              label: id === currentUserId ? "You" : name,
            })),
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-1 px-4 py-10 text-center">
          <p className="text-sm text-muted">No games match these filters.</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface-1 divide-y divide-border">
          {filtered.map((game) => (
            <HistoryRow
              key={game.game.id}
              game={game}
              currentUserId={currentUserId}
              isOpen={openId === game.game.id}
              onToggle={() =>
                setOpenId((prev) => (prev === game.game.id ? null : game.game.id))
              }
            />
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link
            href={`/history?page=${page - 1}`}
            className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Newer
          </Link>
        ) : (
          <span />
        )}
        <span className="text-xs text-muted">Page {page}</span>
        {hasNextPage ? (
          <Link
            href={`/history?page=${page + 1}`}
            className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
          >
            Older <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex-1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function HistoryRow({
  game,
  currentUserId,
  isOpen,
  onToggle,
}: {
  game: PastGame;
  currentUserId: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const winner = game.members.find((m) => m.user_id === game.game.winner_user_id);
  const p1 = game.members.find((m) => m.slot === "P1");
  const p2 = game.members.find((m) => m.slot === "P2");
  const s1 = game.scores.find((s) => s.user_id === p1?.user_id);
  const s2 = game.scores.find((s) => s.user_id === p2?.user_id);
  const youWon = winner?.user_id === currentUserId;
  const winnerLabel = winner
    ? winner.user_id === currentUserId
      ? "You won"
      : `${winner.user.display_name} won`
    : "Tie";
  const teamA = iplTeamCode(game.match.team_a);
  const teamB = iplTeamCode(game.match.team_b);

  return (
    <li id={`game-${game.game.id}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <div className="min-w-[56px] text-[11px] uppercase tracking-wider text-muted">
          {formatShortDate(game.match.date)}
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
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="expand"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <PicksTwoUp
                members={game.members}
                picks={game.picks}
                scores={game.scores}
                currentUserId={currentUserId}
                showPoints
                highlightWinner={game.game.winner_user_id}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
