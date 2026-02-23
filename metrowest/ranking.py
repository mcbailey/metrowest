from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

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


def compute_division_rankings(
    teams: list[dict],
    games: list[dict],
    config: RankingConfig,
) -> list[dict]:
    team_ids = {str(t["teamno"]) for t in teams}
    stats = {tid: TeamStats(teamno=tid) for tid in team_ids}
    elo = {tid: config.initial_elo for tid in team_ids}
    opponents: dict[str, list[str]] = defaultdict(list)

    final_games = []
    for g in games:
        home = str(g.get("home_teamno") or "")
        away = str(g.get("away_teamno") or "")
        if home not in team_ids or away not in team_ids:
            continue
        if not _is_final_game(g):
            continue
        final_games.append(g)

    for g in final_games:
        home = str(g["home_teamno"])
        away = str(g["away_teamno"])
        hs = int(g["home_score"])
        as_ = int(g["away_score"])

        stats[home].pf += hs
        stats[home].pa += as_
        stats[away].pf += as_
        stats[away].pa += hs

        if hs > as_:
            stats[home].wins += 1
            stats[away].losses += 1
            result_home = 1.0
        elif hs < as_:
            stats[home].losses += 1
            stats[away].wins += 1
            result_home = 0.0
        else:
            stats[home].ties += 1
            stats[away].ties += 1
            result_home = 0.5

        expected_home = 1.0 / (1.0 + 10 ** ((elo[away] - elo[home]) / 400.0))
        mov = abs(hs - as_)
        elo_diff = abs(elo[home] - elo[away])
        multiplier = math.log(mov + 1.0) * (2.2 / ((elo_diff * 0.001) + 2.2))
        if multiplier == 0:
            multiplier = 1.0

        change = config.k_factor * multiplier * (result_home - expected_home)
        elo[home] += change
        elo[away] -= change

        opponents[home].append(away)
        opponents[away].append(home)

    sos = {}
    for tid in team_ids:
        opps = opponents.get(tid, [])
        sos[tid] = sum(elo[o] for o in opps) / len(opps) if opps else config.initial_elo

    rows = []
    for t in teams:
        tid = str(t["teamno"])
        power = config.power_elo_weight * elo[tid] + config.power_sos_weight * sos[tid]
        st = stats[tid]
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
                "elo": elo[tid],
                "sos": sos[tid],
                "power": power,
            }
        )

    rows.sort(key=lambda r: (r["power"], r["elo"], r["diff"]), reverse=True)
    for idx, row in enumerate(rows, start=1):
        row["rank"] = idx
    return rows
