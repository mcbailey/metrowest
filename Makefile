PYTHON ?= python3
DB ?= data/metrowest.sqlite
OUT ?= frontend/public/data

.PHONY: scrape backfill build-json test dev build

# Scrape the active season (auto-detected from the source) and rebuild the site data.
scrape:
	$(PYTHON) -m metrowest.scrape --yrseason auto --db-path $(DB) --out-json $(OUT)

# One-time/occasional: load past seasons. Override with `make backfill SEASONS=2018-2019`.
SEASONS ?= 2020-2026
backfill:
	$(PYTHON) -m metrowest.scrape --yrseason $(SEASONS) --force --db-path $(DB) --out-json $(OUT)

# Rebuild site data for every season from the existing database (no network).
build-json:
	$(PYTHON) -m metrowest.build_json --db-path $(DB) --out $(OUT)

test:
	$(PYTHON) -m unittest discover -s tests -p 'test_*.py'

dev:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
