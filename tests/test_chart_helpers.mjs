import assert from "node:assert/strict";

import {
  ALL_SPECINT_OPTION,
  buildBenchmarkOptions,
  chartFullscreenButtonLabel,
  filterSeriesByVisibility,
  resolveSeries,
} from "../site/chart-helpers.mjs";

const benchmarks = [
  "SPECint avg",
  "astar",
  "gcc",
  "mcf",
];

const dataset = {
  points: [
    {
      metrics: {
        "SPECint avg": 18.5,
        astar: 19.1,
        gcc: 18.9,
        mcf: 17.0,
      },
    },
    {
      metrics: {
        "SPECint avg": 18.7,
        astar: 19.3,
        gcc: 19.0,
        mcf: 17.2,
      },
    },
  ],
};

const options = buildBenchmarkOptions(benchmarks);
assert.equal(options[0].value, "SPECint avg");
assert.equal(options[1].value, ALL_SPECINT_OPTION);
assert.equal(options[1].label, "All SPECint subscores");

const singleSeries = resolveSeries(dataset, "gcc");
assert.equal(singleSeries.length, 1);
assert.equal(singleSeries[0].name, "gcc");
assert.deepEqual(singleSeries[0].values, [18.9, 19.0]);

const allSeries = resolveSeries(dataset, ALL_SPECINT_OPTION);
assert.equal(allSeries.length, 3);
assert.deepEqual(
  allSeries.map((series) => series.name),
  ["astar", "gcc", "mcf"],
);

const filteredSeries = filterSeriesByVisibility(
  allSeries,
  new Set(["astar", "mcf"]),
  ALL_SPECINT_OPTION,
);
assert.deepEqual(
  filteredSeries.map((series) => series.name),
  ["astar", "mcf"],
);

const hiddenAllSeries = filterSeriesByVisibility(
  allSeries,
  new Set(),
  ALL_SPECINT_OPTION,
);
assert.equal(hiddenAllSeries.length, 0);

const unchangedSingleSeries = filterSeriesByVisibility(
  singleSeries,
  new Set(["gcc"]),
  "gcc",
);
assert.deepEqual(unchangedSingleSeries, singleSeries);

assert.equal(chartFullscreenButtonLabel(false), "Fullscreen Chart");
assert.equal(chartFullscreenButtonLabel(true), "Exit Fullscreen");

console.log("chart helpers ok");
