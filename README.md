# IPL Draft

A private 2-player IPL draft game. Each day's IPL match becomes a mini-draft: you
and a friend alternate picking 3 players each, then each pick a predicted winning
team. After the match, points are tallied from the scorecard and the winner gets
first pick tomorrow.

## Stack

- **Next.js 16** (App Router, TypeScript) hosted on Vercel Hobby
- **Supabase** for auth, database, and realtime pick updates
- **CricketData / CricAPI** free tier for fixtures, squads, and scorecards
- **Tailwind v4** + shadcn-style primitives, Framer Motion, Lucide icons

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app runs at <http://localhost:3000>.

## Project layout

```
src/
  app/                 Next.js App Router routes
    api/               Server routes (Cricket fetchers, cron, picks, admin)
    page.tsx           Home screen (state-driven top card)
    history/           Past games browser
    admin/             Manual override page (email-allowlisted)
  lib/                 Shared helpers (cricket client, scoring, draft, theme)
  components/          UI components
supabase/
  migrations/          SQL migrations
```

Scoring, draft rules, and API budget are documented in the plan file at
`.cursor/plans/ipl_draft_game_mvp_*.plan.md`.
