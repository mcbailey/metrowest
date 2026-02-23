import { useNavigate } from "react-router-dom";
import { RankingTeam } from "../types";

type Props = {
  teams: RankingTeam[];
};

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
          <th>PF</th>
          <th>PA</th>
          <th>Diff</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((team) => (
          <tr key={team.teamno} onClick={() => navigate(`/team/${team.teamno}`)}>
            <td>{team.rank}</td>
            <td>{team.name}</td>
            <td>
              {team.wins}-{team.losses}
              {team.ties ? `-${team.ties}` : ""}
            </td>
            <td>{team.sos.toFixed(1)}</td>
            <td>{team.power.toFixed(1)}</td>
            <td>{team.pf}</td>
            <td>{team.pa}</td>
            <td>{team.diff}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
