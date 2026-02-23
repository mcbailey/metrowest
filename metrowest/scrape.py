from __future__ import annotations

import argparse
import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

from .api import SportsiteAPI
from .config import RANKING_CONFIG, SCRAPE_CONFIG
from .db import (
    connect_db,
    get_divisions,
    get_games_for_teams,
    get_teams_for_division,
    init_db,
    replace_snapshots,
    upsert_division,
    upsert_game,
    upsert_season,
    upsert_team,
    upsert_team_game,
)
from .ranking import compute_division_rankings
from .util import game_hash_id, normalize_date, parse_genders, parse_grades, setup_logging, to_int

LOG = logging.getLogger(__name__)


def _division_name(division: dict[str, Any], grade: int, gender: str, tier_name: str | None) -> str:
    gender_name = "Boys" if gender == "M" else "Girls"
    return (
        str(division.get("divisiontiername") or division.get("divisionname") or "").strip()
        or tier_name
        or f"{grade}th {gender_name}"
    )


def _normalize_game(
    yrseason: str,
    divisionno: str,
    teamno: str,
    team_division: str,
    row: dict[str, Any],
) -> dict[str, Any]:
    raw_home = row.get("hometeam")
    raw_away = row.get("awayteam")
    home_teamno = str(raw_home) if raw_home not in (None, "") else None
    away_teamno = str(raw_away) if raw_away not in (None, "") else None

    teamno = str(teamno)
    opponent_teamno = row.get("opponentteamno")
    opponent_teamno = str(opponent_teamno) if opponent_teamno not in (None, "") else None

    homeaway = str(row.get("homeaway") or "").lower()
    if not home_teamno or not away_teamno:
        if homeaway == "home":
            home_teamno = home_teamno or teamno
            away_teamno = away_teamno or opponent_teamno
        elif homeaway == "away":
            away_teamno = away_teamno or teamno
            home_teamno = home_teamno or opponent_teamno

    gameno = row.get("gameno")
    gameno = str(gameno) if gameno not in (None, "") else None

    d = normalize_date(row.get("gamedate"))
    st = row.get("starttime")
    loc = row.get("location")

    if not gameno:
        gameno = game_hash_id(
            yrseason=yrseason,
            date=d,
            starttime=str(st or ""),
            home_teamno=home_teamno,
            away_teamno=away_teamno,
            location=str(loc or ""),
        )

    team_score = to_int(row.get("teamscore"))
    opp_score = to_int(row.get("opponentscore"))
    score_home = to_int(row.get("scorehome"))
    score_away = to_int(row.get("scoreaway"))

    home_score: int | None = None
    away_score: int | None = None

    if score_home is not None and score_away is not None:
        home_score, away_score = score_home, score_away
    elif team_score is not None and opp_score is not None:
        if homeaway == "home":
            home_score, away_score = team_score, opp_score
        elif homeaway == "away":
            home_score, away_score = opp_score, team_score
        elif home_teamno and away_teamno:
            # Tournament/crossover games may use values like "Tourn" in homeaway.
            if teamno == home_teamno:
                home_score, away_score = team_score, opp_score
            elif teamno == away_teamno:
                home_score, away_score = opp_score, team_score

    status = "final" if home_score is not None and away_score is not None else "scheduled"

    return {
        "gameno": gameno,
        "yrseason": yrseason,
        "date": d,
        "dow": row.get("gamedow"),
        "starttime": st,
        "location": loc,
        "divisionno": str(row.get("divisionno") or divisionno or team_division or "") or None,
        "home_teamno": home_teamno,
        "away_teamno": away_teamno,
        "home_score": home_score,
        "away_score": away_score,
        "status": status,
        "raw_json": json.dumps(row, separators=(",", ":"), ensure_ascii=True),
    }


def discover_divisions(api: SportsiteAPI, yrseason: str, grade: int, gender: str) -> list[dict[str, Any]]:
    divisions: list[dict[str, Any]] = []
    try:
        tiers = api.get_grade_gender_div_tiers(yrseason, grade, gender)
        for tier in tiers:
            tier_id = str(tier.get("divisiontier") or "")
            tier_name = str(tier.get("divisiontiername") or "").strip() or None
            if not tier_id:
                continue
            try:
                tier_divisions = api.get_gender_grade_tier_divisions(yrseason, grade, gender, tier_id)
                for d in tier_divisions:
                    d["_tiername"] = tier_name
                divisions.extend(tier_divisions)
            except Exception as err:  # noqa: BLE001
                LOG.warning(
                    "tier lookup failed yrseason=%s grade=%s gender=%s tier=%s: %s",
                    yrseason,
                    grade,
                    gender,
                    tier_id,
                    err,
                )
    except Exception as err:  # noqa: BLE001
        LOG.warning("tier discovery failed yrseason=%s grade=%s gender=%s: %s", yrseason, grade, gender, err)

    if divisions:
        return divisions

    LOG.info("using fallback getGenderGradeDivisions for grade=%s gender=%s", grade, gender)
    try:
        return api.get_gender_grade_divisions(yrseason, grade, gender)
    except Exception as err:  # noqa: BLE001
        LOG.error("fallback division discovery failed yrseason=%s grade=%s gender=%s: %s", yrseason, grade, gender, err)
        return []


def scrape_season(
    yrseason: str,
    grades: list[int],
    genders: list[str],
    db_path: Path,
) -> None:
    api = SportsiteAPI(SCRAPE_CONFIG)
    conn = connect_db(db_path)
    init_db(conn)

    upsert_season(conn, yrseason, f"Season {yrseason}", True)
    conn.commit()

    for gender in genders:
        for grade in grades:
            LOG.info("discovering divisions yrseason=%s grade=%s gender=%s", yrseason, grade, gender)
            divisions = discover_divisions(api, yrseason, grade, gender)
            LOG.info("found %s divisions for grade=%s gender=%s", len(divisions), grade, gender)

            for division in divisions:
                divisionno = str(division.get("divisionno") or "").strip()
                if not divisionno:
                    continue
                div_tier = str(division.get("divisiontier") or "").strip() or None
                div_name = _division_name(division, grade, gender, division.get("_tiername"))
                upsert_division(conn, divisionno, yrseason, grade, gender, div_tier, div_name)

                team_rows: list[dict[str, Any]] = []
                try:
                    team_rows = api.get_division_standings(divisionno)
                except Exception as err:  # noqa: BLE001
                    LOG.warning("standings failed division=%s: %s", divisionno, err)

                seen_teamnos: set[str] = set()
                for t in team_rows:
                    teamno = str(t.get("teamno") or "").strip()
                    if not teamno:
                        continue
                    seen_teamnos.add(teamno)
                    team_name = str(t.get("teamname") or teamno).strip()
                    town = str(t.get("town") or "").strip() or None
                    upsert_team(conn, teamno, yrseason, grade, gender, divisionno, town, team_name)

                for teamno in seen_teamnos:
                    try:
                        league_games = api.get_team_schedule(yrseason, teamno)
                    except Exception as err:  # noqa: BLE001
                        LOG.warning("team schedule failed team=%s division=%s: %s", teamno, divisionno, err)
                        league_games = []
                    try:
                        nl_games = api.get_team_nl_schedule(yrseason, teamno)
                    except Exception as err:  # noqa: BLE001
                        LOG.warning("nl schedule failed team=%s division=%s: %s", teamno, divisionno, err)
                        nl_games = []

                    for row in [*league_games, *nl_games]:
                        game = _normalize_game(yrseason, divisionno, teamno, divisionno, row)
                        upsert_game(conn, game)
                        home = game.get("home_teamno")
                        away = game.get("away_teamno")
                        if home == teamno:
                            is_home = 1
                        elif away == teamno:
                            is_home = 0
                        else:
                            is_home = None
                        upsert_team_game(conn, teamno, game["gameno"], is_home)

                conn.commit()

    snapshot_date = date.today().isoformat()
    snapshot_rows: list[dict[str, Any]] = []
    divisions = get_divisions(conn, yrseason)
    for division in divisions:
        divisionno = str(division["divisionno"])
        teams = [dict(r) for r in get_teams_for_division(conn, divisionno)]
        if not teams:
            continue

        teamnos = [str(t["teamno"]) for t in teams]
        games = [dict(r) for r in get_games_for_teams(conn, teamnos, yrseason)]
        ranked = compute_division_rankings(teams, games, RANKING_CONFIG)

        for row in ranked:
            snapshot_rows.append(
                {
                    "yrseason": yrseason,
                    "grade": int(division["grade"]),
                    "gender": str(division["gender"]),
                    "divisionno": divisionno,
                    "teamno": row["teamno"],
                    "wins": row["wins"],
                    "losses": row["losses"],
                    "ties": row["ties"],
                    "pf": row["pf"],
                    "pa": row["pa"],
                    "diff": row["diff"],
                    "sos": round(float(row["sos"]), 3),
                    "power": round(float(row["power"]), 3),
                    "rank": int(row["rank"]),
                }
            )

    replace_snapshots(conn, snapshot_date, snapshot_rows)
    conn.commit()
    conn.close()
    LOG.info("completed scrape yrseason=%s with %s snapshot rows", yrseason, len(snapshot_rows))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape Metrowest basketball and compute rankings")
    parser.add_argument("--yrseason", default=SCRAPE_CONFIG.default_yrseason)
    parser.add_argument("--grades", default=None, help="Comma-separated grades, e.g. 3,4,5,6,7,8")
    parser.add_argument("--genders", default=None, help="Comma-separated genders, e.g. M,F")
    parser.add_argument("--db-path", default=str(SCRAPE_CONFIG.db_path))
    parser.add_argument("--out-json", default=None, help="Optional output folder to also generate JSON")
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    setup_logging(args.log_level)
    grades = parse_grades(args.grades, SCRAPE_CONFIG.default_grades)
    genders = parse_genders(args.genders, SCRAPE_CONFIG.default_genders)
    db_path = Path(args.db_path)
    scrape_season(args.yrseason, grades, genders, db_path)

    if args.out_json:
        from .build_json import build_json

        build_json(db_path=db_path, out_dir=Path(args.out_json), yrseason=args.yrseason)


if __name__ == "__main__":
    main()
