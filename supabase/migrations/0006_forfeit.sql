-- Forfeit rule: if a draft isn't completed before the match starts, the
-- player currently on the clock loses. Stores that user's id so scoring
-- can skip scorecard tallying and award the win to the other player.
--
-- null  → no forfeit, normal scoring applies
-- uuid  → the forfeiting user; the non-forfeiter wins regardless of
--         scorecard. Score rows are still written as zeros so downstream
--         UI can render the final state cleanly.

alter table public.games
  add column if not exists forfeit_user_id uuid
    references public.users (id) on delete set null;
