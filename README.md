# Metrowest Youth Basketball Rankings

Daily scraper + ranking pipeline for Metrowest Youth Basketball, with static JSON output and a React frontend for browsing division power rankings and team details.

## Stack

- Python 3.11+
- `requests` + `sqlite3`
- Ranking engine: Elo + Strength of Schedule (SoS)
- Frontend: Vite + React + TypeScript
- Automation: GitHub Actions + GitHub Pages

## Project Layout

- `metrowest/`: scraper, API client, DB, ranking, JSON builder
- `data/metrowest.sqlite`: persisted state and snapshots
- `frontend/`: static site consuming generated JSON
- `.github/workflows/scrape_and_build.yml`: daily automation

## Local Setup

1. Create a venv and install dependencies:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

## Common Commands

- Scrape and build JSON:
  ```bash
  make scrape
  ```
- Build JSON only from existing SQLite:
  ```bash
  make build-json
  ```
- Run unit tests:
  ```bash
  make test
  ```
- Run frontend dev server:
  ```bash
  make dev
  ```
- Build frontend production assets:
  ```bash
  make build
  ```

## Scraper CLI

```bash
python -m metrowest.scrape \
  --yrseason 2026 \
  --grades 3,4,5,6,7,8 \
  --genders M,F \
  --db-path data/metrowest.sqlite \
  --ranking-profile division-aware \
  --out-json frontend/public/data \
  --log-level INFO
```

### Ranking Profile Flag

`--ranking-profile` controls ranking math.

- `division-aware` (default): division-anchored seeding, upset/top-division K adjustments, 15-point MOV cap, division-adjusted SoS, weekly regression toward division baseline.
- `classic`: original flat-1500 Elo behavior.

Flag locations:

- Default value: `metrowest/config.py` (`RankingConfig.profile`)
- CLI override: `metrowest/scrape.py` (`--ranking-profile`)
- Daily automation value: `.github/workflows/scrape_and_build.yml`

### Behavior

- Discovers tiers/divisions for each grade/gender.
- Falls back to legacy endpoints if tier discovery fails.
- Upserts divisions, teams, and games into SQLite.
- De-dupes by `gameno`; if missing, creates a stable hash ID.
- Marks missing-score games as `scheduled`; scored games as `final`.
- Computes per-division Elo/SoS/Power and stores daily snapshot rows.

## Ranking Method

For each division team set:

1. Seed Elo by division baseline (`division-aware`) or 1500 (`classic`).
2. Process final games in order.
3. Apply dynamic K in `division-aware`:
   - upset boost when a lower division beats a higher division,
   - reduced volatility for D1/D2 matchups,
   - MOV multiplier capped at 15 points.
4. Compute SoS from opponents, plus Division-Adjusted SoS.
5. Regress ratings weekly toward each team’s division baseline (`division-aware`).
6. Compute power and rank teams by descending power.

## JSON Output Contract

Generated under `frontend/public/data`:

- `index.json`
- `{season}/{gender}/{grade}/divisions.json`
- `{season}/{gender}/{grade}/division-{divisionno}.json`
- `{season}/team-{teamno}.json`
- Optional CSV per division alongside division JSON

## GitHub Actions

The workflow runs daily at **11:00 UTC** (6:00 AM Eastern Standard Time), and also supports manual trigger.

Steps:

1. Scrape + compute + generate JSON
2. Build frontend
3. Commit updated SQLite + JSON back to main
4. Deploy `frontend/dist` to GitHub Pages

No secrets are required; it uses `GITHUB_TOKEN`.
