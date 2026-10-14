import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TeamSearch } from "../components/TeamSearch";
import { loadJson } from "../data";
import {
  currentSeason,
  findSeason,
  genderLabel,
  gradeLabel,
  loadLastView,
  rankingsHref,
  seasonStatusText,
} from "../season";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import type { IndexData } from "../types";

export function HomePage() {
  const [index, setIndex] = useState<IndexData | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastView = useMemo(() => loadLastView(), []);

  useEffect(() => {
    loadJson<IndexData>("data/index.json")
      .then((data) => {
        setIndex(data);
        setSeason(currentSeason(data)?.yrseason ?? null);
      })
      .catch((err) => setError(String(err)));
  }, []);

  usePageSeo({
    title: SEO_SITE_NAME,
    description: "Metrowest youth basketball power rankings, division standings, team ratings, and schedule-driven analytics.",
    canonicalPath: "/",
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: SEO_SITE_NAME, url: SEO_SITE_URL },
  });

  if (error) return <p className="error">{error}</p>;
  if (!index || !season) return <p>Loading data...</p>;

  const entry = findSeason(index, season);
  const groups = entry?.groups ?? [];
  const lastSeason = lastView ? findSeason(index, lastView.season) : undefined;

  return (
    <div className="stack">
      <section className="panel home-hero">
        <div className="home-hero-head">
          <div>
            <h2>Power rankings by grade</h2>
            <p className="meta">{seasonStatusText(entry)}</p>
          </div>
          <label className="season-picker">
            Season
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              {index.seasons.map((s) => (
                <option key={s.yrseason} value={s.yrseason}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TeamSearch season={season} seasonLabel={entry?.label} />
        {lastView && lastSeason ? (
          <p className="meta compact">
            Pick up where you left off:{" "}
            <Link to={rankingsHref(lastView)}>
              {gradeLabel(lastView.grade)} {genderLabel(lastView.gender)}, {lastSeason.label}
            </Link>
          </p>
        ) : null}
      </section>

      {(["M", "F"] as const).map((gender) => {
        const row = groups.filter((g) => g.gender === gender);
        if (!row.length) return null;
        return (
          <section className="panel" key={gender}>
            <h3>{genderLabel(gender)}</h3>
            <div className="grade-grid">
              {row.map((g) => (
                <Link key={g.grade} className="grade-card" to={rankingsHref({ season, gender, grade: g.grade })}>
                  <span className="grade-card-title">{gradeLabel(g.grade)}</span>
                  <span className="grade-card-meta">
                    {g.teams} teams · {g.divisions} {g.divisions === 1 ? "division" : "divisions"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
