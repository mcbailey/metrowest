import { Link, Route, Routes } from "react-router-dom";
import { DivisionPage } from "./routes/DivisionPage";
import { GlossaryPage } from "./routes/GlossaryPage";
import { TeamPage } from "./routes/TeamPage";

export default function App() {
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
            Rankings
          </Link>
          <Link to="/glossary" className="home-link">
            Glossary
          </Link>
        </nav>
      </header>

      <section className="notice-banner" role="note">
        <p>
          Data source: <a href="https://metrowestbball.com" target="_blank" rel="noreferrer">metrowestbball.com</a>. Updated daily.
        </p>
        <p>
          Insights and analytics are best-effort and for entertainment and curiosity only. They are discussion starters for coaches and players, not formal evaluations. Keep youth sports fun.
        </p>
      </section>

      <main>
        <Routes>
          <Route path="/" element={<DivisionPage />} />
          <Route path="/glossary" element={<GlossaryPage />} />
          <Route path="/team/:teamno" element={<TeamPage />} />
        </Routes>
      </main>
    </div>
  );
}
