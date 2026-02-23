import unittest

from metrowest.util import game_hash_id


class UtilTests(unittest.TestCase):
    def test_game_hash_stable(self):
        a = game_hash_id("2026", "2026-01-01", "8:00 PM", "100", "200", "Gym A")
        b = game_hash_id("2026", "2026-01-01", "8:00 PM", "100", "200", "Gym A")
        self.assertEqual(a, b)

    def test_game_hash_changes_for_different_match(self):
        a = game_hash_id("2026", "2026-01-01", "8:00 PM", "100", "200", "Gym A")
        b = game_hash_id("2026", "2026-01-01", "8:00 PM", "101", "200", "Gym A")
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
