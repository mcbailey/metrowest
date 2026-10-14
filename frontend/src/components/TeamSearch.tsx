import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadJsonCached } from "../data";
import { teamPath } from "../paths";
import { genderLabel, gradeLabel } from "../season";
import type { SearchData, SearchTeam } from "../types";

function loadSearch(season: string): Promise<SearchData> {
  return loadJsonCached<SearchData>(`data/${season}/search.json`);
}

function haystack(team: SearchTeam): string {
  return [team.name, team.town ?? "", `${gradeLabel(team.grade)} ${genderLabel(team.gender)}`, team.division_tag ?? ""]
    .join(" ")
    .toLowerCase();
}

type Props = {
  season: string;
  seasonLabel?: string;
  autoFocus?: boolean;
};

export function TeamSearch({ season, seasonLabel, autoFocus = false }: Props) {
  const [query, setQuery] = useState("");
  const [teams, setTeams] = useState<SearchTeam[] | null>(null);
  const listId = useId();

  useEffect(() => {
    let active = true;
    setTeams(null);
    loadSearch(season)
      .then((data) => {
        if (active) setTeams(data.teams);
      })
      .catch(() => {
        if (active) setTeams([]);
      });
    return () => {
      active = false;
    };
  }, [season]);

  const results = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length || !teams) return [];
    return teams.filter((t) => {
      const text = haystack(t);
      return tokens.every((tok) => text.includes(tok));
    });
  }, [query, teams]);

  const shown = results.slice(0, 12);

  return (
    <div className="team-search">
      <label className="team-search-label" htmlFor={`${listId}-input`}>
        Find a team{seasonLabel ? ` (${seasonLabel})` : ""}
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        value={query}
        autoFocus={autoFocus}
        placeholder="Town or team name, e.g. Natick 6th boys"
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {query.trim() ? (
        <ul className="team-search-results" aria-live="polite">
          {teams === null ? <li className="meta">Loading teams…</li> : null}
          {teams !== null && !shown.length ? <li className="meta">No teams match “{query.trim()}”.</li> : null}
          {shown.map((t) => (
            <li key={t.teamno}>
              <Link to={teamPath(season, t.teamno, t.name)} onClick={() => setQuery("")}>
                <span className="result-name">{t.name}</span>
                <span className="result-meta">
                  {gradeLabel(t.grade)} {genderLabel(t.gender)}
                  {t.division_tag ? ` · ${t.division_tag}` : ""} · #{t.rank} · {t.wins}-{t.losses}
                  {t.ties ? `-${t.ties}` : ""}
                </span>
              </Link>
            </li>
          ))}
          {results.length > shown.length ? (
            <li className="meta">{results.length - shown.length} more; keep typing to narrow it down.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
