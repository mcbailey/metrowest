import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadJsonCached } from "../data";
import { useFavorites } from "../favorites";
import { teamPath } from "../paths";
import { genderLabel, gradeLabel } from "../season";
import type { TeamData } from "../types";
import { TeamName } from "./TeamName";
import { NextGame, upcomingGames } from "./TeamSchedule";

/** Starred teams with their record and next game. Shows how to star a team when there are none. */
export function MyTeams() {
  const { favorites, toggle } = useFavorites();
  const [teams, setTeams] = useState<Record<string, TeamData | null>>({});

  useEffect(() => {
    let active = true;
    for (const f of favorites) {
      if (f.teamno in teams) continue;
      loadJsonCached<TeamData>(`data/${f.season}/team-${f.teamno}.json`)
        .then((t) => active && setTeams((prev) => ({ ...prev, [f.teamno]: t })))
        .catch(() => active && setTeams((prev) => ({ ...prev, [f.teamno]: null })));
    }
    return () => {
      active = false;
    };
  }, [favorites]);

  if (!favorites.length) {
    return (
      <section className="panel">
        <h3>My teams</h3>
        <p className="meta compact">
          Find your team below and tap <strong>☆ Add to My teams</strong> on its page. Starred teams show up here with
          their next game. They're saved in this browser only.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h3>My teams</h3>
      <div className="my-teams">
        {favorites.map((f) => {
          const t = teams[f.teamno];
          const next = t ? upcomingGames(t.future_games)[0] : undefined;
          return (
            <article className="my-team" key={f.teamno}>
              <div className="my-team-head">
                <Link className="team-link" to={teamPath(f.season, f.teamno, f.name)}>
                  <strong>
                    <TeamName name={t?.team_name ?? f.name} />
                  </strong>
                </Link>
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Remove ${f.name} from My teams`}
                  onClick={() => toggle(f)}
                >
                  Remove
                </button>
              </div>
              {t ? (
                <p className="meta compact">
                  {gradeLabel(t.summary.grade)} {genderLabel(t.summary.gender)} · {t.summary.wins}-{t.summary.losses}
                  {t.summary.ties ? `-${t.summary.ties}` : ""}
                  {t.summary.rank ? ` · #${t.summary.rank} in ${t.summary.division_tag ?? "division"}` : ""}
                </p>
              ) : null}
              {t === undefined ? <p className="meta compact">Loading…</p> : null}
              {t === null ? <p className="meta compact">This team isn't in the current data.</p> : null}
              {next ? <NextGame game={next} season={f.season} /> : t ? <p className="meta compact">No upcoming games.</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
