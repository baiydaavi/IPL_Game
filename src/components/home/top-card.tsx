import { BowlerDesignationCard } from "@/components/home/bowler-designation-card";
import { Countdown } from "@/components/home/countdown";
import { DraftCard } from "@/components/draft/draft-card";
import { MatchExtras } from "@/components/home/match-extras";
import {
  ImpactSubCard,
  type SquadForImpact,
} from "@/components/home/impact-sub-card";
import { LiveAutoPoll } from "@/components/home/live-auto-poll";
import { MatchStartLabel } from "@/components/home/match-start-label";
import { PicksTwoUp } from "@/components/home/picks-two-up";
import { RefreshLiveButton } from "@/components/home/refresh-live-button";
import { StartDraftButton } from "@/components/home/start-draft-button";
import { TeamChip } from "@/components/team-chip";
import { Card, CardSection, type CardTint } from "@/components/ui/card";
import { getCachedSquad } from "@/lib/cricket-cache";
import type { CachedFixture } from "@/lib/fixtures";
import type { HomeState } from "@/lib/home-state-types";
import { iplTeamCode } from "@/lib/ipl-teams";
import { teamPalette } from "@/lib/theme";

/**
 * Build a very subtle two-color tint for a match card, keyed off the two
 * competing teams' jersey colors. Used as a diagonal gradient on the Card
 * so every fixture has a faint sense of place (CSK vs MI → warm yellow
 * fading into deep navy). Alpha is kept low on purpose so it never
 * overwhelms the text or borders.
 */
function tintForFixture(fixture: CachedFixture): CardTint {
  const a = teamPalette(iplTeamCode(fixture.team_a));
  const b = teamPalette(iplTeamCode(fixture.team_b));
  return { left: a.tint, right: b.tint };
}

function MatchupHeader({ fixture }: { fixture: CachedFixture }) {
  const a = iplTeamCode(fixture.team_a);
  const b = iplTeamCode(fixture.team_b);
  return (
    <div className="flex items-center gap-3">
      <TeamChip code={a} />
      <span className="text-sm text-muted">vs</span>
      <TeamChip code={b} />
      <MatchStartLabel
        iso={fixture.date}
        className="ml-auto text-xs uppercase tracking-wider text-muted"
      />
    </div>
  );
}

async function loadSquadsForImpact(
  matchId: string,
): Promise<SquadForImpact[]> {
  try {
    const squads = await getCachedSquad(matchId);
    return squads.map((s) => ({
      team_code: iplTeamCode(s.teamName),
      team_name: s.teamName,
      players: (s.players ?? []).map((p) => ({ id: p.id, name: p.name })),
    }));
  } catch (err) {
    console.error("[TopCard] squad load failed", err);
    return [];
  }
}

export async function TopCard({
  state,
  currentUserId,
}: {
  state: HomeState;
  currentUserId: string;
}) {
  if (state.kind === "no-match-today") {
    return (
      <Card>
        <CardSection className="py-10 text-center">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            No match today
          </div>
          <p className="mt-2 text-sm text-muted">
            We&apos;ll be back when the next IPL fixture goes up.
          </p>
        </CardSection>
      </Card>
    );
  }

  if (state.kind === "match-today-no-draft") {
    return (
      <Card tint={tintForFixture(state.fixture)}>
        <CardSection>
          <MatchupHeader fixture={state.fixture} />
        </CardSection>
        <CardSection className="border-t border-border pt-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Today
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Ready to draft?
          </h2>
          <p className="mt-1 text-sm text-muted">
            Start a new game and invite your friend.
          </p>
          <div className="mt-4">
            <StartDraftButton matchId={state.fixture.match_id} />
          </div>
        </CardSection>
      </Card>
    );
  }

  if (state.kind === "drafting") {
    return (
      <Card tint={tintForFixture(state.fixture)}>
        <CardSection>
          <MatchupHeader fixture={state.fixture} />
        </CardSection>
        <CardSection className="border-t border-border pt-4">
          <DraftCard
            currentUserId={currentUserId}
            fixture={{
              match_id: state.fixture.match_id,
              team_a: state.fixture.team_a,
              team_b: state.fixture.team_b,
            }}
            game={state.game.game}
            members={state.game.members}
            initialPicks={state.game.picks}
            bowlerDesignations={state.game.bowlerDesignations}
            matchStartIso={state.fixture.date}
          />
        </CardSection>
      </Card>
    );
  }

  if (state.kind === "locked-pre-match") {
    return (
      <Card tint={tintForFixture(state.fixture)}>
        <CardSection>
          <MatchupHeader fixture={state.fixture} />
        </CardSection>
        <CardSection className="border-t border-border pt-4">
          {/* The two team-colored pick cards already communicate "locked in"
              visually, so the countdown is tucked into the footer next to
              the dagger legend rather than taking its own row above. */}
          <PicksTwoUp
            members={state.game.members}
            picks={state.game.picks}
            currentUserId={currentUserId}
            showPoints={false}
            bowlerDesignations={state.game.bowlerDesignations}
            footerRight={<Countdown startIso={state.fixture.date} />}
          />
          <div className="mt-4">
            <BowlerDesignationCard
              gameId={state.game.game.id}
              currentUserId={currentUserId}
              picks={state.game.picks}
              designations={state.game.bowlerDesignations}
              matchStartIso={state.fixture.date}
            />
          </div>
        </CardSection>
      </Card>
    );
  }

  if (state.kind === "match-live") {
    const squads = await loadSquadsForImpact(state.fixture.match_id);
    return (
      <Card tint={tintForFixture(state.fixture)}>
        <CardSection>
          <div className="flex items-center gap-2">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-live" />
            <span className="text-xs font-medium uppercase tracking-wider text-live">
              Live
            </span>
          </div>
          <div className="mt-3">
            <MatchupHeader fixture={state.fixture} />
          </div>
        </CardSection>
        <CardSection className="border-t border-border pt-4">
          <PicksTwoUp
            members={state.game.members}
            picks={state.game.picks}
            scores={state.game.scores}
            currentUserId={currentUserId}
            showPoints={true}
            bowlerDesignations={state.game.bowlerDesignations}
          />
          <div className="mt-4">
            <RefreshLiveButton gameId={state.game.game.id} />
          </div>
          <LiveAutoPoll gameId={state.game.game.id} />
          {squads.length > 0 ? (
            <div className="mt-4">
              <ImpactSubCard
                gameId={state.game.game.id}
                squads={squads}
                impactSubs={state.game.impactSubs}
              />
            </div>
          ) : null}
          <MatchExtras matchId={state.fixture.match_id} isFinal={false} />
        </CardSection>
      </Card>
    );
  }

  // match-finished
  const finished = state.game;
  const winnerId = finished.game.winner_user_id;
  const p1Score = finished.scores.find((s) => s.user_id === finished.members.find((m) => m.slot === "P1")?.user_id);
  const p2Score = finished.scores.find((s) => s.user_id === finished.members.find((m) => m.slot === "P2")?.user_id);
  return (
    <Card tint={tintForFixture(state.fixture)}>
      <CardSection>
        <MatchupHeader fixture={state.fixture} />
      </CardSection>
      <CardSection className="border-t border-border pt-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          {finished.game.status === "scored" ? "Final" : "Match ended"}
          {finished.game.forfeit_user_id ? (
            <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-live">
              Forfeit
            </span>
          ) : null}
        </div>
        {finished.game.status === "scored" ? (
          <div className="mt-1 flex items-baseline gap-3">
            <h2 className="text-xl font-semibold tracking-tight">
              {winnerId
                ? `${finished.members.find((m) => m.user_id === winnerId)?.user.display_name} won${
                    finished.game.forfeit_user_id ? " (forfeit)" : ""
                  }`
                : "Tie"}
            </h2>
            {p1Score && p2Score ? (
              <span className="font-mono text-sm text-muted tabular-nums">
                {p1Score.total} — {p2Score.total}
              </span>
            ) : null}
          </div>
        ) : (
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Awaiting final scorecard
          </h2>
        )}
        <div className="mt-4">
          <PicksTwoUp
            members={finished.members}
            picks={finished.picks}
            scores={finished.scores}
            currentUserId={currentUserId}
            showPoints={finished.game.status === "scored"}
            highlightWinner={winnerId}
            bowlerDesignations={finished.bowlerDesignations}
          />
        </div>
        <MatchExtras matchId={state.fixture.match_id} isFinal={true} />
      </CardSection>
    </Card>
  );
}
