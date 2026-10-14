import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ProgramHistory } from "../components/ProgramHistory";
import { loadJsonCached } from "../data";
import { rankingsPath, seasonSlug, teamPath } from "../paths";
import { genderLabel, gradeLabel } from "../season";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import type { TownData, TownTeam } from "../types";

export function TownPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [town, setTown] = useState<TownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [cohort, setCohort] = useState<string>("");

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
    title: `${name} youth basketball teams | ${SEO_SITE_NAME}`,
    description: `${name} teams in Metrowest youth basketball: power rankings, records, and playoff results for every grade and season.`,
    canonicalPath: `/towns/${slug}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${name} teams`,
      url: `${SEO_SITE_URL}/towns/${slug}`,
    },
  });

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
        <h2>{town.name}</h2>
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

      {(["M", "F"] as const).map((gender) => {
        const teams = seasonTeams.filter((t) => t.gender === gender);
        if (!teams.length) return null;
        return (
          <section className="panel" key={gender}>
            <h3>
              {genderLabel(gender)}, {seasonSlug(season)}
            </h3>
            <TownTeamsTable teams={teams} season={season} />
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

function TownTeamsTable({ teams, season }: { teams: TownTeam[]; season: string }) {
  return (
    <div className="table-wrap">
      <table className="games">
        <thead>
          <tr>
            <th>Grade</th>
            <th>Team</th>
            <th>Division</th>
            <th>Rank</th>
            <th>Record</th>
            <th>Playoffs</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.teamno}>
              <td>
                {i === 0 || teams[i - 1].grade !== t.grade ? (
                  <Link to={rankingsPath(season, t.gender, t.grade)}>{gradeLabel(t.grade)}</Link>
                ) : null}
              </td>
              <td>
                <Link className="team-link" to={teamPath(season, t.teamno, t.name)}>
                  {t.name}
                </Link>
              </td>
              <td>{t.division_tag ?? (t.divisiontier ? `D${t.divisiontier}` : "-")}</td>
              <td>
                {t.rank}
                {t.division_size ? <span className="metric-note"> of {t.division_size}</span> : null}
              </td>
              <td>
                {t.wins}-{t.losses}
                {t.ties ? `-${t.ties}` : ""}
              </td>
              <td>{t.playoffs.length ? t.playoffs.join("; ") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
