-- Single-row app_config table. Used for tunables that don't warrant their
-- own table and that the admin needs to edit without a code change.
--
-- First use-case: `h2h_offset` — per-user win counts for games played
-- OUTSIDE the app (e.g. the WhatsApp era before this app existed). Shape:
--   {
--     "<user_id>": <wins: integer>,
--     ...
--   }
-- These are added on top of the in-app win tally when rendering the
-- head-to-head card.

create table if not exists app_config (
  key text primary key default 'singleton' check (key = 'singleton'),
  h2h_offset jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_config (key) values ('singleton')
  on conflict (key) do nothing;

alter table app_config enable row level security;

drop policy if exists app_config_select on app_config;
create policy app_config_select on app_config
  for select
  to authenticated
  using (true);

-- Writes only via service role (admin routes).
drop policy if exists app_config_service_all on app_config;
create policy app_config_service_all on app_config
  for all
  to service_role
  using (true)
  with check (true);
