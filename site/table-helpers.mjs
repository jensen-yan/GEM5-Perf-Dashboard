import { ALL_SPECINT_OPTION, AVG_LABEL } from "./chart-helpers.mjs";

function formatCell(value) {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

export function buildTableRows(dataset, selectedBenchmark) {
  if (!dataset?.points?.length) {
    return [];
  }

  return dataset.points.map((point) => {
    const detail =
      selectedBenchmark && selectedBenchmark !== ALL_SPECINT_OPTION
        ? point.details?.[selectedBenchmark]
        : null;
    const valueMetric = selectedBenchmark === ALL_SPECINT_OPTION ? AVG_LABEL : selectedBenchmark;
    return {
      createdAt: point.created_at,
      shortCommit: point.short_commit,
      title: point.title,
      runId: point.run_id,
      value: formatCell(point.metrics?.[valueMetric]),
      coverage: formatCell(detail?.coverage),
      score: formatCell(detail?.score),
      time: formatCell(detail?.time),
      refTime: formatCell(detail?.ref_time),
    };
  });
}

export function buildTableModel(dataset, selectedBenchmark) {
  if (!dataset?.points?.length) {
    return {
      columns: [],
      rows: [],
    };
  }

  const rows = buildTableRows(dataset, selectedBenchmark);
  if (selectedBenchmark === ALL_SPECINT_OPTION) {
    const metricColumns = dataset.benchmarks?.length
      ? dataset.benchmarks
      : Object.keys(dataset.points[0]?.metrics || {});
    return {
      columns: [
        { key: "createdAt", label: "Date" },
        { key: "shortCommit", label: "Commit" },
        { key: "runId", label: "Run" },
        ...metricColumns.map((metric) => ({ key: `metric:${metric}`, label: metric })),
        { key: "title", label: "Title" },
      ],
      rows: dataset.points.map((point, index) => ({
        ...rows[index],
        metrics: Object.fromEntries(metricColumns.map((metric) => [metric, formatCell(point.metrics?.[metric])])),
      })),
    };
  }

  return {
    columns: [
      { key: "createdAt", label: "Date" },
      { key: "shortCommit", label: "Commit" },
      { key: "runId", label: "Run" },
      { key: "value", label: selectedBenchmark || AVG_LABEL },
      { key: "coverage", label: "Coverage" },
      { key: "score", label: "Score" },
      { key: "time", label: "Time" },
      { key: "refTime", label: "Ref Time" },
      { key: "title", label: "Title" },
    ],
    rows,
  };
}
