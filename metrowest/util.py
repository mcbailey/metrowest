from __future__ import annotations

import hashlib
import json
import logging
import re
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
    # The source occasionally sends two-digit years as "0025-11-28".
    m = re.fullmatch(r"00(\d\d)-(\d\d)-(\d\d)", s)
    if m:
        s = f"20{m.group(1)}-{m.group(2)}-{m.group(3)}"
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(s, fmt).date()
        except ValueError:
            continue
        # Placeholder dates like 1900-01-01 mean "unknown" (mostly tournament games).
        return parsed.isoformat() if parsed.year >= 2000 else None
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


def season_label(yrseason: str | int) -> str:
    """2026 -> "2025-26" (seasons span the winter and are keyed by their ending year)."""
    y = int(yrseason)
    return f"{y - 1}-{str(y)[-2:]}"
