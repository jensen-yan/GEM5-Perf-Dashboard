import assert from "node:assert/strict";

import { buildTableRows } from "../site/table-helpers.mjs";

const dataset = {
  points: [
    {
      created_at: "2026-04-14T10:40:51Z",
      short_commit: "cac9b46979",
      title: "arch-riscv,configs: Add SE matrix smoke support (#819)",
      run_id: 24394540782,
      metrics: {
        "SPECint avg": 21.757342479568475,
        gcc: 22.125,
      },
      details: {
        gcc: {
          coverage: 0.8,
          score: 22.125,
          time: 101.3,
          ref_time: 80.4,
        },
      },
    },
  ],
};

const gccRows = buildTableRows(dataset, "gcc");
assert.equal(gccRows.length, 1);
assert.deepEqual(gccRows[0], {
  createdAt: "2026-04-14T10:40:51Z",
  shortCommit: "cac9b46979",
  title: "arch-riscv,configs: Add SE matrix smoke support (#819)",
  runId: 24394540782,
  value: "22.125",
  coverage: "0.800",
  score: "22.125",
  time: "101.300",
  refTime: "80.400",
});

const avgRows = buildTableRows(dataset, "SPECint avg");
assert.equal(avgRows[0].value, "21.757");
assert.equal(avgRows[0].coverage, "-");

console.log("table helpers ok");
