import {
  ALL_SPECINT_OPTION,
  AVG_LABEL,
  buildBenchmarkOptions,
  chartFullscreenButtonLabel,
  filterSeriesByVisibility,
  latestSummary,
  resolveSeries,
} from "./chart-helpers.mjs";
import { buildTableModel } from "./table-helpers.mjs";

const manifestPath = "./data/manifest.json";
const palette = [
  "#BB4D28",
  "#2E6F6B",
  "#5A4FCF",
  "#AA8A11",
  "#D0667D",
  "#0081A7",
  "#5C4B51",
  "#7A9E2F",
  "#A545D3",
  "#C56A1F",
  "#4D7CFE",
  "#A13D63",
];

const state = {
  manifest: null,
  datasets: new Map(),
  currentDatasetId: null,
  currentBenchmark: AVG_LABEL,
  visibleSeriesNames: null,
};

const datasetSelect = document.getElementById("dataset-select");
const benchmarkSelect = document.getElementById("benchmark-select");
const datasetMeta = document.getElementById("dataset-meta");
const chartTitle = document.getElementById("chart-title");
const chartNote = document.getElementById("chart-note");
const pointCount = document.getElementById("point-count");
const latestValue = document.getElementById("latest-value");
const modeLabel = document.getElementById("mode-label");
const legendRoot = document.getElementById("chart-legend");
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
  for (const item of state.manifest.datasets) {
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

function renderChart(dataset, benchmark) {
  chart.replaceChildren();
  const points = dataset.points;
  const allSeries = resolveSeries(dataset, benchmark).map((series, index) => ({
    ...series,
    color: seriesColor(index),
  }));
  const visibleSeriesNames = ensureVisibleSeries(allSeries, benchmark);
  const seriesList = filterSeriesByVisibility(
    allSeries,
    visibleSeriesNames ?? new Set(),
    benchmark,
  );
  chartTitle.textContent = `${dataset.dataset.label} - ${benchmark === ALL_SPECINT_OPTION ? "All SPECint subscores" : benchmark}`;
  chartNote.textContent =
    benchmark === ALL_SPECINT_OPTION
      ? "Overlay SPECint sub-scores, and use the legend to hide or restore specific lines."
      : "Hover a point to inspect the exact score, commit, and workflow.";
  pointCount.textContent = String(points.length);
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
        r: seriesList.length > 1 ? 4.4 : 5.8,
        class: "point-core",
        fill: "#fffaf1",
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

function render() {
  const dataset = state.datasets.get(state.currentDatasetId);
  if (!dataset) {
    return;
  }
  renderMeta(dataset);
  renderBenchmarks(dataset);
  renderChart(dataset, state.currentBenchmark);
  renderTable(dataset, state.currentBenchmark);
}

async function main() {
  state.manifest = await loadJson(manifestPath);
  for (const entry of state.manifest.datasets) {
    const dataset = await loadJson(`./data/${entry.file}`);
    state.datasets.set(entry.id, dataset);
  }
  state.currentDatasetId = state.manifest.datasets[0]?.id || null;
  renderDatasetOptions();
  render();
}

datasetSelect.addEventListener("change", (event) => {
  state.currentDatasetId = event.target.value;
  resetSeriesVisibility();
  render();
});

benchmarkSelect.addEventListener("change", (event) => {
  state.currentBenchmark = event.target.value;
  resetSeriesVisibility();
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
});
