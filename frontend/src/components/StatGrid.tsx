import { useState } from "react";
import { Link } from "react-router-dom";

/** Plain-language meaning of each stat; mirrors the glossary page. */
const TERMS: Record<string, string> = {
  Rank: "Place in the division by Power.",
  "W-L": "Wins and losses in division games.",
  SoS: "Strength of schedule: how tough the opponents were on average. Higher means tougher.",
  Power: "Overall team score used for rank. It blends game results with the strength of the teams played.",
  "MW Rating": "The rating Metrowest shows in its own standings. Shown as-is.",
  "MW Points": "The points Metrowest shows in its own standings. Shown as-is.",
  "PF/G": "Points scored per game.",
  "PA/G": "Points allowed per game.",
  Diff: "Total points scored minus points allowed.",
};

/** Stat tiles; tapping a label shows what it means. */
export function StatGrid({ stats }: { stats: Array<[label: string, value: string]> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="panel">
      <div className="summary-grid">
        {stats.map(([label, value]) => (
          <button
            type="button"
            key={label}
            className={`stat-tile ${open === label ? "stat-tile-open" : ""}`}
            aria-expanded={open === label}
            onClick={() => setOpen(open === label ? null : label)}
          >
            <span className="stat-label">{label}</span> <strong>{value}</strong>
          </button>
        ))}
      </div>
      {open && TERMS[open] ? (
        <p className="meta compact stat-definition">
          <strong>{open}:</strong> {TERMS[open]} <Link to="/glossary">More in the glossary</Link>
        </p>
      ) : (
        <p className="meta compact">Tap a stat to see what it means.</p>
      )}
    </section>
  );
}
