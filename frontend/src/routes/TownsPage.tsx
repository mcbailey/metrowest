import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadJsonCached } from "../data";
import { seasonSlug, townPath } from "../paths";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import type { TownsData } from "../types";

export function TownsPage() {
  const [data, setData] = useState<TownsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadJsonCached<TownsData>("data/towns.json")
      .then(setData)
      .catch((err) => setError(String(err)));
  }, []);

  usePageSeo({
    title: `Towns | ${SEO_SITE_NAME}`,
    description: "Every town in Metrowest youth basketball, with each town's teams, rankings, and history by season.",
    canonicalPath: "/towns",
    jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Towns", url: `${SEO_SITE_URL}/towns` },
  });

  const towns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.towns ?? []).filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [data, query]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading towns…</p>;

  return (
    <div className="stack">
      <section className="panel">
        <h2>Towns</h2>
        <p className="meta">Each town's teams across every grade and season on record.</p>
        <div className="team-search">
          <label className="team-search-label" htmlFor="town-filter">
            Filter towns
          </label>
          <input
            id="town-filter"
            type="search"
            value={query}
            placeholder="e.g. Natick"
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
      </section>
      <section className="panel">
        <ul className="town-list">
          {towns.map((t) => (
            <li key={t.slug}>
              <Link to={townPath(t.slug)}>
                <span className="result-name">{t.name}</span>
                <span className="result-meta">
                  {t.latest_teams} teams in {seasonSlug(t.latest_season)} · {t.seasons}{" "}
                  {t.seasons === 1 ? "season" : "seasons"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {!towns.length ? <p className="meta">No towns match “{query.trim()}”.</p> : null}
      </section>
    </div>
  );
}
