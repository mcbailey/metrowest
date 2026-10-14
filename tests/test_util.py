import unittest

from metrowest.util import game_hash_id, normalize_date, season_label


class UtilTests(unittest.TestCase):
    def test_game_hash_stable(self):
        a = game_hash_id("2026", "2026-01-01", "8:00 PM", "100", "200", "Gym A")
        b = game_hash_id("2026", "2026-01-01", "8:00 PM", "100", "200", "Gym A")
        self.assertEqual(a, b)

    def test_game_hash_changes_for_different_match(self):
        a = game_hash_id("2026", "2026-01-01", "8:00 PM", "100", "200", "Gym A")
        b = game_hash_id("2026", "2026-01-01", "8:00 PM", "101", "200", "Gym A")
        self.assertNotEqual(a, b)

    def test_two_digit_year_dates_are_repaired(self):
        self.assertEqual(normalize_date("0025-11-28"), "2025-11-28")
        self.assertEqual(normalize_date("2026-01-04"), "2026-01-04")

    def test_placeholder_dates_become_unknown(self):
        self.assertIsNone(normalize_date("1900-01-01"))
        self.assertIsNone(normalize_date("1899-11-29"))

    def test_season_label(self):
        self.assertEqual(season_label("2026"), "2025-26")
        self.assertEqual(season_label(2020), "2019-20")


if __name__ == "__main__":
    unittest.main()
