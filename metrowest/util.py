from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any


def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def to_int(value: Any) -> int | None:
    if value in (None, "", "null"):
        return None
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


def to_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def normalize_date(value: str | None) -> str | None:
    if not value:
        return None
    s = value.strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s


def game_hash_id(
    yrseason: str,
    date: str | None,
    starttime: str | None,
    home_teamno: str | None,
    away_teamno: str | None,
    location: str | None,
) -> str:
    payload = {
        "yrseason": yrseason,
        "date": date or "",
        "starttime": (starttime or "").strip().lower(),
        "home_teamno": str(home_teamno or ""),
        "away_teamno": str(away_teamno or ""),
        "location": (location or "").strip().lower(),
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:20]
    return f"HASH-{digest}"


def parse_grades(value: str | None, default: tuple[int, ...]) -> list[int]:
    if not value:
        return list(default)
    return sorted({int(v.strip()) for v in value.split(",") if v.strip()})


def parse_genders(value: str | None, default: tuple[str, ...]) -> list[str]:
    if not value:
        return list(default)
    return sorted({v.strip().upper() for v in value.split(",") if v.strip()})
