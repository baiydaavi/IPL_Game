"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, X } from "lucide-react";

import { TeamChip } from "@/components/team-chip";
import type { ImpactSubRow } from "@/lib/db-types";
import { cn } from "@/lib/utils";

export type SquadForImpact = {
  team_code: string;
  team_name: string;
  players: Array<{ id: string; name: string }>;
};

/**
 * Lets either player report an impact-player substitution during a live
 * match. One entry per team (CSK + MI, whoever is playing). Editable until
 * the match finishes — last write wins.
 *
 * CricAPI free tier doesn't expose impact-player data, so this is manual
 * entry. The scoring engine reads `impact_subs` and redirects the benched
 * player's slot to the replacement (unless the replacement was separately
 * drafted, in which case nothing changes).
 */
export function ImpactSubCard({
  gameId,
  squads,
  impactSubs,
}: {
  gameId: string;
  squads: SquadForImpact[];
  impactSubs: ImpactSubRow[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-3.5 w-3.5 text-p2" />
        <span className="text-xs font-medium uppercase tracking-wider text-p2">
          Impact player
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Report any impact-sub used by either team. Edits are shared —
        whoever noticed first wins.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {squads.map((sq) => {
          const existing = impactSubs.find(
            (s) => s.team_code === sq.team_code,
          );
          return (
            <ImpactSubRow
              key={sq.team_code}
              gameId={gameId}
              squad={sq}
              existing={existing ?? null}
            />
          );
        })}
      </div>
    </div>
  );
}

function ImpactSubRow({
  gameId,
  squad,
  existing,
}: {
  gameId: string;
  squad: SquadForImpact;
  existing: ImpactSubRow | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(existing === null);
  const [outId, setOutId] = useState(existing?.out_player_id ?? "");
  const [inId, setInId] = useState(existing?.in_player_id ?? "");
  const [error, setError] = useState<string | null>(null);

  const sortedPlayers = useMemo(
    () => [...squad.players].sort((a, b) => a.name.localeCompare(b.name)),
    [squad.players],
  );

  function save() {
    setError(null);
    if (!outId || !inId) {
      setError("Pick both players.");
      return;
    }
    if (outId === inId) {
      setError("Out and In must be different.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/games/${gameId}/impact-sub`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          team_code: squad.team_code,
          out_player_id: outId,
          in_player_id: inId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Failed to save.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function clear() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/games/${gameId}/impact-sub`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team_code: squad.team_code, clear: true }),
      });
      if (!res.ok) {
        setError("Failed to clear.");
        return;
      }
      setOutId("");
      setInId("");
      setEditing(true);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <TeamChip code={squad.team_code} />
        <span className="text-xs text-muted">{squad.team_name}</span>
        {!editing && existing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto text-[11px] text-muted underline-offset-2 hover:underline"
          >
            edit
          </button>
        ) : null}
        {existing ? (
          <button
            type="button"
            onClick={clear}
            disabled={isPending}
            className="text-muted hover:text-foreground disabled:opacity-50"
            aria-label="Remove impact sub"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {!editing && existing ? (
        <div className="mt-2 text-sm">
          <span className="text-muted">OUT</span>{" "}
          <span className="text-foreground">{existing.out_player_name}</span>
          <span className="mx-1.5 text-muted">→</span>
          <span className="text-muted">IN</span>{" "}
          <span className="text-foreground">{existing.in_player_name}</span>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <PlayerSelect
            label="OUT"
            players={sortedPlayers}
            value={outId}
            onChange={setOutId}
          />
          <PlayerSelect
            label="IN"
            players={sortedPlayers}
            value={inId}
            onChange={setInId}
          />
        </div>
      )}

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isPending || !outId || !inId}
            className={cn(
              "rounded-md bg-p2 px-3 py-1 text-xs font-medium text-black transition-colors",
              "disabled:opacity-50",
            )}
          >
            {isPending ? "Saving…" : existing ? "Update" : "Save"}
          </button>
          {existing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setOutId(existing.out_player_id);
                setInId(existing.in_player_id);
                setError(null);
              }}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-1.5 text-[11px] text-live">{error}</div>
      ) : null}
    </div>
  );
}

function PlayerSelect({
  label,
  players,
  value,
  onChange,
}: {
  label: string;
  players: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm",
          "focus:border-ring focus:outline-none",
        )}
      >
        <option value="">— select —</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
