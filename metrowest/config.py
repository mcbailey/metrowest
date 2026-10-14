from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class ScrapeConfig:
    base_url: str = "https://sportsite2.com"
    client_id: str = "metrowbb"
    # Seasons are auto-detected from the source; see metrowest/season.py.
    default_yrseason: str = "auto"
    backfill_first_season: int = 2020
    default_grades: tuple[int, ...] = (3, 4, 5, 6, 7, 8)
    default_genders: tuple[str, ...] = ("M", "F")
    request_timeout_s: int = 30
    request_retries: int = 3
    retry_backoff_s: float = 1.0
    max_workers: int = 6
    # A season is considered final once its last scored game is this old and nothing is scheduled ahead.
    season_final_after_days: int = 21
    db_path: Path = field(default_factory=lambda: Path("data/metrowest.sqlite"))


@dataclass(frozen=True)
class RankingConfig:
    # "pooled" (default): one rating per team across its grade and gender, fit to all games at once.
    # "division-aware" / "classic": the earlier per-division Elo profiles, kept for comparison.
    profile: str = "pooled"

    # Pooled profile. Backtested on 2021-22..2025-26 (ratings from games before Feb 1 predicting later games):
    # 74.5% of winners vs 70.9% for division-aware Elo. See README "Ranking Method".
    pool_margin_cap: int = 25  # per-game score difference used is capped at this
    pool_shrinkage: float = 3.0  # games-worth of pull toward the division level (keeps small samples sane)
    pool_division_prior_step: float = 8.0  # fallback gap (points) between division levels with no cross games
    pool_division_prior_weight: float = 0.5
    pool_power_center: float = 1500.0  # each grade/gender pool is centered here
    pool_power_per_point: float = 22.0  # power units per point of expected score difference

    initial_elo: float = 1500.0
    k_factor: float = 20.0
    power_elo_weight: float = 0.75
    power_sos_weight: float = 0.25
    power_sos_adj_weight: float = 0.0

    # Division-aware controls
    base_div1_elo: float = 1650.0
    division_step_elo: float = 50.0
    grade4_special_grade: int = 4
    # 4th grade has no Division 3 (tiers 1,2,4,5,6,7) and D2 seeds above D1; applies to every season.
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
