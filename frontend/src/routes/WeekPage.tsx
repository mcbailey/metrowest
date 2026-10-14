import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { GameList } from "../components/GameList";
import { useSeasonTeams } from "../components/useSeasonTeams";
import { loadJsonCached } from "../data";
import { teamPath } from "../paths";
import { currentSeason, findSeason, genderLabel, gradeLabel } from "../season";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import type { IndexData, ScheduleGame, SearchTeam, WeekendData, WeekendsIndex } from "../types";

/** Saturday of the Monday-Sunday week that `day` belongs to (week files are keyed by their Saturday). */
function saturdayOf(day: Date): string {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  const dow = d.getDay(); // 0 Sun ... 6 Sat
  if (dow === 0) d.setDate(d.getDate() - 1);
  else d.setDate(d.getDate() + (6 - dow));
  return d.toISOString().slice(0, 10);
}

/** "Feb 2" for the week whose Saturday is `saturday`. */
function weekStart(saturday: string): string {
  const d = new Date(`${saturday}T12:00:00`);
  d.setDate(d.getDate() - 5);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function winChance(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

export function WeekPage() {
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState<IndexData | null>(null);
  const [weekends, setWeekends] = useState<WeekendsIndex | null>(null);
  const [weekend, setWeekend] = useState<WeekendData | null>(null);
  const [missing, setMissing] = useState(false);
  const [gender, setGender] = useState<"ALL" | "M" | "F">("ALL");
  const [grade, setGrade] = useState<number | "ALL">("ALL");

  useEffect(() => {
    loadJsonCached<IndexData>("data/index.json").then(setIndex).catch(() => undefined);
  }, []);

  const season = index ? (findSeason(index, params.get("season")) ?? currentSeason(index)) : undefined;
  const yrseason = season?.yrseason ?? null;
  const saturday = params.get("date") ?? saturdayOf(new Date());
  const teams = useSeasonTeams(yrseason);

  useEffect(() => {
    if (!yrseason) return;
    loadJsonCached<WeekendsIndex>(`data/${yrseason}/weekends.json`).then(setWeekends).catch(() => setWeekends(null));
  }, [yrseason]);

  useEffect(() => {
    if (!yrseason) return;
    let active = true;
    setWeekend(null);
    setMissing(false);
    loadJsonCached<WeekendData>(`data/${yrseason}/weekends/${saturday}.json`)
      .then((d) => {
        if (active) setWeekend(d);
      })
      .catch(() => {
        if (active) setMissing(true);
      });
    return () => {
      active = false;
    };
  }, [yrseason, saturday]);

  usePageSeo({
    title: `This week's games | ${SEO_SITE_NAME}`,
    description: "Every Metrowest youth basketball game this week, by grade, with gyms and close matchups to watch.",
    canonicalPath: "/week",
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: "This week", url: `${SEO_SITE_URL}/week` },
  });

  const games = useMemo(
    () =>
      (weekend?.games ?? []).filter(
        (g) => (gender === "ALL" || g.gender === gender) && (grade === "ALL" || g.grade === grade)
      ),
    [weekend, gender, grade]
  );

  // Weeks worth browsing (skip stray one-off dates the source sometimes has).
  const list = (weekends?.weekends ?? []).filter((w) => w.games >= 10);
  const pos = list.findIndex((w) => w.saturday === saturday);
  const prev = pos > 0 ? list[pos - 1] : [...list].reverse().find((w) => w.saturday < saturday);
  const next = pos >= 0 ? list[pos + 1] : list.find((w) => w.saturday > saturday);
  const go = (sat: string) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("date", sat);
    if (yrseason) nextParams.set("season", yrseason);
    setParams(nextParams);
  };

  if (!index || !season || !yrseason) return <p>Loading…</p>;

  const mon = new Date(`${saturday}T12:00:00`);
  mon.setDate(mon.getDate() - 5);
  const sun = new Date(`${saturday}T12:00:00`);
  sun.setDate(sun.getDate() + 1);
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const heading = `Week of ${short(mon)} – ${short(sun)}, ${sun.getFullYear()}`;
  const grades = season.grades;

  return (
    <div className="stack">
      <section className="panel">
        <div className="home-hero-head">
          <div>
            <h2>{heading}</h2>
            <p className="meta compact">
              {season.label} season
              {weekend ? ` · ${weekend.games.length} games, Monday through Sunday` : ""}
            </p>
          </div>
          <label className="season-picker">
            Week
            <select value={pos >= 0 ? saturday : ""} onChange={(e) => e.target.value && go(e.target.value)}>
              {pos < 0 ? <option value="">Pick a week…</option> : null}
              {list.map((w) => (
                <option key={w.saturday} value={w.saturday}>
                  Week of {weekStart(w.saturday)} ({w.games} games)
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="link-row">
          {prev ? (
            <button type="button" className="chip" onClick={() => go(prev.saturday)}>
              ← Week of {weekStart(prev.saturday)}
            </button>
          ) : null}
          {next ? (
            <button type="button" className="chip" onClick={() => go(next.saturday)}>
              Week of {weekStart(next.saturday)} →
            </button>
          ) : null}
        </div>
        <div className="chip-group" role="group" aria-label="Gender">
          {(["ALL", "M", "F"] as const).map((g) => (
            <button
              type="button"
              key={g}
              className={`chip ${gender === g ? "chip-active" : ""}`}
              aria-pressed={gender === g}
              onClick={() => setGender(g)}
            >
              {g === "ALL" ? "Boys & Girls" : genderLabel(g)}
            </button>
          ))}
        </div>
        <div className="chip-group" role="group" aria-label="Grade">
          {(["ALL", ...grades] as const).map((g) => (
            <button
              type="button"
              key={g}
              className={`chip ${grade === g ? "chip-active" : ""}`}
              aria-pressed={grade === g}
              onClick={() => setGrade(g)}
            >
              {g === "ALL" ? "All grades" : gradeLabel(g)}
            </button>
          ))}
        </div>
      </section>

      {missing ? (
        <section className="panel">
          <p className="meta">
            No games on the schedule this week.
            {season.status === "final" ? ` The ${season.label} season is complete.` : ""}
            {list.length ? " Pick a week above to browse the season." : ""}
          </p>
        </section>
      ) : null}

      {weekend && teams ? (
        <>
          <Highlights games={games} teams={teams} season={yrseason} />
          <section className="panel">
            <h3>All games</h3>
            {games.length ? (
              <GameList games={games} season={yrseason} teams={teams} gymNames={weekend.gyms} />
            ) : (
              <p className="meta">No games for this grade and gender this week.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Upcoming: the most evenly matched games. Already played: the closest finishes. */
function Highlights({ games, teams, season }: { games: ScheduleGame[]; teams: Map<string, SearchTeam>; season: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = games.filter((g) => !g.final && g.home && g.away && g.date !== null && g.date >= today);
  const played = games.filter((g) => g.final && g.home_score !== null && g.away_score !== null);

  const close = upcoming
    .map((g) => {
      const h = teams.get(g.home!);
      const a = teams.get(g.away!);
      if (h?.power === undefined || a?.power === undefined) return null;
      return { g, h, a, p: winChance(h.power, a.power) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && Math.abs(x.p - 0.5) < 0.1)
    .sort((x, y) => Math.abs(x.p - 0.5) - Math.abs(y.p - 0.5))
    .slice(0, 8);

  const tight = played
    .map((g) => ({ g, margin: Math.abs((g.home_score ?? 0) - (g.away_score ?? 0)) }))
    .filter((x) => x.margin <= 3)
    .sort((x, y) => x.margin - y.margin)
    .slice(0, 8);

  if (!close.length && !tight.length) return null;
  const name = (teamno: string | null, fallback: string | null) => {
    const t = teamno ? teams.get(teamno) : undefined;
    return t ? (
      <Link className="team-link" to={teamPath(season, t.teamno, t.name)}>
        {t.name}
      </Link>
    ) : (
      (fallback ?? "TBD")
    );
  };

  return (
    <section className="panel">
      {close.length ? (
        <>
          <h3>Close matchups to watch</h3>
          <p className="meta compact">Games between evenly matched teams, based on the current power ratings.</p>
          <ul className="plain-list">
            {close.map(({ g }) => (
              <li key={g.id}>
                {gradeLabel(g.grade)} {genderLabel(g.gender)}: {name(g.away, g.away_name)} at {name(g.home, g.home_name)}
                <span className="metric-note">
                  {" "}
                  · {g.date ? new Date(`${g.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : ""}{" "}
                  {g.time ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {tight.length ? (
        <>
          <h3>Closest finishes</h3>
          <ul className="plain-list">
            {tight.map(({ g, margin }) => (
              <li key={g.id}>
                {gradeLabel(g.grade)} {genderLabel(g.gender)}: {name(g.away, g.away_name)} {g.away_score}, {name(g.home, g.home_name)}{" "}
                {g.home_score}
                <span className="metric-note"> · {margin === 0 ? "tie" : `${margin}-point game`}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
