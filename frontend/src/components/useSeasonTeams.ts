import { useEffect, useState } from "react";
import { loadJsonCached } from "../data";
import type { SearchData, SearchTeam } from "../types";

/** Every league team in a season, by team number (from {season}/search.json). */
export function useSeasonTeams(season: string | null): Map<string, SearchTeam> | null {
  const [teams, setTeams] = useState<Map<string, SearchTeam> | null>(null);
  useEffect(() => {
    if (!season) return;
    let active = true;
    setTeams(null);
    loadJsonCached<SearchData>(`data/${season}/search.json`)
      .then((d) => {
        if (active) setTeams(new Map(d.teams.map((t) => [t.teamno, t])));
      })
      .catch(() => {
        if (active) setTeams(new Map());
      });
    return () => {
      active = false;
    };
  }, [season]);
  return teams;
}
