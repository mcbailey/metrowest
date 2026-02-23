import unittest

from metrowest.config import RankingConfig
from metrowest.ranking import compute_division_rankings


class RankingTests(unittest.TestCase):
    def test_ranking_includes_sos_component(self):
        teams = [
            {"teamno": "A", "name": "Team A", "town": None},
            {"teamno": "B", "name": "Team B", "town": None},
            {"teamno": "C", "name": "Team C", "town": None},
        ]
        games = [
            {"home_teamno": "A", "away_teamno": "B", "home_score": 40, "away_score": 20},
            {"home_teamno": "B", "away_teamno": "C", "home_score": 35, "away_score": 30},
        ]
        ranked = compute_division_rankings(teams, games, RankingConfig())
        self.assertTrue(any(abs(row["power"] - row["elo"]) > 0.001 for row in ranked))

    def test_ties_are_counted(self):
        teams = [
            {"teamno": "A", "name": "Team A", "town": None},
            {"teamno": "B", "name": "Team B", "town": None},
        ]
        games = [{"home_teamno": "A", "away_teamno": "B", "home_score": 30, "away_score": 30}]
        ranked = compute_division_rankings(teams, games, RankingConfig())
        a = next(r for r in ranked if r["teamno"] == "A")
        b = next(r for r in ranked if r["teamno"] == "B")
        self.assertEqual(a["ties"], 1)
        self.assertEqual(b["ties"], 1)


if __name__ == "__main__":
    unittest.main()
