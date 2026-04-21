import { redirect } from "next/navigation";

import { HeadToHeadCard } from "@/components/home/head-to-head-card";
import { HomeHeader } from "@/components/home/header";
import { PastGamesList } from "@/components/home/past-games-list";
import { TopCard } from "@/components/home/top-card";
import { UpcomingList } from "@/components/home/upcoming-list";
import { getCurrentUser } from "@/lib/auth";
import { getHomeView } from "@/lib/home-state";
import { getHeadToHead, getPastGames } from "@/lib/past-games";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/** Always re-run on every request — state depends on current time & DB rows. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return <SetupNeeded />;
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [view, pastGames, headToHead] = await Promise.all([
    getHomeView(),
    getPastGames(5),
    getHeadToHead(),
  ]);

  // Build slot map for head-to-head accent coloring. We look up the most
  // recent game each user was in to find their canonical slot; for the
  // common case both users play every game the slots are stable.
  const slotByUserId = await resolveSlotsForUsers(
    headToHead.byUser.map((b) => b.user.id),
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <HomeHeader user={user} />

      {headToHead.totalGames > 0 ? (
        <HeadToHeadCard
          byUser={headToHead.byUser}
          totalGames={headToHead.totalGames}
          recentForm={headToHead.recentForm}
          currentUserId={user.id}
          slotByUserId={slotByUserId}
        />
      ) : null}

      {view.todays.map((state) => (
        <TopCard
          key={
            state.kind === "no-match-today"
              ? "no-match"
              : state.fixture.match_id
          }
          state={state}
          currentUserId={user.id}
        />
      ))}

      <UpcomingList fixtures={view.upcoming} />

      <PastGamesList games={pastGames} currentUserId={user.id} />
    </main>
  );
}

async function resolveSlotsForUsers(
  userIds: string[],
): Promise<Record<string, "P1" | "P2">> {
  if (userIds.length === 0) return {};
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("game_members")
    .select("user_id, slot")
    .in("user_id", userIds);
  const out: Record<string, "P1" | "P2"> = {};
  for (const row of (data ?? []) as Array<{ user_id: string; slot: "P1" | "P2" }>) {
    if (!out[row.user_id]) out[row.user_id] = row.slot;
  }
  return out;
}

function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
      <div>
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          IPL Draft
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Setup needed
        </h1>
      </div>
      <p className="text-sm text-muted">
        Supabase isn&apos;t configured yet. Copy <code className="rounded bg-surface px-1.5 py-0.5 text-xs">.env.example</code> to{" "}
        <code className="rounded bg-surface px-1.5 py-0.5 text-xs">.env.local</code> and fill in your project keys, then restart the dev server.
      </p>
      <p className="text-xs text-muted">
        See <code className="rounded bg-surface px-1.5 py-0.5">supabase/README.md</code> for step-by-step instructions.
      </p>
    </main>
  );
}
