import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RankingTeam } from "../types";

type DisplayTeam = RankingTeam & {
  division_label?: string;
  subgroup?: string;
};

type Props = {
  teams: DisplayTeam[];
  showGroup?: boolean;
};

type SortDir = "asc" | "desc";
type SortKey = "rank" | "subgroup" | "name" | "wins" | "losses" | "ties" | "sos" | "power" | "pfg" | "pag" | "diff";

function gamesPlayed(team: RankingTeam): number {
  return team.wins + team.losses + team.ties;
}

function avg(value: number, games: number): number {
  return games > 0 ? value / games : 0;
}

function defaultDirFor(key: SortKey): SortDir {
  if (key === "name" || key === "subgroup" || key === "rank") {
    return "asc";
  }
  if (key === "losses") {
    return "asc";
  }
  return "desc";
}

function compareStrings(a: string | undefined, b: string | undefined): number {
  return (a ?? "").toLowerCase().localeCompare((b ?? "").toLowerCase());
}

export function RankingsTable({ teams, showGroup = false }: Props) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedTeams = useMemo(() => {
    const out = [...teams];
    out.sort((a, b) => {
      const aGp = gamesPlayed(a);
      const bGp = gamesPlayed(b);

      let cmp = 0;
      switch (sortKey) {
        case "rank":
          cmp = a.rank - b.rank;
          break;
        case "subgroup":
          cmp = compareStrings(a.subgroup, b.subgroup);
          break;
        case "name":
          cmp = compareStrings(a.name, b.name);
          break;
        case "wins":
          cmp = a.wins - b.wins;
          if (cmp === 0) cmp = b.losses - a.losses;
          break;
        case "losses":
          cmp = a.losses - b.losses;
          if (cmp === 0) cmp = b.wins - a.wins;
          break;
        case "ties":
          cmp = a.ties - b.ties;
          break;
        case "sos":
          cmp = a.sos - b.sos;
          break;
        case "power":
          cmp = a.power - b.power;
          break;
        case "pfg":
          cmp = avg(a.pf, aGp) - avg(b.pf, bGp);
          break;
        case "pag":
          cmp = avg(a.pa, aGp) - avg(b.pa, bGp);
          break;
        case "diff":
          cmp = a.diff - b.diff;
          break;
        default:
          cmp = 0;
      }

      if (cmp === 0) cmp = a.rank - b.rank;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [teams, sortDir, sortKey]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultDirFor(key));
  };

  const arrow = (key: SortKey): string => {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? "▲" : "▼";
  };

  const avgLabel = (value: number, games: number): string => avg(value, games).toFixed(1);

  return (
    <div className="table-wrap">
      <table className="rankings">
        <thead>
          <tr>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("rank")}>
                Rank <span>{arrow("rank")}</span>
              </button>
            </th>
            {showGroup ? (
              <th>
                <button type="button" className="sort-btn" onClick={() => setSort("subgroup")}>
                  Group <span>{arrow("subgroup")}</span>
                </button>
              </th>
            ) : null}
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("name")}>
                Team <span>{arrow("name")}</span>
              </button>
            </th>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("wins")}>
                W <span>{arrow("wins")}</span>
              </button>
            </th>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("losses")}>
                L <span>{arrow("losses")}</span>
              </button>
            </th>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("ties")}>
                T <span>{arrow("ties")}</span>
              </button>
            </th>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("sos")}>
                SoS <span>{arrow("sos")}</span>
              </button>
            </th>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("power")}>
                Power <span>{arrow("power")}</span>
              </button>
            </th>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("pfg")}>
                PF/G <span>{arrow("pfg")}</span>
              </button>
            </th>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("pag")}>
                PA/G <span>{arrow("pag")}</span>
              </button>
            </th>
            <th>
              <button type="button" className="sort-btn" onClick={() => setSort("diff")}>
                Diff <span>{arrow("diff")}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team) => {
            const gp = gamesPlayed(team);
            return (
              <tr key={team.teamno} onClick={() => navigate(`/team/${team.teamno}`)}>
                <td>{team.rank}</td>
                {showGroup ? <td>{team.subgroup ?? "-"}</td> : null}
                <td>{team.name}</td>
                <td>{team.wins}</td>
                <td>{team.losses}</td>
                <td>{team.ties}</td>
                <td>{team.sos.toFixed(1)}</td>
                <td>{team.power.toFixed(1)}</td>
                <td>{avgLabel(team.pf, gp)}</td>
                <td>{avgLabel(team.pa, gp)}</td>
                <td>{team.diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
