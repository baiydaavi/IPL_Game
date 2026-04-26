# Draft and scoring rules

The full set of rules the app enforces. Start here before reading the scoring
engine source in `src/lib/scoring.ts`.

## The draft

Each IPL fixture becomes an independent 2-player draft. The draft opens once
the fixture appears in the today window (kickoff within the next ~24h) and
locks the moment the match starts.

### Draft order

- 8 picks total, alternating between the two players over 8 turns.
- First picker is chosen by the previous match's result: winner picks first
tomorrow. If there is no previous match (or it was a draw), Player 1 starts.
- Turns 1–6 are **player picks**: each player picks 3 players in total from
the combined squads of the two teams playing the fixture.
- Turns 7–8 are **team picks**: each player picks one team they think will
win the match. Both players are allowed to pick the same team.

### Forfeit

If the draft isn't completed before kickoff, the player whose turn it is
when the match starts **forfeits**. Scoring writes 0 points for both players
and records the non-forfeiting player as the winner. The forfeit is
surfaced on the home card and in history.

## Scoring

After the match ends and a final scorecard is available, the app computes
each player's total from their 3 player picks + 1 team pick.

### Per-player contribution

For each of your 3 drafted players:

- **Runs scored** contribute 1 point per run.
- **Wickets taken** contribute 25 points per wicket.
- Any other stat (catches, stumpings, economy, etc.) is ignored.

Total player contribution = sum across your 3 drafted players (subject to
the Impact Player and Bowler Penalty rules below).

### Team pick bonus

- Correct team pick: **+75** points.
- Wrong team pick: **0** points.
- No match winner (rain draw, tie with no super over, etc.): **0** points
for both players' team picks.

## Special rules

### Rule 1 — Impact Player

When an impact substitution happens in the real match, the drafted slot
for the player involved (either as the OUT or the IN player) absorbs the
*other* half of the substitution — provided that player isn't already
drafted by someone, in which case they're already scoring normally.

Both directions are symmetric:

- **Forward (your drafted player went OUT)**: the IN player's stats are
  added to your slot — unless the IN player is drafted by your opponent
  (in which case they score normally for the opponent and your slot just
  stops at the OUT player's pre-sub stats).
- **Reverse (your drafted player came IN)**: the OUT player's pre-sub
  stats are added to your slot — unless the OUT player is drafted by
  your opponent (same reason: they already score normally for the
  opponent).

Mechanics:

1. Both players can report an impact substitution via the live card.
2. For every reported impact sub, the scorer:
   - Looks up which user (if any) drafted the IN player and which (if
     any) drafted the OUT player.
   - Adds a forward redirect contribution to the OUT player's slot
     **only if the IN player isn't drafted by the opponent**.
   - Adds a reverse redirect contribution to the IN player's slot
     **only if the OUT player isn't drafted by anyone** (including the
     drafter themselves — that case is already covered by the OUT
     player's own normal scoring).

The result is displayed on the scored card:

- A drafted player who was subbed OUT gets a red ▼ next to their name,
  and a separate green ▲ row shows the IN player's contribution.
- A drafted player who came IN as the sub gets a green ▲ next to their
  name, and a separate red ▼ row shows the OUT player's pre-sub
  contribution.

### Rule 2 — Bowler Penalty (designation rule)

After all 8 picks are locked in, each player designates **one** of their
3 drafted players as their "bowler" for the match. The designation is a
one-shot, irreversible commitment made from the locked-pre-match card.

Intent: you can't load up on pure batters and skip the bowling slot.

Penalty logic (evaluated after the match ends, on top of normal scoring):

- If **any** of your 3 drafted players (or an impact-sub replacement that
redirects into one of your slots) bowled at least one ball, no penalty
fires. Everyone's contributions count normally.
- If **nobody** you're credited for bowled a single ball:
  - If you **did** designate a bowler, only that designated slot's
  contribution is zeroed. If the designated player was subbed out,
  the impact-sub replacement (if any) is also zeroed.
  - If you **didn't** designate a bowler, all 3 of your drafted players'
  contributions are zeroed.
- The team bonus is never affected by the bowler penalty.

### Rule 3 — Rain Draw

A match is considered "rain-affected" only when the match status returned
by the cricket provider contains an explicit rain keyword (e.g., "no
result", "abandoned", "rain"). Incomplete scorecards alone do not count.

When a match is rain-affected **and** either player had zero of their 3
drafted players bat or bowl at least one ball, the game is a forced draw:

- No winner is recorded.
- Player points are still computed and shown for transparency.
- The Bowler Penalty (Rule 2) still applies.
- The team bonus is 0 for both players.

If both players had at least one drafted player participate, the
rain-affected match still scores normally (whoever has more points wins).

### Super over

Not handled. If a match goes to a super over, the main innings determine  
the team winner for the team bonus; the super over itself does not  
contribute runs or wickets to player contributions. (In practice this  
rarely matters, since a super over means the main innings were tied and  
both team picks either match or split the correct answer.)

