from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


def connect_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS seasons(
          season_id TEXT PRIMARY KEY,
          yrseason TEXT NOT NULL,
          label TEXT,
          is_current INT NOT NULL DEFAULT 0,
          discovered_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS divisions(
          divisionno TEXT PRIMARY KEY,
          yrseason TEXT NOT NULL,
          grade INT NOT NULL,
          gender TEXT NOT NULL,
          divisiontier TEXT,
          name TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_divisions_yr_g_g ON divisions(yrseason, gender, grade);

        CREATE TABLE IF NOT EXISTS teams(
          teamno TEXT PRIMARY KEY,
          yrseason TEXT NOT NULL,
          grade INT NOT NULL,
          gender TEXT NOT NULL,
          divisionno TEXT NOT NULL,
          town TEXT,
          name TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(divisionno) REFERENCES divisions(divisionno)
        );
        CREATE INDEX IF NOT EXISTS idx_teams_divisionno ON teams(divisionno);
        CREATE INDEX IF NOT EXISTS idx_teams_yr_g_g ON teams(yrseason, gender, grade);

        CREATE TABLE IF NOT EXISTS games(
          gameno TEXT PRIMARY KEY,
          yrseason TEXT NOT NULL,
          date TEXT,
          dow TEXT,
          starttime TEXT,
          location TEXT,
          divisionno TEXT,
          home_teamno TEXT,
          away_teamno TEXT,
          home_score INT,
          away_score INT,
          status TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          raw_json TEXT,
          FOREIGN KEY(divisionno) REFERENCES divisions(divisionno)
        );
        CREATE INDEX IF NOT EXISTS idx_games_divisionno ON games(divisionno);
        CREATE INDEX IF NOT EXISTS idx_games_teams ON games(home_teamno, away_teamno);
        CREATE INDEX IF NOT EXISTS idx_games_yrseason ON games(yrseason);

        CREATE TABLE IF NOT EXISTS team_games(
          teamno TEXT NOT NULL,
          gameno TEXT NOT NULL,
          is_home INT,
          PRIMARY KEY(teamno, gameno),
          FOREIGN KEY(teamno) REFERENCES teams(teamno),
          FOREIGN KEY(gameno) REFERENCES games(gameno)
        );
        CREATE INDEX IF NOT EXISTS idx_team_games_game ON team_games(gameno);

        CREATE TABLE IF NOT EXISTS snapshots(
          snapshot_date TEXT NOT NULL,
          yrseason TEXT NOT NULL,
          grade INT NOT NULL,
          gender TEXT NOT NULL,
          divisionno TEXT NOT NULL,
          teamno TEXT NOT NULL,
          wins INT NOT NULL,
          losses INT NOT NULL,
          ties INT NOT NULL,
          pf INT NOT NULL,
          pa INT NOT NULL,
          diff INT NOT NULL,
          sos REAL NOT NULL,
          sos_adj REAL NOT NULL DEFAULT 0,
          power REAL NOT NULL,
          rank INT NOT NULL,
          mw_rating REAL,
          mw_points INT,
          PRIMARY KEY(snapshot_date, teamno, divisionno)
        );
        CREATE INDEX IF NOT EXISTS idx_snapshots_division ON snapshots(snapshot_date, yrseason, gender, grade, divisionno);
        """
    )

    snapshot_cols = {row["name"] for row in conn.execute("PRAGMA table_info(snapshots)")}
    if "mw_rating" not in snapshot_cols:
        conn.execute("ALTER TABLE snapshots ADD COLUMN mw_rating REAL")
    if "mw_points" not in snapshot_cols:
        conn.execute("ALTER TABLE snapshots ADD COLUMN mw_points INT")
    if "sos_adj" not in snapshot_cols:
        conn.execute("ALTER TABLE snapshots ADD COLUMN sos_adj REAL NOT NULL DEFAULT 0")

    conn.commit()


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def upsert_season(conn: sqlite3.Connection, yrseason: str, label: str, is_current: bool) -> None:
    conn.execute(
        """
        INSERT INTO seasons(season_id, yrseason, label, is_current, discovered_at)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(season_id) DO UPDATE SET
          label=excluded.label,
          is_current=excluded.is_current,
          discovered_at=excluded.discovered_at
        """,
        (yrseason, yrseason, label, int(is_current), now_iso()),
    )


def upsert_division(
    conn: sqlite3.Connection,
    divisionno: str,
    yrseason: str,
    grade: int,
    gender: str,
    divisiontier: str | None,
    name: str,
) -> None:
    conn.execute(
        """
        INSERT INTO divisions(divisionno, yrseason, grade, gender, divisiontier, name, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(divisionno) DO UPDATE SET
          yrseason=excluded.yrseason,
          grade=excluded.grade,
          gender=excluded.gender,
          divisiontier=excluded.divisiontier,
          name=excluded.name,
          updated_at=excluded.updated_at
        """,
        (divisionno, yrseason, grade, gender, divisiontier, name, now_iso()),
    )


def upsert_team(
    conn: sqlite3.Connection,
    teamno: str,
    yrseason: str,
    grade: int,
    gender: str,
    divisionno: str,
    town: str | None,
    name: str,
) -> None:
    conn.execute(
        """
        INSERT INTO teams(teamno, yrseason, grade, gender, divisionno, town, name, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(teamno) DO UPDATE SET
          yrseason=excluded.yrseason,
          grade=excluded.grade,
          gender=excluded.gender,
          divisionno=excluded.divisionno,
          town=excluded.town,
          name=excluded.name,
          updated_at=excluded.updated_at
        """,
        (teamno, yrseason, grade, gender, divisionno, town, name, now_iso()),
    )


def upsert_game(conn: sqlite3.Connection, game: dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO games(
          gameno, yrseason, date, dow, starttime, location, divisionno,
          home_teamno, away_teamno, home_score, away_score,
          status, last_seen_at, raw_json
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gameno) DO UPDATE SET
          yrseason=excluded.yrseason,
          date=excluded.date,
          dow=excluded.dow,
          starttime=excluded.starttime,
          location=excluded.location,
          divisionno=COALESCE(excluded.divisionno, games.divisionno),
          home_teamno=COALESCE(excluded.home_teamno, games.home_teamno),
          away_teamno=COALESCE(excluded.away_teamno, games.away_teamno),
          home_score=excluded.home_score,
          away_score=excluded.away_score,
          status=excluded.status,
          last_seen_at=excluded.last_seen_at,
          raw_json=excluded.raw_json
        """,
        (
            game["gameno"],
            game["yrseason"],
            game.get("date"),
            game.get("dow"),
            game.get("starttime"),
            game.get("location"),
            game.get("divisionno"),
            game.get("home_teamno"),
            game.get("away_teamno"),
            game.get("home_score"),
            game.get("away_score"),
            game["status"],
            now_iso(),
            game.get("raw_json"),
        ),
    )


def upsert_team_game(conn: sqlite3.Connection, teamno: str, gameno: str, is_home: int | None) -> None:
    conn.execute(
        """
        INSERT INTO team_games(teamno, gameno, is_home)
        VALUES(?, ?, ?)
        ON CONFLICT(teamno, gameno) DO UPDATE SET
          is_home=excluded.is_home
        """,
        (teamno, gameno, is_home),
    )


def get_divisions(conn: sqlite3.Connection, yrseason: str) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            """
            SELECT divisionno, yrseason, grade, gender, divisiontier, name
            FROM divisions
            WHERE yrseason = ?
            ORDER BY gender, grade, name
            """,
            (yrseason,),
        )
    )


def get_teams_for_division(conn: sqlite3.Connection, divisionno: str) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            """
            SELECT t.teamno, t.yrseason, t.grade, t.gender, t.divisionno, t.town, t.name, d.divisiontier
            FROM teams t
            JOIN divisions d ON d.divisionno = t.divisionno
            WHERE t.divisionno = ?
            ORDER BY t.name
            """,
            (divisionno,),
        )
    )


def get_games_for_division(conn: sqlite3.Connection, divisionno: str) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            """
            SELECT gameno, yrseason, date, dow, starttime, location, divisionno,
                   home_teamno, away_teamno, home_score, away_score, status, raw_json
            FROM games
            WHERE divisionno = ?
            ORDER BY COALESCE(date, '9999-12-31'), COALESCE(starttime, ''), gameno
            """,
            (divisionno,),
        )
    )


def get_games_for_teams(conn: sqlite3.Connection, teamnos: list[str], yrseason: str) -> list[sqlite3.Row]:
    if not teamnos:
        return []
    placeholders = ",".join("?" for _ in teamnos)
    params: list[Any] = [yrseason, *teamnos]
    return list(
        conn.execute(
            f"""
            SELECT DISTINCT g.gameno, g.yrseason, g.date, g.dow, g.starttime, g.location, g.divisionno,
                            g.home_teamno, g.away_teamno, g.home_score, g.away_score, g.status, g.raw_json
            FROM games g
            JOIN team_games tg ON tg.gameno = g.gameno
            WHERE g.yrseason = ?
              AND tg.teamno IN ({placeholders})
            ORDER BY COALESCE(g.date, '9999-12-31'), COALESCE(g.starttime, ''), g.gameno
            """,
            params,
        )
    )


def replace_snapshots(conn: sqlite3.Connection, snapshot_date: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    yrseason = rows[0]["yrseason"]
    conn.execute("DELETE FROM snapshots WHERE snapshot_date = ? AND yrseason = ?", (snapshot_date, yrseason))
    conn.executemany(
        """
        INSERT INTO snapshots(
          snapshot_date, yrseason, grade, gender, divisionno, teamno,
          wins, losses, ties, pf, pa, diff, sos, sos_adj, power, rank, mw_rating, mw_points
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                snapshot_date,
                r["yrseason"],
                r["grade"],
                r["gender"],
                r["divisionno"],
                r["teamno"],
                r["wins"],
                r["losses"],
                r["ties"],
                r["pf"],
                r["pa"],
                r["diff"],
                r["sos"],
                r.get("sos_adj", r["sos"]),
                r["power"],
                r["rank"],
                r.get("mw_rating"),
                r.get("mw_points"),
            )
            for r in rows
        ],
    )


def latest_snapshot_date(conn: sqlite3.Connection, yrseason: str) -> str | None:
    row = conn.execute(
        "SELECT MAX(snapshot_date) AS snapshot_date FROM snapshots WHERE yrseason = ?",
        (yrseason,),
    ).fetchone()
    return row["snapshot_date"] if row and row["snapshot_date"] else None
