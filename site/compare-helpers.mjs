const SUMMARY_METRICS = ["SPECint avg", "SPECfp avg", "SPEC overall avg"];
const SCORE_SECTION_LABELS = {
  Int: "int",
  FP: "fp",
};
const SCORE_AVERAGE_LABELS = {
  Int: "SPECint avg",
  FP: "SPECfp avg",
  overall: "SPEC overall avg",
};
const SCORE_NUMBER_PATTERN = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const SCORE_ROW_RE = new RegExp(
  `^([A-Za-z0-9_.-]+)\\s+(${SCORE_NUMBER_PATTERN})\\s+(${SCORE_NUMBER_PATTERN})\\s+(${SCORE_NUMBER_PATTERN})\\s+(${SCORE_NUMBER_PATTERN})$`,
);
const SCORE_AVERAGE_RE = new RegExp(
  `^Estimated (Int|FP|overall) score per GHz:\\s*(${SCORE_NUMBER_PATTERN})$`,
  "i",
);

function numericMetric(point, name) {
  const value = point?.metrics?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseActionsRunId(value) {
  const text = String(value || "").trim();
  if (/^\d+$/.test(text)) {
    return text;
  }

  try {
    const url = new URL(text);
    if (url.hostname.toLowerCase() !== "github.com") {
      return null;
    }
    const match = /^\/OpenXiangShan\/GEM5\/actions\/runs\/(\d+)(?:\/|$)/i.exec(
      url.pathname,
    );
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function parsePastedScore(value) {
  const text = String(value || "");
  const details = {};
  const averages = {};
  const counts = { int: 0, fp: 0 };
  let currentSection = null;
  let specVersion = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const specMatch = /^=+\s*SPEC(?:20)?(06|17|26)\s*=+$/i.exec(line);
    if (specMatch) {
      specVersion = specMatch[1];
      currentSection = null;
      continue;
    }

    const sectionMatch = /^=+\s*(Int|FP)\s*=+$/.exec(line);
    if (sectionMatch) {
      currentSection = SCORE_SECTION_LABELS[sectionMatch[1]];
      continue;
    }
    if (line.startsWith("================")) {
      currentSection = null;
    }

    const averageMatch = SCORE_AVERAGE_RE.exec(line);
    if (averageMatch) {
      const averageSection = averageMatch[1].toLowerCase();
      const section = averageSection === "overall" ? "overall" : averageSection === "fp" ? "FP" : "Int";
      averages[SCORE_AVERAGE_LABELS[section]] = Number(averageMatch[2]);
      continue;
    }

    if (!currentSection || !line || /^(?:benchmark\s+)?time(?:[\s,]|$)/i.test(line)) {
      continue;
    }

    const rowMatch = SCORE_ROW_RE.exec(line.replaceAll(",", " ").replace(/\s+/g, " "));
    if (!rowMatch) {
      continue;
    }
    const name = currentSection === "int" ? rowMatch[1] : `${currentSection}:${rowMatch[1]}`;
    details[name] = {
      time: Number(rowMatch[2]),
      ref_time: Number(rowMatch[3]),
      score: Number(rowMatch[4]),
      coverage: Number(rowMatch[5]),
    };
    counts[currentSection] += 1;
  }

  if (!("SPECint avg" in averages)) {
    throw new Error("Could not find 'Estimated Int score per GHz' in pasted score data.");
  }
  if (!Object.keys(details).length) {
    throw new Error("Could not find benchmark rows in pasted score data.");
  }

  const metrics = { ...averages };
  for (const [name, detail] of Object.entries(details)) {
    metrics[name] = detail.score;
  }
  return { specVersion, averages, metrics, details, counts };
}

export function buildRunIndex(datasets) {
  const index = new Map();
  for (const [datasetId, dataset] of datasets) {
    for (const point of dataset.points || []) {
      const runId = String(point.run_id);
      const matches = index.get(runId) || [];
      matches.push({ datasetId, dataset, point });
      index.set(runId, matches);
    }
  }
  return index;
}

export function resolveRunSelection(runIndex, runId, preferredDatasetId = null) {
  const matches = runIndex.get(String(runId)) || [];
  const preferred = matches.find((match) => match.datasetId === preferredDatasetId);
  if (preferred) {
    return { status: "resolved", match: preferred, matches };
  }
  if (matches.length === 1) {
    return { status: "resolved", match: matches[0], matches };
  }
  return {
    status: matches.length ? "ambiguous" : "missing",
    match: null,
    matches,
  };
}

export function inferSpecVersion(dataset) {
  const text = `${dataset?.dataset?.id || ""} ${dataset?.dataset?.label || ""}`;
  const match = /SPEC(?:20)?(06|17|26)/i.exec(text);
  return match?.[1] || null;
}

export function comparisonCompatibility(baseDataset, targetDataset) {
  const warnings = [];
  const blocking = [];
  const baseVersion = inferSpecVersion(baseDataset);
  const targetVersion = inferSpecVersion(targetDataset);
  const baseCoverage = baseDataset?.dataset?.coverage;
  const targetCoverage = targetDataset?.dataset?.coverage;

  if (baseVersion && targetVersion && baseVersion !== targetVersion) {
    blocking.push(`SPEC version mismatch: SPEC${baseVersion} vs SPEC${targetVersion}.`);
  }
  if (baseCoverage && targetCoverage && baseCoverage !== targetCoverage) {
    warnings.push(`Coverage mismatch: ${baseCoverage} vs ${targetCoverage}.`);
  }
  if (
    baseDataset?.dataset?.toolchain &&
    targetDataset?.dataset?.toolchain &&
    baseDataset.dataset.toolchain !== targetDataset.dataset.toolchain
  ) {
    warnings.push(
      `Toolchain differs: ${baseDataset.dataset.toolchain} vs ${targetDataset.dataset.toolchain}.`,
    );
  }

  return { blocking, warnings };
}

function metricGroup(name) {
  if (name === "SPECint avg") return "Summary";
  if (name === "SPECfp avg") return "Summary";
  if (name === "SPEC overall avg") return "Summary";
  return name.startsWith("fp:") ? "SPECfp" : "SPECint";
}

function displayMetricName(name) {
  return name.startsWith("fp:") ? name.slice(3) : name;
}

function metricSortKey(name) {
  const summaryIndex = SUMMARY_METRICS.indexOf(name);
  if (summaryIndex >= 0) return [0, summaryIndex, name];
  return name.startsWith("fp:") ? [2, 0, name] : [1, 0, name];
}

export function buildComparisonRows(basePoint, targetPoint) {
  const names = new Set([
    ...Object.keys(basePoint?.metrics || {}),
    ...Object.keys(targetPoint?.metrics || {}),
  ]);
  return [...names]
    .sort((a, b) => {
      const aKey = metricSortKey(a);
      const bKey = metricSortKey(b);
      return (
        aKey[0] - bKey[0] ||
        aKey[1] - bKey[1] ||
        String(aKey[2]).localeCompare(String(bKey[2]))
      );
    })
    .map((name) => {
      const base = numericMetric(basePoint, name);
      const target = numericMetric(targetPoint, name);
      const diff = base !== null && target !== null ? target - base : null;
      return {
        name,
        label: displayMetricName(name),
        group: metricGroup(name),
        summary: SUMMARY_METRICS.includes(name),
        base,
        target,
        diff,
        diffPct: diff !== null && base !== 0 ? (diff / base) * 100 : null,
        hasBoth: base !== null && target !== null,
      };
    });
}

export function comparisonSummary(rows) {
  const benchmarks = rows.filter((row) => !row.summary);
  const common = benchmarks.filter((row) => row.hasBoth).length;
  const preferred = ["SPEC overall avg", "SPECint avg", "SPECfp avg"]
    .map((name) => rows.find((row) => row.name === name && row.hasBoth))
    .find(Boolean);
  return {
    common,
    total: benchmarks.length,
    headlineName: preferred?.name || null,
    headlineDiffPct: preferred?.diffPct ?? null,
  };
}

export function diffBarRatio(value, cap = 20) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) < 0.0005) {
    return 0;
  }
  const magnitude = Math.min(Math.abs(value), cap);
  return Math.log1p(magnitude) / Math.log1p(cap);
}
