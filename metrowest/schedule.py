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


def facility_name(location: str | None) -> str | None:
    text = re.sub(r"\s+", " ", location or "").strip()
    if not text or text.upper() == "TBD":
        return None
    stripped = _COURT_SUFFIX.sub("", text).strip(" -–,")
    return stripped or text


def clean_address(street: Any, citystzip: Any) -> str | None:
    parts = [re.sub(r"\s+", " ", str(p or "")).strip(" ,") for p in (street, citystzip)]
    parts = [p for p in parts if p]
    return ", ".join(parts) or None


_STREET_WORDS = {"e": "east", "w": "west", "n": "north", "s": "south", "st": "street", "rd": "road", "ave": "avenue"}


def address_key(address: str | None) -> str | None:
    """Rough identity for a street address: "117 E Central St, Natick" and "117 East Central Street, Natick MA"
    both become "117-east-central-nati". Needs a street number; returns None otherwise."""
    if not address:
        return None
    street, _, city = address.partition(",")
    words = [_STREET_WORDS.get(w, w) for w in re.findall(r"[a-z0-9]+", street.lower())]
    if not words or not words[0].isdigit():
        return None
    city_words = re.findall(r"[a-z]+", city.lower())
    return "-".join(words[:3] + ([city_words[0][:4]] if city_words else []))


def parse_time(text: Any) -> tuple[int, int] | None:
    """ "10:15 AM" -> (10, 15)."""
    m = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])\s*", str(text or ""))
    if not m:
        return None
    hour, minute = int(m.group(1)) % 12, int(m.group(2))
    if m.group(3).lower() == "pm":
        hour += 12
    return hour, minute


def season_games(conn, yrseason: str, teams: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Every game in the season, once, with names for teams outside the league."""
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
    _assign_gyms(games)
    return games


def _assign_gyms(games: list[dict[str, Any]]) -> None:
    """Group league venues into gyms (courts of one building, spelling variants at one address) and set each
    game's "venue" slug. Non-league games join a gym only if their address or name matches one."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.setdefault(x, x) != x:
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        parent[find(a)] = find(b)

    for g in games:
        if g["league_venue"] and g["venue_name"]:
            name_key = f"name:{slugify(g['venue_name'])}"
            find(name_key)
            addr = address_key(g["address"])
            if addr:
                union(name_key, f"addr:{addr}")

    names_by_root: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for g in games:
        if g["league_venue"] and g["venue_name"]:
            names_by_root[find(f"name:{slugify(g['venue_name'])}")][g["venue_name"]] += 1

    slug_by_root: dict[str, str] = {}
    used: set[str] = set()
    for root, names in sorted(names_by_root.items(), key=lambda kv: -sum(kv[1].values())):
        slug = base = slugify(max(names.items(), key=lambda kv: kv[1])[0])
        n = 2
        while slug in used:
            slug, n = f"{base}-{n}", n + 1
        used.add(slug)
        slug_by_root[root] = slug

    for g in games:
        root = None
        if g["venue_name"] and f"name:{slugify(g['venue_name'])}" in parent:
            root = find(f"name:{slugify(g['venue_name'])}")
        elif address_key(g["address"]) and f"addr:{address_key(g['address'])}" in parent:
            root = find(f"addr:{address_key(g['address'])}")
        g["venue"] = slug_by_root.get(root) if root else None


def write_season_schedule(
    out_dir: Path,
    yrseason: str,
    games: list[dict[str, Any]],
    write_json: Callable[[Path, object], None],
) -> list[dict[str, Any]]:
    """Write {season}/weekends/*.json and {season}/gyms/{slug}.json; return a gym summary list for the index."""
    public = lambda g, drop=(): {k: v for k, v in g.items() if k not in ("venue_name", "address", "league_venue", *drop)}

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
        for g in gym_games:
            if g["league_venue"]:
                names[g["venue_name"]] += 1
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


def write_gyms_index(out_dir: Path, summaries: list[dict[str, Any]], write_json: Callable[[Path, object], None]) -> None:
    gyms: dict[str, dict[str, Any]] = {}
    for s in summaries:
        gym = gyms.setdefault(s["slug"], {"slug": s["slug"], "name": s["name"], "address": s["address"], "seasons": {}})
        gym["seasons"][s["yrseason"]] = s["games"]
        latest = max(gym["seasons"])
        if s["yrseason"] == latest:
            gym["name"], gym["address"] = s["name"], s["address"] or gym["address"]
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
