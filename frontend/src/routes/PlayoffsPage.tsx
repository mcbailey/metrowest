import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { loadJsonCached } from "../data";
import {
  parseGenderSlug,
  parseGradeSlug,
  parseSeasonSlug,
  playoffsPath,
  rankingsPath,
  teamPath,
} from "../paths";
import { findSeason, genderLabel, gradeLabel } from "../season";
import { SEO_SITE_NAME, SEO_SITE_URL, usePageSeo } from "../seo";
import type { BracketGame, BracketTeam, IndexData, PlayoffGroup, PlayoffsData } from "../types";

function roundName(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
}

export function PlayoffsPage() {
  const params = useParams<{ season: string; gender: string; grade: string }>();
  const navigate = useNavigate();
  const [index, setIndex] = useState<IndexData | null>(null);
  const [data, setData] = useState<PlayoffsData | null>(null);
  const [missing, setMissing] = useState(false);

  const yrseason = parseSeasonSlug(params.season);
  const gender = parseGenderSlug(params.gender);
  const grade = parseGradeSlug(params.grade);

  useEffect(() => {
    loadJsonCached<IndexData>("data/index.json").then(setIndex).catch(() => setMissing(true));
  }, []);

  useEffect(() => {
    if (!yrseason || !gender || grade === null) return;
    let active = true;
    setData(null);
    setMissing(false);
    loadJsonCached<PlayoffsData>(`data/${yrseason}/playoffs/${gender}/${grade}.json`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) setMissing(true);
      });
    return () => {
      active = false;
    };
  }, [yrseason, gender, grade]);

  const season = findSeason(index, yrseason);
  const title =
    gender && grade !== null ? `${gradeLabel(grade)} ${genderLabel(gender)} playoffs, ${season?.label ?? ""}` : "Playoffs";
  const canonicalPath = yrseason && gender && grade !== null ? playoffsPath(yrseason, gender, grade) : "/";
  usePageSeo({
    title: `${title} | ${SEO_SITE_NAME}`,
    description: `${title}: brackets, seeds, and results for every playoff group.`,
    canonicalPath,
    jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: title, url: `${SEO_SITE_URL}${canonicalPath}` },
  });

  if (!yrseason || !gender || grade === null) return <Navigate to="/" replace />;
  if (!index) return <p>Loading playoffs…</p>;

  const groupsWithBrackets = (season?.groups ?? []).filter((g) => g.playoffs);

  return (
    <div className="stack">
      <section className="panel">
        <div className="home-hero-head">
          <div>
            <h2>{title}</h2>
            <p className="meta compact">
              <Link to={rankingsPath(yrseason, gender, grade)}>
                {gradeLabel(grade)} {genderLabel(gender)} rankings
              </Link>
            </p>
          </div>
          <label className="season-picker">
            Season
            <select
              value={yrseason}
              onChange={(e) => navigate(playoffsPath(e.target.value, gender, grade))}
            >
              {index.seasons.map((s) => (
                <option key={s.yrseason} value={s.yrseason}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="chip-group" role="group" aria-label="Grade and gender">
          {groupsWithBrackets.map((g) => {
            const active = g.gender === gender && g.grade === grade;
            return (
              <Link
                key={`${g.gender}${g.grade}`}
                className={`chip ${active ? "chip-active" : ""}`}
                aria-current={active ? "page" : undefined}
                to={playoffsPath(yrseason, g.gender, g.grade)}
              >
                {gradeLabel(g.grade)} {genderLabel(g.gender)}
              </Link>
            );
          })}
        </div>
      </section>

      {missing ? <p className="meta panel">No playoff brackets on record for this grade and season.</p> : null}
      {!missing && !data ? <p>Loading brackets…</p> : null}
      {data?.groups.map((group) => <Bracket key={group.groupno} group={group} season={yrseason} />)}
    </div>
  );
}

function Bracket({ group, season }: { group: PlayoffGroup; season: string }) {
  const rounds = Array.from({ length: group.rounds }, (_, i) => i + 1);
  const champion = group.games.find((g) => g.round === group.rounds && g.winner);
  const championTeam = champion?.teams.find((t) => t.teamno === champion.winner);

  return (
    <section className="panel" id={`group-${group.groupno}`}>
      <h3>{group.name}</h3>
      <p className="meta compact">
        {group.numteams ? `${group.numteams} teams` : null}
        {championTeam?.name ? ` · Champion: ${championTeam.name}` : null}
      </p>
      <div className="bracket-wrap">
        <div className="bracket" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(190px, 1fr))` }}>
          {rounds.map((round) => (
            <div className="bracket-round" key={round}>
              <h4>{roundName(round, group.rounds)}</h4>
              <div className="bracket-games">
                {group.games
                  .filter((g) => g.round === round)
                  .map((g) => (
                    <BracketGameCard key={g.id} game={g} season={season} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BracketGameCard({ game, season }: { game: BracketGame; season: string }) {
  return (
    <div className="bracket-game">
      {game.teams.map((t, i) => {
        // A first-round slot with no team ("Seed #16") is a bye for the other team.
        const bye = !t.teamno && /^seed #/i.test(t.name ?? "");
        return (
          <BracketRow
            key={i}
            team={bye ? { ...t, name: "Bye" } : t}
            won={Boolean(game.winner && t.teamno === game.winner)}
            season={season}
          />
        );
      })}
      {game.when || game.venue ? (
        <div className="bracket-when">{[game.when, game.venue].filter(Boolean).join(" · ")}</div>
      ) : null}
    </div>
  );
}

function BracketRow({ team, won, season }: { team: BracketTeam; won: boolean; season: string }) {
  const placeholder = !team.teamno;
  return (
    <div className={`bracket-team ${won ? "bracket-won" : ""} ${placeholder ? "bracket-placeholder" : ""}`}>
      <span className="bracket-seed">{team.seed ?? ""}</span>
      <span className="bracket-name">
        {team.teamno ? <Link to={teamPath(season, team.teamno, team.name)}>{team.name}</Link> : (team.name ?? "TBD")}
      </span>
      <span className="bracket-score">{team.score ?? ""}</span>
    </div>
  );
}
