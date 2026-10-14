import unittest
from datetime import date

from metrowest.scrape import parse_seasons
from metrowest.season import detect_active_season, is_season_final


class FakeAPI:
    def __init__(self, info, seasons_with_divisions):
        self.info = info
        self.seasons_with_divisions = seasons_with_divisions

    def get_client_season_info(self):
        return self.info

    def get_grade_gender_div_tiers(self, yrseason, grade, gender):
        if yrseason in self.seasons_with_divisions:
            return [{"divisiontier": "1", "divisiontiername": "Division 1"}]
        return [{"status": "FAULT", "message": "No division tiers exist"}]


class SeasonTests(unittest.TestCase):
    def test_stays_on_public_season_until_next_one_has_divisions(self):
        api = FakeAPI({"yrseason": 2026, "adminyrseason": 2027}, {"2026"})
        self.assertEqual(detect_active_season(api), "2026")

    def test_picks_up_next_season_once_divisions_are_posted(self):
        api = FakeAPI({"yrseason": 2026, "adminyrseason": 2027}, {"2026", "2027"})
        self.assertEqual(detect_active_season(api), "2027")

    def test_season_final_rules(self):
        today = date(2026, 10, 14)
        self.assertTrue(is_season_final("2026-03-22", "2026-03-01", 21, today))
        self.assertFalse(is_season_final("2026-10-10", None, 21, today))
        self.assertFalse(is_season_final("2026-03-22", "2026-12-06", 21, today))
        self.assertFalse(is_season_final(None, None, 21, today))

    def test_parse_seasons(self):
        self.assertEqual(parse_seasons("2020-2022,2026"), ["2020", "2021", "2022", "2026"])


if __name__ == "__main__":
    unittest.main()
