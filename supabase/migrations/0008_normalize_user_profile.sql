-- ---------------------------------------------------------------------------
-- 0008_normalize_user_profile.sql
--
-- Server-side defense-in-depth for the email/display_name invariants the
-- app-layer code enforces:
--   - email is always lowercased + trimmed.
--   - display_name is the first whitespace-separated word, title-cased.
--
-- These helpers get applied inside `handle_new_user` (runs on every
-- auth.users insert) so even manual auth signups via the Supabase
-- dashboard or CLI end up with normalized public.users rows. They don't
-- touch existing rows; run a one-off update manually if you need to
-- backfill.
-- ---------------------------------------------------------------------------

create or replace function public.normalize_email(raw text)
returns text
language sql
immutable
as $$
  select lower(btrim(raw));
$$;

create or replace function public.normalize_display_name(raw text)
returns text
language plpgsql
immutable
as $$
declare
  first_word text;
begin
  if raw is null then
    return null;
  end if;

  -- Strip surrounding whitespace, grab only the first whitespace-separated
  -- token so "Sanchit Aggarwal" collapses to "Sanchit".
  first_word := split_part(btrim(raw), ' ', 1);
  if first_word = '' then
    return null;
  end if;

  -- Title-case the first word. This is a lightweight version of the TS
  -- helper in src/lib/user-profile.ts — we don't try to handle hyphen /
  -- apostrophe segments server-side since signups always go through the
  -- app's TS normalizer first; this is just the safety net.
  return initcap(first_word);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  supplied_name text;
  fallback_name text;
begin
  normalized_email := public.normalize_email(new.email);
  supplied_name := public.normalize_display_name(
    new.raw_user_meta_data ->> 'display_name'
  );
  fallback_name := public.normalize_display_name(
    split_part(coalesce(normalized_email, ''), '@', 1)
  );

  insert into public.users (id, email, display_name)
  values (
    new.id,
    normalized_email,
    coalesce(supplied_name, fallback_name)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
