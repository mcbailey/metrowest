from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class ScrapeConfig:
    base_url: str = "https://sportsite2.com"
    client_id: str = "metrowbb"
    default_yrseason: str = "2026"
    default_grades: tuple[int, ...] = (3, 4, 5, 6, 7, 8)
    default_genders: tuple[str, ...] = ("M", "F")
    request_timeout_s: int = 30
    request_retries: int = 3
    retry_backoff_s: float = 1.0
    db_path: Path = field(default_factory=lambda: Path("data/metrowest.sqlite"))


@dataclass(frozen=True)
class RankingConfig:
    initial_elo: float = 1500.0
    k_factor: float = 20.0
    power_elo_weight: float = 0.75
    power_sos_weight: float = 0.25


SCRAPE_CONFIG = ScrapeConfig()
RANKING_CONFIG = RankingConfig()
