// Explicit current-series aliases: a profile upgrade changes these pointers,
// while every dataset keeps its original ID and history.
export const CURRENT_DATASETS = new Map([
  ["kmhv3-spec06-rva23-novec-gcc16-0.3c", "kmhv3"],
  ["idealkmhv3-spec06-rva23-novec-gcc16-0.3c", "idealkmhv3"],
  ["smt-idealkmhv3-gcc12-spec06-smt-0.3c", "SMT"],
]);

const FULL_DATASETS = new Set([
  "weekly-kmhv3-spec06-rva23-novec-gcc16-1.0c",
  "weekly-idealkmhv3-spec06-rva23-novec-gcc16-1.0c",
  "weekly-kmhv3-spec17-1.0c",
  "weekly-idealkmhv3-spec17-1.0c",
  "weekly-kmhv3-gcc15-spec26-1.0c",
  "weekly-idealkmhv3-gcc15-spec26-1.0c",
  "weekly-idealkmhv3-gcc12-spec06-dynpf-1.0c",
  "weekly-smt-idealkmhv3-gcc12-spec06-smt-1.0c",
]);

export function datasetPickerGroups(entries, expanded = false) {
  const current = entries.filter((entry) => CURRENT_DATASETS.has(entry.id));
  const groups = [{ label: "当前 SPEC06 · 日常回归", entries: current }];
  if (expanded || current.length === 0) {
    groups.push(
      { label: "全量测试 · SPEC06 / 17 / 26", entries: entries.filter((entry) => FULL_DATASETS.has(entry.id)) },
      { label: "历史数据", entries: entries.filter((entry) => !CURRENT_DATASETS.has(entry.id) && !FULL_DATASETS.has(entry.id)) },
    );
  }
  return groups.filter((group) => group.entries.length);
}
