-- Demo-mode shared state.
--
-- Keeps the "match state" (not-started / live / finished) and the current
-- scorecard scenario across requests, so both demo users (Avinash &
-- Sanchit) see the same view. Only used when DEMO_MODE=1; production
-- builds never write to it.
--
-- Single-row design: always key = 'singleton'. Avoids the complexity of
-- per-user demo state for now — demo is shared between the two players.

create table if not exists public.demo_state (
  key text primary key,
  match_state text not null default 'not-started',  -- 'not-started' | 'live' | 'finished'
  scenario text not null default 'normal',          -- 'normal' | 'rain-draw' | 'rain-no-draw' | 'bowler-penalty' | 'impact-sub'
  updated_at timestamptz not null default now()
);

comment on table public.demo_state is
  'Shared demo-mode state. Only written when DEMO_MODE=1. One row (key=singleton) shared between Avinash and Sanchit.';

insert into public.demo_state (key) values ('singleton')
  on conflict (key) do nothing;

-- RLS: read-only to anon/authed (the demo panel reads this). Writes only
-- via the service-role key from /api/demo/*.
alter table public.demo_state enable row level security;

drop policy if exists demo_state_select on public.demo_state;
create policy demo_state_select on public.demo_state
  for select to anon, authenticated using (true);
