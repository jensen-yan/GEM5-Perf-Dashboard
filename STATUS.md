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
- Tightened dataset classification to require the exact workflow path as well as artifact name.
- Added commit-driven artifact refresh in [scripts/update_data.py](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/scripts/update_data.py), so recent `xs-dev` commits can map directly to the right `score.txt` artifact.
- Fixed local archive seeding to validate each `workflow_run_id` against GitHub Actions before including it, which prevents `idealkmhv3` `0.8c` datasets from mixing in regular `gem5-perf.yml` results.
- Added a fullscreen-capable data table view to the frontend for clearer metric inspection.
- Added a Pages workflow draft:
  - [.github/workflows/deploy-pages.yml](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/.github/workflows/deploy-pages.yml)

## Verified

- `python3 -B -m unittest discover -s tests -v`
- `node tests/test_chart_helpers.mjs`
- `node tests/test_table_helpers.mjs`
- `node --check site/app.js`
- `python3 scripts/seed_from_local_archives.py --archive-root /nfs/home/share/gem5_ci/performance_data --gem5-repo /nfs/home/yanyue/workspace/GEM5_4 --limit-per-dataset 12`
- `python3 scripts/update_data.py --source commits --branch xs-dev --max-pages 2 --per-page 20 --out-dir /tmp/gem5-dashboard-artifact-data-commits`

## Data Generated

Current seeded JSON in [site/data](/nfs/home/yanyue/workspace/GEM5-Perf-Dashboard/site/data):

- `kmhv3-gcc12-spec06-0.3c`: 12 points, latest `54de78cf99`
- `kmhv3-gcc15-spec06-0.3c`: 4 points, latest `cac9b46`
- `idealkmhv3-gcc12-spec06-0.8c`: 12 points, latest `54de78c`
- `idealkmhv3-gcc15-spec06-0.8c`: 4 points, latest `cac9b46`

Artifact refresh was also exercised successfully in commit-driven mode into `/tmp/gem5-dashboard-artifact-data-commits`, with recent points generated directly from GitHub Actions artifacts matched to `xs-dev` commits.

## In Progress / Not Yet Manually Verified

- The new fullscreen data table and the updated chart/table layout have not been visually re-checked in a browser from this session after the latest changes.
- The new all-series table mode is implemented, but very wide benchmark sets still need a human eyeball check for readability.

## Suggested Next Steps

1. Open the site locally and visually check:
   - fullscreen table open/close behavior
   - wide-table readability in `All SPECint subscores` mode
   - commit/workflow links and point-detail consistency
2. Commit the current repo state.
3. Optionally wire `scripts/update_data.py` into a scheduled workflow once the GitHub repo exists.

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
