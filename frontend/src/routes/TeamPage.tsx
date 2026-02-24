import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { loadJson } from "../data";
import { DivisionRankingData, DivisionsData, IndexData, RankingTeam, TeamData, TeamGame } from "../types";

type FinalGame = {
  game: TeamGame;
  teamScore: number;
  oppScore: number;
  ts: number;
};

type RankedContext = {
  team: RankingTeam;
  divisionno: string;
  divisionTier: number | null;
  divisionBaseline: number | null;
};

type TeamInsights = {
  offenseDelta: number;
  defenseDelta: number;
  divisionAvgPfPerGame: number;
  divisionAvgPaPerGame: number;
  qualityWins: number;
  badLosses: number;
  gameOutcomeTags: Record<string, "Quality Win" | "Bad Loss">;
  seasonMarginAvg: number;
  last3MarginAvg: number;
  trendDelta: number;
  trendLabel: string;
  volatility: number;
  divisionMedianVolatility: number;
  divisionMedianPower: number;
  quadrantLabel: string;
  quadrantMeaning: string;
  powerMin: number;
  powerMax: number;
  volatilityMin: number;
  volatilityMax: number;
};

type CompareTeamOption = {
  teamno: string;
  name: string;
  rank: number;
};

type ComparisonWinner = "left" | "right" | "tie";

type ComparisonRow = {
  metric: string;
  leftDisplay: string;
  rightDisplay: string;
  winner: ComparisonWinner;
};

function gamesPlayed(team: TeamData): number {
  return team.summary.wins + team.summary.losses + team.summary.ties;
}

function rankingGamesPlayed(team: RankingTeam): number {
  return team.wins + team.losses + team.ties;
}

function avg(value: number, games: number): string {
  return games > 0 ? (value / games).toFixed(1) : "0.0";
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

function teamAndOpponentScores(g: TeamGame): { team: number | null; opp: number | null } {
  if (g.team_score !== undefined && g.opponent_score !== undefined) {
    return { team: g.team_score ?? null, opp: g.opponent_score ?? null };
  }

  if (g.home_score === null || g.away_score === null) {
    return { team: null, opp: null };
  }

  if (g.is_home === true) {
    return { team: g.home_score, opp: g.away_score };
  }
  if (g.is_home === false) {
    return { team: g.away_score, opp: g.home_score };
  }
  return { team: null, opp: null };
}

function finalGames(games: TeamGame[]): FinalGame[] {
  return games
    .map((game) => {
      const scores = teamAndOpponentScores(game);
      if (scores.team === null || scores.opp === null) {
        return null;
      }
      const ts = game.date ? Date.parse(game.date) : 0;
      return {
        game,
        teamScore: scores.team,
        oppScore: scores.opp,
        ts: Number.isNaN(ts) ? 0 : ts,
      };
    })
    .filter((g): g is FinalGame => g !== null);
}

function outcome(teamScore: number | null, oppScore: number | null): string {
  if (teamScore === null || oppScore === null) return "-";
  if (teamScore > oppScore) return "W";
  if (teamScore < oppScore) return "L";
  return "T";
}

function genderLabel(gender: "M" | "F" | null): string {
  if (gender === "M") return "Boys";
  if (gender === "F") return "Girls";
  return "-";
}

function trendLabel(delta: number): string {
  if (delta >= 4) return "Heating up";
  if (delta <= -4) return "Cooling off";
  return "Steady";
}

function quadrant(highPower: boolean, highVolatility: boolean): { label: string; meaning: string } {
  if (highPower && !highVolatility) {
    return { label: "Contender", meaning: "High power and consistently steady." };
  }
  if (highPower && highVolatility) {
    return { label: "Wildcard", meaning: "High ceiling, but less predictable game to game." };
  }
  if (!highPower && !highVolatility) {
    return { label: "Floor-Raiser", meaning: "Usually performs to expectation with fewer swings." };
  }
  return { label: "Underdog", meaning: "Lower current power with wide outcomes possible." };
}

function winPct(team: TeamData): number {
  const gp = gamesPlayed(team);
  if (gp <= 0) return 0;
  return (team.summary.wins + team.summary.ties * 0.5) / gp;
}

function compareHigher(left: number, right: number): ComparisonWinner {
  if (Math.abs(left - right) < 1e-9) return "tie";
  return left > right ? "left" : "right";
}

function compareLower(left: number, right: number): ComparisonWinner {
  if (Math.abs(left - right) < 1e-9) return "tie";
  return left < right ? "left" : "right";
}

function compareRank(left: number | null, right: number | null): ComparisonWinner {
  if (left === null && right === null) return "tie";
  if (left === null) return "right";
  if (right === null) return "left";
  if (left === right) return "tie";
  return left < right ? "left" : "right";
}

function buildComparisonRows(left: TeamData, right: TeamData): ComparisonRow[] {
  const leftGp = gamesPlayed(left);
  const rightGp = gamesPlayed(right);

  const leftPf = leftGp > 0 ? left.summary.pf / leftGp : 0;
  const rightPf = rightGp > 0 ? right.summary.pf / rightGp : 0;

  const leftPa = leftGp > 0 ? left.summary.pa / leftGp : 0;
  const rightPa = rightGp > 0 ? right.summary.pa / rightGp : 0;

  const leftWp = winPct(left);
  const rightWp = winPct(right);

  return [
    {
      metric: "Avg Points For",
      leftDisplay: leftPf.toFixed(1),
      rightDisplay: rightPf.toFixed(1),
      winner: compareHigher(leftPf, rightPf),
    },
    {
      metric: "Avg Points Against",
      leftDisplay: leftPa.toFixed(1),
      rightDisplay: rightPa.toFixed(1),
      winner: compareLower(leftPa, rightPa),
    },
    {
      metric: "Win %",
      leftDisplay: `${(leftWp * 100).toFixed(1)}%`,
      rightDisplay: `${(rightWp * 100).toFixed(1)}%`,
      winner: compareHigher(leftWp, rightWp),
    },
    {
      metric: "Division Rank",
      leftDisplay: left.summary.rank === null ? "-" : `#${left.summary.rank}`,
      rightDisplay: right.summary.rank === null ? "-" : `#${right.summary.rank}`,
      winner: compareRank(left.summary.rank, right.summary.rank),
    },
    {
      metric: "SoS",
      leftDisplay: left.summary.sos.toFixed(1),
      rightDisplay: right.summary.sos.toFixed(1),
      winner: compareHigher(left.summary.sos, right.summary.sos),
    },
  ];
}

async function computeInsights(team: TeamData, season: string): Promise<TeamInsights | null> {
  const grade = team.summary.grade;
  const gender = team.summary.gender;
  const divisionno = team.summary.divisionno;
  if (grade === null || gender === null || divisionno === null) {
    return null;
  }

  let divisions: DivisionsData;
  try {
    divisions = await loadJson<DivisionsData>(`data/${season}/${gender}/${grade}/divisions.json`);
  } catch {
    return null;
  }

  const divisionTierByNo = new Map<string, number>();
  for (const d of divisions.divisions) {
    const tier = Number(d.divisiontier ?? "");
    if (Number.isFinite(tier)) {
      divisionTierByNo.set(d.divisionno, tier);
    }
  }

  const divisionNos = divisions.divisions.map((d) => d.divisionno);
  const divisionResults = await Promise.allSettled(
    divisionNos.map((dno) => loadJson<DivisionRankingData>(`data/${season}/${gender}/${grade}/division-${dno}.json`))
  );

  const divisionDatasets = divisionResults
    .filter((r): r is PromiseFulfilledResult<DivisionRankingData> => r.status === "fulfilled")
    .map((r) => r.value);

  if (!divisionDatasets.length) {
    return null;
  }

  const divisionBaselineByNo = new Map<string, number>();
  for (const ds of divisionDatasets) {
    const values = ds.rankings.map((t) => t.power).filter((v) => Number.isFinite(v));
    if (values.length) {
      divisionBaselineByNo.set(ds.divisionno, median(values));
    }
  }

  const rankedWithDivision: RankedContext[] = divisionDatasets.flatMap((d) =>
    d.rankings.map((t) => ({
      team: t,
      divisionno: d.divisionno,
      divisionTier: divisionTierByNo.get(d.divisionno) ?? null,
      divisionBaseline: divisionBaselineByNo.get(d.divisionno) ?? null,
    }))
  );

  const rankedByTeamNo = new Map<string, RankedContext>();
  for (const rc of rankedWithDivision) {
    rankedByTeamNo.set(rc.team.teamno, rc);
  }

  const inDivision = divisionDatasets.find((d) => d.divisionno === divisionno);
  if (!inDivision || !inDivision.rankings.length) {
    return null;
  }

  const ownBaseline = divisionBaselineByNo.get(divisionno);

  const top15ByTier = new Set<string>();
  const bottom15ByTier = new Set<string>();
  const teamsByTier = new Map<number, RankingTeam[]>();
  for (const rc of rankedWithDivision) {
    if (rc.divisionTier === null) continue;
    const arr = teamsByTier.get(rc.divisionTier) ?? [];
    arr.push(rc.team);
    teamsByTier.set(rc.divisionTier, arr);
  }
  for (const teams of teamsByTier.values()) {
    const sorted = [...teams].sort((a, b) => b.power - a.power);
    const n = Math.max(1, Math.ceil(sorted.length * 0.15));
    for (const t of sorted.slice(0, n)) top15ByTier.add(t.teamno);
    for (const t of sorted.slice(-n)) bottom15ByTier.add(t.teamno);
  }

  const overallTop25 = new Set<string>();
  {
    const sortedAll = [...rankedWithDivision].sort((a, b) => b.team.power - a.team.power);
    const n = Math.max(1, Math.ceil(sortedAll.length * 0.25));
    for (const rc of sortedAll.slice(0, n)) overallTop25.add(rc.team.teamno);
  }

  const divisionPfPerGame = inDivision.rankings
    .map((t) => {
      const gp = rankingGamesPlayed(t);
      return gp > 0 ? t.pf / gp : 0;
    })
    .filter((v) => Number.isFinite(v));

  const divisionPaPerGame = inDivision.rankings
    .map((t) => {
      const gp = rankingGamesPlayed(t);
      return gp > 0 ? t.pa / gp : 0;
    })
    .filter((v) => Number.isFinite(v));

  const teamGp = gamesPlayed(team);
  const teamPfPerGame = teamGp > 0 ? team.summary.pf / teamGp : 0;
  const teamPaPerGame = teamGp > 0 ? team.summary.pa / teamGp : 0;

  const divisionAvgPfPerGame = mean(divisionPfPerGame);
  const divisionAvgPaPerGame = mean(divisionPaPerGame);
  const offenseDelta = teamPfPerGame - divisionAvgPfPerGame;
  const defenseDelta = divisionAvgPaPerGame - teamPaPerGame;

  const finals = finalGames(team.past_games);
  let qualityWins = 0;
  let badLosses = 0;
  const gameOutcomeTags: Record<string, "Quality Win" | "Bad Loss"> = {};

  for (const g of finals) {
    const opponentTeamNo = g.game.opponent_teamno;
    if (!opponentTeamNo) continue;

    const opponent = rankedByTeamNo.get(opponentTeamNo);
    const opponentPower = opponent?.team.power ?? 1500;
    const powerGap = opponentPower - team.summary.power;

    const giantKiller =
      ownBaseline !== undefined &&
      opponent?.divisionBaseline !== null &&
      opponent?.divisionBaseline !== undefined &&
      opponent.divisionBaseline > ownBaseline;

    const dropLoss =
      ownBaseline !== undefined &&
      opponent?.divisionBaseline !== null &&
      opponent?.divisionBaseline !== undefined &&
      opponent.divisionBaseline < ownBaseline;

    const apex = top15ByTier.has(opponentTeamNo);
    const floor = bottom15ByTier.has(opponentTeamNo);

    const outperformer = powerGap > 0;
    const stumble = powerGap < 0;

    if (g.teamScore > g.oppScore && (giantKiller || apex || outperformer)) {
      qualityWins += 1;
      gameOutcomeTags[g.game.gameno] = "Quality Win";
    }

    const badLossCandidate = g.teamScore < g.oppScore && (dropLoss || floor || stumble);
    const closeLoss = g.teamScore < g.oppScore && g.oppScore - g.teamScore <= 5;
    const lostToTop25 = g.teamScore < g.oppScore && overallTop25.has(opponentTeamNo);

    if (badLossCandidate && !closeLoss && !lostToTop25) {
      badLosses += 1;
      gameOutcomeTags[g.game.gameno] = "Bad Loss";
    }
  }

  const margins = finals.map((g) => g.teamScore - g.oppScore);
  const seasonMarginAvg = mean(margins);
  const recent3 = [...finals].sort((a, b) => b.ts - a.ts).slice(0, 3);
  const last3MarginAvg = mean(recent3.map((g) => g.teamScore - g.oppScore));
  const trendDelta = last3MarginAvg - seasonMarginAvg;
  const volatility = stdDev(margins);

  const peerVolatilityResults = await Promise.allSettled(
    inDivision.rankings.map((t) => loadJson<TeamData>(`data/${season}/team-${t.teamno}.json`))
  );
  const peerVolatility = peerVolatilityResults
    .filter((r): r is PromiseFulfilledResult<TeamData> => r.status === "fulfilled")
    .map((r) => stdDev(finalGames(r.value.past_games).map((g) => g.teamScore - g.oppScore)))
    .filter((v) => Number.isFinite(v));

  const powerValues = inDivision.rankings.map((t) => t.power).filter((v) => Number.isFinite(v));
  const volatilityValues = peerVolatility.length ? peerVolatility : [volatility];

  const divisionMedianPower = median(powerValues);
  const divisionMedianVolatility = median(volatilityValues);
  const powerMin = powerValues.length ? Math.min(...powerValues) : team.summary.power;
  const powerMax = powerValues.length ? Math.max(...powerValues) : team.summary.power;
  const volatilityMin = volatilityValues.length ? Math.min(...volatilityValues) : volatility;
  const volatilityMax = volatilityValues.length ? Math.max(...volatilityValues) : volatility;

  const q = quadrant(team.summary.power >= divisionMedianPower, volatility >= divisionMedianVolatility);

  return {
    offenseDelta,
    defenseDelta,
    divisionAvgPfPerGame,
    divisionAvgPaPerGame,
    qualityWins,
    badLosses,
    gameOutcomeTags,
    seasonMarginAvg,
    last3MarginAvg,
    trendDelta,
    trendLabel: trendLabel(trendDelta),
    volatility,
    divisionMedianVolatility,
    divisionMedianPower,
    quadrantLabel: q.label,
    quadrantMeaning: q.meaning,
    powerMin,
    powerMax,
    volatilityMin,
    volatilityMax,
  };
}

export function TeamPage() {
  const { teamno } = useParams<{ teamno: string }>();
  const location = useLocation();

  const [team, setTeam] = useState<TeamData | null>(null);
  const [activeSeason, setActiveSeason] = useState<string | null>(null);
  const [insights, setInsights] = useState<TeamInsights | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareDivisions, setCompareDivisions] = useState<DivisionsData["divisions"]>([]);
  const [selectedCompareDivision, setSelectedCompareDivision] = useState<string>("");
  const [compareTeams, setCompareTeams] = useState<CompareTeamOption[]>([]);
  const [selectedCompareTeam, setSelectedCompareTeam] = useState<string>("");
  const [compareTeamData, setCompareTeamData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seasonFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("season");
  }, [location.search]);

  const backTo = location.search ? `/${location.search}` : "/";

  useEffect(() => {
    if (!teamno) return;

    async function run() {
      try {
        setError(null);
        setCompareError(null);
        setInsights(null);
        setCompareDivisions([]);
        setSelectedCompareDivision("");
        setCompareTeams([]);
        setSelectedCompareTeam("");
        setCompareTeamData(null);

        const index = await loadJson<IndexData>("data/index.json");
        const season = seasonFromQuery || index.default.yrseason;
        setActiveSeason(season);

        const payload = await loadJson<TeamData>(`data/${season}/team-${teamno}.json`);
        setTeam(payload);

        const computed = await computeInsights(payload, season);
        setInsights(computed);
      } catch (err) {
        setError(String(err));
      }
    }

    void run();
  }, [teamno, seasonFromQuery]);

  useEffect(() => {
    if (!team || !activeSeason) return;
    if (team.summary.grade === null || team.summary.gender === null) return;
    const currentTeam = team;

    let active = true;

    async function loadCompareDivisions() {
      try {
        const payload = await loadJson<DivisionsData>(
          `data/${activeSeason}/${currentTeam.summary.gender}/${currentTeam.summary.grade}/divisions.json`
        );
        if (!active) return;

        const sorted = [...payload.divisions].sort((a, b) => {
          const ta = Number(a.divisiontier ?? 0);
          const tb = Number(b.divisiontier ?? 0);
          if (ta !== tb) return ta - tb;
          return a.name.localeCompare(b.name) || a.divisionno.localeCompare(b.divisionno);
        });

        setCompareDivisions(sorted);

        const ownDivision = currentTeam.summary.divisionno;
        const firstOther = sorted.find((d) => d.divisionno !== ownDivision)?.divisionno;
        const fallback = sorted[0]?.divisionno ?? "";
        const defaultDivision = firstOther || fallback;

        setSelectedCompareDivision((prev) => {
          const exists = sorted.some((d) => d.divisionno === prev);
          return exists ? prev : defaultDivision;
        });
        setCompareError(null);
      } catch (err) {
        if (!active) return;
        setCompareDivisions([]);
        setSelectedCompareDivision("");
        setCompareTeams([]);
        setSelectedCompareTeam("");
        setCompareTeamData(null);
        setCompareError(String(err));
      }
    }

    void loadCompareDivisions();

    return () => {
      active = false;
    };
  }, [team?.teamno, team?.summary.grade, team?.summary.gender, activeSeason]);

  useEffect(() => {
    if (!team || !activeSeason || !selectedCompareDivision) return;
    if (team.summary.grade === null || team.summary.gender === null) return;
    const currentTeam = team;

    let active = true;

    async function loadTeamsInDivision() {
      try {
        const division = await loadJson<DivisionRankingData>(
          `data/${activeSeason}/${currentTeam.summary.gender}/${currentTeam.summary.grade}/division-${selectedCompareDivision}.json`
        );
        if (!active) return;

        const options = division.rankings
          .filter((t) => t.teamno !== currentTeam.teamno)
          .map((t) => ({ teamno: t.teamno, name: t.name, rank: t.rank }))
          .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

        setCompareTeams(options);
        setSelectedCompareTeam((prev) => {
          const exists = options.some((o) => o.teamno === prev);
          return exists ? prev : (options[0]?.teamno ?? "");
        });

        if (!options.length) {
          setCompareTeamData(null);
        }

        setCompareError(null);
      } catch (err) {
        if (!active) return;
        setCompareTeams([]);
        setSelectedCompareTeam("");
        setCompareTeamData(null);
        setCompareError(String(err));
      }
    }

    void loadTeamsInDivision();

    return () => {
      active = false;
    };
  }, [selectedCompareDivision, team?.teamno, team?.summary.grade, team?.summary.gender, activeSeason]);

  useEffect(() => {
    if (!activeSeason || !selectedCompareTeam) {
      setCompareTeamData(null);
      return;
    }

    let active = true;

    async function loadCompareTeam() {
      try {
        const payload = await loadJson<TeamData>(`data/${activeSeason}/team-${selectedCompareTeam}.json`);
        if (!active) return;
        setCompareTeamData(payload);
        setCompareError(null);
      } catch (err) {
        if (!active) return;
        setCompareTeamData(null);
        setCompareError(String(err));
      }
    }

    void loadCompareTeam();

    return () => {
      active = false;
    };
  }, [selectedCompareTeam, activeSeason]);

  if (error) return <p className="error">{error}</p>;
  if (!team) return <p>Loading team...</p>;

  const gp = gamesPlayed(team);

  const teamX = insights
    ? (() => {
        const med = insights.divisionMedianPower;
        const value = team.summary.power;
        if (value >= med) {
          const denom = Math.max(0.0001, insights.powerMax - med);
          return clampPercent(50 + (50 * (value - med)) / denom);
        }
        const denom = Math.max(0.0001, med - insights.powerMin);
        return clampPercent(50 - (50 * (med - value)) / denom);
      })()
    : 50;

  const teamY = insights
    ? (() => {
        const med = insights.divisionMedianVolatility;
        const value = insights.volatility;
        if (value <= med) {
          const denom = Math.max(0.0001, med - insights.volatilityMin);
          return clampPercent(50 - (50 * (med - value)) / denom);
        }
        const denom = Math.max(0.0001, insights.volatilityMax - med);
        return clampPercent(50 + (50 * (value - med)) / denom);
      })()
    : 50;

  const quadrantStyle =
    insights !== null
      ? ({
          ["--team-x" as string]: `${teamX}%`,
          ["--team-y" as string]: `${teamY}%`,
        } as CSSProperties)
      : undefined;

  const comparisonRows = compareTeamData ? buildComparisonRows(team, compareTeamData) : [];

  return (
    <div className="stack">
      <p>
        <Link to={backTo} className="home-link">
          Back to rankings
        </Link>
      </p>

      <section className="panel">
        <h2>{team.team_name}</h2>
        <p className="meta">
          {genderLabel(team.summary.gender)} {team.summary.grade}th | {team.summary.division_name}
        </p>
        <p className="meta compact">
          Division record: {team.summary.wins}-{team.summary.losses}
          {team.summary.ties ? `-${team.summary.ties}` : ""} | Total listed games: {team.summary.games_played_total ?? team.past_games.length} final, {team.summary.games_scheduled_total ?? team.future_games.length} upcoming
        </p>
      </section>

      <section className="summary-grid panel">
        <div>Rank: {team.summary.rank ?? "-"}</div>
        <div>
          W-L: {team.summary.wins}-{team.summary.losses}
          {team.summary.ties ? `-${team.summary.ties}` : ""}
        </div>
        <div>SoS: {team.summary.sos.toFixed(1)}</div>
        <div>Power: {team.summary.power.toFixed(1)}</div>
        <div>PF/G: {avg(team.summary.pf, gp)}</div>
        <div>PA/G: {avg(team.summary.pa, gp)}</div>
        <div>Diff: {team.summary.diff}</div>
      </section>

      <section className="panel">
        <h3>Past Games</h3>
        <div className="table-wrap">
          <table className="games">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opponent</th>
                <th>Team</th>
                <th>Opp</th>
                <th>W/L</th>
                <th>Tag</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {team.past_games.map((g) => {
                const scores = teamAndOpponentScores(g);
                const tag = insights?.gameOutcomeTags[g.gameno];
                return (
                  <tr key={g.gameno}>
                    <td>{g.date ?? "TBD"}</td>
                    <td>{g.opponent_name ?? "TBD"}</td>
                    <td>{scores.team ?? "-"}</td>
                    <td>{scores.opp ?? "-"}</td>
                    <td>{outcome(scores.team, scores.opp)}</td>
                    <td>
                      {tag ? (
                        <span className={`game-tag ${tag === "Quality Win" ? "game-tag-win" : "game-tag-loss"}`}>
                          {tag}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{g.location ?? "TBD"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Future Games</h3>
        <div className="table-wrap">
          <table className="games">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Opponent</th>
                <th>Home/Away</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {team.future_games.map((g) => (
                <tr key={g.gameno}>
                  <td>{g.date ?? "TBD"}</td>
                  <td>{g.starttime ?? "TBD"}</td>
                  <td>{g.opponent_name ?? "TBD"}</td>
                  <td>{g.is_home === null ? "TBD" : g.is_home ? "Home" : "Away"}</td>
                  <td>{g.location ?? "TBD"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {insights ? (
        <section className="panel">
          <h3>Coach Insights</h3>
          <p className="meta compact">
            Quality win rules: higher-division baseline win, top-15% opponent in their division tier, or beating a higher current-power opponent. Bad loss rules: lower-division baseline loss, bottom-15% opponent in their division tier, or losing to a lower current-power opponent. Bad-loss tags are suppressed for losses by 5 or fewer points and for losses to top-25% opponents overall.
          </p>
          <div className="summary-grid">
            <div>
              Offense vs peers: {signed(insights.offenseDelta)} pts/g
              <span className="metric-note"> (avg {insights.divisionAvgPfPerGame.toFixed(1)})</span>
            </div>
            <div>
              Defense vs peers: {signed(insights.defenseDelta)} pts/g
              <span className="metric-note"> (avg {insights.divisionAvgPaPerGame.toFixed(1)})</span>
            </div>
            <div>
              Quality wins: {insights.qualityWins}
              <span className="metric-note"> (weighted criteria)</span>
            </div>
            <div>
              Bad losses: {insights.badLosses}
              <span className="metric-note"> (weighted criteria)</span>
            </div>
            <div>
              Last-3 trend: {insights.trendLabel}
              <span className="metric-note"> ({signed(insights.trendDelta)} margin vs season avg)</span>
            </div>
            <div>
              Volatility: {insights.volatility.toFixed(1)}
              <span className="metric-note"> (division median {insights.divisionMedianVolatility.toFixed(1)})</span>
            </div>
            <div>
              Quadrant: {insights.quadrantLabel}
              <span className="metric-note"> ({insights.quadrantMeaning})</span>
            </div>
            <div>
              Last 3 margin: {signed(insights.last3MarginAvg)}
              <span className="metric-note"> | Season margin: {signed(insights.seasonMarginAvg)}</span>
            </div>
          </div>

          <div className="quadrant-block">
            <h4>Quadrant Map</h4>
            <p className="meta compact">Right = higher power. Top = lower volatility (more predictable).</p>
            <div className="quadrant-map" style={quadrantStyle}>
              <div className="quad-cell quad-floor">
                <strong>Floor-Raiser</strong>
                <span>Lower power, lower volatility</span>
              </div>
              <div className="quad-cell quad-contender">
                <strong>Contender</strong>
                <span>Higher power, lower volatility</span>
              </div>
              <div className="quad-cell quad-underdog">
                <strong>Underdog</strong>
                <span>Lower power, higher volatility</span>
              </div>
              <div className="quad-cell quad-wildcard">
                <strong>Wildcard</strong>
                <span>Higher power, higher volatility</span>
              </div>
              <div className="team-marker" title={`${team.team_name}: ${insights.quadrantLabel}`} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h3>Compare With Another Team</h3>
        <p className="meta compact">
          Compare against teams in the same season, grade, and gender only.
        </p>

        <div className="compare-controls">
          <label>
            Division
            <select
              value={selectedCompareDivision}
              onChange={(e) => setSelectedCompareDivision(e.target.value)}
              disabled={!compareDivisions.length}
            >
              {compareDivisions.map((d) => (
                <option key={d.divisionno} value={d.divisionno}>
                  {d.name} {d.divisiontier ? `- Div ${d.divisiontier}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Team
            <select
              value={selectedCompareTeam}
              onChange={(e) => setSelectedCompareTeam(e.target.value)}
              disabled={!compareTeams.length}
            >
              {compareTeams.map((t) => (
                <option key={t.teamno} value={t.teamno}>
                  #{t.rank} {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {compareError ? <p className="error">{compareError}</p> : null}

        {compareTeamData ? (
          <div className="table-wrap">
            <table className="games compare-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{team.team_name}</th>
                  <th>{compareTeamData.team_name}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => {
                  const leftClass =
                    row.winner === "left" ? "compare-win" : row.winner === "right" ? "compare-lose" : "";
                  const rightClass =
                    row.winner === "right" ? "compare-win" : row.winner === "left" ? "compare-lose" : "";

                  return (
                    <tr key={row.metric}>
                      <td>{row.metric}</td>
                      <td className={leftClass}>{row.leftDisplay}</td>
                      <td className={rightClass}>{row.rightDisplay}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="meta compact">Choose a division and team to compare.</p>
        )}
      </section>
    </div>
  );
}
