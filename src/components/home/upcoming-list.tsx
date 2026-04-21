import { TeamChip } from "@/components/team-chip";
import { Card, CardSection } from "@/components/ui/card";
import type { CachedFixture } from "@/lib/fixtures";
import { iplTeamCode } from "@/lib/ipl-teams";

function formatUpcoming(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UpcomingList({ fixtures }: { fixtures: CachedFixture[] }) {
  if (fixtures.length === 0) return null;
  return (
    <Card>
      <CardSection>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          Upcoming
        </h3>
        <ul className="mt-3 divide-y divide-border">
          {fixtures.map((f) => {
            const a = iplTeamCode(f.team_a);
            const b = iplTeamCode(f.team_b);
            return (
              <li key={f.match_id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <TeamChip code={a} />
                  <span className="text-xs text-muted">vs</span>
                  <TeamChip code={b} />
                </div>
                <span className="ml-auto text-xs uppercase tracking-wider text-muted">
                  {formatUpcoming(f.date)}
                </span>
              </li>
            );
          })}
        </ul>
      </CardSection>
    </Card>
  );
}
