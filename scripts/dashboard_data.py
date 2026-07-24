from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import re
from typing import Any

AVG_LABEL = "SPECint avg"
FP_AVG_LABEL = "SPECfp avg"
OVERALL_AVG_LABEL = "SPEC overall avg"

SECTION_HEADERS = {
    "================ Int =================": "int",
    "================ FP =================": "fp",
}
SECTION_AVG_LABELS = {
    "Int": AVG_LABEL,
    "FP": FP_AVG_LABEL,
    "overall": OVERALL_AVG_LABEL,
}
AVERAGE_LABELS = [AVG_LABEL, FP_AVG_LABEL, OVERALL_AVG_LABEL]


@dataclass(frozen=True)
class DatasetConfig:
    id: str
    label: str
    config_name: str
    toolchain: str
    coverage: str
    workflow_name: str
    workflow_path: str
    artifact_name: str
    archive_subdir: str
    workflow_event: str = "push"
    job_name_prefix: str | None = None


MAINLINE_BRANCH = "xs-dev"


DATASETS = [
    DatasetConfig(
        id="kmhv3-gcc12-spec06-0.3c",
        label="kmhv3 / gcc12 / SPEC06 0.3c",
        config_name="kmhv3",
        toolchain="gcc12",
        coverage="0.3c",
        workflow_name="gem5 Align BTB Performance Test(0.3c)",
        workflow_path=".github/workflows/gem5-align-btb-0.3c.yml",
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
        workflow_path=".github/workflows/gem5-align-btb-0.3c.yml",
        artifact_name="performance-score-gcc15-spec06-0.3c",
        archive_subdir="gcc15-spec06-0.3c",
    ),
    DatasetConfig(
        id="idealkmhv3-gcc15-spec06-0.3c",
        label="idealkmhv3 / gcc15 / SPEC06 0.3c",
        config_name="idealkmhv3",
        toolchain="gcc15",
        coverage="0.3c",
        workflow_name="gem5 Ideal BTB Performance Test",
        workflow_path=".github/workflows/gem5-ideal-btb-perf.yml",
        artifact_name="performance-score-gcc15-spec06-0.3c",
        archive_subdir="gcc15-spec06-0.3c",
    ),
    DatasetConfig(
        id="smt-idealkmhv3-gcc12-spec06-smt-0.3c",
        label="smt_idealkmhv3 / gcc12 / SPEC06 SMT 0.3c",
        config_name="smt_idealkmhv3",
        toolchain="gcc12",
        coverage="0.3c",
        workflow_name="gem5 SMT SPEC2006 Performance Test(0.3c)",
        workflow_path=".github/workflows/gem5-smt-spec06-0.3c.yml",
        artifact_name="performance-score-gcc12-spec06-smt-0.3c",
        archive_subdir="gcc12-spec06-smt-0.3c",
    ),
    DatasetConfig(
        id="idealkmhv3-gcc12-spec06-0.8c",
        label="idealkmhv3 / gcc12 / SPEC06 0.8c",
        config_name="idealkmhv3",
        toolchain="gcc12",
        coverage="0.8c",
        workflow_name="gem5 Ideal BTB Performance Test",
        workflow_path=".github/workflows/gem5-ideal-btb-perf.yml",
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
        workflow_path=".github/workflows/gem5-ideal-btb-perf.yml",
        artifact_name="performance-score-gcc15-spec06-0.8c",
        archive_subdir="gcc15-spec06-0.8c",
    ),
    DatasetConfig(
        id="weekly-kmhv3-gcc15-spec06-1.0c",
        label="weekly kmhv3 / gcc15 / SPEC06 1.0c",
        config_name="kmhv3",
        toolchain="gcc15",
        coverage="1.0c",
        workflow_name="gem5 Ideal BTB Weekly Performance Test",
        workflow_path=".github/workflows/gem5-ideal-btb-perf-weekly.yml",
        artifact_name="performance-score-gcc15-spec06-1.0c",
        archive_subdir="gcc15-spec06-1.0c",
        workflow_event="schedule",
        job_name_prefix="align_test_spec06 / ",
    ),
    DatasetConfig(
        id="weekly-kmhv3-spec17-1.0c",
        label="weekly kmhv3 / SPEC17 1.0c",
        config_name="kmhv3",
        toolchain="gcc15",
        coverage="1.0c",
        workflow_name="gem5 Ideal BTB Weekly Performance Test",
        workflow_path=".github/workflows/gem5-ideal-btb-perf-weekly.yml",
        artifact_name="performance-score-spec17-1.0c",
        archive_subdir="spec17-1.0c",
        workflow_event="schedule",
        job_name_prefix="align_test_spec17 / ",
    ),
    DatasetConfig(
        id="weekly-idealkmhv3-gcc15-spec06-1.0c",
        label="weekly idealkmhv3 / gcc15 / SPEC06 1.0c",
        config_name="idealkmhv3",
        toolchain="gcc15",
        coverage="1.0c",
        workflow_name="gem5 Ideal BTB Weekly Performance Test",
        workflow_path=".github/workflows/gem5-ideal-btb-perf-weekly.yml",
        artifact_name="performance-score-gcc15-spec06-1.0c",
        archive_subdir="gcc15-spec06-1.0c",
        workflow_event="schedule",
        job_name_prefix="perf_test_spec06 / ",
    ),
    DatasetConfig(
        id="weekly-idealkmhv3-spec17-1.0c",
        label="weekly idealkmhv3 / SPEC17 1.0c",
        config_name="idealkmhv3",
        toolchain="gcc15",
        coverage="1.0c",
        workflow_name="gem5 Ideal BTB Weekly Performance Test",
        workflow_path=".github/workflows/gem5-ideal-btb-perf-weekly.yml",
        artifact_name="performance-score-spec17-1.0c",
        archive_subdir="spec17-1.0c",
        workflow_event="schedule",
        job_name_prefix="perf_test_spec17 / ",
    ),
    DatasetConfig(
        id="weekly-smt-idealkmhv3-gcc12-spec06-smt-1.0c",
        label="weekly smt_idealkmhv3 / gcc12 / SPEC06 SMT 1.0c",
        config_name="smt_idealkmhv3",
        toolchain="gcc12",
        coverage="1.0c",
        workflow_name="gem5 Ideal BTB Weekly Performance Test",
        workflow_path=".github/workflows/gem5-ideal-btb-perf-weekly.yml",
        artifact_name="performance-score-gcc12-spec06-smt-1.0c",
        archive_subdir="gcc12-spec06-smt-1.0c",
        workflow_event="schedule",
        job_name_prefix="smt_test_spec06 / ",
    ),
    DatasetConfig(
        id="weekly-smt-idealkmhv3-gcc12-spec06-smt-0.3c",
        label="weekly smt_idealkmhv3 / gcc12 / SPEC06 SMT 0.3c",
        config_name="smt_idealkmhv3",
        toolchain="gcc12",
        coverage="0.3c",
        workflow_name="gem5 SMT SPEC2006 Performance Test(0.3c)",
        workflow_path=".github/workflows/gem5-smt-spec06-0.3c.yml",
        artifact_name="performance-score-gcc12-spec06-smt-0.3c",
        archive_subdir="gcc12-spec06-smt-0.3c",
        workflow_event="schedule",
    ),
]

DATASET_BY_ID = {dataset.id: dataset for dataset in DATASETS}
DATASETS_BY_ARTIFACT: dict[str, list[DatasetConfig]] = {}
for dataset in DATASETS:
    DATASETS_BY_ARTIFACT.setdefault(dataset.artifact_name, []).append(dataset)

_ROW_RE = re.compile(
    r"^(?P<name>[A-Za-z0-9_.-]+)\s+"
    r"(?P<time>[\d.]+)\s+"
    r"(?P<ref_time>[\d.]+)\s+"
    r"(?P<score>[\d.]+)\s+"
    r"(?P<coverage>[\d.]+)$"
)
_AVG_RE = re.compile(r"^Estimated (?P<section>Int|FP|overall) score per GHz: (?P<value>[\d.]+)$")
_ARCHIVE_TIMESTAMP_RE = re.compile(r"^\d{8}_\d{6}$")


def normalize_created_at(value: Any) -> str:
    """Normalize GitHub/archive timestamps so generated points sort chronologically."""
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if not value:
        return ""
    if _ARCHIVE_TIMESTAMP_RE.match(value):
        return (
            datetime.strptime(value, "%Y%m%d_%H%M%S")
            .replace(tzinfo=UTC)
            .isoformat()
            .replace("+00:00", "Z")
        )
    return value


def point_created_at_sort_key(point: dict[str, Any]) -> str:
    return normalize_created_at(point.get("created_at")) or str(point.get("created_at", ""))


def normalize_point_created_at(point: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_created_at(point.get("created_at"))
    if normalized and normalized != point.get("created_at"):
        return {**point, "created_at": normalized}
    return point


def parse_score_text(text: str) -> dict[str, Any]:
    """Parse score rows and averages from score.txt."""
    current_section: str | None = None
    rows: dict[str, dict[str, float]] = {}
    averages: dict[str, float] = {}

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line in SECTION_HEADERS:
            current_section = SECTION_HEADERS[line]
            continue
        if line.startswith("================"):
            current_section = None

        match_avg = _AVG_RE.match(line)
        if match_avg:
            label = SECTION_AVG_LABELS[match_avg.group("section")]
            averages[label] = float(match_avg.group("value"))
            continue

        if current_section is None:
            continue
        if not line or line.startswith("time"):
            continue

        match_row = _ROW_RE.match(line)
        if not match_row:
            continue

        name = match_row.group("name")
        if current_section != "int":
            name = f"{current_section}:{name}"
        rows[name] = {
            "time": float(match_row.group("time")),
            "ref_time": float(match_row.group("ref_time")),
            "score": float(match_row.group("score")),
            "coverage": float(match_row.group("coverage")),
        }

    if AVG_LABEL not in averages:
        raise ValueError("Failed to find SPECint average in score.txt")
    if not rows:
        raise ValueError("Failed to find SPECint benchmark rows in score.txt")

    return {
        "averages": averages,
        "specint_avg": averages[AVG_LABEL],
        "benchmarks": rows,
    }


def make_commit_url(sha: str) -> str:
    return f"https://github.com/OpenXiangShan/GEM5/commit/{sha}"


def run_matches_dataset(run: dict[str, Any], dataset: DatasetConfig) -> bool:
    """Return True when a workflow run matches the exact dashboard dataset source."""
    workflow_path = str(run.get("path", "")).split("@", 1)[0]
    return (
        run.get("event") == dataset.workflow_event
        and run.get("head_branch") == MAINLINE_BRANCH
        and run.get("name") == dataset.workflow_name
        and workflow_path == dataset.workflow_path
    )


def classify_run(run: dict[str, Any], artifact_name: str) -> DatasetConfig | None:
    """Map a GitHub Actions run plus artifact to one dashboard dataset."""
    for dataset in DATASETS_BY_ARTIFACT.get(artifact_name, []):
        if run_matches_dataset(run, dataset):
            return dataset
    return None


def benchmark_metrics(parsed: dict[str, Any]) -> dict[str, float]:
    metrics = {name: float(value) for name, value in parsed.get("averages", {}).items()}
    if not metrics:
        metrics[AVG_LABEL] = float(parsed["specint_avg"])
    for name, row in parsed["benchmarks"].items():
        metrics[name] = float(row["score"])
    return metrics


def benchmark_names(parsed: dict[str, Any]) -> list[str]:
    averages = parsed.get("averages", {})
    names = [name for name in AVERAGE_LABELS if name in averages] or [AVG_LABEL]
    names.extend(sorted(parsed["benchmarks"].keys(), key=lambda name: (":" in name, name)))
    return names
