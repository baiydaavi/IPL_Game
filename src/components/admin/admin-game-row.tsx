"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, RefreshCw, Users } from "lucide-react";

import type { CricApiSquadEntry } from "@/lib/cricket";
import type {
  BowlerDesignationRow,
  GameMemberRow,
  GameRow,
  ImpactSubRow,
  MatchCachedRow,
  PickRow,
  UserRow,
} from "@/lib/db-types";
import { iplTeamCode } from "@/lib/ipl-teams";
import { IPL_TEAMS } from "@/lib/theme";
import { cn } from "@/lib/utils";

type MemberWithUser = GameMemberRow & { user: UserRow };

export function AdminGameRow({
  game,
  match,
  members,
  picks,
  impactSubs,
  bowlerDesignations,
  squad,
}: {
  game: GameRow;
  match?: Pick<MatchCachedRow, "match_id" | "date" | "team_a" | "team_b" | "status">;
  members: MemberWithUser[];
  picks: PickRow[];
  impactSubs: ImpactSubRow[];
  bowlerDesignations: BowlerDesignationRow[];
  squad: CricApiSquadEntry[];
}) {
  const router = useRouter();
  const [rescoring, startRescore] = useTransition();
  const [overriding, startOverride] = useTransition();
  const [editing, startEdit] = useTransition();
  const [refreshingSquad, startRefreshSquad] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const matchupCodes = match
    ? [iplTeamCode(match.team_a), iplTeamCode(match.team_b)]
    : ["—", "—"];
  const teamCodes = useMemo(
    () =>
      Array.from(
        new Set(
          [matchupCodes[0], matchupCodes[1]].filter((c) => c in IPL_TEAMS),
        ),
      ),
    [matchupCodes],
  );

  const membersByUserId = useMemo(() => {
    const m = new Map<string, MemberWithUser>();
    for (const row of members) m.set(row.user_id, row);
    return m;
  }, [members]);

  // All squad players flattened, with a team-code tag per player for filtering.
  const allSquadPlayers = useMemo(() => {
    const out: Array<{
      id: string;
      name: string;
      team_code: string;
      team_name: string;
    }> = [];
    for (const team of squad) {
      const teamCode = iplTeamCode(team.teamName);
      for (const p of team.players) {
        out.push({
          id: p.id,
          name: p.name,
          team_code: teamCode,
          team_name: team.teamName,
        });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [squad]);

  // Unique team entries for the Add-player dropdown. We want the raw name
  // (to send to the API) alongside a short display form.
  const squadTeams = useMemo(
    () =>
      squad.map((t) => ({
        name: t.teamName,
        short: t.shortname ?? iplTeamCode(t.teamName),
      })),
    [squad],
  );

  async function call(url: string, body?: unknown): Promise<void> {
    setStatus(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const parsed = (await res.json().catch(() => ({}))) as {
        reason?: string;
        detail?: string;
        error?: string;
        message?: string;
      };
      if (res.ok) {
        setStatus("Saved.");
        router.refresh();
      } else {
        setStatus(
          parsed.detail ??
            parsed.reason ??
            parsed.error ??
            parsed.message ??
            `Failed (${res.status})`,
        );
      }
    } catch {
      setStatus("Network error.");
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left"
        >
          <div className="text-sm font-medium">
            {matchupCodes[0]} vs {matchupCodes[1]}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-muted">
            {game.status}
            {match?.date
              ? ` · ${new Date(match.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}`
              : ""}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-3"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse" : "Edit picks"}
        >
          <Pencil className="h-3 w-3" />
          Edit
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
          />
        </button>
        <button
          type="button"
          onClick={() => startRescore(() => call(`/api/admin/games/${game.id}/rescore`))}
          disabled={rescoring || overriding || editing || refreshingSquad}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", rescoring && "animate-spin")} />
          Rescore
        </button>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Squad:
            </span>
            <button
              type="button"
              onClick={() =>
                startRefreshSquad(() =>
                  call(`/api/admin/games/${game.id}/refresh-squad`),
                )
              }
              disabled={rescoring || overriding || editing || refreshingSquad}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50"
              title="Force-repull the squad from CricAPI (1 hit on paid tier)"
            >
              <Users className={cn("h-3 w-3", refreshingSquad && "animate-pulse")} />
              Refresh squad
            </button>
          </div>
          {squadTeams.length > 0 ? (
            <AddSquadPlayer
              gameId={game.id}
              teams={squadTeams}
              disabled={rescoring || overriding || editing || refreshingSquad}
              onDone={() => router.refresh()}
              onError={(msg) => setStatus(msg)}
            />
          ) : null}
        </div>
      ) : null}

      {teamCodes.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            Override winner:
          </span>
          {teamCodes.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() =>
                startOverride(() =>
                  call(`/api/admin/games/${game.id}/override-winner`, {
                    team_code: code,
                  }),
                )
              }
              disabled={overriding || rescoring || editing}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              {code}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              startOverride(() =>
                call(`/api/admin/games/${game.id}/override-winner`, {
                  team_code: null,
                }),
              )
            }
            disabled={overriding || rescoring || editing}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            clear
          </button>
        </div>
      ) : null}

      {members.length > 0 ? (
        <div className="text-[11px] text-muted">
          {members
            .map(
              (m) =>
                `${m.slot}: ${m.user.display_name}${m.user_id === game.winner_user_id ? " (W)" : ""}`,
            )
            .join(" · ")}
        </div>
      ) : null}

      {expanded ? (
        <EditPanel
          gameId={game.id}
          members={members}
          picks={picks}
          impactSubs={impactSubs}
          bowlerDesignations={bowlerDesignations}
          squadPlayers={allSquadPlayers}
          teamCodes={teamCodes}
          membersByUserId={membersByUserId}
          disabled={editing || rescoring || overriding}
          onAction={(url, body) => startEdit(() => call(url, body))}
        />
      ) : null}

      {status ? <div className="text-[11px] text-muted">{status}</div> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Edit panel
// ---------------------------------------------------------------------------

function EditPanel({
  gameId,
  members,
  picks,
  impactSubs,
  bowlerDesignations,
  squadPlayers,
  teamCodes,
  membersByUserId,
  disabled,
  onAction,
}: {
  gameId: string;
  members: MemberWithUser[];
  picks: PickRow[];
  impactSubs: ImpactSubRow[];
  bowlerDesignations: BowlerDesignationRow[];
  squadPlayers: Array<{ id: string; name: string; team_code: string; team_name: string }>;
  teamCodes: string[];
  membersByUserId: Map<string, MemberWithUser>;
  disabled: boolean;
  onAction: (url: string, body?: unknown) => void;
}) {
  const picksByUser = useMemo(() => {
    const out = new Map<string, PickRow[]>();
    for (const p of picks) {
      const list = out.get(p.user_id) ?? [];
      list.push(p);
      out.set(p.user_id, list);
    }
    for (const [, list] of out) list.sort((a, b) => a.turn_index - b.turn_index);
    return out;
  }, [picks]);

  const bowlerByUser = useMemo(() => {
    const out = new Map<string, BowlerDesignationRow>();
    for (const d of bowlerDesignations) out.set(d.user_id, d);
    return out;
  }, [bowlerDesignations]);

  const impactByTeam = useMemo(() => {
    const out = new Map<string, ImpactSubRow>();
    for (const s of impactSubs) out.set(s.team_code, s);
    return out;
  }, [impactSubs]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2/40 p-3">
      {/* Picks per user */}
      {members.map((m) => {
        const userPicks = picksByUser.get(m.user_id) ?? [];
        const bowlerPid = bowlerByUser.get(m.user_id)?.player_id;
        return (
          <div key={m.user_id} className="flex flex-col gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
              {m.user.display_name} ({m.slot})
            </div>
            {userPicks.map((p) => (
              <PickEditor
                key={p.id}
                gameId={gameId}
                pick={p}
                squadPlayers={squadPlayers}
                teamCodes={teamCodes}
                disabled={disabled}
                onAction={onAction}
              />
            ))}
            {/* Bowler designation for this user (only valid if they have player picks) */}
            <BowlerEditor
              gameId={gameId}
              userId={m.user_id}
              currentPlayerId={bowlerPid ?? null}
              userPicks={userPicks.filter((p) => p.pick_type === "player")}
              disabled={disabled}
              onAction={onAction}
            />
          </div>
        );
      })}

      {/* Impact subs per team */}
      {teamCodes.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Impact subs
          </div>
          {teamCodes.map((tc) => (
            <ImpactSubEditor
              key={tc}
              gameId={gameId}
              teamCode={tc}
              current={impactByTeam.get(tc)}
              squadPlayers={squadPlayers.filter((p) => p.team_code === tc)}
              disabled={disabled}
              onAction={onAction}
            />
          ))}
        </div>
      ) : null}

      <p className="text-[10px] text-muted/70">
        Edits auto-rescore the game if it&apos;s locked or scored. Owner:
        {" "}
        {Array.from(membersByUserId.values())
          .map((m) => m.user.display_name)
          .join(" vs ")}
      </p>
    </div>
  );
}

function PickEditor({
  gameId,
  pick,
  squadPlayers,
  teamCodes,
  disabled,
  onAction,
}: {
  gameId: string;
  pick: PickRow;
  squadPlayers: Array<{ id: string; name: string; team_code: string; team_name: string }>;
  teamCodes: string[];
  disabled: boolean;
  onAction: (url: string, body?: unknown) => void;
}) {
  const [selected, setSelected] = useState<string>(
    pick.pick_type === "player"
      ? (pick.player_id ?? "")
      : (pick.team_code ?? ""),
  );

  function submit() {
    if (!selected) return;
    if (pick.pick_type === "player") {
      const player = squadPlayers.find((p) => p.id === selected);
      if (!player) return;
      onAction(`/api/admin/games/${gameId}/edit-pick`, {
        pick_id: pick.id,
        player_id: player.id,
        player_name: player.name,
      });
    } else {
      onAction(`/api/admin/games/${gameId}/edit-pick`, {
        pick_id: pick.id,
        team_code: selected,
      });
    }
  }

  const unchanged =
    pick.pick_type === "player"
      ? selected === pick.player_id
      : selected === pick.team_code;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-muted">
        {pick.pick_type === "player" ? `P${pick.turn_index + 1}` : "Team"}
      </span>
      {pick.pick_type === "player" ? (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs"
        >
          <option value="">— pick a player —</option>
          {squadPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.team_code})
            </option>
          ))}
        </select>
      ) : (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs"
        >
          <option value="">— pick a team —</option>
          {teamCodes.map((tc) => (
            <option key={tc} value={tc}>
              {tc}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !selected || unchanged}
        className="rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] font-medium hover:bg-surface-3 disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}

function BowlerEditor({
  gameId,
  userId,
  currentPlayerId,
  userPicks,
  disabled,
  onAction,
}: {
  gameId: string;
  userId: string;
  currentPlayerId: string | null;
  userPicks: PickRow[];
  disabled: boolean;
  onAction: (url: string, body?: unknown) => void;
}) {
  const [selected, setSelected] = useState<string>(currentPlayerId ?? "");

  function submit() {
    if (!selected) return;
    onAction(`/api/admin/games/${gameId}/edit-bowler`, {
      user_id: userId,
      player_id: selected,
    });
  }

  function clear() {
    onAction(`/api/admin/games/${gameId}/edit-bowler`, {
      user_id: userId,
      clear: true,
    });
  }

  const unchanged = selected === (currentPlayerId ?? "");

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-muted">
        Bowler
      </span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={disabled || userPicks.length === 0}
        className="min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs"
      >
        <option value="">— no designation —</option>
        {userPicks.map((p) => (
          <option key={p.id} value={p.player_id ?? ""}>
            {p.player_name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !selected || unchanged}
        className="rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] font-medium hover:bg-surface-3 disabled:opacity-40"
      >
        Save
      </button>
      {currentPlayerId ? (
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-3 disabled:opacity-40"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function ImpactSubEditor({
  gameId,
  teamCode,
  current,
  squadPlayers,
  disabled,
  onAction,
}: {
  gameId: string;
  teamCode: string;
  current: ImpactSubRow | undefined;
  squadPlayers: Array<{ id: string; name: string; team_code: string; team_name: string }>;
  disabled: boolean;
  onAction: (url: string, body?: unknown) => void;
}) {
  const [outPid, setOutPid] = useState(current?.out_player_id ?? "");
  const [inPid, setInPid] = useState(current?.in_player_id ?? "");

  function submit() {
    if (!outPid || !inPid || outPid === inPid) return;
    onAction(`/api/admin/games/${gameId}/edit-impact-sub`, {
      team_code: teamCode,
      out_player_id: outPid,
      in_player_id: inPid,
    });
  }

  function clear() {
    onAction(`/api/admin/games/${gameId}/edit-impact-sub`, {
      team_code: teamCode,
      clear: true,
    });
  }

  const canSave =
    !disabled && outPid && inPid && outPid !== inPid &&
    !(current && current.out_player_id === outPid && current.in_player_id === inPid);

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-muted">
          {teamCode}
        </span>
        <select
          value={outPid}
          onChange={(e) => setOutPid(e.target.value)}
          disabled={disabled || squadPlayers.length === 0}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs"
        >
          <option value="">— OUT —</option>
          {squadPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-muted">→</span>
        <select
          value={inPid}
          onChange={(e) => setInPid(e.target.value)}
          disabled={disabled || squadPlayers.length === 0}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs"
        >
          <option value="">— IN —</option>
          {squadPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] font-medium hover:bg-surface-3 disabled:opacity-40"
        >
          Save
        </button>
        {current ? (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-3 disabled:opacity-40"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-player-to-squad editor
// ---------------------------------------------------------------------------

/**
 * Manually append a player to the cached squad for this match. No CricAPI
 * hit — just mutates `squads_cached.raw_json`. Intended for late additions
 * that upstream is missing (e.g. replacement overseas players).
 *
 * Collapsible so it doesn't clutter the edit panel in the common case
 * where the admin just wants to refresh the squad from upstream.
 */
function AddSquadPlayer({
  gameId,
  teams,
  disabled,
  onDone,
  onError,
}: {
  gameId: string;
  teams: Array<{ name: string; short: string }>;
  disabled: boolean;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState(teams[0]?.name ?? "");
  const [playerName, setPlayerName] = useState("");
  const [role, setRole] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [saving, startSave] = useTransition();

  function submit() {
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      onError("Player name is required.");
      return;
    }
    if (!teamName) {
      onError("Pick a team.");
      return;
    }
    startSave(async () => {
      try {
        const res = await fetch(`/api/admin/games/${gameId}/add-squad-player`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            team_name: teamName,
            player_name: trimmedName,
            role: role.trim() || undefined,
            player_id: playerId.trim() || undefined,
          }),
        });
        const parsed = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (res.ok) {
          setPlayerName("");
          setRole("");
          setPlayerId("");
          onDone();
        } else {
          onError(parsed.message ?? parsed.error ?? `Failed (${res.status})`);
        }
      } catch {
        onError("Network error.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-3"
        aria-expanded={open}
      >
        + Add player to squad
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-1 p-2">
          <select
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            disabled={disabled || saving}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          >
            {teams.map((t) => (
              <option key={t.name} value={t.name}>
                {t.short}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            disabled={disabled || saving}
            placeholder="Player name *"
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          />
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={disabled || saving}
            placeholder="Role (opt.)"
            className="w-24 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          />
          <input
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            disabled={disabled || saving}
            placeholder="CricAPI id (opt.)"
            className="w-36 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-mono"
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || saving || !playerName.trim()}
            className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium hover:bg-surface-3 disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
