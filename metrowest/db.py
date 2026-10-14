from __future__ import annotations

import sqlite3
import hashlib
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

        CREATE TABLE IF NOT EXISTS playoff_groups(
          groupno TEXT PRIMARY KEY,
          yrseason TEXT NOT NULL,
          grade INT NOT NULL,
          gender TEXT NOT NULL,
          name TEXT NOT NULL,
          numteams INT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_playoff_groups_season ON playoff_groups(yrseason, gender, grade);

        CREATE TABLE IF NOT EXISTS playoff_games(
          tournamentgameno TEXT PRIMARY KEY,
          groupno TEXT NOT NULL,
          round INT NOT NULL,
          game INT NOT NULL,
          round_label TEXT,
          when_text TEXT,
          venue TEXT,
          team1_teamno TEXT,
          team1_name TEXT,
          team1_seed INT,
          team1_score INT,
          team1_source_game INT,
          team2_teamno TEXT,
          team2_name TEXT,
          team2_seed INT,
          team2_score INT,
          team2_source_game INT,
          winner_teamno TEXT,
          FOREIGN KEY(groupno) REFERENCES playoff_groups(groupno)
        );
        CREATE INDEX IF NOT EXISTS idx_playoff_games_group ON playoff_games(groupno);
        """
    )

    snapshot_cols = {row["name"] for row in conn.execute("PRAGMA table_info(snapshots)")}
    if "mw_rating" not in snapshot_cols:
        conn.execute("ALTER TABLE snapshots ADD COLUMN mw_rating REAL")
    if "mw_points" not in snapshot_cols:
        conn.execute("ALTER TABLE snapshots ADD COLUMN mw_points INT")
    if "sos_adj" not in snapshot_cols:
        conn.execute("ALTER TABLE snapshots ADD COLUMN sos_adj REAL NOT NULL DEFAULT 0")

    _add_missing_columns(conn, "divisions", {"code": "TEXT", "tag": "TEXT"})
    # League rating/points from the standings feed, kept so rankings can be recomputed without re-scraping.
    _add_missing_columns(conn, "teams", {"mw_rating": "REAL", "mw_points": "INT"})
    # The league's town for the team. Town numbers change every season, so towns are matched across seasons by name.
    _add_missing_columns(conn, "teams", {"townno": "TEXT", "town_name": "TEXT"})
    # status: in_progress | final. as_of: date of the latest scored game. data_hash: fingerprint of the
    # season's games, so unchanged scrapes don't rewrite rankings or output files.
    _add_missing_columns(conn, "seasons", {"status": "TEXT", "as_of": "TEXT", "data_hash": "TEXT", "updated_at": "TEXT"})

    conn.commit()


def _add_missing_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, decl in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def upsert_season(conn: sqlite3.Connection, yrseason: str, label: str, is_current: bool) -> None:
    if is_current:
        conn.execute("UPDATE seasons SET is_current = 0 WHERE season_id <> ?", (yrseason,))
    conn.execute(
        """
        INSERT INTO seasons(season_id, yrseason, label, is_current, discovered_at)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(season_id) DO UPDATE SET
          label=excluded.label,
          is_current=MAX(seasons.is_current, excluded.is_current)
        """,
        (yrseason, yrseason, label, int(is_current), now_iso()),
    )


def get_season(conn: sqlite3.Connection, yrseason: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM seasons WHERE season_id = ?", (yrseason,)).fetchone()


def list_seasons(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(conn.execute("SELECT * FROM seasons ORDER BY yrseason DESC"))


def update_season_state(conn: sqlite3.Connection, yrseason: str, *, status: str, as_of: str | None, data_hash: str) -> None:
    conn.execute(
        "UPDATE seasons SET status = ?, as_of = ?, data_hash = ?, updated_at = ? WHERE season_id = ?",
        (status, as_of, data_hash, now_iso(), yrseason),
    )


def season_game_dates(conn: sqlite3.Connection, yrseason: str) -> tuple[str | None, str | None]:
    """(date of the latest scored game, date of the earliest unscored game)."""
    row = conn.execute(
        """
        SELECT MAX(CASE WHEN status = 'final' THEN date END) AS last_final,
               MIN(CASE WHEN status <> 'final' THEN date END) AS next_scheduled
        FROM games WHERE yrseason = ?
        """,
        (yrseason,),
    ).fetchone()
    return row["last_final"], row["next_scheduled"]


def season_fingerprint(conn: sqlite3.Connection, yrseason: str) -> str:
    """Hash of everything that affects rankings or output for a season."""
    digest = hashlib.sha256()
    queries = [
        ("SELECT divisionno, grade, gender, divisiontier, name, code FROM divisions WHERE yrseason = ? ORDER BY divisionno", (yrseason,)),
        ("SELECT teamno, divisionno, town, name, mw_rating, mw_points, townno, town_name FROM teams WHERE yrseason = ? ORDER BY teamno", (yrseason,)),
        (
            """SELECT gameno, date, starttime, location, divisionno, home_teamno, away_teamno, home_score, away_score, status
               FROM games WHERE yrseason = ? ORDER BY gameno""",
            (yrseason,),
        ),
        (
            """SELECT tg.teamno, tg.gameno, tg.is_home FROM team_games tg JOIN teams t ON t.teamno = tg.teamno
               WHERE t.yrseason = ? ORDER BY tg.teamno, tg.gameno""",
            (yrseason,),
        ),
        (
            """SELECT g.groupno, g.name, g.numteams, p.tournamentgameno, p.round, p.game, p.when_text, p.team1_teamno,
                      p.team1_score, p.team2_teamno, p.team2_score, p.winner_teamno
               FROM playoff_groups g LEFT JOIN playoff_games p ON p.groupno = g.groupno
               WHERE g.yrseason = ? ORDER BY g.groupno, p.tournamentgameno""",
            (yrseason,),
        ),
    ]
    for sql, params in queries:
        for row in conn.execute(sql, params):
            digest.update(repr(tuple(row)).encode("utf-8"))
    return digest.hexdigest()


def upsert_division(
    conn: sqlite3.Connection,
    divisionno: str,
    yrseason: str,
    grade: int,
    gender: str,
    divisiontier: str | None,
    name: str,
    code: str | None = None,
    tag: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO divisions(divisionno, yrseason, grade, gender, divisiontier, name, code, tag, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(divisionno) DO UPDATE SET
          yrseason=excluded.yrseason,
          grade=excluded.grade,
          gender=excluded.gender,
          divisiontier=excluded.divisiontier,
          name=excluded.name,
          code=COALESCE(excluded.code, divisions.code),
          tag=COALESCE(excluded.tag, divisions.tag),
          updated_at=excluded.updated_at
        """,
        (divisionno, yrseason, grade, gender, divisiontier, name, code, tag, now_iso()),
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
    mw_rating: float | None = None,
    mw_points: int | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO teams(teamno, yrseason, grade, gender, divisionno, town, name, mw_rating, mw_points, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(teamno) DO UPDATE SET
          yrseason=excluded.yrseason,
          grade=excluded.grade,
          gender=excluded.gender,
          divisionno=excluded.divisionno,
          town=excluded.town,
          name=excluded.name,
          mw_rating=excluded.mw_rating,
          mw_points=excluded.mw_points,
          updated_at=excluded.updated_at
        """,
        (teamno, yrseason, grade, gender, divisionno, town, name, mw_rating, mw_points, now_iso()),
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
            SELECT divisionno, yrseason, grade, gender, divisiontier, name, code, tag
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
            SELECT t.teamno, t.yrseason, t.grade, t.gender, t.divisionno, t.town, t.name,
                   t.mw_rating, t.mw_points, d.divisiontier
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
    """Replace the season's rankings. Only the latest snapshot per season is kept."""
    if not rows:
        return
    yrseason = rows[0]["yrseason"]
    conn.execute("DELETE FROM snapshots WHERE yrseason = ?", (yrseason,))
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


def set_team_towns(conn: sqlite3.Connection, towns: dict[str, tuple[str, str]]) -> None:
    """towns: teamno -> (townno, town_name)."""
    conn.executemany(
        "UPDATE teams SET townno = ?, town_name = ? WHERE teamno = ?",
        [(townno, name, teamno) for teamno, (townno, name) in towns.items()],
    )


def replace_playoffs(conn: sqlite3.Connection, yrseason: str, groups: list[dict[str, Any]], games: list[dict[str, Any]]) -> None:
    """Replace a season's playoff groups and bracket games."""
    conn.execute(
        "DELETE FROM playoff_games WHERE groupno IN (SELECT groupno FROM playoff_groups WHERE yrseason = ?)", (yrseason,)
    )
    conn.execute("DELETE FROM playoff_groups WHERE yrseason = ?", (yrseason,))
    stamp = now_iso()
    conn.executemany(
        """INSERT INTO playoff_groups(groupno, yrseason, grade, gender, name, numteams, updated_at)
           VALUES(:groupno, :yrseason, :grade, :gender, :name, :numteams, :updated_at)""",
        [{**g, "yrseason": yrseason, "updated_at": stamp} for g in groups],
    )
    conn.executemany(
        """INSERT OR REPLACE INTO playoff_games(
             tournamentgameno, groupno, round, game, round_label, when_text, venue,
             team1_teamno, team1_name, team1_seed, team1_score, team1_source_game,
             team2_teamno, team2_name, team2_seed, team2_score, team2_source_game, winner_teamno)
           VALUES(:tournamentgameno, :groupno, :round, :game, :round_label, :when_text, :venue,
             :team1_teamno, :team1_name, :team1_seed, :team1_score, :team1_source_game,
             :team2_teamno, :team2_name, :team2_seed, :team2_score, :team2_source_game, :winner_teamno)""",
        games,
    )
