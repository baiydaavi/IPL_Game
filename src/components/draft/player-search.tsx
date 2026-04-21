"use client";

import { useEffect, useMemo, useState } from "react";

import type { CricApiSquadEntry } from "@/lib/cricket";
import { iplTeamCode } from "@/lib/ipl-teams";
import { teamPalette } from "@/lib/theme";

export type SquadPlayer = {
  id: string;
  name: string;
  teamCode: string;
  role?: string;
};

function toTeamLists(squads: CricApiSquadEntry[]): {
  teamCode: string;
  teamName: string;
  players: SquadPlayer[];
}[] {
  return squads.map((team) => {
    const code = iplTeamCode(team.teamName);
    return {
      teamCode: code,
      teamName: team.teamName,
      players: team.players.map((p) => ({
        id: p.id,
        name: p.name,
        teamCode: code,
        role: p.role,
      })),
    };
  });
}

export function PlayerSearch({
  matchId,
  disabledPlayerIds,
  onPick,
  isSubmitting,
}: {
  matchId: string;
  disabledPlayerIds: Set<string>;
  onPick: (player: SquadPlayer) => void;
  isSubmitting: boolean;
}) {
  const [squads, setSquads] = useState<CricApiSquadEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cricket/squad/${encodeURIComponent(matchId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as { squad: CricApiSquadEntry[] };
        if (!cancelled) setSquads(body.squad ?? []);
      } catch (err) {
        if (!cancelled) {
          console.error("[PlayerSearch] squad load failed", err);
          setLoadError("Couldn't load squads. Try again in a moment.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const teams = useMemo(() => (squads ? toTeamLists(squads) : []), [squads]);

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.map((t) => ({
      ...t,
      players: t.players.filter((p) => p.name.toLowerCase().includes(q)),
    }));
  }, [teams, query]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        inputMode="search"
        placeholder="Search players..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-p1 focus:ring-2 focus:ring-p1/40"
      />

      {loadError ? (
        <div className="rounded-lg border border-live/30 bg-live/10 px-3 py-2 text-xs text-live">
          {loadError}
        </div>
      ) : null}

      {!squads && !loadError ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((col) => (
            <div
              key={col}
              className="flex flex-col gap-2 rounded-xl border border-border p-2"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-8 w-full rounded" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredTeams.map((team) => {
            const palette = teamPalette(team.teamCode);
            return (
              <div
                key={team.teamCode}
                className="flex flex-col overflow-hidden rounded-xl border border-border"
              >
                <div
                  className="flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: palette.tint,
                    color: palette.fg,
                  }}
                >
                  <span>{team.teamCode}</span>
                  <span className="opacity-70">{team.players.length}</span>
                </div>
                <ul className="flex flex-col divide-y divide-border">
                  {team.players.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-muted">
                      No matches
                    </li>
                  ) : (
                    team.players.map((p) => {
                      const disabled =
                        disabledPlayerIds.has(p.id) || isSubmitting;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onPick(p)}
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="w-full truncate text-sm font-medium">
                              {p.name}
                            </span>
                            {p.role ? (
                              <span className="text-[9px] uppercase tracking-wider text-muted">
                                {p.role}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
