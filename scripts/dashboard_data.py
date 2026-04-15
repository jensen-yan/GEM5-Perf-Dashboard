from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

INT_HEADER = "================ Int ================="
AVG_LABEL = "SPECint avg"


@dataclass(frozen=True)
class DatasetConfig:
    id: str
    label: str
    config_name: str
    toolchain: str
    coverage: str
    workflow_name: str
    artifact_name: str
    archive_subdir: str


DATASETS = [
    DatasetConfig(
        id="kmhv3-gcc12-spec06-0.3c",
        label="kmhv3 / gcc12 / SPEC06 0.3c",
        config_name="kmhv3",
        toolchain="gcc12",
        coverage="0.3c",
        workflow_name="gem5 Align BTB Performance Test(0.3c)",
        artifact_name="performance-score-gcc12-spec06-0.3c",
        archive_subdir="gcc12-spec06-0.3c",
    ),
    DatasetConfig(
        id="kmhv3-gcc15-spec06-0.3c",
        label="kmhv3 / gcc15 / SPEC06 0.3c",
        config_name="kmhv3",
        toolchain="gcc15",
        coverage="0.3c",
        workflow_name="gem5 Align BTB Performance Test(0.3c)",
        artifact_name="performance-score-gcc15-spec06-0.3c",
        archive_subdir="gcc15-spec06-0.3c",
    ),
    DatasetConfig(
        id="idealkmhv3-gcc12-spec06-0.8c",
        label="idealkmhv3 / gcc12 / SPEC06 0.8c",
        config_name="idealkmhv3",
        toolchain="gcc12",
        coverage="0.8c",
        workflow_name="gem5 Ideal BTB Performance Test",
        artifact_name="performance-score-gcc12-spec06-0.8c",
        archive_subdir="gcc12-spec06-0.8c",
    ),
    DatasetConfig(
        id="idealkmhv3-gcc15-spec06-0.8c",
        label="idealkmhv3 / gcc15 / SPEC06 0.8c",
        config_name="idealkmhv3",
        toolchain="gcc15",
        coverage="0.8c",
        workflow_name="gem5 Ideal BTB Performance Test",
        artifact_name="performance-score-gcc15-spec06-0.8c",
        archive_subdir="gcc15-spec06-0.8c",
    ),
]

DATASET_BY_ID = {dataset.id: dataset for dataset in DATASETS}
DATASET_BY_ARTIFACT = {dataset.artifact_name: dataset for dataset in DATASETS}

_ROW_RE = re.compile(
    r"^(?P<name>[A-Za-z0-9_.-]+)\s+"
    r"(?P<time>[\d.]+)\s+"
    r"(?P<ref_time>[\d.]+)\s+"
    r"(?P<score>[\d.]+)\s+"
    r"(?P<coverage>[\d.]+)$"
)
_AVG_RE = re.compile(r"^Estimated Int score per GHz: (?P<value>[\d.]+)$")


def parse_score_text(text: str) -> dict[str, Any]:
    """Parse SPECint rows and the SPECint average from score.txt."""
    in_int_section = False
    rows: dict[str, dict[str, float]] = {}
    specint_avg: float | None = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line == INT_HEADER:
            in_int_section = True
            continue
        if in_int_section and line.startswith("================") and line != INT_HEADER:
            in_int_section = False

        match_avg = _AVG_RE.match(line)
        if match_avg:
            specint_avg = float(match_avg.group("value"))
            continue

        if not in_int_section:
            continue
        if not line or line.startswith("time"):
            continue

        match_row = _ROW_RE.match(line)
        if not match_row:
            continue

        name = match_row.group("name")
        rows[name] = {
            "time": float(match_row.group("time")),
            "ref_time": float(match_row.group("ref_time")),
            "score": float(match_row.group("score")),
            "coverage": float(match_row.group("coverage")),
        }

    if specint_avg is None:
        raise ValueError("Failed to find SPECint average in score.txt")
    if not rows:
        raise ValueError("Failed to find SPECint benchmark rows in score.txt")

    return {
        "specint_avg": specint_avg,
        "benchmarks": rows,
    }


def make_commit_url(sha: str) -> str:
    return f"https://github.com/OpenXiangShan/GEM5/commit/{sha}"


def classify_run(run: dict[str, Any], artifact_name: str) -> DatasetConfig | None:
    """Map a GitHub Actions run plus artifact to one dashboard dataset."""
    if run.get("event") != "push":
        return None
    if run.get("head_branch") != "xs-dev":
        return None

    dataset = DATASET_BY_ARTIFACT.get(artifact_name)
    if not dataset:
        return None
    if run.get("name") != dataset.workflow_name:
        return None
    return dataset


def benchmark_metrics(parsed: dict[str, Any]) -> dict[str, float]:
    metrics = {AVG_LABEL: float(parsed["specint_avg"])}
    for name, row in parsed["benchmarks"].items():
        metrics[name] = float(row["score"])
    return metrics


def benchmark_names(parsed: dict[str, Any]) -> list[str]:
    names = [AVG_LABEL]
    names.extend(sorted(parsed["benchmarks"].keys()))
    return names
