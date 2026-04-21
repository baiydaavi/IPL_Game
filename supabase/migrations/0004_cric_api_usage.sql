-- Single-row table that tracks the most recent CricAPI usage headers we saw.
-- CricAPI returns `hitsToday`, `hitsUsed`, `hitsLimit`, `credits` in the `info`
-- envelope of every response; we upsert the latest values here so the admin
-- dashboard can show a live count without another API hit.

create table if not exists cric_api_usage (
  key text primary key default 'singleton' check (key = 'singleton'),
  hits_today integer,
  hits_used integer,
  hits_limit integer,
  credits integer,
  last_fetched_at timestamptz,
  last_path text,
  updated_at timestamptz not null default now()
);

-- Seed the singleton row so upserts don't have to create it on the first call.
insert into cric_api_usage (key) values ('singleton')
  on conflict (key) do nothing;

-- RLS: only service role reads/writes. Admin page queries via service client.
alter table cric_api_usage enable row level security;

drop policy if exists cric_api_usage_service_all on cric_api_usage;
create policy cric_api_usage_service_all on cric_api_usage
  for all
  to service_role
  using (true)
  with check (true);
