# GEM5 Perf Dashboard

A lightweight static dashboard for recent GEM5 `score.txt` trends.
The published site consumes generated JSON directly; it does not require a CSV export step.

## What it shows

- Separate datasets for `kmhv3` and `idealkmhv3`
- Separate recent history for `gcc12` and `gcc15`
- A single selected line at a time for a clean trend view
- `SPECint avg` and every SPECint sub-score parsed from `score.txt`

The site is dependency-light:

- frontend: plain HTML/CSS/JavaScript
- data generation: Python stdlib + `gh api`
- tests: Python `unittest`

## Repo layout

```text
site/                     Static site published to GitHub Pages
  index.html
  app.js
  styles.css
  data/

scripts/                  Data parsing and refresh tools
  dashboard_data.py
  update_data.py          Refresh from GitHub Actions artifacts
  seed_from_local_archives.py

tests/                    Parser and dataset classification tests
```

## Quick start

### 1. Seed with local archive data

This is the fastest way to get a working page with recent points:

```bash
python3 scripts/seed_from_local_archives.py   --archive-root /nfs/home/share/gem5_ci/performance_data   --gem5-repo /nfs/home/yanyue/workspace/GEM5_4
```

The command writes JSON into `site/data/`.
It now validates each archived run against its originating GitHub Actions workflow, so
`idealkmhv3` data does not accidentally absorb the regular `gem5-perf.yml` `0.8c` runs.

### 2. Open the dashboard locally

```bash
cd site
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

### 3. Refresh from GitHub Actions artifacts

This follows the same high-level idea as the XiangShan dashboard: fetch recent workflow runs, download `score.txt` artifacts, and rebuild static JSON.

```bash
python3 scripts/update_data.py --source commits --branch xs-dev --max-pages 5 --per-page 100
```

The default refresh mode is now commit-driven: it walks recent `xs-dev` commits, finds the
matching performance workflow runs for each dataset, and downloads the exact `score.txt`
artifact for that workflow.

Requirements:

- `gh` CLI installed and authenticated
- access to `OpenXiangShan/GEM5`

## Current dataset scope

The MVP focuses on recent mainline-style datasets:

- `kmhv3-gcc12-spec06-0.3c`
- `kmhv3-gcc15-spec06-0.3c`
- `idealkmhv3-gcc12-spec06-0.8c`
- `idealkmhv3-gcc15-spec06-0.8c`

## Deploying to GitHub Pages

A sample Pages workflow is included at `.github/workflows/deploy-pages.yml`.
Once this repo is pushed to GitHub and Pages is enabled, the workflow publishes the `site/` directory.

## Automating Data Refresh

`.github/workflows/update-data.yml` can refresh `site/data` automatically from GitHub Actions
artifacts every day at `01:00 UTC`, which is `09:00` China Standard Time, and it also supports
manual dispatch.
