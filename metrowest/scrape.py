from __future__ import annotations

import argparse
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import date
from pathlib import Path
from typing import Any

from .api import SportsiteAPI
from .config import RANKING_CONFIG, SCRAPE_CONFIG, RankingConfig, ScrapeConfig
from .db import (
    connect_db,
    get_divisions,
    get_games_for_teams,
    get_season,
    get_teams_for_division,
    init_db,
    replace_snapshots,
    season_fingerprint,
    season_game_dates,
    update_season_state,
    upsert_division,
    upsert_game,
    upsert_season,
    upsert_team,
    upsert_team_game,
)
from .ranking import compute_division_rankings
from .season import detect_active_season, is_season_final
from .util import (
    game_hash_id,
    normalize_date,
    parse_genders,
    parse_grades,
    season_label,
    setup_logging,
    to_float,
    to_int,
)

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
    raw_home_teamno = str(raw_home) if raw_home not in (None, "") else None
    raw_away_teamno = str(raw_away) if raw_away not in (None, "") else None

    teamno = str(teamno)
    opponent_teamno = row.get("opponentteamno")
    opponent_teamno = str(opponent_teamno) if opponent_teamno not in (None, "") else None

    if not opponent_teamno:
        if raw_home_teamno and raw_home_teamno != teamno:
            opponent_teamno = raw_home_teamno
        elif raw_away_teamno and raw_away_teamno != teamno:
            opponent_teamno = raw_away_teamno

    homeaway = str(row.get("homeaway") or "").strip().lower()

    # Team schedule endpoints can return hometeam/awayteam in team-first order, which
    # conflicts with the true home/away side. Trust explicit homeaway whenever present.
    if homeaway == "home":
        home_teamno = teamno
        away_teamno = opponent_teamno or (raw_away_teamno if raw_away_teamno != teamno else raw_home_teamno)
    elif homeaway == "away":
        away_teamno = teamno
        home_teamno = opponent_teamno or (raw_home_teamno if raw_home_teamno != teamno else raw_away_teamno)
    else:
        home_teamno = raw_home_teamno
        away_teamno = raw_away_teamno

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

    # Forfeits: the league records the official result as 2-0 for the winner, even when a game was played
    # (raw scores then disagree depending on which team's row we read). Double forfeits stay unscored.
    forfeit = str(row.get("forfeitgame") or "").upper() == "YES"
    wonlost = str(row.get("wonlost") or "").upper()
    double_forfeit = str(row.get("officialscore") or "").replace(" ", "").upper() == "F,F"
    if forfeit:
        if double_forfeit:
            team_score = opp_score = None
        elif wonlost == "W":
            team_score, opp_score = 2, 0
        elif wonlost == "L":
            team_score, opp_score = 0, 2
        else:
            team_score = opp_score = None

    # Some responses provide scorehome as a comma pair like "69,50".
    if not forfeit and (team_score is None or opp_score is None):
        pair_source = row.get("scorehome") or row.get("scoreaway")
        pair_text = str(pair_source or "")
        if "," in pair_text:
            left, right = pair_text.split(",", 1)
            left_i = to_int(left)
            right_i = to_int(right)
            if left_i is not None and right_i is not None:
                if team_score is None:
                    team_score = left_i
                if opp_score is None:
                    opp_score = right_i

    score_home = to_int(row.get("scorehome"))
    score_away = to_int(row.get("scoreaway"))

    home_score: int | None = None
    away_score: int | None = None

    if team_score is not None and opp_score is not None:
        if homeaway == "home":
            home_score, away_score = team_score, opp_score
        elif homeaway == "away":
            home_score, away_score = opp_score, team_score
        elif home_teamno and away_teamno:
            if teamno == home_teamno:
                home_score, away_score = team_score, opp_score
            elif teamno == away_teamno:
                home_score, away_score = opp_score, team_score

    if not forfeit and home_score is None and away_score is None and score_home is not None and score_away is not None:
        home_score, away_score = score_home, score_away

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


def _fetch_team_games(api: SportsiteAPI, yrseason: str, teamno: str, divisionno: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for label, fetch in (("team schedule", api.get_team_schedule), ("nl schedule", api.get_team_nl_schedule)):
        try:
            rows.extend(fetch(yrseason, teamno) or [])
        except Exception as err:  # noqa: BLE001
            LOG.warning("%s failed team=%s division=%s: %s", label, teamno, divisionno, err)
    # Some endpoints answer "no games" with a status object instead of an empty list.
    return [r for r in rows if isinstance(r, dict) and ("gameno" in r or "gamedate" in r)]


def scrape_season(
    yrseason: str,
    grades: list[int],
    genders: list[str],
    conn,
    api: SportsiteAPI,
    scrape_config: ScrapeConfig = SCRAPE_CONFIG,
) -> None:
    """Fetch divisions, teams and games for one season into the database."""
    for gender in genders:
        for grade in grades:
            divisions = discover_divisions(api, yrseason, grade, gender)
            divisions = [d for d in divisions if isinstance(d, dict) and str(d.get("divisionno") or "").strip()]
            LOG.info("yrseason=%s %s%s: %s divisions", yrseason, grade, gender, len(divisions))

            team_jobs: list[tuple[str, str]] = []
            for division in divisions:
                divisionno = str(division["divisionno"]).strip()
                div_tier = str(division.get("divisiontier") or "").strip() or None
                div_name = _division_name(division, grade, gender, division.get("_tiername"))
                upsert_division(
                    conn,
                    divisionno,
                    yrseason,
                    grade,
                    gender,
                    div_tier,
                    div_name,
                    code=str(division.get("divisionid") or "").strip() or None,
                    tag=str(division.get("divisiontag") or "").strip() or None,
                )

                try:
                    team_rows = api.get_division_standings(divisionno) or []
                except Exception as err:  # noqa: BLE001
                    LOG.warning("standings failed division=%s: %s", divisionno, err)
                    team_rows = []

                for t in team_rows:
                    if not isinstance(t, dict):
                        continue
                    teamno = str(t.get("teamno") or "").strip()
                    if not teamno:
                        continue
                    upsert_team(
                        conn,
                        teamno,
                        yrseason,
                        grade,
                        gender,
                        divisionno,
                        str(t.get("town") or "").strip() or None,
                        str(t.get("teamname") or teamno).strip(),
                        mw_rating=to_float(t.get("rankthisyr")),
                        mw_points=to_int(t.get("rankpoints")),
                    )
                    team_jobs.append((teamno, divisionno))

            with ThreadPoolExecutor(max_workers=scrape_config.max_workers) as pool:
                results = pool.map(lambda job: (job, _fetch_team_games(api, yrseason, *job)), team_jobs)
                for (teamno, divisionno), rows in results:
                    for row in rows:
                        game = _normalize_game(yrseason, divisionno, teamno, divisionno, row)
                        upsert_game(conn, game)
                        home = game.get("home_teamno")
                        away = game.get("away_teamno")
                        is_home = 1 if home == teamno else 0 if away == teamno else None
                        upsert_team_game(conn, teamno, game["gameno"], is_home)
            conn.commit()


def rank_season(conn, yrseason: str, ranking_config: RankingConfig, snapshot_date: str) -> int:
    """Compute rankings for every division in the season and store them as the season's snapshot."""
    snapshot_rows: list[dict[str, Any]] = []
    team_meta_by_teamno = {
        str(row["teamno"]): dict(row)
        for row in conn.execute(
            """
            SELECT t.teamno, t.grade, t.gender, t.divisionno, d.divisiontier
            FROM teams t
            JOIN divisions d ON d.divisionno = t.divisionno
            WHERE t.yrseason = ?
            """,
            (yrseason,),
        )
    }

    for division in get_divisions(conn, yrseason):
        divisionno = str(division["divisionno"])
        teams = [dict(r) for r in get_teams_for_division(conn, divisionno)]
        if not teams:
            continue
        mw_by_teamno = {str(t["teamno"]): t for t in teams}

        teamnos = [str(t["teamno"]) for t in teams]
        games = [dict(r) for r in get_games_for_teams(conn, teamnos, yrseason)]
        ranked = compute_division_rankings(
            teams,
            games,
            ranking_config,
            team_meta_by_teamno=team_meta_by_teamno,
            grade=int(division["grade"]),
        )

        for row in ranked:
            team = mw_by_teamno.get(str(row["teamno"]), {})
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
                    "sos_adj": round(float(row.get("sos_adj", row["sos"])), 3),
                    "power": round(float(row["power"]), 3),
                    "rank": int(row["rank"]),
                    "mw_rating": team.get("mw_rating"),
                    "mw_points": team.get("mw_points"),
                }
            )

    replace_snapshots(conn, snapshot_date, snapshot_rows)
    return len(snapshot_rows)


def update_season(
    conn,
    api: SportsiteAPI,
    yrseason: str,
    grades: list[int],
    genders: list[str],
    ranking_config: RankingConfig,
    *,
    is_current: bool,
    force_rank: bool = False,
) -> bool:
    """Scrape and (if anything changed) re-rank one season. Returns True when output should be rebuilt."""
    previous = get_season(conn, yrseason)
    upsert_season(conn, yrseason, season_label(yrseason), is_current)
    conn.commit()

    scrape_season(yrseason, grades, genders, conn, api)

    fingerprint = season_fingerprint(conn, yrseason)
    last_final, next_scheduled = season_game_dates(conn, yrseason)
    status = "final" if is_season_final(last_final, next_scheduled, SCRAPE_CONFIG.season_final_after_days) else "in_progress"
    changed = force_rank or previous is None or previous["data_hash"] != fingerprint

    if changed:
        # Rankings are dated by the latest scored game, not the run date, so reruns are reproducible.
        snapshot_date = last_final or date.today().isoformat()
        count = rank_season(conn, yrseason, ranking_config, snapshot_date)
        LOG.info("ranked yrseason=%s: %s teams as of %s", yrseason, count, snapshot_date)
    else:
        LOG.info("no changes for yrseason=%s; rankings left as is", yrseason)

    status_changed = previous is None or previous["status"] != status
    update_season_state(conn, yrseason, status=status, as_of=last_final, data_hash=fingerprint)
    conn.commit()
    return changed or status_changed


def _write_github_output(**values: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as fh:
        for key, value in values.items():
            fh.write(f"{key}={value}\n")


def parse_seasons(value: str) -> list[str]:
    """ "2026", "2020,2021" or "2020-2025" -> list of seasons."""
    seasons: list[str] = []
    for part in value.split(","):
        part = part.strip()
        if "-" in part:
            start, end = (int(x) for x in part.split("-", 1))
            seasons.extend(str(y) for y in range(start, end + 1))
        elif part:
            seasons.append(str(int(part)))
    return seasons


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape Metrowest basketball and compute rankings")
    parser.add_argument(
        "--yrseason",
        default=SCRAPE_CONFIG.default_yrseason,
        help='"auto" (default: newest season with divisions), a season like 2026, or a list/range like 2020-2025',
    )
    parser.add_argument("--grades", default=None, help="Comma-separated grades, e.g. 3,4,5,6,7,8")
    parser.add_argument("--genders", default=None, help="Comma-separated genders, e.g. M,F")
    parser.add_argument("--db-path", default=str(SCRAPE_CONFIG.db_path))
    parser.add_argument("--ranking-profile", choices=("classic", "division-aware"), default=RANKING_CONFIG.profile)
    parser.add_argument("--out-json", default=None, help="Optional output folder to also generate JSON")
    parser.add_argument("--force", action="store_true", help="Scrape and re-rank even if the season is final/unchanged")
    parser.add_argument(
        "--rank-only",
        action="store_true",
        help="Recompute rankings from the database without scraping (e.g. after changing ranking settings)",
    )
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    setup_logging(args.log_level)
    grades = parse_grades(args.grades, SCRAPE_CONFIG.default_grades)
    genders = parse_genders(args.genders, SCRAPE_CONFIG.default_genders)
    db_path = Path(args.db_path)
    ranking_config = replace(RANKING_CONFIG, profile=args.ranking_profile)

    api = SportsiteAPI(SCRAPE_CONFIG)
    conn = connect_db(db_path)
    init_db(conn)

    if args.rank_only:
        seasons = [r["season_id"] for r in conn.execute("SELECT season_id FROM seasons ORDER BY season_id")]
        if args.yrseason != "auto":
            seasons = [s for s in seasons if s in set(parse_seasons(args.yrseason))]
        for yrseason in seasons:
            last_final, _ = season_game_dates(conn, yrseason)
            count = rank_season(conn, yrseason, ranking_config, last_final or date.today().isoformat())
            conn.execute(
                "UPDATE seasons SET data_hash = ? WHERE season_id = ?", (season_fingerprint(conn, yrseason), yrseason)
            )
            LOG.info("re-ranked yrseason=%s: %s teams", yrseason, count)
        conn.commit()
        conn.close()
        if args.out_json:
            from .build_json import build_json

            build_json(db_path=db_path, out_dir=Path(args.out_json), ranking_profile=args.ranking_profile)
        return

    auto = args.yrseason == "auto"
    seasons = [detect_active_season(api)] if auto else parse_seasons(args.yrseason)

    changed = False
    if auto:
        # When a new season is detected, the previous current season is over regardless of stray unscored games.
        for row in conn.execute(
            "SELECT season_id FROM seasons WHERE is_current = 1 AND season_id <> ? AND COALESCE(status, '') <> 'final'",
            (seasons[0],),
        ).fetchall():
            LOG.info("season %s superseded by %s; marking final", row["season_id"], seasons[0])
            conn.execute("UPDATE seasons SET status = 'final' WHERE season_id = ?", (row["season_id"],))
            changed = True
        conn.commit()

    for yrseason in seasons:
        existing = get_season(conn, yrseason)
        if auto and not args.force and existing is not None and existing["status"] == "final":
            # Off-season: the active season is over and the next one has no divisions yet.
            LOG.info("season %s is final; nothing to scrape until the next season is posted", yrseason)
            continue
        changed |= update_season(
            conn,
            api,
            yrseason,
            grades,
            genders,
            ranking_config,
            is_current=auto,
            force_rank=args.force,
        )
    conn.close()

    _write_github_output(changed="true" if changed else "false")
    LOG.info("done; output %s", "changed" if changed else "unchanged")

    if args.out_json:
        from .build_json import build_json

        build_json(db_path=db_path, out_dir=Path(args.out_json), ranking_profile=args.ranking_profile)


if __name__ == "__main__":
    main()
