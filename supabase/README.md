# Supabase

## Applying migrations

Once you've created a Supabase project:

1. Go to **SQL Editor** in the Supabase dashboard.
2. Open `migrations/0001_init.sql` from this repo.
3. Paste the contents into the editor and click **Run**.

That's it. The migration is idempotent-ish (type/extension creation uses
`if not exists`), but tables themselves will error if they already exist —
apply to a fresh project.

## Environment variables

Copy `.env.example` in the repo root to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` — from **Project Settings -> API -> Project URL**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from **Project Settings -> API -> anon public**
- `SUPABASE_SERVICE_ROLE_KEY` — from **Project Settings -> API -> service_role** (server-only, never expose)

## RLS in short

- Authed users can read everything.
- Only the logged-in user can insert their own `picks`, only during a
  `drafting` game they're a member of. Turn ordering is enforced
  server-side in `/api/games/[id]/pick`.
- All other writes (cache tables, game state changes, scoring) go through
  server routes using the service role, which bypasses RLS by design.
