import type { UserRow } from "@/lib/db-types";

export function HomeHeader({ user }: { user: UserRow }) {
  return (
    <header className="flex items-center justify-between">
      <span className="font-mono text-xs uppercase tracking-widest text-muted">
        IPL Draft
      </span>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          {user.display_name}
        </button>
      </form>
    </header>
  );
}
