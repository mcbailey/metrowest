# Metrowest Youth Basketball Rankings

Daily scraper + ranking pipeline for Metrowest Youth Basketball, with static JSON output and a React frontend for browsing division power rankings and team details.

## Stack

- Python 3.11+
- `requests` + `sqlite3`
- Ranking engine: Elo + Strength of Schedule (SoS)
- Frontend: Vite + React + TypeScript
- Automation: GitHub Actions + GitHub Pages

## Project Layout

- `metrowest/`: scraper, API client, DB, ranking, JSON builder, season detection
- `data/metrowest.sqlite`: local database (not in git; CI keeps it on the `data` GitHub release)
- `frontend/`: static site consuming generated JSON (`frontend/public/data`, also not in git)
- `.github/workflows/scrape_and_build.yml`: daily scrape + deploy

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

3. Get a database: download the one CI uses (`gh release download data --pattern metrowest.sqlite.gz --dir data && gunzip data/metrowest.sqlite.gz`), or build one from scratch with `make backfill` (about 4 minutes for 2020-2026).

## Common Commands

- Scrape the active season and build JSON:
  ```bash
  make scrape
  ```
- Load past seasons (default 2020-2026):
  ```bash
  make backfill SEASONS=2020-2026
  ```
- Build JSON for every season from the existing SQLite (no network):
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
  --yrseason auto \
  --db-path data/metrowest.sqlite \
  --ranking-profile division-aware \
  --out-json frontend/public/data
```

- `--yrseason auto` (default) asks the source which seasons exist (`getClientNameYrseasonJson.php`) and scrapes the
  newest one that has divisions posted. When the league posts 2026-27 divisions, the daily job switches to it
  with no code change. A season can also be given explicitly (`2026`), as a list (`2020,2021`) or a range (`2020-2025`).
- Seasons are keyed by the year they end: `2026` is the 2025-26 season.
- `--force` re-scrapes and re-ranks even if nothing changed or the season is final.
- `--rank-only` recomputes rankings from the database without scraping (use after changing ranking settings).

### Season lifecycle

- In season: every run re-scrapes the season. Rankings and output are only rebuilt when the season's data
  actually changed (a fingerprint of divisions/teams/games is stored on the `seasons` row).
- A season is marked `final` once its last scored game is 21+ days old and nothing is scheduled ahead.
- Off-season (`auto` + current season final): the run makes three API calls, finds nothing new, and exits.
  CI then skips the deploy.
- When a new season appears, the previous one is marked final and kept for browsing.

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
- Upserts divisions (with the league's division code, e.g. `6MD1H` / tag `D1H`), teams, and games into SQLite.
- Fetches team schedules in parallel (6 workers).
- De-dupes by `gameno`; if missing, creates a stable hash ID.
- Marks missing-score games as `scheduled`; scored games as `final`.
- Forfeits count as the league records them: 2-0 for the winner. Double forfeits stay unscored.
- Placeholder dates (`1900-01-01`) are stored as unknown; two-digit years (`0025-11-28`) are repaired.
- Computes per-division Elo/SoS/Power and stores one snapshot per season, dated by the season's latest scored game.

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

Generated under `frontend/public/data` (rebuilt from scratch each time; not committed):

- `index.json`: all seasons with label (`2025-26`), status, as-of date, and per grade/gender counts
- `{season}/search.json`: compact team list for the team/town search
- `{season}/{gender}/{grade}/divisions.json`
- `{season}/{gender}/{grade}/division-{divisionno}.json`
- `{season}/team-{teamno}.json`

## GitHub Actions

One workflow, `.github/workflows/scrape_and_build.yml`:

- **Daily at 11:00 UTC**: downloads the database from the `data` release, runs `--yrseason auto`, and if anything
  changed uploads the database back and deploys. Off-season it stops after the check.
- **Push to `main`** (frontend, scraper or workflow changes): rebuilds the site from the stored database and deploys.
- **Manual run**: scrape + deploy; tick `force` to re-scrape and re-rank.

Data never goes into git. The workflow uses `GITHUB_TOKEN` only; no secrets are required.
