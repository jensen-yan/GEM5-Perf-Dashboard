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

try:
    from .dashboard_data import (
        DATASETS,
        DatasetConfig,
        benchmark_metrics,
        classify_run,
        make_commit_url,
        parse_score_text,
        run_matches_dataset,
    )
except ImportError:
    from dashboard_data import (
        DATASETS,
        DatasetConfig,
        benchmark_metrics,
        classify_run,
        make_commit_url,
        parse_score_text,
        run_matches_dataset,
    )

OWNER = "OpenXiangShan"
REPO = "GEM5"
DEFAULT_BRANCH = "xs-dev"
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


def list_branch_commits(branch: str, max_pages: int, per_page: int) -> list[str]:
    commits: list[str] = []
    for page in range(1, max_pages + 1):
        payload = gh_api_json(
            f"repos/{OWNER}/{REPO}/commits?sha={branch}&per_page={per_page}&page={page}"
        )
        if not payload:
            break
        commits.extend(item["sha"] for item in payload)
    return commits


def list_runs_for_commit(sha: str, branch: str, per_page: int = 100) -> list[dict[str, Any]]:
    payload = gh_api_json(
        f"repos/{OWNER}/{REPO}/actions/runs?head_sha={sha}&branch={branch}&event=push&per_page={per_page}"
    )
    return payload.get("workflow_runs", [])


def list_run_artifacts(run_id: int) -> list[dict[str, Any]]:
    payload = gh_api_json(f"repos/{OWNER}/{REPO}/actions/runs/{run_id}/artifacts")
    return payload.get("artifacts", [])


def select_run_for_dataset(
    runs: list[dict[str, Any]], dataset: DatasetConfig
) -> dict[str, Any] | None:
    candidates = [
        run
        for run in runs
        if run.get("conclusion") == "success" and run_matches_dataset(run, dataset)
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda run: (
            run.get("run_started_at", ""),
            run.get("created_at", ""),
            run.get("run_number", 0),
        ),
    )


def find_dataset_artifact(
    artifacts: list[dict[str, Any]], dataset: DatasetConfig
) -> dict[str, Any] | None:
    for artifact in artifacts:
        if artifact.get("expired"):
            continue
        if artifact.get("name") == dataset.artifact_name:
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


def include_run(
    run: dict[str, Any],
    dataset: DatasetConfig,
    artifact: dict[str, Any],
    points_by_dataset: dict[str, list[dict[str, Any]]],
) -> bool:
    score_text = download_score_text(artifact["id"])
    try:
        parsed = parse_score_text(score_text)
    except ValueError as err:
        print(f"skipped {dataset.id}: run {run['id']} ({err})", file=sys.stderr)
        return False
    title = fetch_commit_subject(run["head_sha"])
    points_by_dataset[dataset.id].append(build_point(run, parsed, title))
    print(f"included {dataset.id}: run {run['id']}", file=sys.stderr)
    return True


def collect_from_commits(
    branch: str,
    max_pages: int,
    per_page: int,
    points_by_dataset: dict[str, list[dict[str, Any]]],
) -> None:
    for sha in list_branch_commits(branch, max_pages, per_page):
        runs = list_runs_for_commit(sha, branch)
        for dataset in DATASETS:
            run = select_run_for_dataset(runs, dataset)
            if not run:
                continue
            artifact = find_dataset_artifact(list_run_artifacts(run["id"]), dataset)
            if not artifact:
                continue
            include_run(run, dataset, artifact, points_by_dataset)


def collect_from_runs(
    max_pages: int,
    per_page: int,
    points_by_dataset: dict[str, list[dict[str, Any]]],
) -> None:
    for run in list_recent_runs(max_pages, per_page):
        if run.get("conclusion") != "success":
            continue
        artifacts = list_run_artifacts(run["id"])
        for dataset in DATASETS:
            artifact = find_dataset_artifact(artifacts, dataset)
            if not artifact:
                continue
            if classify_run(run, artifact["name"]) is None:
                continue
            include_run(run, dataset, artifact, points_by_dataset)
            break


def main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Build dashboard data from GitHub Actions artifacts")
    parser.add_argument("--source", choices=("commits", "runs"), default="commits")
    parser.add_argument("--branch", default=DEFAULT_BRANCH)
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--per-page", type=int, default=100)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args(argv)

    points_by_dataset: dict[str, list[dict[str, Any]]] = defaultdict(list)

    if args.source == "commits":
        collect_from_commits(args.branch, args.max_pages, args.per_page, points_by_dataset)
    else:
        collect_from_runs(args.max_pages, args.per_page, points_by_dataset)

    write_outputs(points_by_dataset, args.out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
