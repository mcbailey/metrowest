from __future__ import annotations

import logging
import time
from typing import Any

import requests

from .config import ScrapeConfig

LOG = logging.getLogger(__name__)


class SportsiteAPI:
    def __init__(self, config: ScrapeConfig) -> None:
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "Mozilla/5.0",
                "Origin": "https://metrowestbball.com",
                "Referer": "https://metrowestbball.com/",
            }
        )

    def _post_json(self, endpoint: str, data: dict[str, str]) -> Any:
        url = f"{self.config.base_url}/{endpoint}"
        exc: Exception | None = None
        for attempt in range(1, self.config.request_retries + 1):
            try:
                resp = self.session.post(url, data=data, timeout=self.config.request_timeout_s)
                resp.raise_for_status()
                return resp.json()
            except Exception as err:  # noqa: BLE001
                exc = err
                wait = self.config.retry_backoff_s * attempt
                LOG.warning("POST %s failed (attempt %s/%s): %s", endpoint, attempt, self.config.request_retries, err)
                time.sleep(wait)
        raise RuntimeError(f"POST failed after retries for {endpoint}: {exc}")

    def get_grade_gender_div_tiers(self, yrseason: str, grade: int, gender: str) -> list[dict[str, Any]]:
        return self._post_json(
            "getGradeGenderDivTiers.php",
            {
                "clientid": self.config.client_id,
                "yrseason": yrseason,
                "grade": str(grade),
                "gender": gender,
            },
        )

    def get_gender_grade_tier_divisions(
        self, yrseason: str, grade: int, gender: str, divisiontier: str
    ) -> list[dict[str, Any]]:
        return self._post_json(
            "getGenderGradeTierDivisions.php",
            {
                "clientid": self.config.client_id,
                "yrseason": yrseason,
                "grade": str(grade),
                "gender": gender,
                "divisiontier": str(divisiontier),
            },
        )

    def get_gender_grade_divisions(self, yrseason: str, grade: int, gender: str) -> list[dict[str, Any]]:
        return self._post_json(
            "getGenderGradeDivisions.php",
            {
                "clientid": self.config.client_id,
                "yrseason": yrseason,
                "grade": str(grade),
                "gender": gender,
            },
        )

    def get_division_standings(self, divisionno: str) -> list[dict[str, Any]]:
        return self._post_json("getDivisionStandings.php", {"divisionno": str(divisionno)})

    def get_team_schedule(self, yrseason: str, teamno: str) -> list[dict[str, Any]]:
        return self._post_json(
            "getTeamSchedule.php",
            {
                "clientid": self.config.client_id,
                "yrseason": yrseason,
                "teamno": str(teamno),
            },
        )

    def get_team_nl_schedule(self, yrseason: str, teamno: str) -> list[dict[str, Any]]:
        return self._post_json(
            "getTeamNLSchedule.php",
            {
                "clientid": self.config.client_id,
                "yrseason": yrseason,
                "teamno": str(teamno),
            },
        )

    def get_division_schedule(self, yrseason: str, divisionno: str) -> list[dict[str, Any]]:
        return self._post_json(
            "getDivisionSchedule.php",
            {
                "clientid": self.config.client_id,
                "yrseason": yrseason,
                "divisionno": str(divisionno),
            },
        )
