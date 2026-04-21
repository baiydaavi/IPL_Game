import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { HistoryList } from "@/components/history/history-list";
import { getCurrentUser } from "@/lib/auth";
import { getPastGames } from "@/lib/past-games";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = {
  page?: string;
  month?: string;
  winner?: string;
};

/**
 * /history — full browsable list of past (scored) games.
 *
 * Query params:
 *   page    1-indexed page number
 *   month   YYYY-MM filter (applied client-side from the loaded page)
 *   winner  user_id filter (applied client-side from the loaded page)
 *
 * Pagination is intentionally DB-side (via `range`) even though the
 * dataset is small; month + winner filtering is client-side since the
 * home screen already loads the recent window. Good enough for the 2-
 * user case; we can move them to SQL if the history ever grows large.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const games = await getPastGames(PAGE_SIZE, offset);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Home
        </Link>
        <h1 className="ml-2 text-lg font-semibold tracking-tight">History</h1>
      </header>

      <HistoryList
        games={games}
        currentUserId={user.id}
        page={page}
        hasNextPage={games.length === PAGE_SIZE}
      />
    </main>
  );
}
