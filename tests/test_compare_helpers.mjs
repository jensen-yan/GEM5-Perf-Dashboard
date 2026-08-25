import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildComparisonRows,
  buildRunIndex,
  comparisonCompatibility,
  comparisonSummary,
  datasetEntriesWithPoints,
  diffBarRatio,
  parseActionsRunId,
  parsePastedScore,
  resolveRunSelection,
} from "../site/compare-helpers.mjs";

assert.equal(
  parseActionsRunId("https://github.com/OpenXiangShan/GEM5/actions/runs/32160902176"),
  "32160902176",
);
assert.equal(
  parseActionsRunId("https://github.com/openxiangshan/gem5/actions/runs/32160902176/job/1"),
  "32160902176",
);
assert.equal(parseActionsRunId("32160902176"), "32160902176");
assert.equal(parseActionsRunId("https://example.com/actions/runs/32160902176"), null);
assert.equal(parseActionsRunId("not a run"), null);

const visibleEntries = datasetEntriesWithPoints(
  [
    { id: "empty", point_count: 0 },
    { id: "current", point_count: 2 },
  ],
  new Map([
    ["empty", { points: [] }],
    ["current", { points: [{ run_id: 1 }, { run_id: 2 }] }],
  ]),
);
assert.deepEqual(visibleEntries.map((entry) => entry.id), ["current"]);

const pastedScore = parsePastedScore(
  await readFile(new URL("./fixtures/sample_score.txt", import.meta.url), "utf8"),
);
assert.equal(pastedScore.specVersion, "06");
assert.equal(pastedScore.counts.int, 12);
assert.equal(pastedScore.counts.fp, 0);
assert.equal(pastedScore.metrics["SPECint avg"], 18.69279014105546);
assert.equal(pastedScore.metrics.gcc, 19.022);
assert.equal(pastedScore.details.mcf.coverage, 0.341);

const fullSuiteScore = parsePastedScore(`
================ SPEC26 =================
================ Int =================
time ref_time score coverage
706.stockfish, 10, 20, 2.0, 1.0
Estimated Int score per GHz: 2.0
================ FP =================
time ref_time score coverage
782.lbm 20 30 1.5 1.0
Estimated FP score per GHz: 1.5
================ Overall =================
Estimated overall score per GHz: 1.75
`);
assert.equal(fullSuiteScore.specVersion, "26");
assert.deepEqual(fullSuiteScore.counts, { int: 1, fp: 1 });
assert.equal(fullSuiteScore.metrics["SPEC overall avg"], 1.75);
assert.equal(fullSuiteScore.metrics["fp:782.lbm"], 1.5);
assert.throws(() => parsePastedScore("not score data"), /Estimated Int score per GHz/);

assert.equal(diffBarRatio(0), 0);
assert.ok(diffBarRatio(2) > 0.3);
assert.ok(diffBarRatio(20) > diffBarRatio(2));
assert.equal(diffBarRatio(200), diffBarRatio(20));

const pointA = {
  run_id: 100,
  metrics: {
    "SPECint avg": 20,
    perlbench: 10,
    gcc: 20,
    "fp:lbm": 30,
  },
};
const pointB = {
  run_id: 101,
  metrics: {
    "SPECint avg": 22,
    perlbench: 9,
    gcc: 25,
    mcf: 40,
    "fp:lbm": 33,
  },
};
const datasetA = {
  dataset: {
    id: "kmhv3-gcc15-spec06-0.3c",
    label: "kmhv3 / gcc15 / SPEC06 0.3c",
    toolchain: "gcc15",
    coverage: "0.3c",
  },
  points: [pointA, pointB],
};
const datasetB = {
  dataset: {
    id: "idealkmhv3-gcc15-spec06-1.0c",
    label: "idealkmhv3 / gcc15 / SPEC06 1.0c",
    toolchain: "gcc15",
    coverage: "1.0c",
  },
  points: [{ ...pointA, run_id: 100 }],
};

const runIndex = buildRunIndex(
  new Map([
    [datasetA.dataset.id, datasetA],
    [datasetB.dataset.id, datasetB],
  ]),
);
assert.equal(resolveRunSelection(runIndex, 101).status, "resolved");
assert.equal(resolveRunSelection(runIndex, 100).status, "ambiguous");
assert.equal(
  resolveRunSelection(runIndex, 100, datasetB.dataset.id).match.datasetId,
  datasetB.dataset.id,
);
assert.equal(resolveRunSelection(runIndex, 999).status, "missing");

const rows = buildComparisonRows(pointA, pointB);
assert.deepEqual(
  rows.map((row) => row.name),
  ["SPECint avg", "gcc", "mcf", "perlbench", "fp:lbm"],
);
assert.equal(rows.find((row) => row.name === "SPECint avg").diffPct, 10);
assert.equal(rows.find((row) => row.name === "perlbench").diffPct, -10);
assert.equal(rows.find((row) => row.name === "mcf").hasBoth, false);
assert.equal(rows.find((row) => row.name === "fp:lbm").label, "lbm");
assert.deepEqual(comparisonSummary(rows), {
  common: 3,
  total: 4,
  headlineName: "SPECint avg",
  headlineDiffPct: 10,
});

const compatibility = comparisonCompatibility(datasetA, datasetB);
assert.deepEqual(compatibility.blocking, []);
assert.deepEqual(compatibility.warnings, ["Coverage mismatch: 0.3c vs 1.0c."]);

const spec17Dataset = {
  dataset: {
    id: "weekly-kmhv3-spec17-1.0c",
    label: "weekly kmhv3 / SPEC17 1.0c",
    toolchain: "gcc15",
    coverage: "1.0c",
  },
  points: [],
};
assert.deepEqual(comparisonCompatibility(datasetA, spec17Dataset).blocking, [
  "SPEC version mismatch: SPEC06 vs SPEC17.",
]);

console.log("compare helpers ok");
