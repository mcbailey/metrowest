import { Link, useLocation } from "react-router-dom";
import { SEO_SITE_URL, usePageSeo } from "../seo";

export function GlossaryPage() {
  const location = useLocation();
  const backTo = location.search ? `/${location.search}` : "/";
  usePageSeo({
    title: "Glossary | MWStats",
    description:
      "Coach-friendly glossary for MWStats metrics: SoS, adjusted SoS, power ranking, MW rating, MW points, quality wins, bad losses, and quadrant map categories.",
    canonicalPath: "/glossary",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "MWStats Glossary",
      description:
        "Coach-friendly glossary for MWStats basketball ranking and team analytics terms.",
      url: `${SEO_SITE_URL}/glossary`,
    },
  });

  return (
    <div className="stack">
      <section className="panel">
        <p>
          <Link to={backTo} className="home-link">
            Back to rankings
          </Link>
        </p>
        <h2>Glossary (Coach Speak)</h2>
        <p className="meta">
          Quick definitions for the metrics on this site, written for practical game planning.
        </p>
      </section>

      <section className="panel glossary-grid">
        <article className="glossary-item">
          <h3>SoS (Strength of Schedule)</h3>
          <p>How tough your opponents were on average. Higher SoS means you played tougher teams.</p>
        </article>

        <article className="glossary-item">
          <h3>Adj SoS (Adjusted SoS)</h3>
          <p>SoS with extra context for division level. Playing strong teams in stronger divisions gets more credit.</p>
        </article>

        <article className="glossary-item">
          <h3>Power Ranking</h3>
          <p>Overall team score used for rank. It blends your game results with the strength of teams you played.</p>
        </article>

        <article className="glossary-item">
          <h3>Metrowest Rating</h3>
          <p>The rating value shown by Metrowest in their standings feed. This site displays it directly.</p>
        </article>

        <article className="glossary-item">
          <h3>Metrowest Points</h3>
          <p>The points value shown by Metrowest in their standings feed. This site displays it directly.</p>
        </article>

        <article className="glossary-item">
          <h3>Quality Wins</h3>
          <p>Wins with extra value: beating stronger opponents, top-tier opponents, or teams rated above you.</p>
        </article>

        <article className="glossary-item">
          <h3>Bad Losses</h3>
          <p>Losses to weaker opponents. Close losses (5 or fewer) and losses to top-25% teams are not tagged as bad losses.</p>
        </article>

        <article className="glossary-item">
          <h3>Quadrant Map</h3>
          <p>Horizontal axis is Power (right is stronger). Vertical axis is volatility (top is steadier, bottom is more boom-or-bust).</p>
          <ul className="method-list">
            <li><strong>Contender:</strong> high power, low volatility.</li>
            <li><strong>Wildcard:</strong> high power, high volatility.</li>
            <li><strong>Floor-Raiser:</strong> lower power, low volatility.</li>
            <li><strong>Underdog:</strong> lower power, high volatility.</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
