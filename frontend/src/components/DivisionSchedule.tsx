import { useEffect, useState } from "react";
import { loadJsonCached } from "../data";
import { todayIso } from "../season";
import type { GroupGamesData, ScheduleGame } from "../types";
import { GameList } from "./GameList";
import { useSeasonTeams } from "./useSeasonTeams";

/** Upcoming games and results for one division's teams (including their games against other divisions). */
export function DivisionSchedule({
  season,
  gender,
  grade,
  divisionno,
}: {
  season: string;
  gender: "M" | "F";
  grade: number;
  divisionno: string;
}) {
  const [data, setData] = useState<GroupGamesData | null | undefined>(undefined);
  const [showAll, setShowAll] = useState({ upcoming: false, results: false });
  const teams = useSeasonTeams(season);

  useEffect(() => {
    let active = true;
    setData(undefined);
    setShowAll({ upcoming: false, results: false });
    loadJsonCached<GroupGamesData>(`data/${season}/${gender}/${grade}/division-${divisionno}-games.json`)
      .then((d) => active && setData(d))
      .catch(() => active && setData(null));
    return () => {
      active = false;
    };
  }, [season, gender, grade, divisionno]);

  if (data === null) return null;
  if (data === undefined || !teams) return <section className="panel"><p className="meta">Loading schedule…</p></section>;

  const today = todayIso();
  const results = data.games.filter((g) => g.final).sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
  const upcoming = data.games
    .filter((g) => !g.final && (!g.date || g.date >= today))
    .sort((a, b) => `${a.date}`.localeCompare(`${b.date}`));
  if (!results.length && !upcoming.length) return null;

  return (
    <section className="panel">
      <h3>Division schedule</h3>
      <p className="meta compact">Every game for this division's teams, including games against other divisions.</p>
      {upcoming.length ? (
        <details open>
          <summary>Upcoming ({upcoming.length})</summary>
          <GameList
            games={showAll.upcoming ? upcoming : firstDays(upcoming, 2)}
            season={season}
            teams={teams}
            gymNames={data.gyms}
            showGroup={false}
          />
          {!showAll.upcoming && firstDays(upcoming, 2).length < upcoming.length ? (
            <button type="button" className="link-button" onClick={() => setShowAll({ ...showAll, upcoming: true })}>
              Show all {upcoming.length} upcoming games
            </button>
          ) : null}
        </details>
      ) : null}
      {results.length ? (
        <details open={!upcoming.length}>
          <summary>Results ({results.length})</summary>
          <GameList
            games={showAll.results ? results : firstDays(results, 2)}
            season={season}
            teams={teams}
            gymNames={data.gyms}
            showGroup={false}
            newestFirst
          />
          {!showAll.results && firstDays(results, 2).length < results.length ? (
            <button type="button" className="link-button" onClick={() => setShowAll({ ...showAll, results: true })}>
              Show all {results.length} results
            </button>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}

/** Games on the first `n` distinct dates, in the list's order. */
function firstDays(games: ScheduleGame[], n: number): ScheduleGame[] {
  const days = [...new Set(games.map((g) => g.date))].slice(0, n);
  return games.filter((g) => days.includes(g.date));
}
