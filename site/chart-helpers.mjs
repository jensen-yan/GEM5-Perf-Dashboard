export const ALL_SPECINT_OPTION = "__all_specint__";
export const AVG_LABEL = "SPECint avg";

export function buildBenchmarkOptions(benchmarks) {
  const options = [{ value: AVG_LABEL, label: AVG_LABEL }];
  const subscores = benchmarks.filter((name) => !name.startsWith("SPEC"));
  if (subscores.length) {
    options.push({
      value: ALL_SPECINT_OPTION,
      label: "All benchmark subscores",
    });
  }
  for (const name of benchmarks.filter((name) => name !== AVG_LABEL)) {
    options.push({ value: name, label: name });
  }
  return options;
}

export function resolveSeries(dataset, selectedBenchmark) {
  if (!dataset || !Array.isArray(dataset.points)) {
    return [];
  }

  if (selectedBenchmark === ALL_SPECINT_OPTION) {
    const metricNames = dataset.benchmarks?.length
      ? dataset.benchmarks.filter((name) => !name.startsWith("SPEC"))
      : Object.keys(dataset.points[0]?.metrics || {}).filter((name) => !name.startsWith("SPEC"));
    return metricNames.map((name) => ({
      name,
      values: dataset.points.map((point) => point.metrics?.[name] ?? null),
    }));
  }

  return [
    {
      name: selectedBenchmark,
      values: dataset.points.map((point) => point.metrics?.[selectedBenchmark] ?? null),
    },
  ];
}

export function latestSummary(dataset, selectedBenchmark) {
  if (!dataset?.points?.length) {
    return "-";
  }
  if (selectedBenchmark === ALL_SPECINT_OPTION) {
    return `${Math.max((dataset.benchmarks?.length || 1) - 1, 0)} lines`;
  }
  const latest = dataset.points[dataset.points.length - 1];
  const value = latest.metrics?.[selectedBenchmark];
  return typeof value === "number" ? value.toFixed(3) : "-";
}

export function filterSeriesByVisibility(seriesList, visibleSeriesNames, selectedBenchmark) {
  if (selectedBenchmark !== ALL_SPECINT_OPTION) {
    return seriesList;
  }
  return seriesList.filter((series) => visibleSeriesNames.has(series.name));
}

export function chartFullscreenButtonLabel(isFullscreen) {
  return isFullscreen ? "Exit Fullscreen" : "Fullscreen Chart";
}
