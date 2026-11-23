import { Link } from "react-router-dom";
import { gymPath, teamPath } from "../paths";
import { shortDay, todayIso } from "../season";
import type { TeamGame } from "../types";
import { TeamName } from "./TeamName";

/** Unplayed games from today on, soonest first. */
export function upcomingGames(games: TeamGame[]): TeamGame[] {
  const today = todayIso();
  return games
    .filter((g) => !g.date || g.date >= today)
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

function Opponent({ game, season }: { game: TeamGame; season: string }) {
  const where = game.is_home === null ? "vs" : game.is_home ? "vs" : "@";
  return (
    <>
      <span className="metric-note">{where}</span>{" "}
      {game.opponent_teamno ? (
        <Link className="team-link" to={teamPath(season, game.opponent_teamno, game.opponent_name)}>
          <TeamName name={game.opponent_name} />
        </Link>
      ) : (
        <TeamName name={game.opponent_name} />
      )}
    </>
  );
}

function Gym({ game }: { game: TeamGame }) {
  if (!game.location && !game.venue) return <>Gym TBD</>;
  return game.venue ? <Link to={gymPath(game.venue)}>{game.location ?? "Gym"}</Link> : <>{game.location}</>;
}

/** The headline card: when, who, where. */
export function NextGame({ game, season }: { game: TeamGame; season: string }) {
  return (
    <div className="next-game">
      <p className="next-game-when">
        {shortDay(game.date)}
        {game.starttime ? ` · ${game.starttime}` : ""}
      </p>
      <p className="next-game-who">
        <Opponent game={game} season={season} />
      </p>
      <p className="meta compact">
        <Gym game={game} />
      </p>
    </div>
  );
}

/** Compact list of games: date, time, opponent, gym. */
export function GameRows({ games, season, results = false }: { games: TeamGame[]; season: string; results?: boolean }) {
  return (
    <ul className="game-rows">
      {games.map((g) => {
        const us = g.team_score ?? null;
        const them = g.opponent_score ?? null;
        const mark = us === null || them === null ? "" : us > them ? "W" : us < them ? "L" : "T";
        return (
          <li key={g.gameno}>
            <span className="game-rows-when">
              {shortDay(g.date)}
              {!results && g.starttime ? ` · ${g.starttime}` : ""}
            </span>
            <span className="game-rows-who">
              <Opponent game={g} season={season} />
            </span>
            <span className="game-rows-where">
              {results && mark ? (
                <strong className={mark === "W" ? "result-win" : mark === "L" ? "result-loss" : undefined}>
                  {mark} {us}-{them}
                </strong>
              ) : (
                <Gym game={g} />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
