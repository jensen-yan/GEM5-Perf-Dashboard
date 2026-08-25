import {
  ALL_SPECINT_OPTION,
  AVG_LABEL,
  DEFAULT_CHART_POINT_LIMIT,
  buildBenchmarkOptions,
  chartFullscreenButtonLabel,
  filterSeriesByVisibility,
  latestSummary,
  resolveSeries,
  selectChartPoints,
} from "./chart-helpers.mjs";
import { buildTableModel } from "./table-helpers.mjs";
import {
  buildComparisonRows,
  buildRunIndex,
  comparisonCompatibility,
  comparisonSummary,
  datasetEntriesWithPoints,
  diffBarGeometry,
  diffBarScale,
  inferSpecVersion,
  parseActionsRunId,
  parsePastedScore,
  resolveRunSelection,
} from "./compare-helpers.mjs";

const manifestPath = "./data/manifest.json";
const palette = [
  "#3B82F6",
  "#0F766E",
  "#8B5CF6",
  "#D97706",
  "#EC4899",
  "#0891B2",
  "#475569",
  "#65A30D",
  "#A855F7",
  "#EA580C",
  "#2563EB",
  "#BE185D",
];

const state = {
  manifest: null,
  datasets: new Map(),
  runIndex: new Map(),
  currentDatasetId: null,
  currentBenchmark: AVG_LABEL,
  visibleSeriesNames: null,
  showAllPoints: false,
  mode: "trend",
  comparison: {
    a: { datasetId: null, runId: null },
    b: { datasetId: null, runId: null },
    regressionsOnly: false,
  },
};

const trendModeButton = document.getElementById("trend-mode-button");
const compareModeButton = document.getElementById("compare-mode-button");
const trendSidebar = document.getElementById("trend-sidebar");
const compareSidebar = document.getElementById("compare-sidebar");
const trendView = document.getElementById("trend-view");
const compareView = document.getElementById("compare-view");
const datasetSelect = document.getElementById("dataset-select");
const benchmarkSelect = document.getElementById("benchmark-select");
const datasetMeta = document.getElementById("dataset-meta");
const chartTitle = document.getElementById("chart-title");
const chartNote = document.getElementById("chart-note");
const pointCount = document.getElementById("point-count");
const latestValue = document.getElementById("latest-value");
const modeLabel = document.getElementById("mode-label");
const legendRoot = document.getElementById("chart-legend");
const chartRange = document.getElementById("chart-range");
const chartRangeRecent = document.getElementById("chart-range-recent");
const chartRangeAll = document.getElementById("chart-range-all");
const chart = document.getElementById("chart");
const chartEmpty = document.getElementById("chart-empty");
const pointDetail = document.getElementById("point-detail");
const chartPanel = document.querySelector(".chart-panel");
const chartFullscreenButton = document.getElementById("chart-fullscreen-button");
const tableTitle = document.getElementById("table-title");
const tableFrame = document.getElementById("table-frame");
const tableModal = document.getElementById("table-modal");
const tableModalTitle = document.getElementById("table-modal-title");
const tableFrameModal = document.getElementById("table-frame-modal");
const tableFullscreenButton = document.getElementById("table-fullscreen-button");
const tableCloseButton = document.getElementById("table-close-button");
const tableModalBackdrop = document.getElementById("table-modal-backdrop");
const comparisonTitle = document.getElementById("comparison-title");
const comparisonNote = document.getElementById("comparison-note");
const comparisonCommonCount = document.getElementById("comparison-common-count");
const comparisonHeadlineLabel = document.getElementById("comparison-headline-label");
const comparisonHeadlineDiff = document.getElementById("comparison-headline-diff");
const comparisonAlerts = document.getElementById("comparison-alerts");
const comparisonTableFrame = document.getElementById("comparison-table-frame");
const comparisonRegressionsButton = document.getElementById("comparison-regressions-button");
const comparisonCopyLinkButton = document.getElementById("comparison-copy-link-button");
const comparisonSwapButton = document.getElementById("compare-swap-button");

const comparisonElements = {
  a: {
    dataset: document.getElementById("compare-a-dataset"),
    run: document.getElementById("compare-a-run"),
    url: document.getElementById("compare-a-url"),
    apply: document.getElementById("compare-a-apply"),
    paste: document.getElementById("compare-a-paste"),
    feedback: document.getElementById("compare-a-feedback"),
  },
  b: {
    dataset: document.getElementById("compare-b-dataset"),
    run: document.getElementById("compare-b-run"),
    url: document.getElementById("compare-b-url"),
    apply: document.getElementById("compare-b-apply"),
    paste: document.getElementById("compare-b-paste"),
    feedback: document.getElementById("compare-b-feedback"),
  },
};

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function formatValue(value) {
  return Number(value).toFixed(3);
}

function formatDate(value) {
  if (/^\d{8}_\d{6}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(9, 11)}:${value.slice(11, 13)}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatComparisonValue(value) {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

function formatSigned(value, suffix = "") {
  if (typeof value !== "number") {
    return "—";
  }
  const normalized = Math.abs(value) < 0.0005 ? 0 : value;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(3)}${suffix}`;
}

function comparisonSelection(id) {
  return state.comparison[id];
}

function comparisonDataset(id) {
  return state.datasets.get(comparisonSelection(id).datasetId);
}

function comparisonPoint(id) {
  const source = comparisonSelection(id);
  if (source.customPoint) {
    return source.customPoint;
  }
  return comparisonDataset(id)?.points.find(
    (point) => String(point.run_id) === String(source.runId),
  );
}

function selectionToken(source) {
  return !source.customPoint && source.datasetId && source.runId
    ? `${source.datasetId}@${source.runId}`
    : null;
}

function parseSelectionToken(value) {
  const separator = String(value || "").lastIndexOf("@");
  if (separator <= 0) {
    return null;
  }
  return {
    datasetId: value.slice(0, separator),
    runId: value.slice(separator + 1),
  };
}

function selectionExists(source) {
  const dataset = state.datasets.get(source?.datasetId);
  return Boolean(
    dataset?.points.some((point) => String(point.run_id) === String(source?.runId)),
  );
}

function defaultRunId(dataset, id) {
  const points = dataset?.points || [];
  if (!points.length) {
    return null;
  }
  const index = id === "a" && points.length > 1 ? points.length - 2 : points.length - 1;
  return String(points[index].run_id);
}

function initializeComparisonState(defaultDatasetId) {
  const dataset = state.datasets.get(defaultDatasetId);
  for (const id of ["a", "b"]) {
    state.comparison[id] = {
      datasetId: defaultDatasetId,
      runId: defaultRunId(dataset, id),
    };
  }

  const params = new URLSearchParams(window.location.search);
  for (const id of ["a", "b"]) {
    const saved = parseSelectionToken(params.get(id));
    if (selectionExists(saved)) {
      state.comparison[id] = saved;
    }
  }
  state.mode = params.get("view") === "compare" ? "compare" : "trend";
}

function updateComparisonUrl() {
  const url = new URL(window.location.href);
  if (state.mode === "compare") {
    url.searchParams.set("view", "compare");
    for (const id of ["a", "b"]) {
      const token = selectionToken(comparisonSelection(id));
      if (token) {
        url.searchParams.set(id, token);
      } else {
        url.searchParams.delete(id);
      }
    }
  } else {
    url.searchParams.delete("view");
    url.searchParams.delete("a");
    url.searchParams.delete("b");
  }
  window.history.replaceState({}, "", url);
}

function setMode(mode) {
  state.mode = mode;
  render();
  updateComparisonUrl();
}

function renderModeVisibility() {
  const comparing = state.mode === "compare";
  trendModeButton.setAttribute("aria-pressed", String(!comparing));
  compareModeButton.setAttribute("aria-pressed", String(comparing));
  trendSidebar.classList.toggle("hidden", comparing);
  compareSidebar.classList.toggle("hidden", !comparing);
  trendView.classList.toggle("hidden", comparing);
  compareView.classList.toggle("hidden", !comparing);
}

function setSourceFeedback(id, message = "", error = false) {
  const feedback = comparisonElements[id].feedback;
  feedback.textContent = message;
  feedback.classList.toggle("source-feedback-error", error);
}

function renderComparisonSource(id) {
  const source = comparisonSelection(id);
  const elements = comparisonElements[id];
  elements.dataset.replaceChildren();

  for (const entry of datasetEntriesWithPoints(state.manifest.datasets, state.datasets)) {
    const dataset = state.datasets.get(entry.id);
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = `${entry.label} (${dataset?.points.length || 0})`;
    elements.dataset.appendChild(option);
  }
  elements.dataset.value = source.datasetId;

  const dataset = state.datasets.get(source.datasetId);
  elements.run.replaceChildren();
  for (const point of [...(dataset?.points || [])].reverse()) {
    const option = document.createElement("option");
    option.value = String(point.run_id);
    option.textContent = `${point.run_id} · ${point.short_commit} · ${formatDate(point.created_at).slice(0, 10)}`;
    elements.run.appendChild(option);
  }
  if (source.customPoint) {
    const option = document.createElement("option");
    option.value = String(source.customPoint.run_id);
    option.textContent = `Pasted raw score · ${source.customPoint.metric_count} metrics`;
    elements.run.prepend(option);
  }
  elements.run.value = String(source.runId || "");
}

function comparisonSourceName(dataset, point) {
  if (!dataset || !point) {
    return "Not selected";
  }
  return `${dataset.dataset.label} · Run ${point.run_id} · ${point.short_commit}`;
}

function renderComparisonAlerts(blocking, warnings) {
  comparisonAlerts.replaceChildren();
  for (const message of blocking) {
    const item = document.createElement("div");
    item.className = "comparison-alert comparison-alert-error";
    item.textContent = message;
    comparisonAlerts.appendChild(item);
  }
  for (const message of warnings) {
    const item = document.createElement("div");
    item.className = "comparison-alert";
    item.textContent = message;
    comparisonAlerts.appendChild(item);
  }
  comparisonAlerts.classList.toggle("hidden", !blocking.length && !warnings.length);
}

function comparisonCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) {
    cell.className = className;
  }
  return cell;
}

function diffClass(value) {
  if (typeof value !== "number" || Math.abs(value) < 0.0005) {
    return "";
  }
  return value > 0 ? "diff-positive" : "diff-negative";
}

function applyConditionalDiff(element, value) {
  const className = diffClass(value);
  if (!className) {
    return element;
  }
  element.classList.add(className);
  return element;
}

function applyConditionalBar(element, value, scale) {
  applyConditionalDiff(element, value);
  if (!diffClass(value)) {
    return element;
  }
  const { left, width } = diffBarGeometry(value, scale);
  element.classList.add("diff-data-bar");
  element.style.setProperty("--diff-bar-left", `${left.toFixed(2)}%`);
  element.style.setProperty("--diff-bar-width", `${width.toFixed(2)}%`);
  return element;
}

function renderComparisonTable(rows, blocked) {
  if (blocked) {
    const empty = document.createElement("div");
    empty.className = "table-empty";
    empty.textContent = "Choose compatible SPEC datasets to compare scores.";
    comparisonTableFrame.replaceChildren(empty);
    return;
  }

  const visibleRows = state.comparison.regressionsOnly
    ? rows.filter((row) => row.summary || (row.hasBoth && row.diffPct < 0))
    : rows;
  if (!visibleRows.length) {
    const empty = document.createElement("div");
    empty.className = "table-empty";
    empty.textContent = state.comparison.regressionsOnly
      ? "No benchmark regressions in this comparison."
      : "No comparable score data is available.";
    comparisonTableFrame.replaceChildren(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table comparison-table";
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  for (const label of ["Group", "Benchmark", "Baseline A", "Target B", "Δ", "Δ %"]) {
    const th = document.createElement("th");
    th.textContent = label;
    header.appendChild(th);
  }
  thead.appendChild(header);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const diffScale = diffBarScale(visibleRows);
  for (const row of visibleRows) {
    const tr = document.createElement("tr");
    if (row.summary) {
      tr.classList.add("comparison-summary-row");
    }
    tr.appendChild(comparisonCell(row.group, "comparison-group-cell"));
    tr.appendChild(comparisonCell(row.label));
    tr.appendChild(
      comparisonCell(
        formatComparisonValue(row.base),
        row.base === null ? "comparison-missing" : "",
      ),
    );
    tr.appendChild(
      comparisonCell(
        formatComparisonValue(row.target),
        row.target === null ? "comparison-missing" : "",
      ),
    );
    tr.appendChild(applyConditionalDiff(comparisonCell(formatSigned(row.diff)), row.diffPct));
    tr.appendChild(
      applyConditionalBar(
        comparisonCell(formatSigned(row.diffPct, "%")),
        row.diffPct,
        diffScale,
      ),
    );
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  comparisonTableFrame.replaceChildren(table);
}

function renderComparison() {
  renderComparisonSource("a");
  renderComparisonSource("b");

  const baseDataset = comparisonDataset("a");
  const targetDataset = comparisonDataset("b");
  const basePoint = comparisonPoint("a");
  const targetPoint = comparisonPoint("b");
  if (!baseDataset || !targetDataset || !basePoint || !targetPoint) {
    comparisonTitle.textContent = "Select two runs";
    comparisonCommonCount.textContent = "-";
    comparisonHeadlineDiff.textContent = "-";
    renderComparisonAlerts(["Both comparison sources must contain a valid run."], []);
    renderComparisonTable([], true);
    return;
  }

  comparisonTitle.textContent = `${basePoint.short_commit} → ${targetPoint.short_commit}`;
  comparisonNote.textContent = `${comparisonSourceName(baseDataset, basePoint)} vs ${comparisonSourceName(targetDataset, targetPoint)}`;

  const compatibility = comparisonCompatibility(baseDataset, targetDataset);
  const rows = buildComparisonRows(basePoint, targetPoint);
  const summary = comparisonSummary(rows);
  const warnings = [...compatibility.warnings];
  const hasRawInput = Boolean(basePoint.raw_input || targetPoint.raw_input);
  comparisonCopyLinkButton.disabled = hasRawInput;
  comparisonCopyLinkButton.textContent = hasRawInput
    ? "Raw input is browser-local"
    : "Copy comparison link";
  if (hasRawInput) {
    warnings.push("Pasted raw scores stay in this browser tab and are not included in share links.");
  }
  if (summary.common < summary.total) {
    warnings.push(
      `Only ${summary.common} of ${summary.total} benchmark metrics exist in both sources. Missing values are not included in a diff.`,
    );
  }
  if (!summary.common) {
    compatibility.blocking.push("The selected runs have no benchmark scores in common.");
  }
  renderComparisonAlerts(compatibility.blocking, warnings);

  comparisonCommonCount.textContent = `${summary.common}/${summary.total}`;
  comparisonHeadlineLabel.textContent = summary.headlineName
    ? `${summary.headlineName} Δ`
    : "Aggregate Δ";
  comparisonHeadlineDiff.textContent = formatSigned(summary.headlineDiffPct, "%");
  comparisonHeadlineDiff.className = "";
  applyConditionalDiff(comparisonHeadlineDiff, summary.headlineDiffPct);
  comparisonRegressionsButton.setAttribute(
    "aria-pressed",
    String(state.comparison.regressionsOnly),
  );
  renderComparisonTable(rows, compatibility.blocking.length > 0);
}

function applyRunReference(id, value) {
  const runId = parseActionsRunId(value);
  if (!runId) {
    setSourceFeedback(id, "Paste a GEM5 Actions Run URL or numeric Run ID.", true);
    return;
  }
  const source = comparisonSelection(id);
  const resolution = resolveRunSelection(state.runIndex, runId, source.datasetId);
  if (resolution.status === "missing") {
    source.pendingRunId = runId;
    setSourceFeedback(
      id,
      `Run ${runId} is not stored yet. Paste its complete score.txt contents here instead.`,
      true,
    );
    return;
  }
  if (resolution.status === "ambiguous") {
    const labels = resolution.matches.map((match) => match.dataset.dataset.label).join(", ");
    setSourceFeedback(
      id,
      `Run ${runId} exists in multiple datasets. Select one first: ${labels}`,
      true,
    );
    return;
  }

  source.datasetId = resolution.match.datasetId;
  source.runId = String(resolution.match.point.run_id);
  source.customPoint = null;
  source.pendingRunId = null;
  setSourceFeedback(id, `Resolved ${resolution.match.dataset.dataset.label}.`);
  render();
  updateComparisonUrl();
}

function applyPastedScore(id, value) {
  const source = comparisonSelection(id);
  const dataset = comparisonDataset(id);
  if (!dataset) {
    setSourceFeedback(id, "Select a dataset before applying raw score data.", true);
    return;
  }

  let parsed;
  try {
    parsed = parsePastedScore(value);
  } catch (error) {
    setSourceFeedback(
      id,
      error instanceof Error ? error.message : "Could not parse pasted score data.",
      true,
    );
    return;
  }

  const selectedVersion = inferSpecVersion(dataset);
  if (parsed.specVersion && selectedVersion && parsed.specVersion !== selectedVersion) {
    setSourceFeedback(
      id,
      `Pasted data is SPEC${parsed.specVersion}, but the selected dataset is SPEC${selectedVersion}.`,
      true,
    );
    return;
  }

  const metricCount = Object.keys(parsed.metrics).length;
  const pendingRunId = source.pendingRunId;
  const rawId = pendingRunId || `raw-${id}-${Date.now()}`;
  source.runId = rawId;
  source.customPoint = {
    run_id: rawId,
    run_number: null,
    created_at: new Date().toISOString(),
    commit: "",
    short_commit: pendingRunId ? `run ${pendingRunId}` : "pasted score",
    commit_url: "",
    title: pendingRunId ? `Pasted score for Actions Run ${pendingRunId}` : "Pasted raw score",
    workflow_url: pendingRunId
      ? `https://github.com/OpenXiangShan/GEM5/actions/runs/${pendingRunId}`
      : "",
    metrics: parsed.metrics,
    details: parsed.details,
    metric_count: metricCount,
    raw_input: true,
  };
  source.pendingRunId = null;
  setSourceFeedback(
    id,
    `Parsed ${parsed.counts.int} INT and ${parsed.counts.fp} FP benchmark rows${
      pendingRunId ? ` for Run ${pendingRunId}` : ""
    }.`,
  );
  render();
  updateComparisonUrl();
}

function applyComparisonInput(id, value) {
  if (parseActionsRunId(value)) {
    applyRunReference(id, value);
    return;
  }
  applyPastedScore(id, value);
}

async function pasteComparisonInput(id) {
  if (!navigator.clipboard?.readText) {
    setSourceFeedback(id, "Clipboard access is unavailable; paste into the field manually.", true);
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    comparisonElements[id].url.value = text.trim();
    applyComparisonInput(id, text);
  } catch {
    setSourceFeedback(id, "Clipboard permission was denied; paste into the field manually.", true);
  }
}

async function copyComparisonLink() {
  if (comparisonPoint("a")?.raw_input || comparisonPoint("b")?.raw_input) {
    return;
  }
  updateComparisonUrl();
  const value = window.location.href;
  if (!navigator.clipboard?.writeText) {
    window.prompt("Copy comparison link", value);
    return;
  }
  await navigator.clipboard.writeText(value);
  const original = comparisonCopyLinkButton.textContent;
  comparisonCopyLinkButton.textContent = "Copied";
  window.setTimeout(() => {
    comparisonCopyLinkButton.textContent = original;
  }, 1400);
}

function renderLinks(point) {
  const links = [];
  if (point.commit_url) {
    links.push(
      `<a class="link-chip" href="${point.commit_url}" target="_blank" rel="noreferrer">Commit ${point.short_commit}</a>`,
    );
  }
  if (point.workflow_url) {
    links.push(
      `<a class="link-chip" href="${point.workflow_url}" target="_blank" rel="noreferrer">Workflow run ${point.run_id}</a>`,
    );
  }
  return links.length ? `<div class="detail-links">${links.join("")}</div>` : "";
}

function setDetail(point, benchmark) {
  const benchmarkDetail = point.details?.[benchmark];
  const extraRows = benchmarkDetail
    ? `
      <dt>Coverage</dt><dd>${formatValue(benchmarkDetail.coverage)}</dd>
      <dt>Score</dt><dd>${formatValue(benchmarkDetail.score)}</dd>
      <dt>Time</dt><dd>${formatValue(benchmarkDetail.time)}</dd>
      <dt>Ref Time</dt><dd>${formatValue(benchmarkDetail.ref_time)}</dd>
    `
    : "";

  pointDetail.innerHTML = `
    <h3>Point Detail</h3>
    <dl class="detail-grid">
      <dt>Metric</dt><dd>${benchmark}</dd>
      <dt>Value</dt><dd>${formatValue(point.metrics[benchmark])}</dd>
      <dt>Commit</dt><dd><code>${point.short_commit}</code></dd>
      <dt>Title</dt><dd>${point.title}</dd>
      <dt>Date</dt><dd>${formatDate(point.created_at)}</dd>
      <dt>Run</dt><dd>${point.run_id}</dd>
      ${extraRows}
    </dl>
    ${renderLinks(point)}
  `;
}

function renderMeta(dataset) {
  datasetMeta.innerHTML = `
    <dl>
      <dt>Config</dt><dd>${dataset.dataset.config}</dd>
      <dt>Toolchain</dt><dd>${dataset.dataset.toolchain}</dd>
      <dt>Coverage</dt><dd>${dataset.dataset.coverage}</dd>
      <dt>Benchmarks</dt><dd>${dataset.benchmarks.length - 1} + avg</dd>
      <dt>Points</dt><dd>${dataset.points.length}</dd>
    </dl>
  `;
}

function tableHeading(benchmark) {
  return benchmark === ALL_SPECINT_OPTION ? "All metric history per point" : `${benchmark} history`;
}

function resolveTableCell(row, column) {
  if (column.key.startsWith("metric:")) {
    return row.metrics?.[column.key.slice("metric:".length)] ?? "-";
  }
  return row[column.key] ?? "-";
}

function buildTableElement(model) {
  if (!model.rows.length) {
    const empty = document.createElement("div");
    empty.className = "table-empty";
    empty.textContent = "No rows available for this selection.";
    return empty;
  }

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  model.columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  model.rows.forEach((row) => {
    const tr = document.createElement("tr");
    model.columns.forEach((column) => {
      const td = document.createElement("td");
      const value = resolveTableCell(row, column);
      td.textContent = String(value);
      if (column.key === "title") {
        td.className = "table-title-cell";
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function setTableModalOpen(isOpen) {
  tableModal.classList.toggle("hidden", !isOpen);
  tableModal.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("modal-open", isOpen);
}

function renderTable(dataset, benchmark) {
  const heading = tableHeading(benchmark);
  const model = buildTableModel(dataset, benchmark);
  tableTitle.textContent = heading;
  tableModalTitle.textContent = `${dataset.dataset.label} - ${heading}`;
  tableFrame.replaceChildren(buildTableElement(model));
  tableFrameModal.replaceChildren(buildTableElement(model));
}

function updateChartFullscreenButton() {
  chartFullscreenButton.textContent = chartFullscreenButtonLabel(Boolean(document.fullscreenElement));
}

function renderBenchmarks(dataset) {
  const options = buildBenchmarkOptions(dataset.benchmarks);
  benchmarkSelect.innerHTML = "";
  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    benchmarkSelect.appendChild(option);
  }
  if (!options.some((item) => item.value === state.currentBenchmark)) {
    state.currentBenchmark = options[0]?.value || AVG_LABEL;
  }
  benchmarkSelect.value = state.currentBenchmark;
}

function renderDatasetOptions() {
  datasetSelect.innerHTML = "";
  for (const item of datasetEntriesWithPoints(state.manifest.datasets, state.datasets)) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.label} (${item.point_count})`;
    datasetSelect.appendChild(option);
  }
  datasetSelect.value = state.currentDatasetId;
}

function resetSeriesVisibility() {
  state.visibleSeriesNames = null;
}

function ensureVisibleSeries(seriesList, benchmark) {
  if (benchmark !== ALL_SPECINT_OPTION) {
    return null;
  }
  if (state.visibleSeriesNames === null) {
    state.visibleSeriesNames = new Set(seriesList.map((series) => series.name));
  }
  return state.visibleSeriesNames;
}

function renderLegend(allSeries, visibleSeriesNames, benchmark) {
  legendRoot.replaceChildren();
  if (benchmark !== ALL_SPECINT_OPTION) {
    const chip = document.createElement("div");
    chip.className = "legend-chip";
    chip.innerHTML = `<span class="legend-swatch" style="background:${allSeries[0]?.color || palette[0]}"></span>${allSeries[0]?.name || AVG_LABEL}`;
    legendRoot.appendChild(chip);
    return;
  }

  const controls = document.createElement("div");
  controls.className = "legend-controls";

  const showAllButton = document.createElement("button");
  showAllButton.type = "button";
  showAllButton.className = "legend-action";
  showAllButton.textContent = "Show all";
  showAllButton.addEventListener("click", () => {
    state.visibleSeriesNames = new Set(allSeries.map((series) => series.name));
    render();
  });
  controls.appendChild(showAllButton);

  const hideAllButton = document.createElement("button");
  hideAllButton.type = "button";
  hideAllButton.className = "legend-action";
  hideAllButton.textContent = "Hide all";
  hideAllButton.addEventListener("click", () => {
    state.visibleSeriesNames = new Set();
    render();
  });
  controls.appendChild(hideAllButton);
  legendRoot.appendChild(controls);

  const chips = document.createElement("div");
  chips.className = "legend-chip-list";

  for (const series of allSeries) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "legend-chip";
    if (!visibleSeriesNames.has(series.name)) {
      chip.classList.add("legend-chip-hidden");
    }
    chip.innerHTML = `<span class="legend-swatch" style="background:${series.color}"></span>${series.name}`;
    chip.addEventListener("click", () => {
      const nextVisible = new Set(visibleSeriesNames);
      if (nextVisible.has(series.name)) {
        nextVisible.delete(series.name);
      } else {
        nextVisible.add(series.name);
      }
      state.visibleSeriesNames = nextVisible;
      render();
    });
    chips.appendChild(chip);
  }
  legendRoot.appendChild(chips);
}

function svgNode(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function seriesColor(index) {
  return palette[index % palette.length];
}

function renderChartRange(totalPointCount, visiblePointCount) {
  chartRange.classList.toggle("hidden", totalPointCount <= DEFAULT_CHART_POINT_LIMIT);
  chartRangeRecent.textContent = `Recent ${Math.min(DEFAULT_CHART_POINT_LIMIT, totalPointCount)}`;
  chartRangeAll.textContent = `All ${totalPointCount}`;
  chartRangeRecent.setAttribute("aria-pressed", String(!state.showAllPoints));
  chartRangeAll.setAttribute("aria-pressed", String(state.showAllPoints));
  pointCount.textContent =
    visiblePointCount === totalPointCount
      ? String(totalPointCount)
      : `${visiblePointCount} / ${totalPointCount}`;
}

function renderChart(dataset, benchmark) {
  chart.replaceChildren();
  const totalPointCount = dataset.points.length;
  const points = selectChartPoints(dataset.points, { showAll: state.showAllPoints });
  const densePoints = points.length > DEFAULT_CHART_POINT_LIMIT;
  chart.classList.toggle("dense-points", densePoints);
  const chartDataset = { ...dataset, points };
  const allSeries = resolveSeries(chartDataset, benchmark).map((series, index) => ({
    ...series,
    color: seriesColor(index),
  }));
  const visibleSeriesNames = ensureVisibleSeries(allSeries, benchmark);
  const seriesList = filterSeriesByVisibility(
    allSeries,
    visibleSeriesNames ?? new Set(),
    benchmark,
  );
  chartTitle.textContent = `${dataset.dataset.label} - ${benchmark === ALL_SPECINT_OPTION ? "All benchmark subscores" : benchmark}`;
  chartNote.textContent =
    benchmark === ALL_SPECINT_OPTION
      ? "Overlay benchmark sub-scores, and use the legend to hide or restore specific lines."
      : "Hover a point to inspect the exact score, commit, and workflow.";
  if (points.length < totalPointCount) {
    chartNote.textContent += ` Showing the latest ${points.length} of ${totalPointCount} points.`;
  }
  renderChartRange(totalPointCount, points.length);
  latestValue.textContent = latestSummary(dataset, benchmark);
  modeLabel.textContent =
    benchmark === ALL_SPECINT_OPTION ? "Multi-line comparison" : "Single selected line";

  if (!points.length || !allSeries.length) {
    chart.classList.add("hidden");
    chartEmpty.classList.remove("hidden");
    pointDetail.innerHTML = "<h3>Point Detail</h3><p>No data available for this dataset.</p>";
    renderLegend(allSeries, visibleSeriesNames ?? new Set(), benchmark);
    return;
  }

  chart.classList.remove("hidden");
  chartEmpty.classList.add("hidden");
  chartEmpty.textContent = "No data available for this dataset.";
  renderLegend(
    allSeries,
    visibleSeriesNames ?? new Set(allSeries.map((series) => series.name)),
    benchmark,
  );

  if (!seriesList.length) {
    chart.classList.add("hidden");
    chartEmpty.classList.remove("hidden");
    chartEmpty.textContent = "All subscore lines are hidden. Use Show all or click a legend item to restore lines.";
    pointDetail.innerHTML = "<h3>Point Detail</h3><p>All subscore lines are hidden.</p>";
    return;
  }

  const width = 960;
  const height = 420;
  const margin = { top: 26, right: 34, bottom: 58, left: 76 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const numericValues = [];
  for (const series of seriesList) {
    for (const value of series.values) {
      if (typeof value === "number") {
        numericValues.push(value);
      }
    }
  }

  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const pad = Math.max((maxValue - minValue) * 0.14, 0.6);
  const lower = minValue - pad;
  const upper = maxValue + pad;

  const xAt = (index) =>
    margin.left +
    (points.length === 1 ? innerWidth / 2 : (innerWidth * index) / (points.length - 1));
  const yAt = (value) =>
    margin.top + innerHeight - ((value - lower) / (upper - lower || 1)) * innerHeight;

  for (let i = 0; i < 5; i += 1) {
    const y = margin.top + (innerHeight * i) / 4;
    const value = upper - ((upper - lower) * i) / 4;
    chart.appendChild(
      svgNode("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        class: "grid",
      }),
    );
    const label = svgNode("text", {
      x: margin.left - 12,
      y: y + 4,
      class: "value-label",
      "text-anchor": "end",
    });
    label.textContent = formatValue(value);
    chart.appendChild(label);
  }

  chart.appendChild(
    svgNode("line", {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      class: "axis",
    }),
  );
  chart.appendChild(
    svgNode("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: height - margin.bottom,
      class: "axis",
    }),
  );

  const plotLayer = svgNode("g");
  const pointLayer = svgNode("g");
  const tooltipLayer = svgNode("g");

  let activeMarker = null;

  function clearActiveMarker() {
    if (!activeMarker) {
      return;
    }
    activeMarker.core.setAttribute("cy", activeMarker.baseY);
    activeMarker.halo.setAttribute("cy", activeMarker.baseY);
    activeMarker.group.classList.remove("active");
    tooltipLayer.replaceChildren();
    activeMarker = null;
  }

  function showTooltip(x, y, label, value, color) {
    tooltipLayer.replaceChildren();
    const bubbleY = Math.max(12, y - 52);
    tooltipLayer.appendChild(
      svgNode("rect", {
        x: x - 64,
        y: bubbleY,
        rx: 12,
        ry: 12,
        width: 128,
        height: 38,
        class: "tooltip-card",
      }),
    );
    const title = svgNode("text", {
      x,
      y: bubbleY + 15,
      "text-anchor": "middle",
      class: "tooltip-title",
    });
    title.textContent = label;
    tooltipLayer.appendChild(title);
    const valueNode = svgNode("text", {
      x,
      y: bubbleY + 30,
      "text-anchor": "middle",
      class: "tooltip-value",
      fill: color,
    });
    valueNode.textContent = value;
    tooltipLayer.appendChild(valueNode);
  }

  function activatePoint(pointContext) {
    clearActiveMarker();
    pointContext.core.setAttribute("cy", pointContext.baseY - 8);
    pointContext.halo.setAttribute("cy", pointContext.baseY - 8);
    pointContext.group.classList.add("active");
    showTooltip(
      pointContext.baseX,
      pointContext.baseY - 8,
      pointContext.point.short_commit,
      `${pointContext.seriesName} ${formatValue(pointContext.value)}`,
      pointContext.color,
    );
    setDetail(pointContext.point, pointContext.seriesName);
    activeMarker = pointContext;
  }

  seriesList.forEach((series, seriesIndex) => {
    const color = series.color;
    const pathParts = [];
    let coreRadius = seriesList.length > 1 ? 4.4 : 5.8;
    if (densePoints) {
      coreRadius = seriesList.length > 1 ? 2.4 : 3.2;
    }

    series.values.forEach((value, pointIndex) => {
      if (typeof value !== "number") {
        return;
      }
      const x = xAt(pointIndex);
      const y = yAt(value);
      pathParts.push(`${pathParts.length === 0 ? "M" : "L"} ${x} ${y}`);
    });

    plotLayer.appendChild(
      svgNode("path", {
        d: pathParts.join(" "),
        class: `series-path${seriesList.length > 1 ? " secondary" : ""}`,
        stroke: color,
      }),
    );

    series.values.forEach((value, pointIndex) => {
      if (typeof value !== "number") {
        return;
      }
      const point = points[pointIndex];
      const x = xAt(pointIndex);
      const y = yAt(value);
      const group = svgNode("g", { class: "point" });
      const halo = svgNode("circle", {
        cx: x,
        cy: y,
        r: seriesList.length > 1 ? 9 : 10,
        class: "point-halo",
        fill: color,
      });
      const core = svgNode("circle", {
        cx: x,
        cy: y,
        r: coreRadius,
        class: "point-core",
        fill: "#ffffff",
        stroke: color,
      });

      const pointContext = {
        group,
        halo,
        core,
        point,
        seriesName: series.name,
        value,
        baseX: x,
        baseY: y,
        color,
      };

      group.appendChild(halo);
      group.appendChild(core);
      group.addEventListener("mouseenter", () => activatePoint(pointContext));
      group.addEventListener("click", () => activatePoint(pointContext));
      pointLayer.appendChild(group);

      if (
        seriesIndex === 0 &&
        (pointIndex === 0 ||
          pointIndex === points.length - 1 ||
          pointIndex % Math.ceil(points.length / 6) === 0)
      ) {
        const tick = svgNode("text", {
          x,
          y: height - margin.bottom + 24,
          class: "tick",
          "text-anchor": "middle",
        });
        tick.textContent = point.short_commit;
        chart.appendChild(tick);
      }
    });
  });

  chart.appendChild(plotLayer);
  chart.appendChild(pointLayer);
  chart.appendChild(tooltipLayer);

  const defaultSeries = seriesList[0];
  const defaultIndex = defaultSeries.values.reduce(
    (latestIndex, value, index) => (typeof value === "number" ? index : latestIndex),
    0,
  );
  const defaultValue = defaultSeries.values[defaultIndex];
  if (typeof defaultValue === "number") {
    const x = xAt(defaultIndex);
    const y = yAt(defaultValue);
    const defaultGroup = pointLayer.childNodes[defaultIndex];
    if (defaultGroup && defaultGroup.childNodes.length >= 2) {
      activatePoint({
        group: defaultGroup,
        halo: defaultGroup.childNodes[0],
        core: defaultGroup.childNodes[1],
        point: points[defaultIndex],
        seriesName: defaultSeries.name,
        value: defaultValue,
        baseX: x,
        baseY: y,
        color: defaultSeries.color,
      });
    }
  }
}

function renderTrend() {
  const dataset = state.datasets.get(state.currentDatasetId);
  if (!dataset) {
    return;
  }
  renderMeta(dataset);
  renderBenchmarks(dataset);
  renderChart(dataset, state.currentBenchmark);
  renderTable(dataset, state.currentBenchmark);
}

function render() {
  renderModeVisibility();
  if (state.mode === "compare") {
    renderComparison();
    return;
  }
  renderTrend();
}

async function main() {
  state.manifest = await loadJson(manifestPath);
  for (const entry of state.manifest.datasets) {
    const dataset = await loadJson(`./data/${entry.file}`);
    state.datasets.set(entry.id, dataset);
  }
  const defaultDataset = datasetEntriesWithPoints(
    state.manifest.datasets,
    state.datasets,
  )[0];
  state.currentDatasetId = defaultDataset?.id || null;
  state.runIndex = buildRunIndex(state.datasets);
  initializeComparisonState(state.currentDatasetId);
  renderDatasetOptions();
  render();
}

trendModeButton.addEventListener("click", () => setMode("trend"));
compareModeButton.addEventListener("click", () => setMode("compare"));

datasetSelect.addEventListener("change", (event) => {
  state.currentDatasetId = event.target.value;
  state.showAllPoints = false;
  resetSeriesVisibility();
  render();
});

benchmarkSelect.addEventListener("change", (event) => {
  state.currentBenchmark = event.target.value;
  resetSeriesVisibility();
  render();
});

for (const id of ["a", "b"]) {
  const elements = comparisonElements[id];
  elements.dataset.addEventListener("change", (event) => {
    const source = comparisonSelection(id);
    source.datasetId = event.target.value;
    source.runId = defaultRunId(state.datasets.get(source.datasetId), id);
    source.customPoint = null;
    setSourceFeedback(id);
    render();
    updateComparisonUrl();
  });
  elements.run.addEventListener("change", (event) => {
    const source = comparisonSelection(id);
    source.runId = event.target.value;
    if (String(source.customPoint?.run_id) !== String(source.runId)) {
      source.customPoint = null;
      source.pendingRunId = null;
    }
    setSourceFeedback(id);
    render();
    updateComparisonUrl();
  });
  elements.apply.addEventListener("click", () => applyComparisonInput(id, elements.url.value));
  elements.paste.addEventListener("click", () => pasteComparisonInput(id));
  elements.url.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      applyComparisonInput(id, elements.url.value);
    }
  });
}

comparisonSwapButton.addEventListener("click", () => {
  [state.comparison.a, state.comparison.b] = [state.comparison.b, state.comparison.a];
  [comparisonElements.a.url.value, comparisonElements.b.url.value] = [
    comparisonElements.b.url.value,
    comparisonElements.a.url.value,
  ];
  setSourceFeedback("a");
  setSourceFeedback("b");
  render();
  updateComparisonUrl();
});

comparisonRegressionsButton.addEventListener("click", () => {
  state.comparison.regressionsOnly = !state.comparison.regressionsOnly;
  renderComparison();
});

comparisonCopyLinkButton.addEventListener("click", () => {
  copyComparisonLink().catch(() => {
    comparisonCopyLinkButton.textContent = "Copy failed";
  });
});

chartRangeRecent.addEventListener("click", () => {
  state.showAllPoints = false;
  render();
});

chartRangeAll.addEventListener("click", () => {
  state.showAllPoints = true;
  render();
});

tableFullscreenButton.addEventListener("click", () => setTableModalOpen(true));
tableCloseButton.addEventListener("click", () => setTableModalOpen(false));
tableModalBackdrop.addEventListener("click", () => setTableModalOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setTableModalOpen(false);
  }
});

chartFullscreenButton.addEventListener("click", async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await chartPanel.requestFullscreen();
});

document.addEventListener("fullscreenchange", updateChartFullscreenButton);
updateChartFullscreenButton();

main().catch((error) => {
  chartTitle.textContent = "Failed to load dashboard data";
  chartNote.textContent = "Check generated JSON and local server path.";
  chartEmpty.classList.remove("hidden");
  chart.classList.add("hidden");
  chartEmpty.textContent = error.message;
  tableTitle.textContent = "Failed to load table data";
  tableModalTitle.textContent = "Failed to load table data";
  const message = document.createElement("div");
  message.className = "table-empty";
  message.textContent = error.message;
  tableFrame.replaceChildren(message);
  tableFrameModal.replaceChildren(message.cloneNode(true));
  comparisonTitle.textContent = "Failed to load dashboard data";
  renderComparisonAlerts([error.message], []);
  renderComparisonTable([], true);
});
