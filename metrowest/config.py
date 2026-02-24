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
    profile: str = "division-aware"

    initial_elo: float = 1500.0
    k_factor: float = 20.0
    power_elo_weight: float = 0.75
    power_sos_weight: float = 0.25
    power_sos_adj_weight: float = 0.0

    # Division-aware controls
    base_div1_elo: float = 1650.0
    division_step_elo: float = 50.0
    grade4_special_grade: int = 4
    grade4_tier_baselines: dict[int, float] = field(
        default_factory=lambda: {
            1: 1600.0,
            2: 1650.0,
            3: 1550.0,
            4: 1500.0,
            5: 1450.0,
            6: 1400.0,
        }
    )

    upset_multiplier: float = 1.5
    top_division_tiers: tuple[int, ...] = (1, 2)
    top_division_k_reduction: float = 0.20

    mov_cap: int = 15
    weekly_regression_pct: float = 0.10

    # Additional SoS tier emphasis.
    sos_division_adjust_weight: float = 1.0


SCRAPE_CONFIG = ScrapeConfig()
RANKING_CONFIG = RankingConfig()
