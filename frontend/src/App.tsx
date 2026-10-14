import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { loadJsonCached } from "./data";
import { DivisionPage, legacyRankingsPath } from "./routes/DivisionPage";
import { GlossaryPage } from "./routes/GlossaryPage";
import { GymPage } from "./routes/GymPage";
import { GymsPage } from "./routes/GymsPage";
import { HomePage } from "./routes/HomePage";
import { PlayoffsPage } from "./routes/PlayoffsPage";
import { TeamPage } from "./routes/TeamPage";
import { TownPage } from "./routes/TownPage";
import { TownsPage } from "./routes/TownsPage";
import { WeekPage } from "./routes/WeekPage";
import { currentSeason } from "./season";
import { useSiteSchema } from "./seo";
import type { IndexData } from "./types";

/** "/" is the landing page; old "/?season=…&gender=…" rankings links redirect to their path URLs. */
function RootRoute() {
  const { search } = useLocation();
  const legacy = legacyRankingsPath(new URLSearchParams(search));
  return legacy ? <Navigate to={legacy} replace /> : <HomePage />;
}

function NotFound() {
  return (
    <section className="panel">
      <h2>Page not found</h2>
      <p className="meta">
        That page doesn't exist. Try the <Link to="/">home page</Link> or the <Link to="/towns">town list</Link>.
      </p>
    </section>
  );
}

function OffSeasonNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadJsonCached<IndexData>("data/index.json")
      .then((index) => {
        const season = currentSeason(index);
        if (season?.status !== "final") return;
        const next = Number(season.yrseason);
        setMessage(
          `The ${season.label} season is complete. ${next}-${String(next + 1).slice(-2)} rankings will show up here automatically once the league posts divisions.`
        );
      })
      .catch(() => undefined);
  }, []);

  return message ? <p className="season-notice">{message}</p> : null;
}

export default function App() {
  useSiteSchema();

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand-wrap">
          <img src="/mwstatslogo.png" alt="MWStats logo" className="brand-logo" />
          <div className="brand-copy">
            <p className="brand-kicker">MWStats.com</p>
            <h1>Metrowest Youth Basketball Rankings</h1>
          </div>
        </Link>
        <nav className="topbar-links">
          <Link to="/" className="home-link">
            Home
          </Link>
          <Link to="/week" className="home-link">
            This Week
          </Link>
          <Link to="/towns" className="home-link">
            Towns
          </Link>
          <Link to="/gyms" className="home-link">
            Gyms
          </Link>
          <Link to="/glossary" className="home-link">
            Glossary
          </Link>
        </nav>
      </header>

      <section className="notice-banner" role="note">
        <p>
          Data source: <a href="https://metrowestbball.com" target="_blank" rel="noreferrer">metrowestbball.com</a>. Updated daily during the season.
        </p>
        <p>
          Insights and analytics are best-effort and for entertainment and curiosity only. They are discussion starters for coaches and players, not formal evaluations. Keep youth sports fun.
        </p>
      </section>

      <OffSeasonNotice />

      <main>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/glossary" element={<GlossaryPage />} />
          <Route path="/week" element={<WeekPage />} />
          <Route path="/gyms" element={<GymsPage />} />
          <Route path="/gyms/:slug" element={<GymPage />} />
          <Route path="/towns" element={<TownsPage />} />
          <Route path="/towns/:slug" element={<TownPage />} />
          <Route path="/team/:teamno" element={<TeamPage />} />
          <Route path="/:season/team/:teamSlug" element={<TeamPage />} />
          <Route path="/:season/playoffs/:gender/:grade" element={<PlayoffsPage />} />
          <Route path="/:season/:gender/:grade" element={<DivisionPage />} />
          <Route path="/:season/:gender/:grade/:division" element={<DivisionPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
