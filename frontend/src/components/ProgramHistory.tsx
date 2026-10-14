import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadJsonCached } from "../data";
import { seasonSlug, teamPath, townPath } from "../paths";
import { genderLabel, gradeLabel } from "../season";
import type { TownData, TownTeam } from "../types";

type Props = {
  townSlug: string;
  townName: string;
  gender: "M" | "F";
  classOf: number;
  currentTeamno?: string;
};

/**
 * Teams from the same town, gender and graduating class in every season. The league doesn't link a team
 * from one year to the next, so this is the town's program for that age group: when a town fields several
 * teams in a grade, all of them are shown.
 */
export function ProgramHistory({ townSlug, townName, gender, classOf, currentTeamno }: Props) {
  const [town, setTown] = useState<TownData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadJsonCached<TownData>(`data/towns/${townSlug}.json`)
      .then((data) => {
        if (active) setTown(data);
      })
      .catch((err) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [townSlug]);

  if (error) return <p className="error">{error}</p>;
  if (!town) return <p className="meta">Loading program history…</p>;

  const cohort = town.teams.filter((t) => t.gender === gender && t.class_of === classOf);
  const bySeason = new Map<string, TownTeam[]>();
  for (const t of cohort) {
    bySeason.set(t.yrseason, [...(bySeason.get(t.yrseason) ?? []), t]);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => Number(b) - Number(a));

  return (
    <div className="stack-tight">
      <p className="meta compact">
        {townName} {genderLabel(gender).toLowerCase()}, class of {classOf}: the same age group in every season on record.
        When a town has more than one team in a grade, all of them are listed.{" "}
        <Link to={townPath(townSlug)}>All {townName} teams</Link>
      </p>
      {seasons.length <= 1 ? <p className="meta compact">No other seasons on record for this group yet.</p> : null}
      <div className="table-wrap">
        <table className="games">
          <thead>
            <tr>
              <th>Season</th>
              <th>Grade</th>
              <th>Team</th>
              <th>Division</th>
              <th>Rank</th>
              <th>Record</th>
              <th>Playoffs</th>
            </tr>
          </thead>
          <tbody>
            {seasons.flatMap((season) =>
              (bySeason.get(season) ?? []).map((t, i) => (
                <tr key={t.teamno} className={t.teamno === currentTeamno ? "row-current" : undefined}>
                  <td>{i === 0 ? seasonSlug(season) : ""}</td>
                  <td>{i === 0 ? gradeLabel(t.grade) : ""}</td>
                  <td>
                    {t.teamno === currentTeamno ? (
                      <strong>{t.name}</strong>
                    ) : (
                      <Link className="team-link" to={teamPath(season, t.teamno, t.name)}>
                        {t.name}
                      </Link>
                    )}
                  </td>
                  <td>{t.division_tag ?? (t.divisiontier ? `D${t.divisiontier}` : "-")}</td>
                  <td>
                    {t.rank}
                    {t.division_size ? <span className="metric-note"> of {t.division_size}</span> : null}
                  </td>
                  <td>
                    {t.wins}-{t.losses}
                    {t.ties ? `-${t.ties}` : ""}
                  </td>
                  <td>{t.playoffs.length ? t.playoffs.join("; ") : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
