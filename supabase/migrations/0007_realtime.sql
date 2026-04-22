-- Enable Supabase Realtime for tables whose changes drive live UI.
--
-- By default, Supabase creates an empty `supabase_realtime` publication and
-- new tables are NOT enrolled. Without this migration, browser clients can
-- .subscribe() successfully but never receive payloads — the draft card and
-- admin views would need a manual refresh after every pick/impact-sub/score
-- change.
--
-- This migration is idempotent: running it on a project where the tables
-- are already enrolled is a no-op.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'picks',
    'impact_subs',
    'bowler_designations',
    'scores',
    'games'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
