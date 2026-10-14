import unittest

from metrowest.config import RANKING_CONFIG
from metrowest.ranking import compute_pool_rankings


def g(h, a, hs, as_, forfeit=False, date="2026-01-10"):
    return {"home_teamno": h, "away_teamno": a, "home_score": hs, "away_score": as_, "date": date,
            "forfeit": forfeit, "raw_json": '{"forfeitgame":"YES"}' if forfeit else "{}"}


class PoolRankingTests(unittest.TestCase):
    def teams(self, spec):
        return [{"teamno": t, "divisiontier": tier, "name": t} for t, tier in spec]

    def test_stronger_results_rank_higher_and_pool_is_centered(self):
        teams = self.teams([("A", "1"), ("B", "1"), ("C", "1")])
        games = [g("A", "B", 40, 30), g("B", "C", 35, 30), g("A", "C", 45, 25)]
        out = {r["teamno"]: r for r in compute_pool_rankings(teams, games, RANKING_CONFIG)}
        self.assertGreater(out["A"]["power"], out["B"]["power"])
        self.assertGreater(out["B"]["power"], out["C"]["power"])
        mean = sum(r["power"] for r in out.values()) / 3
        self.assertAlmostEqual(mean, RANKING_CONFIG.pool_power_center, places=6)

    def test_higher_division_sits_higher_without_cross_games(self):
        teams = self.teams([("A", "1"), ("B", "1"), ("C", "2"), ("D", "2")])
        games = [g("A", "B", 30, 28), g("C", "D", 30, 28)]
        out = {r["teamno"]: r["power"] for r in compute_pool_rankings(teams, games, RANKING_CONFIG)}
        self.assertGreater(min(out["A"], out["B"]), max(out["C"], out["D"]))

    def test_cross_division_results_move_both_divisions(self):
        teams = self.teams([("A", "1"), ("B", "1"), ("C", "2"), ("D", "2")])
        base = [g("A", "B", 30, 28), g("C", "D", 30, 28)]
        upsets = base + [g("C", "A", 50, 30, date=f"2026-01-{d}") for d in range(11, 18)]
        before = {r["teamno"]: r["power"] for r in compute_pool_rankings(teams, base, RANKING_CONFIG)}
        after = {r["teamno"]: r["power"] for r in compute_pool_rankings(teams, upsets, RANKING_CONFIG)}
        self.assertGreater(after["C"] - after["A"], before["C"] - before["A"])

    def test_forfeits_count_in_record_but_not_rating(self):
        teams = self.teams([("A", "1"), ("B", "1")])
        out = {r["teamno"]: r for r in compute_pool_rankings(teams, [g("A", "B", 2, 0, forfeit=True)], RANKING_CONFIG)}
        self.assertEqual((out["A"]["wins"], out["B"]["losses"]), (1, 1))
        self.assertAlmostEqual(out["A"]["power"], out["B"]["power"], places=6)

    def test_margin_is_capped(self):
        teams = self.teams([("A", "1"), ("B", "1"), ("C", "1"), ("D", "1")])
        capped = compute_pool_rankings(teams, [g("A", "B", 25, 0), g("C", "D", 80, 0)], RANKING_CONFIG)
        out = {r["teamno"]: r["power"] for r in capped}
        self.assertAlmostEqual(out["A"], out["C"], places=6)


if __name__ == "__main__":
    unittest.main()
