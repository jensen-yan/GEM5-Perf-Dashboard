#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

try:
    from .dashboard_data import (
        DATASETS,
        benchmark_metrics,
        make_commit_url,
        parse_score_text,
        run_matches_dataset,
    )
except ImportError:
    from dashboard_data import (
        DATASETS,
        benchmark_metrics,
        make_commit_url,
        parse_score_text,
        run_matches_dataset,
    )

DEFAULT_ARCHIVE_ROOT = Path('/nfs/home/share/gem5_ci/performance_data')
DEFAULT_GEM5_REPO = Path('/nfs/home/yanyue/workspace/GEM5_4')
DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / 'site' / 'data'
OWNER = 'OpenXiangShan'
REPO = 'GEM5'


def read_metadata(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        if ':' not in line:
            continue
        key, value = line.split(':', 1)
        data[key.strip()] = value.strip()
    return data


def commit_subject(gem5_repo: Path, sha: str) -> str:
    result = subprocess.run(
        ['git', '-C', str(gem5_repo), 'log', '-n', '1', '--format=%s', sha],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        check=False,
    )
    title = result.stdout.strip()
    return title or sha[:10]


def gh_api_json(path: str) -> Any:
    result = subprocess.run(
        ['gh', 'api', path],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return json.loads(result.stdout)


def fetch_run_details(run_id: int, cache: dict[int, dict[str, Any] | None]) -> dict[str, Any] | None:
    if run_id in cache:
        return cache[run_id]

    try:
        run = gh_api_json(f'repos/{OWNER}/{REPO}/actions/runs/{run_id}')
    except subprocess.CalledProcessError:
        cache[run_id] = None
        return None

    cache[run_id] = run
    return run


def write_outputs(points_by_dataset: dict[str, list[dict[str, Any]]], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {'generated_at': datetime.now(UTC).isoformat(), 'datasets': []}

    for dataset in DATASETS:
        points = sorted(points_by_dataset.get(dataset.id, []), key=lambda item: item['created_at'])
        benchmarks = ['SPECint avg']
        if points:
            benchmarks = sorted(points[-1]['metrics'].keys(), key=lambda name: (name != 'SPECint avg', name))
        payload = {
            'dataset': {
                'id': dataset.id,
                'label': dataset.label,
                'config': dataset.config_name,
                'toolchain': dataset.toolchain,
                'coverage': dataset.coverage,
            },
            'benchmarks': benchmarks,
            'points': points,
        }
        file_name = f'{dataset.id}.json'
        (out_dir / file_name).write_text(json.dumps(payload, indent=2), encoding='utf-8')
        manifest['datasets'].append({'id': dataset.id, 'label': dataset.label, 'file': file_name, 'point_count': len(points)})

    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')


def main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(description='Seed dashboard data from local archive directories')
    parser.add_argument('--archive-root', type=Path, default=DEFAULT_ARCHIVE_ROOT)
    parser.add_argument('--gem5-repo', type=Path, default=DEFAULT_GEM5_REPO)
    parser.add_argument('--out-dir', type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument('--limit-per-dataset', type=int, default=12)
    args = parser.parse_args(argv)

    points_by_dataset: dict[str, list[dict[str, Any]]] = defaultdict(list)
    run_cache: dict[int, dict[str, Any] | None] = {}

    for dataset in DATASETS:
        root = args.archive_root / dataset.archive_subdir
        if not root.exists():
            continue
        candidates = []
        for run_dir in sorted(root.iterdir(), reverse=True):
            metadata_path = run_dir / 'metadata.txt'
            score_path = run_dir / 'score.txt'
            if not metadata_path.exists() or not score_path.exists():
                continue
            metadata = read_metadata(metadata_path)
            if metadata.get('branch') != 'xs-dev':
                continue
            run_id = int(metadata.get('workflow_run_id', '0'))
            if run_id <= 0:
                continue
            run = fetch_run_details(run_id, run_cache)
            if run is None or not run_matches_dataset(run, dataset):
                continue
            candidates.append((run_dir, metadata))
            if len(candidates) >= args.limit_per_dataset:
                break

        for run_dir, metadata in reversed(candidates):
            try:
                parsed = parse_score_text((run_dir / 'score.txt').read_text(encoding='utf-8', errors='ignore'))
            except ValueError as err:
                print(f'skipped {dataset.id}: {run_dir.name} ({err})', file=sys.stderr)
                continue
            sha = metadata.get('commit', '')
            run_id = int(metadata.get('workflow_run_id', '0'))
            point = {
                'run_id': run_id,
                'run_number': int(metadata.get('run_number', '0')),
                'created_at': metadata.get('timestamp', ''),
                'commit': sha,
                'short_commit': metadata.get('commit_short', sha[:10]),
                'commit_url': make_commit_url(sha),
                'title': commit_subject(args.gem5_repo, sha),
                'workflow_url': f'https://github.com/OpenXiangShan/GEM5/actions/runs/{run_id}' if run_id else '',
                'metrics': benchmark_metrics(parsed),
                'details': parsed['benchmarks'],
            }
            points_by_dataset[dataset.id].append(point)
            print(f'seeded {dataset.id}: {run_dir.name}', file=sys.stderr)

    write_outputs(points_by_dataset, args.out_dir)
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
