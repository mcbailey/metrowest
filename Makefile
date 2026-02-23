PYTHON ?= python3

.PHONY: scrape build-json test dev build

scrape:
	$(PYTHON) -m metrowest.scrape --yrseason 2026 --db-path data/metrowest.sqlite --out-json frontend/public/data

build-json:
	$(PYTHON) -m metrowest.build_json --db-path data/metrowest.sqlite --out frontend/public/data --yrseason 2026

test:
	$(PYTHON) -m unittest discover -s tests -p 'test_*.py'

dev:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
