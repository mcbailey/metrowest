from __future__ import annotations

import argparse
import json
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any

from .config import RANKING_CONFIG, SCRAPE_CONFIG
from .db import connect_db, init_db, latest_snapshot_date, list_seasons
from .schedule import season_games, write_gyms_index, write_season_schedule, write_team_calendars
from .util import canonical_town, class_of, ensure_dir, season_label, slugify, team_path, town_slug


def _write_json(path: Path, payload: object) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n", encoding="utf-8")


def _safe_int(value: Any) -> int | None:
    if value in (None, "", "--", "null"):
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _parse_raw(raw_json: str | None) -> dict[str, Any]:
    if not raw_json:
        return {}
    try:
        payload = json.loads(raw_json)
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def _snapshot_columns(conn) -> set[str]:
    return {row["name"] for row in conn.execute("PRAGMA table_info(snapshots)")}


def _snapshot_rows(conn, yrseason: str, snapshot_date: str, include_mw: bool, include_sos_adj: bool):
    mw_cols = "s.mw_rating, s.mw_points," if include_mw else "NULL AS mw_rating, NULL AS mw_points,"
    sos_adj_col = "s.sos_adj AS sos_adj," if include_sos_adj else "s.sos AS sos_adj,"
    return list(
        conn.execute(
            f"""
            SELECT s.snapshot_date, s.yrseason, s.grade, s.gender, s.divisionno, s.teamno,
                   s.wins, s.losses, s.ties, s.pf, s.pa, s.diff,
                   s.sos, {sos_adj_col}
                   s.power, s.rank,
                   {mw_cols}
                   t.name AS team_name, COALESCE(t.town_name, t.town) AS town,
                   d.name AS division_name, d.divisiontier, d.code AS division_code, d.tag AS division_tag
            FROM snapshots s
            JOIN teams t ON t.teamno = s.teamno
            JOIN divisions d ON d.divisionno = s.divisionno
            WHERE s.yrseason = ? AND s.snapshot_date = ?
            ORDER BY s.gender, s.grade, d.name, s.rank
            """,
            (yrseason, snapshot_date),
        )
    )


def _round_name(rounds_from_end: int, round_no: int) -> str:
    return {0: "final", 1: "semifinal", 2: "quarterfinal"}.get(rounds_from_end, f"round {round_no}")


def _playoff_data(conn, yrseason: str) -> tuple[dict[str, list[dict]], dict[tuple[str, int], list[dict]]]:
    """(each team's playoff results, bracket payloads by (gender, grade)) for a season."""
    groups = [dict(r) for r in conn.execute(
        "SELECT * FROM playoff_groups WHERE yrseason = ? ORDER BY gender, grade, name", (yrseason,)
    )]
    games_by_group: dict[str, list[dict]] = defaultdict(list)
    for r in conn.execute(
        """SELECT p.* FROM playoff_games p JOIN playoff_groups g ON g.groupno = p.groupno
           WHERE g.yrseason = ? ORDER BY p.groupno, p.round, p.game""",
        (yrseason,),
    ):
        games_by_group[r["groupno"]].append(dict(r))

    results: dict[str, list[dict]] = defaultdict(list)
    by_grade: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for g in groups:
        games = games_by_group.get(g["groupno"], [])
        if not games:
            continue
        last_round = max(x["round"] for x in games)
        by_grade[(g["gender"], int(g["grade"]))].append(
            {
                "groupno": g["groupno"],
                "name": g["name"],
                "numteams": g["numteams"],
                "rounds": last_round,
                "games": [
                    {
                        "id": x["tournamentgameno"],
                        "round": x["round"],
                        "game": x["game"],
                        "when": x["when_text"],
                        "venue": x["venue"],
                        "teams": [
                            {
                                "teamno": x[f"team{i}_teamno"],
                                "name": x[f"team{i}_name"],
                                "seed": x[f"team{i}_seed"],
                                "score": x[f"team{i}_score"],
                                "from_game": x[f"team{i}_source_game"],
                            }
                            for i in (1, 2)
                        ],
                        "winner": x["winner_teamno"],
                    }
                    for x in games
                ],
            }
        )

        # Each team's furthest result in this bracket.
        seeds: dict[str, int | None] = {}
        furthest: dict[str, dict] = {}
        for x in games:
            for i in (1, 2):
                tno = x[f"team{i}_teamno"]
                if not tno:
                    continue
                seeds.setdefault(tno, x[f"team{i}_seed"])
                if tno not in furthest or x["round"] >= furthest[tno]["round"]:
                    furthest[tno] = x
        for tno, x in furthest.items():
            winner = x["winner_teamno"]
            from_end = last_round - x["round"]
            if winner == tno and from_end == 0:
                outcome = "Champion"
            elif winner == tno:
                outcome = f"Won {_round_name(from_end, x['round'])}"
            elif winner:
                outcome = "Runner-up" if from_end == 0 else f"Lost in {_round_name(from_end, x['round'])}"
            else:
                outcome = f"Reached {_round_name(from_end, x['round'])}"
            results[tno].append(
                {"groupno": g["groupno"], "group_name": g["name"], "seed": seeds.get(tno), "result": outcome}
            )

    # Regional brackets (North/South/Central) have no final of their own: their winners move on to a separate
    # "Championship" bracket. Reaching the end of a regional bracket and playing in a championship means the
    # team won its region.
    for items in results.values():
        if any("championship" in i["group_name"].lower() for i in items):
            for i in items:
                if i["result"] == "Reached final" and "championship" not in i["group_name"].lower():
                    i["result"] = "Won region"

    return results, by_grade


def _write_playoffs(conn, out_dir: Path, yrseason: str) -> tuple[dict[str, list[dict]], set[tuple[str, int]]]:
    """Write {season}/playoffs/{gender}/{grade}.json; return each team's playoff results and which groups have brackets."""
    results, by_grade = _playoff_data(conn, yrseason)
    for (gender, grade), payload in by_grade.items():
        _write_json(
            out_dir / yrseason / "playoffs" / gender / f"{grade}.json",
            {"yrseason": yrseason, "gender": gender, "grade": grade, "groups": payload},
        )
    return results, set(by_grade)


def _build_season(conn, out_dir: Path, yrseason: str, is_current: bool = False) -> dict[str, Any] | None:
    """Write all JSON for one season. Returns the season's entry for index.json, or None if it has no rankings."""
    snapshot_date = latest_snapshot_date(conn, yrseason)
    if not snapshot_date:
        return None

    snapshot_cols = _snapshot_columns(conn)
    include_mw = "mw_rating" in snapshot_cols and "mw_points" in snapshot_cols
    include_sos_adj = "sos_adj" in snapshot_cols

    rows = [dict(r) for r in _snapshot_rows(conn, yrseason, snapshot_date, include_mw, include_sos_adj)]
    if not rows:
        return None

    divisions_by_group: dict[tuple[str, int], dict[str, dict]] = defaultdict(dict)
    division_rows: dict[str, list[dict]] = defaultdict(list)
    division_meta_by_no: dict[str, dict[str, Any]] = {}

    for r in rows:
        key = (r["gender"], int(r["grade"]))
        dno = r["divisionno"]
        if dno not in divisions_by_group[key]:
            divisions_by_group[key][dno] = {
                "divisionno": dno,
                "name": r["division_name"],
                "divisiontier": r.get("divisiontier"),
                "code": r.get("division_code"),
                "tag": r.get("division_tag"),
            }

        division_meta_by_no[dno] = {
            "division_name": r["division_name"],
            "divisiontier": r.get("divisiontier"),
            "code": r.get("division_code"),
            "tag": r.get("division_tag"),
            "grade": int(r["grade"]),
            "gender": r["gender"],
        }

        division_rows[dno].append(
            {
                "teamno": r["teamno"],
                "name": r["team_name"],
                "town": r["town"],
                "wins": r["wins"],
                "losses": r["losses"],
                "ties": r["ties"],
                "pf": r["pf"],
                "pa": r["pa"],
                "diff": r["diff"],
                "sos": round(float(r["sos"]), 3),
                "sos_adj": round(float(r.get("sos_adj") if r.get("sos_adj") is not None else r["sos"]), 3),
                "power": round(float(r["power"]), 3),
                "rank": r["rank"],
                "mw_rating": round(float(r["mw_rating"]), 1) if r.get("mw_rating") is not None else None,
                "mw_points": int(r["mw_points"]) if r.get("mw_points") is not None else None,
            }
        )

    available_genders = sorted({r["gender"] for r in rows})
    available_grades = sorted({int(r["grade"]) for r in rows})

    for (gender, grade), div_map in divisions_by_group.items():
        divisions_payload = {
            "yrseason": yrseason,
            "gender": gender,
            "grade": grade,
            "snapshot_date": snapshot_date,
            "divisions": sorted(
                div_map.values(),
                key=lambda d: (int(d.get("divisiontier") or 99), d.get("tag") or "", d["divisionno"]),
            ),
        }
        _write_json(out_dir / yrseason / gender / str(grade) / "divisions.json", divisions_payload)

    for dno, teams in division_rows.items():
        meta_row = division_meta_by_no[dno]
        payload = {
            "yrseason": yrseason,
            "snapshot_date": snapshot_date,
            "gender": meta_row["gender"],
            "grade": int(meta_row["grade"]),
            "divisionno": dno,
            "division_name": meta_row["division_name"],
            "divisiontier": meta_row.get("divisiontier"),
            "code": meta_row.get("code"),
            "tag": meta_row.get("tag"),
            "rankings": teams,
        }
        _write_json(out_dir / yrseason / meta_row["gender"] / str(meta_row["grade"]) / f"division-{dno}.json", payload)

    teams_meta = {
        r["teamno"]: {
            "name": r["team_name"],
            "town": r["town"],
            "divisionno": r["divisionno"],
            "division_name": r["division_name"],
            "divisiontier": r.get("divisiontier"),
            "division_tag": r.get("division_tag"),
        }
        for r in rows
    }

    playoff_results, playoff_groups_present = _write_playoffs(conn, out_dir, yrseason)

    # Compact team list for the site-wide team/town search.
    search_rows = sorted(
        (
            {
                "teamno": r["teamno"],
                "name": r["team_name"],
                "town": canonical_town(r["town"]),
                "town_slug": town_slug(r["town"]),
                "gender": r["gender"],
                "grade": int(r["grade"]),
                "divisionno": r["divisionno"],
                "division_tag": r.get("division_tag"),
                "divisiontier": r.get("divisiontier"),
                "rank": r["rank"],
                "power": round(float(r["power"]), 1),
                "wins": r["wins"],
                "losses": r["losses"],
                "ties": r["ties"],
            }
            for r in rows
        ),
        key=lambda t: (t["gender"], t["grade"], t["name"].lower(), t["teamno"]),
    )
    _write_json(out_dir / yrseason / "search.json", {"yrseason": yrseason, "teams": search_rows})

    league_teams = {
        t["teamno"]: {"name": t["name"], "gender": t["gender"], "grade": t["grade"]} for t in search_rows
    }
    games = season_games(conn, yrseason, league_teams)
    gym_summaries = write_season_schedule(out_dir, yrseason, games, _write_json)
    venue_by_game = {g["id"]: g["venue"] for g in games}
    if is_current:
        write_team_calendars(
            out_dir,
            yrseason,
            games,
            league_teams,
            lambda tno: f"https://mwstats.com{team_path(yrseason, tno, league_teams[tno]['name'])}/",
            snapshot_date,
        )

    linked_games = list(
        conn.execute(
            """
            SELECT tg.teamno,
                   tg.is_home AS linked_is_home,
                   g.gameno, g.yrseason, g.date, g.dow, g.starttime, g.location, g.divisionno,
                   g.home_teamno, g.away_teamno, g.home_score, g.away_score, g.status, g.raw_json
            FROM team_games tg
            JOIN games g ON g.gameno = tg.gameno
            WHERE g.yrseason = ?
            ORDER BY tg.teamno, COALESCE(g.date, '9999-12-31'), COALESCE(g.starttime, ''), g.gameno
            """,
            (yrseason,),
        )
    )

    by_team: dict[str, dict[str, list[dict]]] = {t: {"past": [], "future": []} for t in teams_meta}
    for row in linked_games:
        game = dict(row)
        tid = str(game["teamno"])
        if tid not in by_team:
            continue

        raw = _parse_raw(game.get("raw_json"))
        home = game.get("home_teamno")
        away = game.get("away_teamno")

        is_home_value: bool | None
        if game.get("linked_is_home") in (0, 1):
            is_home_value = bool(game["linked_is_home"])
        elif tid == home:
            is_home_value = True
        elif tid == away:
            is_home_value = False
        else:
            is_home_value = None

        opp_teamno: str | None = None
        if tid == home:
            opp_teamno = away
        elif tid == away:
            opp_teamno = home
        else:
            raw_opp = raw.get("opponentteamno") or raw.get("opponentteam")
            if raw_opp not in (None, ""):
                opp_teamno = str(raw_opp)

        team_score: int | None = None
        opp_score: int | None = None
        if game.get("home_score") is not None and game.get("away_score") is not None and is_home_value is not None:
            if is_home_value:
                team_score = int(game["home_score"])
                opp_score = int(game["away_score"])
            else:
                team_score = int(game["away_score"])
                opp_score = int(game["home_score"])
        else:
            team_score = _safe_int(raw.get("teamscore"))
            opp_score = _safe_int(raw.get("opponentscore"))

        final_status = game.get("status")
        if team_score is not None and opp_score is not None:
            final_status = "final"

        divisionno = game.get("divisionno") or raw.get("divisionno") or teams_meta[tid].get("divisionno")
        division_name = (
            (division_meta_by_no.get(str(divisionno), {}).get("division_name") if divisionno else None)
            or raw.get("divisionname")
            or teams_meta[tid].get("division_name")
        )

        opponent_name = (
            (teams_meta.get(str(opp_teamno), {}).get("name") if opp_teamno else None)
            or raw.get("opponent")
            or (raw.get("homename") if is_home_value is False else raw.get("awayname"))
            or opp_teamno
            or "Unknown"
        )

        game_view = {
            "gameno": game["gameno"],
            "date": game["date"],
            "dow": game["dow"],
            "starttime": game["starttime"],
            "location": game["location"],
            "divisionno": str(divisionno) if divisionno not in (None, "") else None,
            "division_name": division_name,
            "home_teamno": home,
            "away_teamno": away,
            "home_score": game["home_score"],
            "away_score": game["away_score"],
            "team_score": team_score,
            "opponent_score": opp_score,
            "status": final_status,
            "is_home": is_home_value,
            "opponent_teamno": str(opp_teamno) if opp_teamno not in (None, "") else None,
            "opponent_name": opponent_name,
            "forfeit": str(raw.get("forfeitgame") or "").upper() == "YES",
            "venue": venue_by_game.get(game["gameno"]),
        }

        if team_score is not None and opp_score is not None:
            by_team[tid]["past"].append(game_view)
        else:
            by_team[tid]["future"].append(game_view)

    for tid, bins in by_team.items():
        bins["past"].sort(key=lambda x: (x.get("date") or "", x.get("starttime") or ""), reverse=True)
        bins["future"].sort(key=lambda x: (x.get("date") or "9999-12-31", x.get("starttime") or ""))

        snapshot = next((r for r in rows if r["teamno"] == tid), None)
        summary = {
            "wins": snapshot["wins"] if snapshot else 0,
            "losses": snapshot["losses"] if snapshot else 0,
            "ties": snapshot["ties"] if snapshot else 0,
            "pf": snapshot["pf"] if snapshot else 0,
            "pa": snapshot["pa"] if snapshot else 0,
            "diff": snapshot["diff"] if snapshot else 0,
            "sos": round(float(snapshot["sos"]), 3) if snapshot else 0.0,
            "sos_adj": round(float(snapshot.get("sos_adj") if snapshot.get("sos_adj") is not None else snapshot["sos"]), 3)
            if snapshot
            else 0.0,
            "power": round(float(snapshot["power"]), 3) if snapshot else 0.0,
            "rank": snapshot["rank"] if snapshot else None,
            "mw_rating": round(float(snapshot["mw_rating"]), 1) if snapshot and snapshot.get("mw_rating") is not None else None,
            "mw_points": int(snapshot["mw_points"]) if snapshot and snapshot.get("mw_points") is not None else None,
            "divisionno": snapshot["divisionno"] if snapshot else None,
            "division_name": snapshot["division_name"] if snapshot else None,
            "division_tag": snapshot.get("division_tag") if snapshot else None,
            "grade": int(snapshot["grade"]) if snapshot else None,
            "gender": snapshot["gender"] if snapshot else None,
            "games_played_total": len(bins["past"]),
            "games_scheduled_total": len(bins["future"]),
        }
        payload = {
            "yrseason": yrseason,
            "snapshot_date": snapshot_date,
            "teamno": tid,
            "team_name": teams_meta[tid]["name"],
            "town": canonical_town(teams_meta[tid]["town"]),
            "town_slug": town_slug(teams_meta[tid]["town"]),
            "class_of": class_of(yrseason, summary["grade"]) if summary["grade"] else None,
            "playoffs": playoff_results.get(tid, []),
            "summary": summary,
            "past_games": bins["past"],
            "future_games": bins["future"],
        }
        _write_json(out_dir / yrseason / f"team-{tid}.json", payload)

    return {
        "yrseason": yrseason,
        "label": season_label(yrseason),
        "snapshot_date": snapshot_date,
        "genders": available_genders,
        "grades": available_grades,
        "team_count": len(teams_meta),
        "gyms": gym_summaries,
        "groups": [
            {
                "gender": gender,
                "grade": grade,
                "divisions": len(div_map),
                "teams": sum(len(division_rows[d]) for d in div_map),
                "playoffs": (gender, grade) in playoff_groups_present,
            }
            for (gender, grade), div_map in sorted(divisions_by_group.items(), key=lambda kv: (kv[0][0] != "M", kv[0][1]))
        ],
    }


def _write_towns(conn, out_dir: Path) -> None:
    """towns.json (directory) and towns/{slug}.json (every season's teams for that town)."""
    rows = [
        dict(r)
        for r in conn.execute(
            """
            SELECT s.yrseason, s.teamno, s.gender, s.grade, s.rank, s.wins, s.losses, s.ties, s.power,
                   t.name, t.town_name, d.tag AS division_tag, d.divisiontier,
                   (SELECT COUNT(*) FROM snapshots x WHERE x.divisionno = s.divisionno) AS division_size
            FROM snapshots s
            JOIN teams t ON t.teamno = s.teamno
            JOIN divisions d ON d.divisionno = s.divisionno
            WHERE t.town_name IS NOT NULL
            """
        )
    ]
    playoff_by_team: dict[str, list[str]] = defaultdict(list)
    towns: dict[str, dict[str, Any]] = {}
    for r in rows:
        slug = town_slug(r["town_name"])
        town = towns.setdefault(slug, {"slug": slug, "names": defaultdict(int), "teams": []})
        town["names"][canonical_town(r["town_name"])] += 1
        town["teams"].append(
            {
                "yrseason": r["yrseason"],
                "teamno": r["teamno"],
                "name": r["name"],
                "gender": r["gender"],
                "grade": int(r["grade"]),
                "class_of": class_of(r["yrseason"], int(r["grade"])),
                "division_tag": r["division_tag"],
                "divisiontier": r["divisiontier"],
                "rank": r["rank"],
                "division_size": r["division_size"],
                "wins": r["wins"],
                "losses": r["losses"],
                "ties": r["ties"],
                "power": round(float(r["power"]), 1),
            }
        )

    # Playoff results per team, for town pages.
    for season in {r["yrseason"] for r in rows}:
        results, _ = _playoff_data(conn, season)
        for tno, items in results.items():
            playoff_by_team[tno] = [f"{i['result']} ({i['group_name']})" for i in items]

    directory = []
    towns_dir = out_dir / "towns"
    if towns_dir.exists():
        shutil.rmtree(towns_dir)
    for slug, town in sorted(towns.items()):
        name = max(town["names"].items(), key=lambda kv: kv[1])[0]
        teams = sorted(
            town["teams"], key=lambda t: (-int(t["yrseason"]), t["gender"] != "M", t["grade"], int(t["divisiontier"] or 99), t["name"])
        )
        for t in teams:
            t["playoffs"] = playoff_by_team.get(t["teamno"], [])
        seasons = sorted({t["yrseason"] for t in teams}, reverse=True)
        _write_json(towns_dir / f"{slug}.json", {"slug": slug, "name": name, "seasons": seasons, "teams": teams})
        latest = seasons[0]
        directory.append(
            {
                "slug": slug,
                "name": name,
                "seasons": len(seasons),
                "latest_season": latest,
                "latest_teams": sum(1 for t in teams if t["yrseason"] == latest),
            }
        )
    _write_json(out_dir / "towns.json", {"towns": directory})


def build_json(db_path: Path, out_dir: Path, yrseason: str | None = None, ranking_profile: str | None = None) -> None:
    """Rebuild the site's data folder from the database: every season, or just `yrseason`."""
    conn = connect_db(db_path)
    init_db(conn)
    seasons = [dict(r) for r in list_seasons(conn)]
    targets = [s for s in seasons if yrseason in (None, "auto", s["yrseason"])]

    ensure_dir(out_dir)
    entries: list[dict[str, Any]] = []
    for season in targets:
        season_dir = out_dir / season["yrseason"]
        # The folder is fully generated; clear it so teams/divisions that disappeared don't linger.
        if season_dir.exists():
            shutil.rmtree(season_dir)
        entry = _build_season(conn, out_dir, season["yrseason"], is_current=bool(season.get("is_current")))
        if entry is None:
            continue
        entry["status"] = season.get("status") or "in_progress"
        entry["is_current"] = bool(season.get("is_current"))
        entries.append(entry)
    _write_towns(conn, out_dir)
    conn.close()

    # Gym directory across seasons (season entries carry their gym list until here).
    gym_summaries = [g for e in entries for g in e.pop("gyms", [])]
    if yrseason in (None, "auto"):
        write_gyms_index(out_dir, gym_summaries, _write_json)

    if yrseason not in (None, "auto"):
        # Partial rebuild: keep the other seasons already listed in index.json.
        index_path = out_dir / "index.json"
        if index_path.exists():
            existing = json.loads(index_path.read_text(encoding="utf-8")).get("seasons", [])
            entries += [e for e in existing if e["yrseason"] != yrseason]

    entries.sort(key=lambda e: e["yrseason"], reverse=True)
    current = next((e for e in entries if e.get("is_current")), entries[0] if entries else None)

    _write_json(
        out_dir / "index.json",
        {
            "generated_at": max((e["snapshot_date"] for e in entries), default=None),
            "ranking_profile": ranking_profile or RANKING_CONFIG.profile,
            "current": current["yrseason"] if current else None,
            "default": {
                "yrseason": current["yrseason"] if current else None,
                "gender": "M",
                "grade": 6,
            },
            "seasons": entries,
        },
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build frontend JSON from SQLite")
    parser.add_argument("--db-path", default=str(SCRAPE_CONFIG.db_path))
    parser.add_argument("--out", default="frontend/public/data")
    parser.add_argument("--yrseason", default=None, help="Only rebuild this season (default: all seasons)")
    parser.add_argument("--ranking-profile", choices=("classic", "division-aware"), default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_json(Path(args.db_path), Path(args.out), args.yrseason, ranking_profile=args.ranking_profile)


if __name__ == "__main__":
    main()
