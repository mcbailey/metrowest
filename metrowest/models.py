from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Division:
    divisionno: str
    yrseason: str
    grade: int
    gender: str
    divisiontier: str | None
    name: str


@dataclass
class Team:
    teamno: str
    yrseason: str
    grade: int
    gender: str
    divisionno: str
    town: str | None
    name: str


@dataclass
class Game:
    gameno: str
    yrseason: str
    date: str | None
    dow: str | None
    starttime: str | None
    location: str | None
    divisionno: str | None
    home_teamno: str | None
    away_teamno: str | None
    home_score: int | None
    away_score: int | None
    status: str
    raw_json: dict[str, Any]
