import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { loadJson } from "../data";
import { IndexData, TeamData } from "../types";

export function TeamPage() {
  const { teamno } = useParams<{ teamno: string }>();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamno) return;

    async function run() {
      try {
        const index = await loadJson<IndexData>("data/index.json");
        const season = index.default.yrseason;
        const payload = await loadJson<TeamData>(`data/${season}/team-${teamno}.json`);
        setTeam(payload);
      } catch (err) {
        setError(String(err));
      }
    }

    void run();
  }, [teamno]);

  if (error) return <p className="error">{error}</p>;
  if (!team) return <p>Loading team...</p>;

  return (
    <div className="stack">
      <p>
        <Link to="/">Back to rankings</Link>
      </p>
      <h2>{team.team_name}</h2>
      <p className="meta">
        {team.summary.gender === "M" ? "Boys" : "Girls"} {team.summary.grade}th | {team.summary.division_name}
      </p>
      <div className="summary-grid">
        <div>Rank: {team.summary.rank ?? "-"}</div>
        <div>
          W-L: {team.summary.wins}-{team.summary.losses}
          {team.summary.ties ? `-${team.summary.ties}` : ""}
        </div>
        <div>SoS: {team.summary.sos.toFixed(1)}</div>
        <div>Power: {team.summary.power.toFixed(1)}</div>
        <div>PF: {team.summary.pf}</div>
        <div>PA: {team.summary.pa}</div>
        <div>Diff: {team.summary.diff}</div>
      </div>

      <section>
        <h3>Past Games</h3>
        <table className="games">
          <thead>
            <tr>
              <th>Date</th>
              <th>Opponent</th>
              <th>Result</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {team.past_games.map((g) => (
              <tr key={g.gameno}>
                <td>{g.date ?? "TBD"}</td>
                <td>{g.opponent_name ?? "TBD"}</td>
                <td>
                  {g.home_score}-{g.away_score}
                </td>
                <td>{g.location ?? "TBD"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Future Games</h3>
        <table className="games">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Opponent</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {team.future_games.map((g) => (
              <tr key={g.gameno}>
                <td>{g.date ?? "TBD"}</td>
                <td>{g.starttime ?? "TBD"}</td>
                <td>{g.opponent_name ?? "TBD"}</td>
                <td>{g.location ?? "TBD"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
