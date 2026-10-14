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
