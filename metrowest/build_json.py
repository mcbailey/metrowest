from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from .config import SCRAPE_CONFIG
from .db import connect_db, latest_snapshot_date
from .util import ensure_dir


def _write_json(path: Path, payload: object) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


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


def _snapshot_rows(conn, yrseason: str, snapshot_date: str):
    return list(
        conn.execute(
            """
            SELECT s.snapshot_date, s.yrseason, s.grade, s.gender, s.divisionno, s.teamno,
                   s.wins, s.losses, s.ties, s.pf, s.pa, s.diff, s.sos, s.power, s.rank,
                   t.name AS team_name, t.town AS town,
                   d.name AS division_name, d.divisiontier
            FROM snapshots s
            JOIN teams t ON t.teamno = s.teamno
            JOIN divisions d ON d.divisionno = s.divisionno
            WHERE s.yrseason = ? AND s.snapshot_date = ?
            ORDER BY s.gender, s.grade, d.name, s.rank
            """,
            (yrseason, snapshot_date),
        )
    )


def build_json(db_path: Path, out_dir: Path, yrseason: str) -> None:
    conn = connect_db(db_path)
    snapshot_date = latest_snapshot_date(conn, yrseason)
    if not snapshot_date:
        _write_json(
            out_dir / "index.json",
            {
                "generated_at": None,
                "default": {"yrseason": yrseason, "gender": "M", "grade": 3},
                "seasons": [
                    {
                        "yrseason": yrseason,
                        "label": f"Season {yrseason}",
                        "genders": ["M", "F"],
                        "grades": [3, 4, 5, 6, 7, 8],
                    }
                ],
            },
        )
        conn.close()
        return

    rows = [dict(r) for r in _snapshot_rows(conn, yrseason, snapshot_date)]

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
            }

        division_meta_by_no[dno] = {
            "division_name": r["division_name"],
            "divisiontier": r.get("divisiontier"),
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
                "power": round(float(r["power"]), 3),
                "rank": r["rank"],
            }
        )

    available_genders = sorted({r["gender"] for r in rows})
    available_grades = sorted({int(r["grade"]) for r in rows})
    default_gender = rows[0]["gender"] if rows else "M"
    default_grade = int(rows[0]["grade"]) if rows else 3

    index_payload = {
        "generated_at": snapshot_date,
        "default": {"yrseason": yrseason, "gender": default_gender, "grade": default_grade},
        "seasons": [
            {
                "yrseason": yrseason,
                "label": f"Season {yrseason}",
                "genders": available_genders,
                "grades": available_grades,
            }
        ],
    }
    _write_json(out_dir / "index.json", index_payload)

    for (gender, grade), div_map in divisions_by_group.items():
        divisions_payload = {
            "yrseason": yrseason,
            "gender": gender,
            "grade": grade,
            "snapshot_date": snapshot_date,
            "divisions": sorted(div_map.values(), key=lambda d: (d.get("divisiontier") or "", d["name"], d["divisionno"])),
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
            "rankings": teams,
        }
        _write_json(out_dir / yrseason / meta_row["gender"] / str(meta_row["grade"]) / f"division-{dno}.json", payload)

        csv_path = out_dir / yrseason / meta_row["gender"] / str(meta_row["grade"]) / f"division-{dno}.csv"
        ensure_dir(csv_path.parent)
        csv_lines = ["rank,teamno,name,wins,losses,ties,pf,pa,diff,sos,power"]
        for t in teams:
            csv_lines.append(
                f"{t['rank']},{t['teamno']},\"{t['name']}\",{t['wins']},{t['losses']},{t['ties']},{t['pf']},{t['pa']},{t['diff']},{t['sos']},{t['power']}"
            )
        csv_path.write_text("\n".join(csv_lines) + "\n", encoding="utf-8")

    teams_meta = {
        r["teamno"]: {
            "name": r["team_name"],
            "town": r["town"],
            "divisionno": r["divisionno"],
            "division_name": r["division_name"],
            "divisiontier": r.get("divisiontier"),
        }
        for r in rows
    }

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
            "power": round(float(snapshot["power"]), 3) if snapshot else 0.0,
            "rank": snapshot["rank"] if snapshot else None,
            "divisionno": snapshot["divisionno"] if snapshot else None,
            "division_name": snapshot["division_name"] if snapshot else None,
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
            "town": teams_meta[tid]["town"],
            "summary": summary,
            "past_games": bins["past"],
            "future_games": bins["future"],
        }
        _write_json(out_dir / yrseason / f"team-{tid}.json", payload)

    conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build frontend JSON from SQLite")
    parser.add_argument("--db-path", default=str(SCRAPE_CONFIG.db_path))
    parser.add_argument("--out", default="frontend/public/data")
    parser.add_argument("--yrseason", default=SCRAPE_CONFIG.default_yrseason)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_json(Path(args.db_path), Path(args.out), args.yrseason)


if __name__ == "__main__":
    main()
