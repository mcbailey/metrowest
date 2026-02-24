from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .config import RankingConfig


@dataclass
class TeamStats:
    teamno: str
    wins: int = 0
    losses: int = 0
    ties: int = 0
    pf: int = 0
    pa: int = 0

    @property
    def diff(self) -> int:
        return self.pf - self.pa


def _is_final_game(game: dict) -> bool:
    return game.get("home_score") is not None and game.get("away_score") is not None


def _parse_tier(value: Any) -> int | None:
    if value in (None, "", "--"):
        return None
    try:
        tier = int(str(value).strip())
        return tier if tier > 0 else None
    except (TypeError, ValueError):
        return None


def _parse_grade(value: Any) -> int | None:
    if value in (None, "", "--"):
        return None
    try:
        grade = int(str(value).strip())
        return grade if grade > 0 else None
    except (TypeError, ValueError):
        return None


def _division_baseline(config: RankingConfig, grade: int | None, tier: int | None) -> float:
    if tier is None:
        return config.initial_elo

    if grade == config.grade4_special_grade:
        special = config.grade4_tier_baselines.get(tier)
        if special is not None:
            return special

    return config.base_div1_elo - ((tier - 1) * config.division_step_elo)


def _game_sort_key(game: dict[str, Any]) -> tuple:
    date_text = str(game.get("date") or "")
    starttime = str(game.get("starttime") or "")
    gameno = str(game.get("gameno") or "")
    try:
        dt = datetime.strptime(date_text, "%Y-%m-%d")
        return (0, dt.date().isoformat(), starttime, gameno)
    except ValueError:
        return (1, date_text, starttime, gameno)


def _game_week_key(date_text: str | None) -> tuple[int, int] | None:
    if not date_text:
        return None
    try:
        dt = datetime.strptime(date_text, "%Y-%m-%d")
    except ValueError:
        return None
    iso = dt.isocalendar()
    return (iso.year, iso.week)


def _mov_multiplier(home_elo: float, away_elo: float, hs: int, as_: int, config: RankingConfig) -> float:
    mov = min(abs(hs - as_), max(config.mov_cap, 1))
    if mov <= 0:
        return 1.0

    if hs > as_:
        winner_elo = home_elo
        loser_elo = away_elo
    elif as_ > hs:
        winner_elo = away_elo
        loser_elo = home_elo
    else:
        return 1.0

    elo_gap = winner_elo - loser_elo
    scale = (elo_gap * 0.001) + 2.2
    if abs(scale) < 1e-9:
        scale = 2.2

    mult = math.log(mov + 1.0) * (2.2 / scale)
    return max(mult, 0.25)


def _effective_k(
    home_tier: int | None,
    away_tier: int | None,
    hs: int,
    as_: int,
    config: RankingConfig,
    mov_mult: float,
) -> float:
    k = config.k_factor

    # More stable updates at the top divisions.
    if home_tier in config.top_division_tiers and away_tier in config.top_division_tiers:
        k *= max(0.0, 1.0 - config.top_division_k_reduction)

    # Upset boost: lower-division team beats higher-division team.
    if home_tier is not None and away_tier is not None and hs != as_:
        if hs > as_ and home_tier > away_tier:
            k *= config.upset_multiplier
        elif as_ > hs and away_tier > home_tier:
            k *= config.upset_multiplier

    k *= mov_mult
    return k


def compute_division_rankings(
    teams: list[dict],
    games: list[dict],
    config: RankingConfig,
    *,
    team_meta_by_teamno: dict[str, dict[str, Any]] | None = None,
    grade: int | None = None,
) -> list[dict]:
    """
    Compute ratings for teams in a division using all final games linked to those teams.
    This keeps displayed W/L aligned with team-level schedules while ranking within the
    target division's team set.
    """
    team_meta_by_teamno = team_meta_by_teamno or {}

    team_ids = {str(t["teamno"]) for t in teams}
    stats = {tid: TeamStats(teamno=tid) for tid in team_ids}

    team_tiers: dict[str, int | None] = {}
    team_grades: dict[str, int | None] = {}
    for t in teams:
        tid = str(t["teamno"])
        meta = team_meta_by_teamno.get(tid, {})
        team_tiers[tid] = _parse_tier(t.get("divisiontier") or meta.get("divisiontier"))
        team_grades[tid] = _parse_grade(t.get("grade") or meta.get("grade") or grade)

    def initial_for(teamno: str) -> float:
        tmeta = team_meta_by_teamno.get(teamno, {})
        tier = team_tiers.get(teamno)
        if tier is None:
            tier = _parse_tier(tmeta.get("divisiontier"))
        g = team_grades.get(teamno)
        if g is None:
            g = _parse_grade(tmeta.get("grade") or grade)
        if config.profile != "division-aware":
            return config.initial_elo
        return _division_baseline(config, g, tier)

    elo: dict[str, float] = {tid: initial_for(tid) for tid in team_ids}
    opponents: dict[str, list[str]] = defaultdict(list)

    final_games = []
    for g in games:
        home = str(g.get("home_teamno") or "")
        away = str(g.get("away_teamno") or "")
        if home not in team_ids and away not in team_ids:
            continue
        if not _is_final_game(g):
            continue
        final_games.append(g)

    final_games.sort(key=_game_sort_key)

    current_week: tuple[int, int] | None = None

    def regress_week() -> None:
        if config.profile != "division-aware" or config.weekly_regression_pct <= 0:
            return
        keep = 1.0 - config.weekly_regression_pct
        for tid in list(elo):
            baseline = initial_for(tid)
            elo[tid] = baseline + ((elo[tid] - baseline) * keep)

    for g in final_games:
        game_week = _game_week_key(g.get("date"))
        if config.profile == "division-aware" and current_week is not None and game_week != current_week:
            regress_week()
        if game_week is not None:
            current_week = game_week

        home = str(g["home_teamno"])
        away = str(g["away_teamno"])
        hs = int(g["home_score"])
        as_ = int(g["away_score"])

        if home not in elo:
            elo[home] = initial_for(home)
        if away not in elo:
            elo[away] = initial_for(away)

        if home in team_ids:
            stats[home].pf += hs
            stats[home].pa += as_
        if away in team_ids:
            stats[away].pf += as_
            stats[away].pa += hs

        if hs > as_:
            if home in team_ids:
                stats[home].wins += 1
            if away in team_ids:
                stats[away].losses += 1
            result_home = 1.0
        elif hs < as_:
            if home in team_ids:
                stats[home].losses += 1
            if away in team_ids:
                stats[away].wins += 1
            result_home = 0.0
        else:
            if home in team_ids:
                stats[home].ties += 1
            if away in team_ids:
                stats[away].ties += 1
            result_home = 0.5

        expected_home = 1.0 / (1.0 + 10 ** ((elo[away] - elo[home]) / 400.0))

        if config.profile == "division-aware":
            home_tier = team_tiers.get(home)
            if home_tier is None:
                home_tier = _parse_tier(team_meta_by_teamno.get(home, {}).get("divisiontier"))
            away_tier = team_tiers.get(away)
            if away_tier is None:
                away_tier = _parse_tier(team_meta_by_teamno.get(away, {}).get("divisiontier"))

            mov_mult = _mov_multiplier(elo[home], elo[away], hs, as_, config)
            effective_k = _effective_k(home_tier, away_tier, hs, as_, config, mov_mult)
        else:
            mov = abs(hs - as_)
            elo_diff = abs(elo[home] - elo[away])
            mov_mult = math.log(mov + 1.0) * (2.2 / ((elo_diff * 0.001) + 2.2))
            if mov_mult == 0:
                mov_mult = 1.0
            effective_k = config.k_factor * mov_mult

        change = effective_k * (result_home - expected_home)
        elo[home] += change
        elo[away] -= change

        if home in team_ids:
            opponents[home].append(away)
        if away in team_ids:
            opponents[away].append(home)

    if config.profile == "division-aware" and current_week is not None:
        regress_week()

    sos_raw: dict[str, float] = {}
    sos_adj: dict[str, float] = {}

    for tid in team_ids:
        opps = opponents.get(tid, [])
        if not opps:
            baseline = initial_for(tid)
            sos_raw[tid] = baseline
            sos_adj[tid] = baseline
            continue

        raw_vals: list[float] = []
        adj_vals: list[float] = []
        for opp in opps:
            opp_elo = elo.get(opp, initial_for(opp))
            raw_vals.append(opp_elo)

            if config.profile == "division-aware":
                opp_tier = team_tiers.get(opp)
                if opp_tier is None:
                    opp_tier = _parse_tier(team_meta_by_teamno.get(opp, {}).get("divisiontier"))
                opp_grade = team_grades.get(opp)
                if opp_grade is None:
                    opp_grade = _parse_grade(team_meta_by_teamno.get(opp, {}).get("grade") or grade)
                opp_baseline = _division_baseline(config, opp_grade, opp_tier)
                adjusted = opp_elo + ((opp_baseline - config.initial_elo) * config.sos_division_adjust_weight)
                adj_vals.append(adjusted)
            else:
                adj_vals.append(opp_elo)

        sos_raw[tid] = sum(raw_vals) / len(raw_vals)
        sos_adj[tid] = sum(adj_vals) / len(adj_vals)

    rows = []
    for t in teams:
        tid = str(t["teamno"])
        st = stats[tid]
        team_elo = elo.get(tid, initial_for(tid))

        if config.profile == "division-aware":
            if config.power_sos_adj_weight > 0:
                power = (
                    config.power_elo_weight * team_elo
                    + config.power_sos_weight * sos_raw[tid]
                    + config.power_sos_adj_weight * sos_adj[tid]
                )
            else:
                power = (config.power_elo_weight * team_elo) + (config.power_sos_weight * sos_adj[tid])
        else:
            power = config.power_elo_weight * team_elo + config.power_sos_weight * sos_raw[tid]

        rows.append(
            {
                "teamno": tid,
                "name": t.get("name") or tid,
                "town": t.get("town"),
                "wins": st.wins,
                "losses": st.losses,
                "ties": st.ties,
                "pf": st.pf,
                "pa": st.pa,
                "diff": st.diff,
                "elo": team_elo,
                "sos": sos_raw[tid],
                "sos_adj": sos_adj[tid],
                "power": power,
            }
        )

    rows.sort(key=lambda r: (r["power"], r["elo"], r["diff"]), reverse=True)
    for idx, row in enumerate(rows, start=1):
        row["rank"] = idx
    return rows
