# Supabase

## Applying migrations

### Option 1 — Supabase CLI (recommended)

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) installed
locally. First-time setup from the repo root:

```bash
supabase login                               # one-time, opens a browser
supabase init                                # one-time, creates supabase/config.toml
supabase link --project-ref <project-ref>    # DB password required
supabase db push
```

Subsequent changes: add a new `supabase/migrations/NNNN_name.sql` file and
run `supabase db push` again. The CLI figures out which migrations the
remote hasn't applied and runs them in lexicographic order.

### Option 2 — SQL Editor (copy / paste)

For fresh projects where you'd rather not install the CLI:

1. Open the Supabase dashboard → **SQL Editor**.
2. For each file in `supabase/migrations/`, in order (`0001_*` first,
   through `0007_*`), paste the contents into the editor and click **Run**.

The migrations are written to be idempotent (`create table if not exists`,
`drop policy if exists` before creating), so re-running any file is safe.

## Environment variables

Copy `.env.example` in the repo root to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` — from **Project Settings → API → Project URL**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from **Project Settings → API → anon public**
- `SUPABASE_SERVICE_ROLE_KEY` — from **Project Settings → API → service_role** (server-only, never expose)

## Auth URL configuration

After deploying to Vercel (or any host), magic-link redirects need the
hosted URL whitelisted:

1. Supabase dashboard → **Authentication → URL Configuration**.
2. Set **Site URL** to the deployed origin (e.g. `https://your-app.vercel.app`).
3. Add to **Redirect URLs**:
   - `https://your-app.vercel.app/auth/callback`
   - `https://your-app.vercel.app/**`
   - `http://localhost:3000/auth/callback` (for local dev)
   - `http://localhost:3000/**` (for local dev)

Without this, clicking a magic link in a production email redirects to
`localhost:3000` and fails.

## Realtime

Migration `0007_realtime.sql` enrolls `picks`, `impact_subs`,
`bowler_designations`, `scores`, and `games` in the `supabase_realtime`
publication. Without this the draft page can't live-update opponent picks
(it falls back to 3-second polling, but realtime is nicer).

If you add a new table whose changes the client should see live, append
it to that migration and re-push.

## RLS in short

- Authed users can read everything.
- Only the logged-in user can insert their own `picks`, only during a
  `drafting` game they're a member of. Turn ordering is enforced
  server-side in `/api/games/[id]/pick`.
- All other writes (cache tables, game state changes, scoring) go through
  server routes using the service role, which bypasses RLS by design.
