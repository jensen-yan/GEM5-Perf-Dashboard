#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
import io
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import quote
from typing import Any
import zipfile

try:
    from .dashboard_data import (
        DATASETS,
        DatasetConfig,
        AVERAGE_LABELS,
        benchmark_metrics,
        make_commit_url,
        normalize_point_created_at,
        parse_score_text,
        point_created_at_sort_key,
        run_matches_dataset,
    )
except ImportError:
    from dashboard_data import (
        DATASETS,
        DatasetConfig,
        AVERAGE_LABELS,
        benchmark_metrics,
        make_commit_url,
        normalize_point_created_at,
        parse_score_text,
        point_created_at_sort_key,
        run_matches_dataset,
    )

OWNER = "OpenXiangShan"
REPO = "GEM5"
DEFAULT_BRANCH = "xs-dev"
DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / "site" / "data"


def gh_api_json(path: str) -> Any:
    result = gh_api(path, text=True)
    return json.loads(result.stdout)


def gh_api_bytes(path: str) -> bytes:
    result = gh_api(path, text=False)
    return result.stdout


def gh_api(path: str, text: bool) -> subprocess.CompletedProcess:
    last_error: subprocess.CalledProcessError | None = None
    max_attempts = 5
    for attempt in range(max_attempts):
        try:
            return subprocess.run(
                ["gh", "api", path],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=text,
            )
        except subprocess.CalledProcessError as err:
            last_error = err
            if attempt < max_attempts - 1:
                time.sleep(min(2**attempt, 8))
    stderr = last_error.stderr if last_error else ""
    raise RuntimeError(f"gh api failed for {path}: {stderr}") from last_error


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


def list_workflow_runs(
    workflow_path: str,
    max_pages: int,
    per_page: int,
) -> list[dict[str, Any]]:
    workflow_id = quote(Path(workflow_path).name)
    runs: list[dict[str, Any]] = []
    for page in range(1, max_pages + 1):
        payload = gh_api_json(
            f"repos/{OWNER}/{REPO}/actions/workflows/{workflow_id}/runs"
            f"?per_page={per_page}&page={page}"
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


def list_run_jobs(run_id: int) -> list[dict[str, Any]]:
    payload = gh_api_json(f"repos/{OWNER}/{REPO}/actions/runs/{run_id}/jobs?per_page=100")
    return payload.get("jobs", [])


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


def _parse_github_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def find_dataset_job(
    jobs: list[dict[str, Any]], dataset: DatasetConfig
) -> dict[str, Any] | None:
    if not dataset.job_name_prefix:
        return None
    candidates = [
        job
        for job in jobs
        if job.get("conclusion") == "success"
        and str(job.get("name", "")).startswith(dataset.job_name_prefix)
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda job: (
            job.get("completed_at") or "",
            job.get("started_at") or "",
            job.get("id", 0),
        ),
    )


def find_dataset_artifact(
    artifacts: list[dict[str, Any]], dataset: DatasetConfig, job: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    # PR #1131 encodes the configuration in the name; no timing inference.
    current = [
        artifact for artifact in artifacts
        if not artifact.get("expired") and artifact.get("name") == dataset.artifact_name
    ]
    if current:
        return current[0] if len(current) == 1 else None

    candidates = [
        artifact for artifact in artifacts
        if not artifact.get("expired")
        and artifact.get("name") == dataset.legacy_artifact_name
    ]
    if not candidates or (dataset.job_name_prefix and job is None):
        return None
    if job is None:
        return candidates[0] if len(candidates) == 1 else None

    # Historical weekly artifacts share names between regular and ideal jobs.
    completed_at = _parse_github_time(job.get("completed_at"))
    if completed_at is None:
        return None
    distances = [
        (abs((created_at - completed_at).total_seconds()), artifact)
        for artifact in candidates
        if (created_at := _parse_github_time(artifact.get("created_at"))) is not None
    ]
    if not distances:
        return None
    nearest = min(distance for distance, _ in distances)
    matches = [artifact for distance, artifact in distances if distance == nearest]
    return matches[0] if len(matches) == 1 else None


def download_score_text(artifact_id: int) -> str:
    blob = gh_api_bytes(f"repos/{OWNER}/{REPO}/actions/artifacts/{artifact_id}/zip")
    return extract_score_text(blob)


def extract_score_text(blob: bytes) -> str:
    """Read the only score.txt from an artifact, regardless of its directory."""
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        matches = [
            entry
            for entry in zf.infolist()
            if not entry.is_dir() and entry.filename.rsplit("/", 1)[-1] == "score.txt"
        ]
        if len(matches) != 1:
            names = ", ".join(entry.filename for entry in matches) or "none"
            raise ValueError(
                f"Expected exactly one score.txt in artifact, found {len(matches)}: {names}"
            )
        with zf.open(matches[0]) as fp:
            return fp.read().decode("utf-8")


def fetch_commit_subject(sha: str) -> str:
    payload = gh_api_json(f"repos/{OWNER}/{REPO}/commits/{sha}")
    return payload["commit"]["message"].splitlines()[0]


def run_title(run: dict[str, Any]) -> str:
    title = str(run.get("display_title") or "").strip()
    if title:
        return title
    message = str(run.get("head_commit", {}).get("message") or "").strip()
    if message:
        return message.splitlines()[0]
    return fetch_commit_subject(run["head_sha"])


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
        points = sorted(
            (normalize_point_created_at(point) for point in points_by_dataset.get(dataset.id, [])),
            key=point_created_at_sort_key,
        )
        benchmarks = ["SPECint avg"]
        if points:
            average_order = {name: index for index, name in enumerate(AVERAGE_LABELS)}
            benchmarks = sorted(
                points[-1]["metrics"].keys(),
                key=lambda name: (
                    0 if name in average_order else 1,
                    average_order.get(name, 0),
                    name.startswith("fp:"),
                    name,
                ),
            )
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


def merge_existing_outputs(
    points_by_dataset: dict[str, list[dict[str, Any]]], out_dir: Path
) -> None:
    for dataset in DATASETS:
        path = out_dir / f"{dataset.id}.json"
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        existing_points = payload.get("points", [])
        if not isinstance(existing_points, list):
            continue
        points_by_key = {}
        for point in existing_points:
            if not isinstance(point, dict):
                continue
            key = (point.get("run_id"), point.get("commit"))
            points_by_key[key] = point
        for point in points_by_dataset.get(dataset.id, []):
            key = (point.get("run_id"), point.get("commit"))
            points_by_key[key] = point
        points_by_dataset[dataset.id] = list(points_by_key.values())


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
    title = run_title(run)
    points_by_dataset[dataset.id].append(build_point(run, parsed, title))
    print(f"included {dataset.id}: run {run['id']}", file=sys.stderr)
    return True


def collect_run(
    run: dict[str, Any],
    datasets: list[DatasetConfig],
    points_by_dataset: dict[str, list[dict[str, Any]]],
) -> None:
    if run.get("conclusion") != "success":
        datasets = [dataset for dataset in datasets if dataset.job_name_prefix]
    if not datasets:
        return
    artifacts = list_run_artifacts(run["id"])
    jobs: list[dict[str, Any]] | None = None
    for dataset in datasets:
        job = None
        has_current = any(
            artifact.get("name") == dataset.artifact_name and not artifact.get("expired")
            for artifact in artifacts
        )
        if dataset.job_name_prefix and (not has_current or run.get("conclusion") != "success"):
            if jobs is None:
                jobs = list_run_jobs(run["id"])
            job = find_dataset_job(jobs, dataset)
            if job is None:
                continue
        artifact = find_dataset_artifact(artifacts, dataset, job)
        if artifact:
            include_run(run, dataset, artifact, points_by_dataset)


def collect_from_commits(
    branch: str,
    max_pages: int,
    per_page: int,
    points_by_dataset: dict[str, list[dict[str, Any]]],
) -> None:
    for sha in list_branch_commits(branch, max_pages, per_page):
        runs = list_runs_for_commit(sha, branch)
        selected: dict[int, tuple[dict[str, Any], list[DatasetConfig]]] = {}
        for dataset in DATASETS:
            run = select_run_for_dataset(runs, dataset)
            if run:
                selected.setdefault(run["id"], (run, []))[1].append(dataset)
        for run, datasets in selected.values():
            collect_run(run, datasets, points_by_dataset)


def collect_from_runs(
    max_pages: int,
    per_page: int,
    points_by_dataset: dict[str, list[dict[str, Any]]],
) -> None:
    for run in list_recent_runs(max_pages, per_page):
        datasets = [dataset for dataset in DATASETS if run_matches_dataset(run, dataset)]
        collect_run(run, datasets, points_by_dataset)


def collect_from_workflows(
    branch: str,
    max_pages: int,
    per_page: int,
    points_by_dataset: dict[str, list[dict[str, Any]]],
) -> None:
    workflow_paths = sorted({dataset.workflow_path for dataset in DATASETS})
    for workflow_path in workflow_paths:
        # GitHub's workflow endpoint can return stale pages when the branch
        # query is present. Fetch the latest workflow runs and rely on the
        # exact head-branch check in run_matches_dataset instead.
        for run in list_workflow_runs(workflow_path, max_pages, per_page):
            datasets = [dataset for dataset in DATASETS if run_matches_dataset(run, dataset)]
            collect_run(run, datasets, points_by_dataset)


def main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Build dashboard data from GitHub Actions artifacts")
    parser.add_argument("--source", choices=("commits", "runs", "workflows"), default="workflows")
    parser.add_argument("--branch", default=DEFAULT_BRANCH)
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--per-page", type=int, default=100)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args(argv)

    points_by_dataset: dict[str, list[dict[str, Any]]] = defaultdict(list)

    if args.source == "commits":
        collect_from_commits(args.branch, args.max_pages, args.per_page, points_by_dataset)
    elif args.source == "runs":
        collect_from_runs(args.max_pages, args.per_page, points_by_dataset)
    else:
        collect_from_workflows(args.branch, args.max_pages, args.per_page, points_by_dataset)

    merge_existing_outputs(points_by_dataset, args.out_dir)
    write_outputs(points_by_dataset, args.out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
