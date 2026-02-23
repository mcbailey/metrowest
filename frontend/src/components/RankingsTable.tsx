import { useNavigate } from "react-router-dom";
import { RankingTeam } from "../types";

type Props = {
  teams: RankingTeam[];
};

function gamesPlayed(team: RankingTeam): number {
  return team.wins + team.losses + team.ties;
}

function avg(value: number, games: number): string {
  return games > 0 ? (value / games).toFixed(1) : "0.0";
}

export function RankingsTable({ teams }: Props) {
  const navigate = useNavigate();

  return (
    <table className="rankings">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Team</th>
          <th>W-L</th>
          <th>SoS</th>
          <th>Power</th>
          <th>PF/G</th>
          <th>PA/G</th>
          <th>Diff</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((team) => {
          const gp = gamesPlayed(team);
          return (
            <tr key={team.teamno} onClick={() => navigate(`/team/${team.teamno}`)}>
              <td>{team.rank}</td>
              <td>{team.name}</td>
              <td>
                {team.wins}-{team.losses}
                {team.ties ? `-${team.ties}` : ""}
              </td>
              <td>{team.sos.toFixed(1)}</td>
              <td>{team.power.toFixed(1)}</td>
              <td>{avg(team.pf, gp)}</td>
              <td>{avg(team.pa, gp)}</td>
              <td>{team.diff}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
