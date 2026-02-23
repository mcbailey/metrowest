import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { loadJson } from "../data";
import { IndexData, TeamData, TeamGame } from "../types";

function gamesPlayed(team: TeamData): number {
  return team.summary.wins + team.summary.losses + team.summary.ties;
}

function avg(value: number, games: number): string {
  return games > 0 ? (value / games).toFixed(1) : "0.0";
}

function teamAndOpponentScores(g: TeamGame): { team: number | null; opp: number | null } {
  if (g.team_score !== undefined && g.opponent_score !== undefined) {
    return { team: g.team_score ?? null, opp: g.opponent_score ?? null };
  }

  if (g.home_score === null || g.away_score === null) {
    return { team: null, opp: null };
  }

  if (g.is_home === true) {
    return { team: g.home_score, opp: g.away_score };
  }
  if (g.is_home === false) {
    return { team: g.away_score, opp: g.home_score };
  }
  return { team: null, opp: null };
}

function outcome(teamScore: number | null, oppScore: number | null): string {
  if (teamScore === null || oppScore === null) return "-";
  if (teamScore > oppScore) return "W";
  if (teamScore < oppScore) return "L";
  return "T";
}

function genderLabel(gender: "M" | "F" | null): string {
  if (gender === "M") return "Boys";
  if (gender === "F") return "Girls";
  return "-";
}

export function TeamPage() {
  const { teamno } = useParams<{ teamno: string }>();
  const location = useLocation();

  const [team, setTeam] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seasonFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("season");
  }, [location.search]);

  const backTo = location.search ? `/${location.search}` : "/";

  useEffect(() => {
    if (!teamno) return;

    async function run() {
      try {
        setError(null);
        const index = await loadJson<IndexData>("data/index.json");
        const season = seasonFromQuery || index.default.yrseason;
        const payload = await loadJson<TeamData>(`data/${season}/team-${teamno}.json`);
        setTeam(payload);
      } catch (err) {
        setError(String(err));
      }
    }

    void run();
  }, [teamno, seasonFromQuery]);

  if (error) return <p className="error">{error}</p>;
  if (!team) return <p>Loading team...</p>;

  const gp = gamesPlayed(team);

  return (
    <div className="stack">
      <p>
        <Link to={backTo} className="home-link">
          Back to rankings
        </Link>
      </p>

      <section className="panel">
        <h2>{team.team_name}</h2>
        <p className="meta">
          {genderLabel(team.summary.gender)} {team.summary.grade}th | {team.summary.division_name}
        </p>
        <p className="meta compact">
          Division record: {team.summary.wins}-{team.summary.losses}
          {team.summary.ties ? `-${team.summary.ties}` : ""} | Total listed games: {team.summary.games_played_total ?? team.past_games.length} final, {team.summary.games_scheduled_total ?? team.future_games.length} upcoming
        </p>
      </section>

      <section className="summary-grid panel">
        <div>Rank: {team.summary.rank ?? "-"}</div>
        <div>
          W-L: {team.summary.wins}-{team.summary.losses}
          {team.summary.ties ? `-${team.summary.ties}` : ""}
        </div>
        <div>SoS: {team.summary.sos.toFixed(1)}</div>
        <div>Power: {team.summary.power.toFixed(1)}</div>
        <div>PF/G: {avg(team.summary.pf, gp)}</div>
        <div>PA/G: {avg(team.summary.pa, gp)}</div>
        <div>Diff: {team.summary.diff}</div>
      </section>

      <section className="panel">
        <h3>Past Games</h3>
        <div className="table-wrap">
          <table className="games">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opponent</th>
                <th>Team</th>
                <th>Opp</th>
                <th>W/L</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {team.past_games.map((g) => {
                const scores = teamAndOpponentScores(g);
                return (
                  <tr key={g.gameno}>
                    <td>{g.date ?? "TBD"}</td>
                    <td>{g.opponent_name ?? "TBD"}</td>
                    <td>{scores.team ?? "-"}</td>
                    <td>{scores.opp ?? "-"}</td>
                    <td>{outcome(scores.team, scores.opp)}</td>
                    <td>{g.location ?? "TBD"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Future Games</h3>
        <div className="table-wrap">
          <table className="games">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Opponent</th>
                <th>Home/Away</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {team.future_games.map((g) => (
                <tr key={g.gameno}>
                  <td>{g.date ?? "TBD"}</td>
                  <td>{g.starttime ?? "TBD"}</td>
                  <td>{g.opponent_name ?? "TBD"}</td>
                  <td>{g.is_home === null ? "TBD" : g.is_home ? "Home" : "Away"}</td>
                  <td>{g.location ?? "TBD"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
