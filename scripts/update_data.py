#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
import io
import json
from pathlib import Path
import subprocess
import sys
from typing import Any
import zipfile

from dashboard_data import (
    DATASETS,
    benchmark_metrics,
    classify_run,
    make_commit_url,
    parse_score_text,
)

OWNER = "OpenXiangShan"
REPO = "GEM5"
DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / "site" / "data"


def gh_api_json(path: str) -> Any:
    result = subprocess.run(
        ["gh", "api", path],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return json.loads(result.stdout)


def gh_api_bytes(path: str) -> bytes:
    result = subprocess.run(
        ["gh", "api", path],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout


def list_recent_runs(max_pages: int, per_page: int) -> list[dict[str, Any]]:
    runs: list[dict[str, Any]] = []
    for page in range(1, max_pages + 1):
        payload = gh_api_json(
            f"repos/{OWNER}/{REPO}/actions/runs?per_page={per_page}&page={page}"
        )
        page_runs = payload.get("workflow_runs", [])
        if not page_runs:
            break
        runs.extend(page_runs)
    return runs


def find_score_artifact(run_id: int) -> dict[str, Any] | None:
    payload = gh_api_json(f"repos/{OWNER}/{REPO}/actions/runs/{run_id}/artifacts")
    for artifact in payload.get("artifacts", []):
        if artifact.get("expired"):
            continue
        name = artifact.get("name", "")
        if name.startswith("performance-score-"):
            return artifact
    return None


def download_score_text(artifact_id: int) -> str:
    blob = gh_api_bytes(f"repos/{OWNER}/{REPO}/actions/artifacts/{artifact_id}/zip")
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        with zf.open("score.txt") as fp:
            return fp.read().decode("utf-8")


def fetch_commit_subject(sha: str) -> str:
    payload = gh_api_json(f"repos/{OWNER}/{REPO}/commits/{sha}")
    return payload["commit"]["message"].splitlines()[0]


def build_point(run: dict[str, Any], parsed: dict[str, Any], title: str) -> dict[str, Any]:
    return {
        "run_id": run["id"],
        "run_number": run["run_number"],
        "created_at": run["created_at"],
        "commit": run["head_sha"],
        "short_commit": run["head_sha"][:10],
        "commit_url": make_commit_url(run["head_sha"]),
        "title": title,
        "workflow_url": run["html_url"],
        "metrics": benchmark_metrics(parsed),
        "details": parsed["benchmarks"],
    }


def write_outputs(points_by_dataset: dict[str, list[dict[str, Any]]], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "generated_at": datetime.now(UTC).isoformat(),
        "datasets": [],
    }

    for dataset in DATASETS:
        points = sorted(points_by_dataset.get(dataset.id, []), key=lambda item: item["created_at"])
        benchmarks = ["SPECint avg"]
        if points:
            benchmarks = sorted(points[-1]["metrics"].keys(), key=lambda name: (name != "SPECint avg", name))
        payload = {
            "dataset": {
                "id": dataset.id,
                "label": dataset.label,
                "config": dataset.config_name,
                "toolchain": dataset.toolchain,
                "coverage": dataset.coverage,
            },
            "benchmarks": benchmarks,
            "points": points,
        }
        file_name = f"{dataset.id}.json"
        (out_dir / file_name).write_text(json.dumps(payload, indent=2), encoding="utf-8")
        manifest["datasets"].append(
            {
                "id": dataset.id,
                "label": dataset.label,
                "file": file_name,
                "point_count": len(points),
            }
        )

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Build dashboard data from GitHub Actions artifacts")
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--per-page", type=int, default=100)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args(argv)

    points_by_dataset: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for run in list_recent_runs(args.max_pages, args.per_page):
        if run.get("conclusion") != "success":
            continue
        artifact = find_score_artifact(run["id"])
        if not artifact:
            continue
        dataset = classify_run(run, artifact["name"])
        if dataset is None:
            continue

        score_text = download_score_text(artifact["id"])
        try:
            parsed = parse_score_text(score_text)
        except ValueError as err:
            print(f"skipped {dataset.id}: run {run['id']} ({err})", file=sys.stderr)
            continue
        title = fetch_commit_subject(run["head_sha"])
        points_by_dataset[dataset.id].append(build_point(run, parsed, title))
        print(f"included {dataset.id}: run {run['id']}", file=sys.stderr)

    write_outputs(points_by_dataset, args.out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
