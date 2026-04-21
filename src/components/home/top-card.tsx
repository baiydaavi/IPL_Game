import { BowlerDesignationCard } from "@/components/home/bowler-designation-card";
import { DraftCard } from "@/components/draft/draft-card";
import { FinishedExtras } from "@/components/home/finished-extras";
import {
  ImpactSubCard,
  type SquadForImpact,
} from "@/components/home/impact-sub-card";
import { LiveAutoPoll } from "@/components/home/live-auto-poll";
import { PicksTwoUp } from "@/components/home/picks-two-up";
import { RefreshLiveButton } from "@/components/home/refresh-live-button";
import { StartDraftButton } from "@/components/home/start-draft-button";
import { TeamChip } from "@/components/team-chip";
import { Card, CardSection } from "@/components/ui/card";
import { getCachedSquad } from "@/lib/cricket-cache";
import type { CachedFixture } from "@/lib/fixtures";
import type { HomeState } from "@/lib/home-state-types";
import { iplTeamCode } from "@/lib/ipl-teams";

function formatMatchTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MatchupHeader({ fixture }: { fixture: CachedFixture }) {
  const a = iplTeamCode(fixture.team_a);
  const b = iplTeamCode(fixture.team_b);
  return (
    <div className="flex items-center gap-3">
      <TeamChip code={a} />
      <span className="text-sm text-muted">vs</span>
      <TeamChip code={b} />
      <span className="ml-auto text-xs uppercase tracking-wider text-muted">
        {formatMatchTime(fixture.date)}
      </span>
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
      <Card>
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
      <Card>
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
          />
        </CardSection>
      </Card>
    );
  }

  if (state.kind === "locked-pre-match") {
    const startMs = new Date(state.fixture.date).getTime();
    const mins = Math.max(0, Math.round((startMs - Date.now()) / 60000));
    const countdown =
      mins < 60
        ? `${mins} min`
        : `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return (
      <Card>
        <CardSection>
          <MatchupHeader fixture={state.fixture} />
        </CardSection>
        <CardSection className="border-t border-border pt-4">
          <div className="flex items-baseline justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">
              Locked in
            </div>
            <div className="text-xs text-muted">starts in {countdown}</div>
          </div>
          <div className="mt-3">
            <PicksTwoUp
              members={state.game.members}
              picks={state.game.picks}
              currentUserId={currentUserId}
              showPoints={false}
            />
          </div>
          <div className="mt-4">
            <BowlerDesignationCard
              gameId={state.game.game.id}
              currentUserId={currentUserId}
              members={state.game.members}
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
      <Card>
        <CardSection>
          <div className="flex items-center gap-2">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-live" />
            <span className="text-xs font-medium uppercase tracking-wider text-live">
              Live
            </span>
            <span className="ml-auto text-xs uppercase tracking-wider text-muted">
              {formatMatchTime(state.fixture.date)}
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
    <Card>
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
          />
        </div>
        <FinishedExtras
          matchId={state.fixture.match_id}
          members={finished.members}
          bowlerDesignations={finished.bowlerDesignations}
          impactSubs={finished.impactSubs}
        />
      </CardSection>
    </Card>
  );
}
