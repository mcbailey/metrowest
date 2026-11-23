import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GameList } from "../components/GameList";
import { ProgramHistory } from "../components/ProgramHistory";
import { TeamName } from "../components/TeamName";
import { useSeasonTeams } from "../components/useSeasonTeams";
import { loadJsonCached } from "../data";
import { rankingsPath, seasonSlug, teamPath } from "../paths";
import { genderLabel, gradeLabel, shortDay, todayIso } from "../season";
import { SEO_SITE_URL, usePageSeo } from "../seo";
import { officialTownName, townDescription, townTitle } from "../seoText";
import type { GroupGamesData, ScheduleGame, SearchTeam, TownData, TownTeam } from "../types";

export function TownPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [town, setTown] = useState<TownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [cohort, setCohort] = useState<string>("");
  const [townGames, setTownGames] = useState<GroupGamesData | null>(null);

  useEffect(() => {
    let active = true;
    setTown(null);
    setError(null);
    loadJsonCached<TownData>(`data/towns/${slug}.json`)
      .then((data) => {
        if (!active) return;
        setTown(data);
        setSeason(data.seasons[0] ?? null);
        setCohort("");
      })
      .catch(() => {
        if (active) setError("We don't have a town by that name.");
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const name = town?.name ?? slug;
  usePageSeo({
    title: townTitle(name),
    description: townDescription(name),
    canonicalPath: `/towns/${slug}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${name} teams`,
      url: `${SEO_SITE_URL}/towns/${slug}`,
    },
  });

  // Schedule for the latest season only (that is the one with games still to play).
  const latestSeason = town?.seasons[0] ?? null;
  const isLatest = season !== null && season === latestSeason;
  const seasonTeamMap = useSeasonTeams(isLatest ? season : null);
  useEffect(() => {
    if (!latestSeason) return;
    let active = true;
    setTownGames(null);
    loadJsonCached<GroupGamesData>(`data/${latestSeason}/town-games/${slug}.json`)
      .then((d) => active && setTownGames(d))
      .catch(() => active && setTownGames(null));
    return () => {
      active = false;
    };
  }, [latestSeason, slug]);

  // Next game for each team, and the next day (or weekend) with any games.
  const { nextByTeam, comingUp } = useMemo(() => {
    const today = todayIso();
    const upcoming = (townGames?.games ?? [])
      .filter((g) => g.date && g.date >= today && !g.final)
      .sort((a, b) => `${a.date}`.localeCompare(`${b.date}`));
    const nextByTeam = new Map<string, ScheduleGame>();
    for (const g of upcoming) {
      for (const t of [g.home, g.away]) if (t && !nextByTeam.has(t)) nextByTeam.set(t, g);
    }
    // The first weekend with games: its Saturday and Sunday (or a single weekday).
    const first = upcoming[0]?.date;
    let comingUp: ScheduleGame[] = [];
    if (first) {
      const end = new Date(`${first}T12:00:00`);
      end.setDate(end.getDate() + (end.getDay() === 6 ? 1 : 0));
      const last = end.toISOString().slice(0, 10);
      comingUp = upcoming.filter((g) => g.date! <= last);
    }
    return { nextByTeam, comingUp };
  }, [townGames]);

  const seasonTeams = useMemo(() => (town?.teams ?? []).filter((t) => t.yrseason === season), [town, season]);
  const cohorts = useMemo(() => {
    const seen = new Map<string, { gender: "M" | "F"; classOf: number; latestGrade: number; latestSeason: string }>();
    for (const t of town?.teams ?? []) {
      const key = `${t.gender}-${t.class_of}`;
      const prev = seen.get(key);
      if (!prev || Number(t.yrseason) > Number(prev.latestSeason)) {
        seen.set(key, { gender: t.gender, classOf: t.class_of, latestGrade: t.grade, latestSeason: t.yrseason });
      }
    }
    return [...seen.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (a.gender === b.gender ? a.classOf - b.classOf : a.gender === "M" ? -1 : 1));
  }, [town]);

  if (error) return <p className="error">{error}</p>;
  if (!town || !season) return <p>Loading town…</p>;

  const selectedCohort = cohorts.find((c) => c.key === cohort);

  return (
    <div className="stack">
      <p>
        <Link to="/towns" className="home-link">
          ← All towns
        </Link>
      </p>
      <section className="panel">
        <h2>
          {officialTownName(town.name)} youth basketball
        </h2>
        <p className="meta">
          {town.teams.length} teams across {town.seasons.length} {town.seasons.length === 1 ? "season" : "seasons"}
        </p>
        <div className="chip-group" role="group" aria-label="Season">
          {town.seasons.map((s) => (
            <button
              type="button"
              key={s}
              className={`chip ${s === season ? "chip-active" : ""}`}
              aria-pressed={s === season}
              onClick={() => setSeason(s)}
            >
              {seasonSlug(s)}
            </button>
          ))}
        </div>
      </section>

      {isLatest && comingUp.length && seasonTeamMap ? (
        <section className="panel">
          <h3>Coming up</h3>
          <GameList games={comingUp} season={season} teams={seasonTeamMap} gymNames={townGames?.gyms} />
          <p className="meta compact">
            <Link to={`/week?town=${town.slug}`}>All {officialTownName(town.name)} games by week →</Link>
          </p>
        </section>
      ) : null}

      {(["M", "F"] as const).map((gender) => {
        const teams = seasonTeams.filter((t) => t.gender === gender);
        if (!teams.length) return null;
        return (
          <section className="panel" key={gender}>
            <h3>
              {genderLabel(gender)}, {seasonSlug(season)}
            </h3>
            <TownTeamsList
              teams={teams}
              season={season}
              nextByTeam={isLatest ? nextByTeam : undefined}
              teamNames={seasonTeamMap}
            />
          </section>
        );
      })}

      <section className="panel">
        <h3>Follow a class through the years</h3>
        <p className="meta compact">Pick a group to see the same age group in every season (e.g. this year's 6th graders as 5th, 4th, 3rd graders).</p>
        <label className="season-picker">
          Group
          <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
            <option value="">Choose…</option>
            {cohorts.map((c) => (
              <option key={c.key} value={c.key}>
                {genderLabel(c.gender)}, class of {c.classOf} ({gradeLabel(c.latestGrade)} grade in {seasonSlug(c.latestSeason)})
              </option>
            ))}
          </select>
        </label>
        {selectedCohort ? (
          <ProgramHistory
            townSlug={town.slug}
            townName={town.name}
            gender={selectedCohort.gender}
            classOf={selectedCohort.classOf}
          />
        ) : null}
      </section>
    </div>
  );
}

/** Teams grouped by grade: name, division, rank and record, and (current season) the next game. */
function TownTeamsList({
  teams,
  season,
  nextByTeam,
  teamNames,
}: {
  teams: TownTeam[];
  season: string;
  nextByTeam?: Map<string, ScheduleGame>;
  teamNames?: Map<string, SearchTeam> | null;
}) {
  const grades = [...new Set(teams.map((t) => t.grade))].sort((a, b) => a - b);
  return (
    <div className="town-grades">
      {grades.map((grade) => (
        <div key={grade} className="town-grade">
          <h4 className="day-heading">
            <Link to={rankingsPath(season, teams[0].gender, grade)}>{gradeLabel(grade)} grade</Link>
          </h4>
          <ul className="town-teams">
            {teams
              .filter((t) => t.grade === grade)
              .map((t) => {
                const next = nextByTeam?.get(t.teamno);
                const opponent = next ? (next.home === t.teamno ? next.away : next.home) : null;
                return (
                  <li key={t.teamno}>
                    <Link className="team-link" to={teamPath(season, t.teamno, t.name)}>
                      <strong>
                        <TeamName name={t.name} />
                      </strong>
                    </Link>
                    <span className="metric-note">
                      {" "}
                      {t.wins + t.losses + t.ties ? (
                        <>
                          {t.wins}-{t.losses}
                          {t.ties ? `-${t.ties}` : ""} · #{t.rank}
                          {t.division_size ? ` of ${t.division_size}` : ""}
                        </>
                      ) : (
                        <>#{t.rank}{t.division_size ? ` of ${t.division_size}` : ""} preseason</>
                      )}
                      {t.playoffs.length ? ` · ${t.playoffs.join("; ")}` : ""}
                    </span>
                    {next ? (
                      <span className="town-next">
                        Next: {shortDay(next.date)}
                        {next.time ? ` ${next.time}` : ""} {next.home === t.teamno ? "vs" : "@"}{" "}
                        <TeamName name={(opponent && teamNames?.get(opponent)?.name) || nameFor(next, opponent)} tag={false} />
                      </span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function nameFor(game: ScheduleGame, teamno: string | null): string {
  if (teamno === game.home) return game.home_name ?? "";
  return game.away_name ?? "";
}
