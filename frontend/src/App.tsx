import { Link, Route, Routes } from "react-router-dom";
import { DivisionPage } from "./routes/DivisionPage";
import { TeamPage } from "./routes/TeamPage";

export default function App() {
  return (
    <div className="page">
      <header className="topbar">
        <h1>Metrowest Youth Basketball Power Rankings</h1>
        <Link to="/" className="home-link">
          Rankings
        </Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<DivisionPage />} />
          <Route path="/team/:teamno" element={<TeamPage />} />
        </Routes>
      </main>
    </div>
  );
}
