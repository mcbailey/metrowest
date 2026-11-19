import unittest

from metrowest.scrape import _normalize_game


class ScrapeNormalizeGameTests(unittest.TestCase):
    def test_homeaway_away_overrides_team_first_home_away_fields(self):
        row = {
            "gamedate": "2026-02-07",
            "homeaway": "Away",
            "teamscore": "69",
            "opponentscore": "50",
            "hometeam": "45214",
            "awayteam": "46963",
            "opponent": "Cranston (RI D1)",
        }

        game = _normalize_game("2026", "7166", "45214", "7166", row)

        self.assertEqual(game["home_teamno"], "46963")
        self.assertEqual(game["away_teamno"], "45214")
        self.assertEqual(game["home_score"], 50)
        self.assertEqual(game["away_score"], 69)
        self.assertEqual(game["status"], "final")

    def test_compound_scorehome_pair_is_parsed_when_team_scores_missing(self):
        row = {
            "gamedate": "2026-02-01",
            "homeaway": "Away",
            "scorehome": "56,27",
            "hometeam": "45214",
            "awayteam": "46948",
            "opponent": "North Kingstown (RI D1)",
        }

        game = _normalize_game("2026", "7166", "45214", "7166", row)

        self.assertEqual(game["home_teamno"], "46948")
        self.assertEqual(game["away_teamno"], "45214")
        self.assertEqual(game["home_score"], 27)
        self.assertEqual(game["away_score"], 56)
        self.assertEqual(game["status"], "final")

    def test_forfeit_uses_official_result_from_either_teams_row(self):
        base = {
            "gameno": "373929",
            "gamedate": "2025-12-20",
            "hometeam": "45490",
            "awayteam": "43945",
            "scorehome": "20,0",
            "officialscore": "2,F",
            "forfeitgame": "YES",
        }
        home_row = {**base, "homeaway": "Home", "teamscore": "2", "opponentscore": "F", "wonlost": "W"}
        away_row = {**base, "homeaway": "Away", "teamscore": "F", "opponentscore": "2", "wonlost": "L"}

        for teamno, row in (("45490", home_row), ("43945", away_row)):
            game = _normalize_game("2026", "7000", teamno, "7000", row)
            self.assertEqual((game["home_score"], game["away_score"]), (2, 0))
            self.assertEqual(game["status"], "final")

    def test_double_forfeit_is_unscored(self):
        row = {
            "gameno": "1",
            "gamedate": "2026-01-10",
            "hometeam": "1",
            "awayteam": "2",
            "homeaway": "Home",
            "teamscore": "F",
            "opponentscore": "F",
            "officialscore": "F,F",
            "forfeitgame": "YES",
            "wonlost": "L",
        }
        for teamno, homeaway in (("1", "Home"), ("2", "Away")):
            game = _normalize_game("2026", "7000", teamno, "7000", {**row, "homeaway": homeaway})
            self.assertEqual(game["status"], "scheduled")


if __name__ == "__main__":
    unittest.main()


class PruneUnseenGamesTests(unittest.TestCase):
    def setUp(self):
        import sqlite3

        from metrowest.db import init_db, upsert_game, upsert_team_game

        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        init_db(self.conn)

        def add(gameno, home, away, scores=(None, None)):
            upsert_game(self.conn, {
                "gameno": gameno, "yrseason": "2027", "date": "2027-01-10", "divisionno": "1",
                "home_teamno": home, "away_teamno": away, "home_score": scores[0], "away_score": scores[1],
                "status": "final" if scores[0] is not None else "scheduled",
            })
            upsert_team_game(self.conn, home, gameno, 1)
            upsert_team_game(self.conn, away, gameno, 0)

        add("new", "A", "B")
        add("old", "A", "C")  # replaced upstream by "new"
        add("played", "A", "D", (40, 30))  # gone upstream but already scored
        add("other", "E", "F")  # neither team confirmed this run

    def gamenos(self):
        return {r[0] for r in self.conn.execute("SELECT gameno FROM games")}

    def test_removes_only_unscored_games_missing_from_a_confirmed_schedule(self):
        from metrowest.db import prune_unseen_games

        removed = prune_unseen_games(self.conn, "2027", {"A", "B"}, {"new"})

        self.assertEqual(removed, 1)
        self.assertEqual(self.gamenos(), {"new", "played", "other"})
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM team_games WHERE gameno='old'").fetchone()[0], 0)

    def test_nothing_confirmed_removes_nothing(self):
        from metrowest.db import prune_unseen_games

        self.assertEqual(prune_unseen_games(self.conn, "2027", set(), set()), 0)
        self.assertEqual(len(self.gamenos()), 4)
