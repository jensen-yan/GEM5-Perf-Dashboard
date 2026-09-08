import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildComparisonRows,
  buildRunIndex,
  comparisonCompatibility,
  comparisonSourceWarning,
  comparisonSummary,
  datasetEntriesWithPoints,
  diffBarGeometry,
  diffBarRatio,
  diffBarScale,
  parseActionsRunId,
  parsePastedScore,
  resolveRunSelection,
  tableClipboardPayload,
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
assert.equal(pastedScore.scoreFormat, "gem5");
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

const rtlScore = parsePastedScore(
  await readFile(new URL("./fixtures/sample_rtl_score.txt", import.meta.url), "utf8"),
);
assert.equal(rtlScore.specVersion, "06");
assert.equal(rtlScore.scoreFormat, "rtl");
assert.deepEqual(rtlScore.counts, { int: 2, fp: 2 });
assert.equal(rtlScore.metrics["SPECint avg"], 21.047);
assert.equal(rtlScore.metrics["SPECfp avg"], 23.236);
assert.equal(rtlScore.metrics["SPEC overall avg"], 22.304);
assert.equal(rtlScore.metrics.perlbench, 22.065);
assert.equal(rtlScore.metrics["fp:bwaves"], 47.134);
assert.equal(rtlScore.details.perlbench.coverage, 0.418);
assert.equal("400.perlbench" in rtlScore.metrics, false);

const rtlSpec17 = parsePastedScore(`
================ Score ================
600.perlbench_s 10 20 2.0 1.0
SPECint2017/GHz nan nan 2.0 nan
`);
assert.equal(rtlSpec17.specVersion, "17");
assert.equal(rtlSpec17.metrics.perlbench, 2.0);

const rtlSpec26 = parsePastedScore(`
================ Score ================
706.stockfish 10 20 2.0 1.0
SPECint2026/GHz nan nan 2.0 nan
`);
assert.equal(rtlSpec26.specVersion, "26");
assert.equal(rtlSpec26.metrics["706.stockfish"], 2.0);

assert.throws(() => parsePastedScore("not score data"), /supported GEM5 or RTL/);
assert.equal(comparisonSourceWarning({}, {}), null);
assert.match(
  comparisonSourceWarning({}, { score_format: "rtl" }),
  /GEM5 vs RTL comparison/,
);

const clipboardPayload = tableClipboardPayload([
  ["Group", "Benchmark", "Baseline A", "Target B", "Δ", "Δ %"],
  ["SPECINT", "perl\tbench", "21.052", "21.075", "+0.023", "+0.108%"],
  ["SPECFP", "<bwaves>", "22.707", "23.236", "+0.529", "+2.331%"],
]);
assert.equal(
  clipboardPayload.text,
  "Group\tBenchmark\tBaseline A\tTarget B\tΔ\tΔ %\n" +
    "SPECINT\tperl bench\t21.052\t21.075\t+0.023\t+0.108%\n" +
    "SPECFP\t<bwaves>\t22.707\t23.236\t+0.529\t+2.331%",
);
assert.match(clipboardPayload.html, /<thead><tr><th>Group<\/th>/);
assert.match(clipboardPayload.html, /<td>&lt;bwaves&gt;<\/td>/);

assert.equal(diffBarRatio(0), 0);
assert.equal(diffBarRatio(2), 0.1);
assert.equal(diffBarRatio(8, 16), 0.5);
assert.equal(diffBarRatio(-8, 16), 0.5);
assert.equal(diffBarRatio(200), diffBarRatio(20));
assert.deepEqual(diffBarGeometry(8, 16), { left: 50, width: 25 });
assert.deepEqual(diffBarGeometry(-8, 16), { left: 25, width: 25 });
assert.deepEqual(diffBarGeometry(-16, 16), { left: 0, width: 50 });
assert.equal(diffBarScale([{ diffPct: 8 }, { diffPct: -16 }, { diffPct: null }]), 16);

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
  ["SPECint avg", "perlbench", "gcc", "mcf", "fp:lbm"],
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
