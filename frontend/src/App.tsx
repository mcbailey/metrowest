import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { loadJson } from "./data";
import { DivisionPage } from "./routes/DivisionPage";
import { GlossaryPage } from "./routes/GlossaryPage";
import { HomePage } from "./routes/HomePage";
import { TeamPage } from "./routes/TeamPage";
import { currentSeason } from "./season";
import { useSiteSchema } from "./seo";
import type { IndexData } from "./types";

/** "/" is the landing page; "/?season=…&gender=…" (the long-standing rankings URL) shows rankings. */
function RootRoute() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  return params.has("gender") || params.has("grade") ? <DivisionPage /> : <HomePage />;
}

function OffSeasonNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadJson<IndexData>("data/index.json")
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
        <div className="brand-wrap">
          <img src="/mwstatslogo.png" alt="MWStats logo" className="brand-logo" />
          <div className="brand-copy">
            <p className="brand-kicker">MWStats.com</p>
            <h1>Metrowest Youth Basketball Rankings</h1>
          </div>
        </div>
        <nav className="topbar-links">
          <Link to="/" className="home-link">
            Home
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
          <Route path="/team/:teamno" element={<TeamPage />} />
        </Routes>
      </main>
    </div>
  );
}
