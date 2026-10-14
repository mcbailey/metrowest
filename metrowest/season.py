"""Work out which season to scrape.

The source reports two seasons: ``yrseason`` (the one shown publicly, e.g. 2026 for 2025-26)
and ``adminyrseason`` (the one the league is setting up next, e.g. 2027). A season becomes
scrapeable once it has divisions, so the newest season with divisions wins. That picks up
2026-27 automatically when the league posts divisions, without a code change.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from .api import SportsiteAPI

LOG = logging.getLogger(__name__)

# Used to probe whether a season has divisions yet; every season so far has 6th grade boys.
PROBE_GRADE = 6
PROBE_GENDER = "M"


def season_has_divisions(api: SportsiteAPI, yrseason: str) -> bool:
    try:
        tiers = api.get_grade_gender_div_tiers(yrseason, PROBE_GRADE, PROBE_GENDER)
    except Exception as err:  # noqa: BLE001
        LOG.warning("season probe failed yrseason=%s: %s", yrseason, err)
        return False
    return any(isinstance(t, dict) and t.get("divisiontier") for t in tiers or [])


def detect_active_season(api: SportsiteAPI) -> str:
    """Return the newest season (as a string like "2027") that has divisions posted."""
    info = api.get_client_season_info()
    public = int(info.get("yrseason") or 0)
    admin = int(info.get("adminyrseason") or 0)
    candidates = sorted({s for s in (public, admin) if s > 0}, reverse=True)
    if not candidates:
        raise RuntimeError(f"source did not report a season: {info}")
    for yrseason in candidates:
        if season_has_divisions(api, str(yrseason)):
            LOG.info("active season %s (public=%s, admin=%s)", yrseason, public, admin)
            return str(yrseason)
    LOG.info("no season with divisions among %s; falling back to public season %s", candidates, public)
    return str(public or candidates[-1])


def is_season_final(last_final_date: str | None, next_scheduled_date: str | None, final_after_days: int, today: date | None = None) -> bool:
    """A season is final once its last scored game is old and nothing is scheduled from today on."""
    today = today or date.today()
    if next_scheduled_date and next_scheduled_date >= today.isoformat():
        return False
    if not last_final_date:
        return False
    return last_final_date <= (today - timedelta(days=final_after_days)).isoformat()
