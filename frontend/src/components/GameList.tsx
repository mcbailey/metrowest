import { Link } from "react-router-dom";
import { gymPath, teamPath } from "../paths";
import { formatDate, genderLabel, gradeLabel } from "../season";
import type { ScheduleGame, SearchTeam } from "../types";

type Props = {
  games: ScheduleGame[];
  season: string;
  teams: Map<string, SearchTeam>;
  gymNames?: Record<string, string | null>;
  showVenue?: boolean;
  showGroup?: boolean;
  highlight?: Set<string>;
};

/** Games grouped by day, each row: time, matchup (with scores once final), and where. */
export function GameList({ games, season, teams, gymNames = {}, showVenue = true, showGroup = true, highlight }: Props) {
  const byDay = new Map<string, ScheduleGame[]>();
  for (const g of games) {
    const key = g.date ?? "TBD";
    byDay.set(key, [...(byDay.get(key) ?? []), g]);
  }
  const days = [...byDay.keys()].sort();

  return (
    <div className="stack-tight">
      {days.map((day) => (
        <div key={day}>
          <h4 className="day-heading">
            {day === "TBD" ? "Date TBD" : new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}{" "}
            <span className="metric-note">{day === "TBD" ? "" : formatDate(day)}</span>
          </h4>
          <div className="table-wrap">
            <table className="games">
              <tbody>
                {(byDay.get(day) ?? [])
                  .slice()
                  .sort((a, b) => timeValue(a.time) - timeValue(b.time))
                  .map((g) => (
                    <tr key={g.id} className={highlight?.has(g.id) ? "row-current" : undefined}>
                      <td className="nowrap">{g.time ?? "TBD"}</td>
                      {showGroup ? (
                        <td className="nowrap">
                          {gradeLabel(g.grade)} {genderLabel(g.gender)}
                        </td>
                      ) : null}
                      <td>
                        <Side game={g} side="away" season={season} teams={teams} /> <span className="metric-note">at</span>{" "}
                        <Side game={g} side="home" season={season} teams={teams} />
                        {g.playoff ? <span className="game-tag game-tag-win tag-gap">Playoff</span> : null}
                      </td>
                      {showVenue ? (
                        <td>
                          {g.venue ? <Link to={gymPath(g.venue)}>{gymNames[g.venue] ?? g.court}</Link> : (g.court ?? "TBD")}
                          {g.venue && g.court && gymNames[g.venue] && g.court !== gymNames[g.venue] ? (
                            <span className="metric-note"> ({g.court})</span>
                          ) : null}
                        </td>
                      ) : (
                        <td>{g.court ?? ""}</td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function Side({
  game,
  side,
  season,
  teams,
}: {
  game: ScheduleGame;
  side: "home" | "away";
  season: string;
  teams: Map<string, SearchTeam>;
}) {
  const teamno = game[side];
  const team = teamno ? teams.get(teamno) : undefined;
  const name = team?.name ?? game[`${side}_name`] ?? "TBD";
  const score = game.final ? game[`${side}_score`] : null;
  const other = game.final ? game[side === "home" ? "away_score" : "home_score"] : null;
  const won = score !== null && other !== null && score > other;
  return (
    <span className={won ? "winner" : undefined}>
      {teamno && team ? (
        <Link className="team-link" to={teamPath(season, teamno, team.name)}>
          {name}
        </Link>
      ) : (
        name
      )}
      {score !== null ? <span className="score"> {score}</span> : null}
    </span>
  );
}

function timeValue(time: string | null): number {
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(time ?? "");
  if (!m) return 24 * 60;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]);
}
