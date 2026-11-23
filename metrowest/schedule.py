"""Schedule-shaped outputs: the season game list (for "this weekend"), gym pages, and team calendar files."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from .util import slugify

# A facility's courts are listed as separate venues ("Mass Premier - 1", "Sudbury Fieldhouse-Court 2",
# "Winchester High School (Court 1)", "Foxboro Ahern Middle (Gym 2)"); strip the court to get the building.
_COURT_SUFFIX = re.compile(
    r"\s*(?:[-–,]\s*)?\(?\s*(?:court|ct\.?|gym)?\s*#?\s*\d+[a-z]?\s*\)?\s*$", re.IGNORECASE
)
# Some venues are listed per day of the week: "Norwood Savage Center(Sunday)".
_DAY_SUFFIX = re.compile(r"\s*\((?:mon|tues|wednes|thurs|fri|satur|sun)days?\)\s*$", re.IGNORECASE)


def facility_name(location: str | None) -> str | None:
    text = re.sub(r"\s+", " ", location or "").strip()
    if not text or text.upper() == "TBD":
        return None
    stripped = _COURT_SUFFIX.sub("", _DAY_SUFFIX.sub("", text)).strip(" -–,")
    return stripped or text


def clean_address(street: Any, citystzip: Any) -> str | None:
    parts = [re.sub(r"\s+", " ", str(p or "")).strip(" ,") for p in (street, citystzip)]
    parts = [p for p in parts if p]
    return ", ".join(parts) or None


_DIRECTIONS = {"e": "east", "w": "west", "n": "north", "s": "south"}
# Street types are left out of the key: the league writes the same gym as "31 Oxford Rd" and "31 Oxford St".
_STREET_TYPES = {
    "st", "street", "rd", "road", "ave", "avenue", "dr", "drive", "ln", "lane", "blvd", "boulevard",
    "way", "pl", "place", "ct", "court", "pkwy", "parkway", "hwy", "highway", "cir", "circle", "ter", "terrace",
}

_STATES = {"ma", "ri", "nh", "ct"}


def address_key(address: str | None) -> str | None:
    """Rough identity for a street address: "117 E Central St, Natick" and "117 East Central Street, Natick MA"
    both become "117-east-central-nati", and "275 Prospect St Norwood MA" becomes "275-prospect-norw".
    Needs a street number; returns None otherwise."""
    if not address:
        return None
    street, comma, city = address.partition(",")
    words = [_DIRECTIONS.get(w, w) for w in re.findall(r"[a-z0-9]+", street.lower())]
    if not words or not words[0].isdigit() or int(words[0]) == 0:
        return None
    name, rest = [], []
    for i, w in enumerate(words[1:], start=1):
        if w in _STREET_TYPES and name:
            rest = words[i + 1 :]
            break
        name.append(w)
    # The town follows the street type ("31 Oxford Rd. Mansfield, MA") or the first comma.
    city_words = [w for w in rest + re.findall(r"[a-z]+", city.lower()) if not w.isdigit() and w not in _STATES]
    return "-".join([words[0], *name[:2]] + ([city_words[0][:4]] if city_words else []))


def parse_time(text: Any) -> tuple[int, int] | None:
    """ "10:15 AM" -> (10, 15)."""
    m = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])\s*", str(text or ""))
    if not m:
        return None
    hour, minute = int(m.group(1)) % 12, int(m.group(2))
    if m.group(3).lower() == "pm":
        hour += 12
    return hour, minute


def season_games(
    conn, yrseason: str, teams: dict[str, dict[str, Any]], gym_slugs: dict[str, str] | None = None
) -> list[dict[str, Any]]:
    """Every game in the season, once, with names for teams outside the league. `gym_slugs` (from
    gym_directory) keeps a gym's slug the same across seasons."""
    games = []
    for row in conn.execute(
        """SELECT gameno, date, starttime, location, home_teamno, away_teamno, home_score, away_score, status, raw_json
           FROM games WHERE yrseason = ? ORDER BY date, starttime, gameno""",
        (yrseason,),
    ):
        raw = json.loads(row["raw_json"] or "{}")
        home, away = row["home_teamno"], row["away_teamno"]
        league = teams.get(home) or teams.get(away)
        if not league:
            continue
        games.append(
            {
                "id": row["gameno"],
                "date": row["date"],
                "time": row["starttime"],
                "end": raw.get("endtime"),
                "gender": league["gender"],
                "grade": league["grade"],
                "home": home if home in teams else None,
                "away": away if away in teams else None,
                # Names only for teams outside the league (league teams are looked up client-side).
                "home_name": None if home in teams else (raw.get("homename") or None),
                "away_name": None if away in teams else (raw.get("awayname") or None),
                "home_score": row["home_score"],
                "away_score": row["away_score"],
                "final": row["status"] == "final",
                "court": row["location"],
                "venue": None,
                "venue_name": facility_name(row["location"]),
                "address": clean_address(raw.get("street"), raw.get("citystzip")),
                "playoff": str(raw.get("week") or "").upper() == "PO",
                # Non-league games ("NL") have free-text locations; league and playoff games use the league's venues.
                "league_venue": str(raw.get("week") or "").upper() != "NL",
            }
        )
    _assign_gyms(games, gym_slugs)
    return games


def _name_key(venue_name: str) -> str:
    """ "Mansfield Field House" and "Mansfield FieldHouse" are the same venue."""
    return "name:" + slugify(venue_name).replace("-", "")


def gym_directory(conn) -> tuple[dict[str, str], dict[str, list[str]]]:
    """Gyms across every season: venue key -> gym slug (see _venue_slugs), and gym slug -> other slugs its
    venues have had, so old gym URLs can redirect."""
    games, old_names = [], []
    for row in conn.execute("SELECT location, raw_json FROM games"):
        raw = json.loads(row["raw_json"] or "{}")
        venue_name = facility_name(row["location"])
        if not venue_name or str(raw.get("week") or "").upper() == "NL":
            continue
        address = clean_address(raw.get("street"), raw.get("citystzip"))
        games.append({"venue_name": venue_name, "address": address, "league_venue": True})
        # Gym slugs used to keep a day-of-week suffix.
        old_names.append(_COURT_SUFFIX.sub("", re.sub(r"\s+", " ", row["location"]).strip()).strip(" -–,"))
    slugs = _venue_slugs(games)
    taken = set(slugs.values())
    aliases: dict[str, set[str]] = defaultdict(set)
    for g, old in zip(games, old_names):
        slug = slugs[_name_key(g['venue_name'])]
        for alias in (slugify(g["venue_name"]), slugify(old)):
            if alias and alias not in taken:
                aliases[slug].add(alias)
    return slugs, {slug: sorted(names) for slug, names in aliases.items()}


def _venue_slugs(games: list[dict[str, Any]]) -> dict[str, str]:
    """Group league venues into gyms (courts of one building, spelling variants at one address). Returns the
    gym slug for every "name:<venue>" and "addr:<address key>" seen."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.setdefault(x, x) != x:
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        parent[find(a)] = find(b)

    # A venue name joins an address only if it is a real share of that name's games, so a few mistyped
    # addresses can't chain two buildings together.
    name_games: dict[str, int] = defaultdict(int)
    pair_games: dict[tuple[str, str], int] = defaultdict(int)
    for g in games:
        if g["league_venue"] and g["venue_name"]:
            name_key = _name_key(g['venue_name'])
            find(name_key)
            name_games[name_key] += 1
            addr = address_key(g["address"])
            if addr:
                pair_games[(name_key, f"addr:{addr}")] += 1
    for (name_key, addr_key), n in pair_games.items():
        if n * 10 >= name_games[name_key]:
            union(name_key, addr_key)

    names_by_root: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for g in games:
        if g["league_venue"] and g["venue_name"]:
            names_by_root[find(_name_key(g['venue_name']))][g["venue_name"]] += 1

    slug_by_root: dict[str, str] = {}
    used: set[str] = set()
    for root, names in sorted(names_by_root.items(), key=lambda kv: -sum(kv[1].values())):
        slug = base = slugify(max(names.items(), key=lambda kv: kv[1])[0])
        n = 2
        while slug in used:
            slug, n = f"{base}-{n}", n + 1
        used.add(slug)
        slug_by_root[root] = slug
    return {key: slug_by_root[find(key)] for key in list(parent) if find(key) in slug_by_root}


def _assign_gyms(games: list[dict[str, Any]], slugs: dict[str, str] | None = None) -> None:
    """Set each game's "venue" gym slug. Non-league games join a gym only if their address or name matches one."""
    if slugs is None:
        slugs = _venue_slugs(games)
    for g in games:
        name_key = _name_key(g['venue_name']) if g["venue_name"] else None
        addr = address_key(g["address"])
        g["venue"] = slugs.get(name_key) if name_key in slugs else slugs.get(f"addr:{addr}") if addr else None


def write_season_schedule(
    out_dir: Path,
    yrseason: str,
    games: list[dict[str, Any]],
    write_json: Callable[[Path, object], None],
) -> list[dict[str, Any]]:
    """Write {season}/weekends/*.json and {season}/gyms/{slug}.json; return a gym summary list for the index."""
    public = _public_game

    # Games grouped by Monday-Sunday week, keyed by the week's Saturday.
    by_weekend: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for g in games:
        if not g["date"]:
            continue
        d = date.fromisoformat(g["date"])
        saturday = d + timedelta(days=(5 - d.weekday()) % 7) if d.weekday() != 6 else d - timedelta(days=1)
        by_weekend[saturday.isoformat()].append(g)
    gym_names = {g["venue"]: g["venue_name"] for g in games if g["venue"] and g["league_venue"]}
    for saturday, wk in by_weekend.items():
        write_json(
            out_dir / yrseason / "weekends" / f"{saturday}.json",
            {"yrseason": yrseason, "saturday": saturday, "games": [public(g) for g in wk], "gyms": {
                slug: gym_names.get(slug) for slug in {g["venue"] for g in wk if g["venue"]}
            }},
        )
    write_json(
        out_dir / yrseason / "weekends.json",
        {"yrseason": yrseason, "weekends": [{"saturday": k, "games": len(v)} for k, v in sorted(by_weekend.items())]},
    )

    by_gym: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for g in games:
        if g["venue"]:
            by_gym[g["venue"]].append(g)

    summaries = []
    for slug, gym_games in by_gym.items():
        names = defaultdict(int)
        addresses = defaultdict(int)
        # Prefer the league's own venue names; a gym can appear in a season only through non-league games.
        named = [g for g in gym_games if g["league_venue"]] or [g for g in gym_games if g["venue_name"]] or gym_games
        for g in named:
            names[g["venue_name"] or slug] += 1
            if g["address"]:
                addresses[g["address"]] += 1
        name = max(names.items(), key=lambda kv: kv[1])[0]
        address = max(addresses.items(), key=lambda kv: kv[1])[0] if addresses else None
        courts = sorted({g["court"] for g in gym_games if g["court"] and g["league_venue"]})
        write_json(
            out_dir / yrseason / "gyms" / f"{slug}.json",
            {
                "yrseason": yrseason,
                "slug": slug,
                "name": name,
                "address": address,
                "courts": courts,
                "games": [public(g, ("venue",)) for g in gym_games],
            },
        )
        summaries.append({"slug": slug, "name": name, "address": address, "yrseason": yrseason, "games": len(gym_games)})
    return summaries


def _public_game(g: dict[str, Any], drop: tuple[str, ...] = ()) -> dict[str, Any]:
    return {k: v for k, v in g.items() if k not in ("venue_name", "address", "league_venue", *drop)}


def write_group_schedules(
    out_dir: Path,
    yrseason: str,
    games: list[dict[str, Any]],
    teams: dict[str, dict[str, Any]],
    write_json: Callable[[Path, object], None],
    towns: bool = True,
) -> None:
    """Every game for one division's teams ({season}/{gender}/{grade}/division-{no}-games.json) and, with `towns`,
    for one town's teams ({season}/town-games/{slug}.json). `teams` is the season's search rows by team number."""
    gym_names = {g["venue"]: g["venue_name"] for g in games if g["venue"] and g["league_venue"]}
    by_division: dict[tuple[str, int, str], list[dict[str, Any]]] = defaultdict(list)
    by_town: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for g in games:
        sides = [teams[t] for t in (g["home"], g["away"]) if t and t in teams]
        for key in {(t["gender"], t["grade"], t["divisionno"]) for t in sides if t.get("divisionno")}:
            by_division[key].append(g)
        for slug in {t["town_slug"] for t in sides if t.get("town_slug")}:
            by_town[slug].append(g)

    def payload(group: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "yrseason": yrseason,
            "games": [_public_game(g) for g in group],
            "gyms": {v: gym_names.get(v) for v in {g["venue"] for g in group if g["venue"]}},
        }

    for (gender, grade, divisionno), group in by_division.items():
        write_json(out_dir / yrseason / gender / str(grade) / f"division-{divisionno}-games.json", payload(group))
    if towns:
        for slug, group in by_town.items():
            write_json(out_dir / yrseason / "town-games" / f"{slug}.json", payload(group))


def write_gyms_index(
    out_dir: Path,
    summaries: list[dict[str, Any]],
    write_json: Callable[[Path, object], None],
    aliases: dict[str, list[str]] | None = None,
) -> None:
    gyms: dict[str, dict[str, Any]] = {}
    names: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for s in summaries:
        gym = gyms.setdefault(
            s["slug"],
            {
                "slug": s["slug"],
                "name": s["name"],
                "address": s["address"],
                "seasons": {},
                "aliases": (aliases or {}).get(s["slug"], []),
            },
        )
        gym["seasons"][s["yrseason"]] = s["games"]
        names[s["slug"]][s["name"]] += s["games"]
        latest = max(gym["seasons"])
        if s["yrseason"] == latest:
            gym["address"] = s["address"] or gym["address"]
    # A gym merged across seasons goes by the name most of its games used.
    for slug, gym in gyms.items():
        gym["name"] = max(names[slug].items(), key=lambda kv: kv[1])[0]
    write_json(out_dir / "gyms.json", {"gyms": sorted(gyms.values(), key=lambda g: g["name"].lower())})


# ---- Calendar (.ics) ----

_VTIMEZONE = """BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE"""


def _ics_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    # RFC 5545: lines longer than 75 octets are folded with CRLF + space.
    out, current = [], ""
    for ch in line:
        if len((current + ch).encode("utf-8")) > 75:
            out.append(current)
            current = " " + ch
        else:
            current += ch
    out.append(current)
    return "\r\n".join(out)


def team_calendar(
    team_name: str,
    teamno: str,
    games: list[dict[str, Any]],
    teams: dict[str, dict[str, Any]],
    team_url: str,
    stamp: str,
) -> str:
    """An .ics calendar of a team's games (scores in the title once played)."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//MWStats//Team schedule//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_ics_text(team_name)}",
        "X-WR-TIMEZONE:America/New_York",
        "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
        "X-PUBLISHED-TTL:PT12H",
        _VTIMEZONE,
    ]
    for g in games:
        if not g["date"]:
            continue
        is_home = g["home"] == teamno
        opp_no = g["away"] if is_home else g["home"]
        opp = (teams.get(opp_no) or {}).get("name") if opp_no else None
        opp = opp or (g["away_name"] if is_home else g["home_name"]) or "TBD"
        summary = f"{'vs' if is_home else '@'} {opp}"
        if g["final"] and g["home_score"] is not None:
            mine, theirs = (g["home_score"], g["away_score"]) if is_home else (g["away_score"], g["home_score"])
            result = "W" if mine > theirs else "L" if mine < theirs else "T"
            summary = f"{result} {mine}-{theirs} {summary}"
        if g["playoff"]:
            summary = f"Playoff: {summary}"

        day = datetime.strptime(g["date"], "%Y-%m-%d")
        start = parse_time(g["time"])
        event = ["BEGIN:VEVENT", f"UID:{g['id']}-{teamno}@mwstats.com", f"DTSTAMP:{stamp}"]
        if start:
            begin = day.replace(hour=start[0], minute=start[1])
            end_t = parse_time(g["end"])
            end = day.replace(hour=end_t[0], minute=end_t[1]) if end_t else begin + timedelta(minutes=75)
            if end <= begin:
                end = begin + timedelta(minutes=75)
            event += [
                f"DTSTART;TZID=America/New_York:{begin:%Y%m%dT%H%M%S}",
                f"DTEND;TZID=America/New_York:{end:%Y%m%dT%H%M%S}",
            ]
        else:
            event += [f"DTSTART;VALUE=DATE:{day:%Y%m%d}", f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}"]
        event.append(f"SUMMARY:{_ics_text(summary)}")
        location = ", ".join(x for x in (g["court"], g["address"]) if x)
        if location:
            event.append(f"LOCATION:{_ics_text(location)}")
        event += [f"URL:{team_url}", f"DESCRIPTION:{_ics_text(team_url)}", "END:VEVENT"]
        lines += event
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for part in lines for line in part.split("\n")) + "\r\n"


def write_team_calendars(
    out_dir: Path,
    yrseason: str,
    games: list[dict[str, Any]],
    teams: dict[str, dict[str, Any]],
    team_url: Callable[[str], str],
    as_of: str | None,
) -> None:
    by_team: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for g in games:
        for side in ("home", "away"):
            if g[side]:
                by_team[g[side]].append(g)
    # DTSTAMP from the season's data date (not the clock) so unchanged data produces identical files.
    stamp_day = date.fromisoformat(as_of) if as_of else date.today()
    stamp = f"{stamp_day:%Y%m%d}T000000Z"
    cal_dir = out_dir / yrseason / "calendar"
    cal_dir.mkdir(parents=True, exist_ok=True)
    for teamno, team in teams.items():
        ics = team_calendar(team["name"], teamno, by_team.get(teamno, []), teams, team_url(teamno), stamp)
        (cal_dir / f"team-{teamno}.ics").write_text(ics, encoding="utf-8", newline="")
