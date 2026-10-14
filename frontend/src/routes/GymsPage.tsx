import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadJsonCached } from "../data";
import { gymPath, seasonSlug } from "../paths";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import type { GymsIndex } from "../types";

export function GymsPage() {
  const [data, setData] = useState<GymsIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadJsonCached<GymsIndex>("data/gyms.json")
      .then(setData)
      .catch((err) => setError(String(err)));
  }, []);

  usePageSeo({
    title: `Gyms | ${SEO_SITE_NAME}`,
    description: "Every gym used for Metrowest youth basketball games, with addresses and game schedules.",
    canonicalPath: "/gyms",
    jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Gyms", url: `${SEO_SITE_URL}/gyms` },
  });

  const latest = useMemo(() => {
    const seasons = (data?.gyms ?? []).flatMap((g) => Object.keys(g.seasons));
    return seasons.sort().reverse()[0] ?? null;
  }, [data]);

  const gyms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.gyms ?? [])
      .filter((g) => !q || `${g.name} ${g.address ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => (b.seasons[latest ?? ""] ?? 0) - (a.seasons[latest ?? ""] ?? 0) || a.name.localeCompare(b.name));
  }, [data, query, latest]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading gyms…</p>;

  const recent = gyms.filter((g) => latest && g.seasons[latest]);
  const older = gyms.filter((g) => !latest || !g.seasons[latest]);

  return (
    <div className="stack">
      <section className="panel">
        <h2>Gyms</h2>
        <p className="meta">Where games are played, with addresses and each gym's schedule.</p>
        <div className="team-search">
          <label className="team-search-label" htmlFor="gym-filter">
            Find a gym
          </label>
          <input
            id="gym-filter"
            type="search"
            value={query}
            placeholder="Gym or town, e.g. Sudbury"
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
      </section>
      <section className="panel">
        <h3>Used in {latest ? seasonSlug(latest) : "the latest season"}</h3>
        <GymList gyms={recent} season={latest} />
        {!recent.length ? <p className="meta">No gyms match “{query.trim()}”.</p> : null}
      </section>
      {older.length ? (
        <section className="panel">
          <details>
            <summary>Earlier seasons only ({older.length})</summary>
            <GymList gyms={older} season={null} />
          </details>
        </section>
      ) : null}
    </div>
  );
}

function GymList({ gyms, season }: { gyms: GymsIndex["gyms"]; season: string | null }) {
  return (
    <ul className="town-list">
      {gyms.map((g) => (
        <li key={g.slug}>
          <Link to={gymPath(g.slug)}>
            <span className="result-name">{g.name}</span>
            <span className="result-meta">
              {g.address ?? "Address not listed"}
              {season && g.seasons[season] ? ` · ${g.seasons[season]} games` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
