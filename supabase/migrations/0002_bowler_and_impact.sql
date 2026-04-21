-- Bowler designations + impact-player substitutions
--
-- Two new tables that extend the scoring engine:
--
-- bowler_designations
--   Each user must designate one of their 3 drafted players as their
--   "bowler" before the match starts. If none of their 3 drafted players
--   bowls any ball in the match, ALL their player points get zeroed out
--   (batting + wickets). Team-win bonus still counts.
--
--   The designation itself doesn't directly affect scoring math — it's a
--   commitment/bet that forces the user to think about bowling coverage.
--   The penalty rule keys off "did any of the 3 picks bowl", not the
--   specific designated player.
--
-- impact_subs
--   Optional per-team record of the IPL impact-player substitution.
--   CricAPI's free tier doesn't expose this data, so it's entered by
--   hand: either player can report "team X replaced player Y with player Z"
--   from the live match card. If provided, the scorer will redirect the
--   replaced player's scoring slot to the impact sub (unless the impact
--   sub was drafted separately by the other user, in which case the
--   normal scoring already credits them).

create table public.bowler_designations (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete restrict,
  player_id text not null,
  player_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

comment on table public.bowler_designations is
  'Per-user "must designate a bowler" record. One row per (game, user). If none of that user''s 3 drafted players bowls any ball in the match, their player points are zeroed during scoring.';

create index bowler_designations_game_idx on public.bowler_designations (game_id);

create table public.impact_subs (
  game_id uuid not null references public.games (id) on delete cascade,
  team_code text not null,              -- IPL team code (e.g. 'CSK', 'MI')
  out_player_id text not null,          -- CricAPI player ID who was benched
  out_player_name text not null,        -- snapshot
  in_player_id text not null,           -- CricAPI player ID who came on
  in_player_name text not null,         -- snapshot
  reported_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, team_code)
);

comment on table public.impact_subs is
  'Manually-reported impact-player substitutions. CricAPI free tier doesn''t expose these, so either player can report via the live match card.';

create index impact_subs_game_idx on public.impact_subs (game_id);

-- Keep updated_at fresh on row updates.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bowler_designations_touch_updated_at
  before update on public.bowler_designations
  for each row execute function public.touch_updated_at();

create trigger impact_subs_touch_updated_at
  before update on public.impact_subs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.bowler_designations enable row level security;
alter table public.impact_subs enable row level security;

-- bowler_designations: readable by any authed user; only the owner can write.
create policy bowler_designations_select on public.bowler_designations
  for select to authenticated using (true);

create policy bowler_designations_insert_self on public.bowler_designations
  for insert to authenticated
  with check (user_id = auth.uid());

create policy bowler_designations_update_self on public.bowler_designations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy bowler_designations_delete_self on public.bowler_designations
  for delete to authenticated
  using (user_id = auth.uid());

-- impact_subs: readable by any authed user; either player in the game can write.
create policy impact_subs_select on public.impact_subs
  for select to authenticated using (true);

create policy impact_subs_insert_member on public.impact_subs
  for insert to authenticated
  with check (
    reported_by = auth.uid()
    and exists (
      select 1 from public.game_members gm
      where gm.game_id = impact_subs.game_id
        and gm.user_id = auth.uid()
    )
  );

create policy impact_subs_update_member on public.impact_subs
  for update to authenticated
  using (
    exists (
      select 1 from public.game_members gm
      where gm.game_id = impact_subs.game_id
        and gm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.game_members gm
      where gm.game_id = impact_subs.game_id
        and gm.user_id = auth.uid()
    )
  );

create policy impact_subs_delete_member on public.impact_subs
  for delete to authenticated
  using (
    exists (
      select 1 from public.game_members gm
      where gm.game_id = impact_subs.game_id
        and gm.user_id = auth.uid()
    )
  );
