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


if __name__ == "__main__":
    unittest.main()
