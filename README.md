# Gully IPL Fantasy

A poor man's IPL fantasy game for you and one friend. Each day's IPL match
becomes a mini-draft: you and a friend alternate picking 3 players each, then
each pick a predicted winning team. After the match, points are tallied from
the scorecard and the winner gets first pick tomorrow.

## Stack

- **Next.js 16** (App Router, TypeScript) hosted on Vercel
- **Supabase** for auth, database (Postgres), and realtime pick updates
- **CricketData / CricAPI** for fixtures, squads, and scorecards (paid tier,
  2000 hits/day — see `.env.example` for notes)
- **Tailwind v4** + shadcn-style primitives, Framer Motion, Lucide icons

## Rules

Draft order, scoring, Impact Player, Bowler Penalty, Rain Draw, and forfeit
rules are documented in [`docs/rules.md`](docs/rules.md).

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app runs at <http://localhost:3000>. By default it hits the same Supabase
project your env vars point at — be careful running destructive admin actions
locally if that's your prod database. See `.env.example` for `DEMO_MODE=1`,
which bypasses auth + CricAPI entirely so you can click around offline.

## Project layout

```
src/
  app/                 Next.js App Router routes
    page.tsx             Home screen (state-driven top card)
    actions/             Server actions
    admin/               Manual override page (email-allowlisted)
    api/                 Server routes
      admin/               Admin edit / rescore / refresh endpoints
      cricket/             CricAPI fetch helpers
      cron/                Scheduled fixtures + scorecard refreshers
      demo/                Demo-mode identity switcher
      games/               Pick / refresh / impact-sub / bowler routes
    auth/                Supabase auth callback
    history/             Past games browser
    login/               Magic-link sign-in
  lib/                 Shared helpers
    scoring.ts             Per-player + team-bonus scoring, Rules 1–3
    game-lifecycle.ts      Draft lock, forfeit, score transitions
    home-state.ts          Resolves the home view from fixtures + games
    cricket-cache.ts       Read-through cache + squad reconciliation
    cricket.ts             CricAPI client
  components/          UI components
docs/
  rules.md             Draft and scoring rules
supabase/
  README.md            How to apply migrations + Supabase config notes
  migrations/          Numbered SQL migrations (0001 → 0007)
vercel.json          Vercel cron schedule
```

## Deployment

The app deploys to Vercel. End-to-end checklist:

1. **Create a Supabase project** and apply the migrations. See
   [`supabase/README.md`](supabase/README.md).
2. **Configure auth redirect URLs** in the Supabase dashboard — this is
   required for magic-link sign-in to come back to the deployed host
   instead of `localhost`. Instructions are in
   [`supabase/README.md`](supabase/README.md#auth-url-configuration).
3. **Create a Vercel project** pointed at this repo and add the env vars
   from `.env.example` in the Vercel dashboard (Project Settings →
   Environment Variables). `DEMO_MODE` should be left unset in production.
4. **Generate a `CRON_SECRET`** and set it both in Vercel and in Supabase
   (if you want the cron routes to be protected). The schedule is in
   `vercel.json`:
   - `/api/cron/fetch-fixtures` — daily at 03:00 UTC (refreshes the
     upcoming-fixtures cache).
   - `/api/cron/fetch-scorecards` — daily at 19:30 UTC (refreshes live /
     just-finished scorecards).
5. **Set `ADMIN_EMAILS`** to a comma-separated allowlist of emails that
   can access `/admin` and the admin-only API routes.

After the first deploy, visit `/admin` as an allowed email to review the
CricAPI usage widget, seed the initial H2H offset if you had games before
the app existed, and sanity-check fixtures.
