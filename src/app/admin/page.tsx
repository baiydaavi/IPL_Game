import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { AdminGameRow } from "@/components/admin/admin-game-row";
import { H2hOffsetEditor } from "@/components/admin/h2h-offset-editor";
import { RefreshFixturesButton } from "@/components/admin/refresh-fixtures-button";
import { isAdminEmail } from "@/lib/admin-auth";
import type { CricApiSquadEntry } from "@/lib/cricket";
import type {
  AppConfigRow,
  BowlerDesignationRow,
  GameMemberRow,
  GameRow,
  ImpactSubRow,
  MatchCachedRow,
  PickRow,
  SquadCachedRow,
  UserRow,
} from "@/lib/db-types";
import { isIdentityBypassMode } from "@/lib/demo";
import { getEffectiveUser } from "@/lib/effective-user";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect("/");

  const user = await getEffectiveUser();
  if (!user) redirect("/login");
  if (!isIdentityBypassMode() && !isAdminEmail(user.email)) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12">
        <h1 className="text-lg font-semibold">Not authorized</h1>
        <p className="text-sm text-muted">
          Your email isn&apos;t in the admin allowlist.
        </p>
        <Link href="/" className="text-sm text-p1 hover:underline">
          Back home
        </Link>
      </main>
    );
  }

  const admin = createSupabaseServiceClient();

  // CricAPI usage singleton (latest stats we've seen in any response envelope).
  const { data: usageRow } = await admin
    .from("cric_api_usage")
    .select("hits_today, hits_used, hits_limit, credits, last_fetched_at, last_path")
    .eq("key", "singleton")
    .maybeSingle();
  const usage = usageRow as {
    hits_today: number | null;
    hits_used: number | null;
    hits_limit: number | null;
    credits: number | null;
    last_fetched_at: string | null;
    last_path: string | null;
  } | null;

  // H2H offset (pre-app wins per user).
  const { data: configRow } = await admin
    .from("app_config")
    .select("h2h_offset")
    .eq("key", "singleton")
    .maybeSingle();
  const h2hOffset =
    ((configRow as Pick<AppConfigRow, "h2h_offset"> | null)?.h2h_offset ??
      {}) as Record<string, number>;

  const { data: gamesData } = await admin
    .from("games")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  const games = (gamesData ?? []) as GameRow[];

  const matchIds = [...new Set(games.map((g) => g.match_id))];
  const gameIds = games.map((g) => g.id);

  const [
    { data: matches },
    { data: members },
    { data: users },
    { data: picks },
    { data: impactSubs },
    { data: bowlers },
    { data: squads },
  ] = await Promise.all([
    matchIds.length > 0
      ? admin
          .from("matches_cached")
          .select("match_id, date, team_a, team_b, status")
          .in("match_id", matchIds)
      : Promise.resolve({ data: [] }),
    gameIds.length > 0
      ? admin.from("game_members").select("*").in("game_id", gameIds)
      : Promise.resolve({ data: [] }),
    admin.from("users").select("*"),
    gameIds.length > 0
      ? admin.from("picks").select("*").in("game_id", gameIds)
      : Promise.resolve({ data: [] }),
    gameIds.length > 0
      ? admin.from("impact_subs").select("*").in("game_id", gameIds)
      : Promise.resolve({ data: [] }),
    gameIds.length > 0
      ? admin.from("bowler_designations").select("*").in("game_id", gameIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? admin.from("squads_cached").select("match_id, raw_json").in("match_id", matchIds)
      : Promise.resolve({ data: [] }),
  ]);

  const matchById = new Map(
    ((matches ?? []) as MatchCachedRow[]).map((m) => [m.match_id, m]),
  );
  const userById = new Map(((users ?? []) as UserRow[]).map((u) => [u.id, u]));
  const membersByGame = new Map<string, Array<GameMemberRow & { user: UserRow }>>();
  for (const m of (members ?? []) as GameMemberRow[]) {
    const list = membersByGame.get(m.game_id) ?? [];
    const user = userById.get(m.user_id);
    if (user) list.push({ ...m, user });
    membersByGame.set(m.game_id, list);
  }

  const picksByGame = new Map<string, PickRow[]>();
  for (const p of (picks ?? []) as PickRow[]) {
    const list = picksByGame.get(p.game_id) ?? [];
    list.push(p);
    picksByGame.set(p.game_id, list);
  }

  const impactByGame = new Map<string, ImpactSubRow[]>();
  for (const s of (impactSubs ?? []) as ImpactSubRow[]) {
    const list = impactByGame.get(s.game_id) ?? [];
    list.push(s);
    impactByGame.set(s.game_id, list);
  }

  const bowlersByGame = new Map<string, BowlerDesignationRow[]>();
  for (const d of (bowlers ?? []) as BowlerDesignationRow[]) {
    const list = bowlersByGame.get(d.game_id) ?? [];
    list.push(d);
    bowlersByGame.set(d.game_id, list);
  }

  const squadByMatch = new Map<string, CricApiSquadEntry[]>();
  for (const s of (squads ?? []) as Pick<SquadCachedRow, "match_id" | "raw_json">[]) {
    squadByMatch.set(s.match_id, (s.raw_json ?? []) as CricApiSquadEntry[]);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Home
        </Link>
        <h1 className="ml-2 text-lg font-semibold tracking-tight">Admin</h1>
      </header>

      <section className="rounded-2xl border border-border bg-surface-1 p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          CricAPI usage
        </div>
        {usage && usage.hits_today != null ? (
          <>
            <div className="mt-3 flex items-baseline gap-3">
              <div className="font-mono text-3xl font-semibold tabular-nums">
                {usage.hits_today}
              </div>
              <div className="text-sm text-muted">
                / {usage.hits_limit ?? "?"} hits today
              </div>
            </div>
            {usage.hits_limit ? (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-p1"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((usage.hits_today ?? 0) / usage.hits_limit) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted">
              <span>Credits: {usage.credits ?? "—"}</span>
              <span>Total used: {usage.hits_used ?? "—"}</span>
              {usage.last_fetched_at ? (
                <span>
                  Last: {new Date(usage.last_fetched_at).toLocaleString()}
                  {usage.last_path ? ` (${usage.last_path})` : ""}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No CricAPI call recorded yet. Trigger a refresh below to populate.
          </p>
        )}
      </section>

      <H2hOffsetEditor
        users={(users ?? []) as UserRow[]}
        initialOffset={h2hOffset}
      />

      <section className="rounded-2xl border border-border bg-surface-1 p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted">
              Fixtures cache
            </div>
            <p className="mt-1 text-sm text-muted">
              Force-pull the next 7 days of IPL fixtures from CricketData.
            </p>
          </div>
          <RefreshFixturesButton />
        </div>
      </section>

      <section>
        <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted">
          Recent games
        </div>
        {games.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface-1 px-4 py-10 text-center">
            <p className="text-sm text-muted">No games yet.</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-border bg-surface-1 divide-y divide-border">
            {games.map((g) => {
              const match = matchById.get(g.match_id);
              const gMembers = membersByGame.get(g.id) ?? [];
              return (
                <AdminGameRow
                  key={g.id}
                  game={g}
                  match={match}
                  members={gMembers}
                  picks={picksByGame.get(g.id) ?? []}
                  impactSubs={impactByGame.get(g.id) ?? []}
                  bowlerDesignations={bowlersByGame.get(g.id) ?? []}
                  squad={squadByMatch.get(g.match_id) ?? []}
                />
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
