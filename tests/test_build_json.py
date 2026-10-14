import sqlite3
import unittest

from metrowest.build_json import _playoff_data
from metrowest.db import init_db, replace_playoffs
from metrowest.scrape import _bracket_name
from metrowest.util import canonical_town, class_of, slugify, town_slug


def _game(no, rnd, t1, t2, winner, s1=None, s2=None):
    return {
        "tournamentgameno": str(no), "groupno": "G1", "round": rnd, "game": no, "round_label": None,
        "when_text": None, "venue": None,
        "team1_teamno": t1, "team1_name": t1, "team1_seed": 1, "team1_score": s1, "team1_source_game": None,
        "team2_teamno": t2, "team2_name": t2, "team2_seed": 2, "team2_score": s2, "team2_source_game": None,
        "winner_teamno": winner,
    }


class PlayoffResultTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        init_db(self.conn)

    def test_results_by_furthest_round(self):
        # 4-team bracket: A beats D, B beats C, A beats B in the final.
        games = [
            _game(1, 1, "A", "D", "A", 40, 30),
            _game(2, 1, "B", "C", "B", 35, 33),
            _game(3, 2, "A", "B", "A", 50, 45),
        ]
        replace_playoffs(self.conn, "2026", [{"groupno": "G1", "grade": 6, "gender": "M", "name": "6 Boys Group 1", "numteams": 4}], games)
        results, by_grade = _playoff_data(self.conn, "2026")
        outcome = {t: r[0]["result"] for t, r in results.items()}
        self.assertEqual(outcome, {"A": "Champion", "B": "Runner-up", "C": "Lost in semifinal", "D": "Lost in semifinal"})
        self.assertEqual(by_grade[("M", 6)][0]["rounds"], 2)

    def test_unplayed_final_reports_reached(self):
        games = [_game(1, 1, "A", "B", "A", 40, 30), _game(2, 2, "A", None, None)]
        replace_playoffs(self.conn, "2020", [{"groupno": "G1", "grade": 6, "gender": "M", "name": "G", "numteams": 4}], games)
        results, _ = _playoff_data(self.conn, "2020")
        self.assertEqual(results["A"][0]["result"], "Reached final")

    def test_regional_winner_who_plays_in_championship_won_region(self):
        groups = [
            {"groupno": "R", "grade": 6, "gender": "M", "name": "6 Boys Group 5 North", "numteams": 4},
            {"groupno": "C", "grade": 6, "gender": "M", "name": "6 Boys Group 5 Championship", "numteams": 2},
        ]
        games = [
            {**_game(1, 1, "A", "B", "A", 40, 30), "groupno": "R"},
            {**_game(2, 2, "A", None, None), "groupno": "R"},
            {**_game(3, 1, "A", "Z", "Z", 30, 40), "groupno": "C"},
        ]
        replace_playoffs(self.conn, "2026", groups, games)
        results, _ = _playoff_data(self.conn, "2026")
        by_group = {r["group_name"]: r["result"] for r in results["A"]}
        self.assertEqual(by_group, {"6 Boys Group 5 North": "Won region", "6 Boys Group 5 Championship": "Runner-up"})


class HelperTests(unittest.TestCase):
    def test_class_of(self):
        self.assertEqual(class_of("2026", 6), 2032)
        self.assertEqual(class_of(2025, 5), 2032)

    def test_slugify(self):
        self.assertEqual(slugify("North Attleboro "), "north-attleboro")
        self.assertEqual(slugify("Acushnet - Fairhaven"), "acushnet-fairhaven")

    def test_town_names_are_unified_across_seasons(self):
        self.assertEqual(town_slug("RI Cranston"), town_slug("Cranston"))
        self.assertEqual(town_slug("RI Barrington RI"), town_slug("Barrington RI"))
        self.assertEqual(town_slug("Waltham Boys"), town_slug("Waltham Girls"))
        self.assertEqual(town_slug("Reading_BZ"), town_slug("Reading Rec"))
        self.assertEqual(town_slug("Acushnet / Fairhaven"), town_slug("Acushnet - Fairhaven"))
        self.assertEqual(canonical_town("Parkway "), "Parkway")

    def test_bracket_name_strips_seed(self):
        self.assertEqual(_bracket_name("8 - Parkway  (red) D1J"), "Parkway (red) D1J")
        self.assertEqual(_bracket_name("Winner of Game 13"), "Winner of Game 13")


if __name__ == "__main__":
    unittest.main()
