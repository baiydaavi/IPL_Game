-- IPL Draft Game - initial schema
--
-- Tables:
--   users              Mirrors auth.users with a display name.
--   matches_cached     Local cache of CricketData fixtures (write via service role).
--   squads_cached      Local cache of CricketData squads per match.
--   scorecards_cached  Local cache of CricketData scorecards per match.
--   games              A draft game tied to one upcoming/cached match.
--   game_members       Which two users are in a game and their slots (P1/P2).
--   picks              All 8 picks for a game (player/team, turn-ordered).
--   scores             Computed final score per user per game.
--
-- All tables have RLS enabled. Clients authenticate via Supabase Auth; only
-- authenticated users can read anything, and most writes are restricted either
-- to the user's own rows or to the service role (used by server routes and
-- cron). The cricket-data cache tables are readable by any authed user but
-- only writable by the service role.
--
-- Scoring points are NOT stored here; they live in `lib/scoring.ts` so they
-- can be tuned without a migration.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.users is 'Public profile mirror of auth.users.';

-- Keep public.users in sync with auth signups.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Cricket-data cache tables
-- ---------------------------------------------------------------------------
-- `match_id` is CricketData's string ID; we keep the raw JSON payload so we
-- can evolve client code without re-fetching, and store a few hot fields
-- (date, teams) as columns for easy filtering.

create table public.matches_cached (
  match_id text primary key,
  date timestamptz not null,
  team_a text not null,
  team_b text not null,
  status text,                              -- e.g. 'Match not started', 'Live', 'Match ended'
  venue text,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now()
);

create index matches_cached_date_idx on public.matches_cached (date);

create table public.squads_cached (
  match_id text primary key references public.matches_cached (match_id) on delete cascade,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now()
);

create table public.scorecards_cached (
  match_id text primary key references public.matches_cached (match_id) on delete cascade,
  is_final boolean not null default false,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
create type public.game_status as enum ('drafting', 'locked', 'scored');
create type public.player_slot as enum ('P1', 'P2');
create type public.pick_type as enum ('player', 'team');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches_cached (match_id) on delete restrict,
  status public.game_status not null default 'drafting',
  first_picker_user_id uuid not null references public.users (id) on delete restrict,
  winner_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  scored_at timestamptz,
  -- Only one game per IPL match (at the 2-player scale, this is the desired
  -- invariant; we can relax later if needed).
  unique (match_id)
);

create index games_created_at_idx on public.games (created_at desc);
create index games_status_idx on public.games (status);

-- ---------------------------------------------------------------------------
-- game_members
-- ---------------------------------------------------------------------------
create table public.game_members (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete restrict,
  slot public.player_slot not null,
  primary key (game_id, user_id),
  unique (game_id, slot)
);

create index game_members_user_idx on public.game_members (user_id);

-- ---------------------------------------------------------------------------
-- picks
-- ---------------------------------------------------------------------------
-- Each game has exactly 8 picks, indexed 0..7.
-- turn_index 0..5 are player picks, 6..7 are team picks.
-- Alternation is enforced at the application layer (writes go through the
-- server route `/api/games/[id]/pick` which validates whose turn it is).

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete restrict,
  turn_index smallint not null check (turn_index between 0 and 7),
  pick_type public.pick_type not null,
  player_id text,         -- CricketData player ID when pick_type = 'player'
  player_name text,       -- Denormalized for display; immutable snapshot
  team_code text,         -- When pick_type = 'team'
  created_at timestamptz not null default now(),
  unique (game_id, turn_index),
  -- Block duplicate player picks within a single game (team picks allowed to
  -- coincide, handled via a partial unique index below).
  check (
    (pick_type = 'player' and player_id is not null and team_code is null) or
    (pick_type = 'team' and team_code is not null and player_id is null)
  )
);

create unique index picks_unique_player_per_game
  on public.picks (game_id, player_id)
  where pick_type = 'player';

create index picks_game_turn_idx on public.picks (game_id, turn_index);

-- ---------------------------------------------------------------------------
-- scores
-- ---------------------------------------------------------------------------
create table public.scores (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete restrict,
  runs_points integer not null default 0,
  wickets_points integer not null default 0,
  team_bonus integer not null default 0,
  total integer not null default 0,
  breakdown jsonb not null default '{}'::jsonb,   -- per-player contribution for UI
  computed_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
-- The policy pattern:
--   * Any authenticated user can SELECT from cache tables and users.
--   * Any authenticated user can SELECT games/picks/scores (there are only two
--     of you; a stricter per-game membership check can be added later if the
--     app ever opens up).
--   * Users can INSERT their own picks, but the `/api/games/[id]/pick` server
--     route does turn validation using the service role anyway.
--   * All other writes (cache, games, scores) go through server routes using
--     the service role, which bypasses RLS by design.

alter table public.users enable row level security;
alter table public.matches_cached enable row level security;
alter table public.squads_cached enable row level security;
alter table public.scorecards_cached enable row level security;
alter table public.games enable row level security;
alter table public.game_members enable row level security;
alter table public.picks enable row level security;
alter table public.scores enable row level security;

-- users: readable by authed users; self can update display_name.
create policy users_select_authed on public.users
  for select to authenticated
  using (true);

create policy users_update_self on public.users
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- cache: readable by authed; writes via service role only.
create policy cache_matches_select on public.matches_cached
  for select to authenticated using (true);
create policy cache_squads_select on public.squads_cached
  for select to authenticated using (true);
create policy cache_scorecards_select on public.scorecards_cached
  for select to authenticated using (true);

-- games / members / picks / scores: readable by authed.
create policy games_select on public.games
  for select to authenticated using (true);
create policy members_select on public.game_members
  for select to authenticated using (true);
create policy picks_select on public.picks
  for select to authenticated using (true);
create policy scores_select on public.scores
  for select to authenticated using (true);

-- picks: users may only insert rows for themselves, for a game they belong to,
-- in a game that's still `drafting`. Turn-alternation is enforced server-side.
create policy picks_insert_self on public.picks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.game_members gm
      where gm.game_id = picks.game_id
        and gm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.games g
      where g.id = picks.game_id
        and g.status = 'drafting'
    )
  );
