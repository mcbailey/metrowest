import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GameList } from "../components/GameList";
import { useSeasonTeams } from "../components/useSeasonTeams";
import { loadJsonCached } from "../data";
import { seasonSlug } from "../paths";
import { formatDate } from "../season";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import type { GymData, GymsIndex } from "../types";

export function GymPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [index, setIndex] = useState<GymsIndex | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [gym, setGym] = useState<GymData | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJsonCached<GymsIndex>("data/gyms.json")
      .then((d) => {
        setIndex(d);
        const entry = d.gyms.find((g) => g.slug === slug);
        if (!entry) setError("We don't have a gym by that name.");
        else setSeason(Object.keys(entry.seasons).sort().reverse()[0] ?? null);
      })
      .catch((err) => setError(String(err)));
  }, [slug]);

  const teams = useSeasonTeams(season);

  useEffect(() => {
    if (!season) return;
    let active = true;
    setGym(null);
    loadJsonCached<GymData>(`data/${season}/gyms/${slug}.json`)
      .then((d) => {
        if (!active) return;
        setGym(d);
        // Default to the next day with games, or the last one if the season is over.
        const days = [...new Set(d.games.map((g) => g.date).filter((x): x is string => Boolean(x)))].sort();
        const today = new Date().toISOString().slice(0, 10);
        setDay(days.find((x) => x >= today) ?? days[days.length - 1] ?? null);
      })
      .catch((err) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [season, slug]);

  const entry = index?.gyms.find((g) => g.slug === slug);
  const name = gym?.name ?? entry?.name ?? slug;
  usePageSeo({
    title: `${name} | ${SEO_SITE_NAME}`,
    description: `${name}${entry?.address ? `, ${entry.address}` : ""}: Metrowest youth basketball games and schedule.`,
    canonicalPath: `/gyms/${slug}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SportsActivityLocation",
      name,
      address: entry?.address ?? undefined,
      url: `${SEO_SITE_URL}/gyms/${slug}`,
    },
  });

  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of gym?.games ?? []) if (g.date) counts.set(g.date, (counts.get(g.date) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [gym]);

  if (error) return <p className="error">{error}</p>;
  if (!entry || !season) return <p>Loading gym…</p>;

  const seasons = Object.keys(entry.seasons).sort().reverse();
  const address = gym?.address ?? entry.address;
  const dayGames = (gym?.games ?? []).filter((g) => g.date === day);

  return (
    <div className="stack">
      <p>
        <Link to="/gyms" className="home-link">
          ← All gyms
        </Link>
      </p>
      <section className="panel">
        <h2>{name}</h2>
        {address ? (
          <p className="meta">
            {address} ·{" "}
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`} target="_blank" rel="noreferrer">
              Map and directions
            </a>
          </p>
        ) : (
          <p className="meta">Address not listed by the league.</p>
        )}
        {gym && gym.courts.length > 1 ? <p className="meta compact">Courts: {gym.courts.join(" · ")}</p> : null}
        <div className="chip-group" role="group" aria-label="Season">
          {seasons.map((s) => (
            <button
              type="button"
              key={s}
              className={`chip ${s === season ? "chip-active" : ""}`}
              aria-pressed={s === season}
              onClick={() => setSeason(s)}
            >
              {seasonSlug(s)} · {entry.seasons[s]}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="home-hero-head">
          <h3>Games</h3>
          {days.length ? (
            <label className="season-picker">
              Day
              <select value={day ?? ""} onChange={(e) => setDay(e.target.value)}>
                {days.map(([d, n]) => (
                  <option key={d} value={d}>
                    {formatDate(d)} ({n})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {!gym || !teams ? <p className="meta">Loading games…</p> : null}
        {gym && teams && dayGames.length ? (
          <GameList games={dayGames} season={season} teams={teams} showVenue={false} />
        ) : null}
        {gym && teams && !dayGames.length ? <p className="meta">No dated games here this season.</p> : null}
      </section>
    </div>
  );
}
