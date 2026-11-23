import unittest

from metrowest.schedule import _assign_gyms, _venue_slugs, address_key, facility_name, parse_time, team_calendar


def _game(**kw):
    base = {
        "id": "1", "date": "2026-01-10", "time": "9:00 AM", "end": "10:15 AM", "gender": "M", "grade": 6,
        "home": "1", "away": "2", "home_name": None, "away_name": None, "home_score": None, "away_score": None,
        "final": False, "court": None, "venue": None, "venue_name": None, "address": None, "playoff": False,
        "league_venue": True,
    }
    return {**base, **kw}


class ScheduleTests(unittest.TestCase):
    def test_facility_name_strips_court(self):
        self.assertEqual(facility_name("Mass Premier - 1"), "Mass Premier")
        self.assertEqual(facility_name("Sudbury Fieldhouse-Court 2"), "Sudbury Fieldhouse")
        self.assertEqual(facility_name("Winchester High School (Court 1)"), "Winchester High School")
        self.assertEqual(facility_name("Foxboro Ahern Middle (Gym 2)"), "Foxboro Ahern Middle")
        self.assertEqual(facility_name("Natick Community Center"), "Natick Community Center")
        self.assertIsNone(facility_name("TBD"))
        self.assertEqual(facility_name("Norwood Savage Center(Sunday)"), "Norwood Savage Center")

    def test_address_key_ignores_spelling(self):
        self.assertEqual(
            address_key("117 East Central Street, Natick"), address_key("117 E Central St, Natick MA 01760")
        )
        self.assertIsNone(address_key("Green Street, Foxborough"))
        # Street type and missing commas don't matter.
        self.assertEqual(address_key("31 Oxford St, Mansfield, MA 02048"), address_key("31 Oxford Road, Mansfield/MA/02048"))
        self.assertEqual(address_key("275 Prospect St Norwood MA"), address_key("275 Prospect St., Norwood, MA 02062"))
        self.assertNotEqual(address_key("10 Main St, Natick"), address_key("10 Main St, Needham"))
        self.assertEqual(address_key("31 Oxford Rd. Mansfield, MA 02048"), address_key("31 Oxford St, Mansfield"))

    def test_parse_time(self):
        self.assertEqual(parse_time("9:20 AM"), (9, 20))
        self.assertEqual(parse_time("12:45 PM"), (12, 45))
        self.assertEqual(parse_time("12:05 AM"), (0, 5))
        self.assertIsNone(parse_time("TBD"))

    def test_gyms_group_spellings_at_one_address(self):
        games = [
            _game(id="1", venue_name="Mass Premier", address="97 Green St., Foxboro, MA 02035"),
            _game(id="2", venue_name="Mass Premiere", address="97 Green Street, Foxboro MA"),
            # Non-league game with a free-text name but a matching address joins the gym.
            _game(id="3", venue_name="Mass Premier Jamfest", address="97 Green St, Foxboro", league_venue=False),
            # Non-league game with no match stays unlinked.
            _game(id="4", venue_name="Some Tournament Gym", league_venue=False),
        ]
        _assign_gyms(games)
        self.assertEqual({g["venue"] for g in games[:3]}, {"mass-premier"})
        self.assertIsNone(games[3]["venue"])

    def test_gym_slugs_carry_across_seasons(self):
        everything = [
            _game(id="1", venue_name="Mansfield Fieldhouse", address="31 Oxford St, Mansfield, MA 02048"),
            _game(id="2", venue_name="Mansfield Fieldhouse", address="31 Oxford St, Mansfield, MA 02048"),
            _game(id="3", venue_name="MPlex", address="31 Oxford Rd, Mansfield MA"),
        ]
        one_season = [_game(id="3", venue_name="MPlex", address="31 Oxford Rd, Mansfield MA")]
        _assign_gyms(one_season, _venue_slugs(everything))
        self.assertEqual(one_season[0]["venue"], "mansfield-fieldhouse")

    def test_stray_address_does_not_merge_gyms(self):
        games = [_game(id=str(i), venue_name="Mansfield Fieldhouse", address="31 Oxford St, Mansfield") for i in range(20)]
        games += [_game(id="x", venue_name="Mansfield Fieldhouse", address="97 Green St, Foxboro")]
        games += [_game(id=f"p{i}", venue_name="Mass Premier", address="97 Green St, Foxboro") for i in range(5)]
        _assign_gyms(games)
        self.assertEqual(games[0]["venue"], "mansfield-fieldhouse")
        self.assertEqual(games[-1]["venue"], "mass-premier")
        self.assertIsNone(address_key("0 Main St, Foxboro"))

    def test_calendar_event(self):
        teams = {"1": {"name": "Natick (red)"}, "2": {"name": "Needham"}}
        ics = team_calendar(
            "Natick (red)", "1",
            [_game(final=True, home_score=40, away_score=31, court="Natick HS", address="15 West St, Natick")],
            teams, "https://mwstats.com/x/", "20260322T000000Z",
        )
        self.assertIn("SUMMARY:W 40-31 vs Needham", ics)
        self.assertIn("DTSTART;TZID=America/New_York:20260110T090000", ics)
        self.assertIn("DTEND;TZID=America/New_York:20260110T101500", ics)
        self.assertIn("LOCATION:Natick HS\\, 15 West St\\, Natick", ics)
        self.assertTrue(all(len(line.encode()) <= 75 for line in ics.split("\r\n")))


if __name__ == "__main__":
    unittest.main()
