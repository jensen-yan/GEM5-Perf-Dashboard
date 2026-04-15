# Current Status

Last updated: 2026-04-15

## Completed

- Created the standalone dashboard repo scaffold.
- Added a dependency-light static site:
  - [site/index.html](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/site/index.html)
  - [site/app.js](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/site/app.js)
  - [site/styles.css](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/site/styles.css)
- Implemented `score.txt` parsing and dataset classification:
  - [scripts/dashboard_data.py](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/scripts/dashboard_data.py)
- Implemented two data paths:
  - local archive seed: [scripts/seed_from_local_archives.py](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/scripts/seed_from_local_archives.py)
  - GitHub artifact refresh: [scripts/update_data.py](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/scripts/update_data.py)
- Added tests:
  - Python: [tests/test_dashboard_data.py](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/tests/test_dashboard_data.py)
  - Node helper test: [tests/test_chart_helpers.mjs](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/tests/test_chart_helpers.mjs)
- Added chart helper module for benchmark option construction and all-series mode:
  - [site/chart-helpers.mjs](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/site/chart-helpers.mjs)
- Added commit links into generated point data and detail panel.
- Added an `All SPECint subscores` chart mode in the frontend.
- Added a Pages workflow draft:
  - [.github/workflows/deploy-pages.yml](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/.github/workflows/deploy-pages.yml)

## Verified

- `python3 -B -m unittest discover -s tests -v`
- `node tests/test_chart_helpers.mjs`
- `node --check site/app.js`

## Data Generated

Current seeded JSON in [site/data](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/site/data):

- `kmhv3-gcc12-spec06-0.3c`: 12 points, latest `54de78cf99`
- `kmhv3-gcc15-spec06-0.3c`: 4 points, latest `cac9b46`
- `idealkmhv3-gcc12-spec06-0.8c`: 11 points, latest `54de78cf99`
- `idealkmhv3-gcc15-spec06-0.8c`: 11 points, latest `cac9b46`

Artifact refresh was also exercised successfully into `/tmp/gem5-dashboard-artifact-data`, with recent points generated from GitHub Actions artifacts.

## In Progress / Not Yet Manually Verified

- The UI polish pass is coded, but I have not visually re-checked it in a browser from this session after the latest changes.
- The new hover behavior should move the focused point upward by adjusting SVG coordinates instead of CSS transform, but this still needs a human eyeball check.
- The new all-series mode is implemented, but legend density and readability may still need tuning.
- No git commit has been created yet in this repo.

## Suggested Next Steps

1. Open the site locally and visually check:
   - hover lift direction
   - commit/workflow links
   - all-series readability
2. Make a quick UI cleanup pass if anything still feels off.
3. Commit the repo state.
4. Optionally wire `scripts/update_data.py` into a scheduled workflow once the GitHub repo exists.

## Useful Commands

Serve locally:

```bash
cd /nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/site
python3 -m http.server 8017
```

Re-seed from local archives:

```bash
cd /nfs/home/yanyue/workspace/GEM5-Perf-Dashboard
python3 scripts/seed_from_local_archives.py \
  --archive-root /nfs/home/share/gem5_ci/performance_data \
  --gem5-repo /nfs/home/yanyue/workspace/GEM5_4 \
  --limit-per-dataset 12
```

Refresh from GitHub artifacts:

```bash
cd /nfs/home/yanyue/workspace/GEM5-Perf-Dashboard
python3 scripts/update_data.py --max-pages 2 --per-page 100 --out-dir /tmp/gem5-dashboard-artifact-data
```
