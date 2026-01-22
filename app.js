const sampleCsv = `No.,シングル,,ダブル,トリプル
,インナー,アウター,,
20,47,21,6,6
1,16,11,4,8
18,10,11,4,16
4,14,4,0,2
13,12,5,0,0
6,4,1,1,1
10,6,1,0,1
15,2,0,0,1
2,5,1,0,1
17,4,0,0,0
3,4,1,2,1
19,7,3,0,0
7,2,1,0,0
16,3,0,0,0
8,2,1,0,0
11,2,0,1,0
14,5,0,0,0
9,8,4,0,2
12,13,4,0,2
5,22,7,2,9
S-BULL,7,0,0,0
D-BULL,3,0,0,0
OUT,7,0,0,0
投数,351,0,0,0
AVE,16.27920228,,,
`;

const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const ringDefs = [
  { key: "inner", label: "シングル(内)" },
  { key: "triple", label: "トリプル" },
  { key: "outer", label: "シングル(外)" },
  { key: "double", label: "ダブル" },
];
const heatPalette = { low: "#1d4ed8", mid: "#16a34a", high: "#dc2626" };
const bullPalette = heatPalette;
const totalPalette = heatPalette;
const neutralFill = "#e7e1d4";
const ringBarColors = {
  inner: "#0b6e63",
  outer: "#d39a12",
  double: "#1e4f8f",
  triple: "#c64c2d",
  bull: "#a4251e",
  out: "#a43a2c",
};

const fileInput = document.getElementById("fileInput");
const useSampleBtn = document.getElementById("useSample");
const statusEl = document.getElementById("status");
const svg = document.getElementById("boardSvg");
const legend = document.getElementById("legend");
const hoverInfo = document.getElementById("hoverInfo");
const totalsEl = document.getElementById("totals");
const ringBarsEl = document.getElementById("ringBars");
const numberTableBody = document.getElementById("numberTableBody");
const bullSingleInput = document.getElementById("bullSingle");
const bullDoubleInput = document.getElementById("bullDouble");
const outCountInput = document.getElementById("outCount");

let currentData = null;
let boardReady = false;
let lastHoverKey = null;
let legendMinEl = null;
let legendMaxEl = null;

function cleanCell(value) {
  return value ? value.replace(/^\uFEFF/, "").trim() : "";
}

function toInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 3) {
    throw new Error("CSVが短すぎます。ヘッダーとデータ行を確認してください。");
  }

  const header1 = lines[0].split(",").map(cleanCell);
  const header2 = lines[1].split(",").map(cleanCell);
  const idx = { no: 0, inner: 1, outer: 2, double: 3, triple: 4 };

  const noIndex = header1.findIndex((cell) => /^No\.?$/i.test(cell) || cell.includes("番号"));
  if (noIndex >= 0) idx.no = noIndex;

  const innerIndex = header2.findIndex((cell) => cell.includes("インナー"));
  if (innerIndex >= 0) idx.inner = innerIndex;

  const outerIndex = header2.findIndex((cell) => cell.includes("アウター"));
  if (outerIndex >= 0) idx.outer = outerIndex;

  const doubleIndex = header1.findIndex((cell) => cell.includes("ダブル"));
  if (doubleIndex >= 0) idx.double = doubleIndex;

  const tripleIndex = header1.findIndex((cell) => cell.includes("トリプル"));
  if (tripleIndex >= 0) idx.triple = tripleIndex;

  const data = {
    byNumber: {},
    bull: { single: 0, double: 0 },
    out: 0,
    totals: {},
  };

  lines.slice(2).forEach((line) => {
    const cells = line.split(",");
    const key = cleanCell(cells[idx.no]);
    if (!key || key === "No.") {
      return;
    }
    if (key.includes("投数") || key.includes("AVE") || key.includes("平均")) {
      return;
    }
    if (/^S-?BULL$/i.test(key)) {
      data.bull.single = toInt(cells[idx.inner]);
      return;
    }
    if (/^D-?BULL$/i.test(key)) {
      data.bull.double = toInt(cells[idx.inner]);
      return;
    }
    if (/^OUT$/i.test(key)) {
      data.out = toInt(cells[idx.inner]);
      return;
    }

    if (/^\d+$/.test(key)) {
      const num = String(parseInt(key, 10));
      data.byNumber[num] = {
        inner: toInt(cells[idx.inner]),
        outer: toInt(cells[idx.outer]),
        double: toInt(cells[idx.double]),
        triple: toInt(cells[idx.triple]),
      };
    }
  });

  return finalizeData(data);
}

function finalizeData(data) {
  for (let n = 1; n <= 20; n += 1) {
    const key = String(n);
    if (!data.byNumber[key]) {
      data.byNumber[key] = { inner: 0, outer: 0, double: 0, triple: 0 };
    }
  }

  const totals = {
    inner: 0,
    outer: 0,
    double: 0,
    triple: 0,
    bullSingle: data.bull.single,
    bullDouble: data.bull.double,
    out: data.out,
    totalNumbers: 0,
    overall: 0,
  };

  Object.values(data.byNumber).forEach((counts) => {
    counts.total = counts.inner + counts.outer + counts.double + counts.triple;
    totals.inner += counts.inner;
    totals.outer += counts.outer;
    totals.double += counts.double;
    totals.triple += counts.triple;
    totals.totalNumbers += counts.total;
  });

  totals.overall = totals.totalNumbers + totals.bullSingle + totals.bullDouble + totals.out;
  data.totals = totals;

  return data;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function wedgePath(cx, cy, rInner, rOuter, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, endAngle);
  const startInner = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

function createSvgElement(name) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function buildLegend() {
  legend.innerHTML = "";
  const scale = document.createElement("div");
  scale.className = "legend-scale";

  const bar = document.createElement("div");
  bar.className = "legend-gradient";
  bar.style.background = `linear-gradient(90deg, ${heatPalette.low} 0%, ${heatPalette.mid} 50%, ${heatPalette.high} 100%)`;

  const labels = document.createElement("div");
  labels.className = "legend-labels";
  labels.innerHTML = '<span data-legend="min">0.0%</span><span data-legend="max">0.0%</span>';

  scale.appendChild(bar);
  scale.appendChild(labels);
  legend.appendChild(scale);

  legendMinEl = legend.querySelector('[data-legend="min"]');
  legendMaxEl = legend.querySelector('[data-legend="max"]');
}

function buildBoard() {
  svg.innerHTML = "";
  const cx = 200;
  const cy = 200;
  const rBullInner = 12;
  const rBullOuter = 28;
  const rInnerOuter = 86;
  const rTripleOuter = 104;
  const rOuterOuter = 154;
  const rDoubleOuter = 174;

  const backdrop = createSvgElement("circle");
  backdrop.setAttribute("cx", cx);
  backdrop.setAttribute("cy", cy);
  backdrop.setAttribute("r", rDoubleOuter + 10);
  backdrop.setAttribute("fill", "#0f151f");
  backdrop.setAttribute("stroke", "#223044");
  svg.appendChild(backdrop);

  const ringRadius = {
    inner: [rBullOuter, rInnerOuter],
    triple: [rInnerOuter, rTripleOuter],
    outer: [rTripleOuter, rOuterOuter],
    double: [rOuterOuter, rDoubleOuter],
  };

  const angleStep = 360 / 20;

  order.forEach((num, index) => {
    const centerAngle = -90 + index * angleStep;
    const startAngle = centerAngle - angleStep / 2;
    const endAngle = centerAngle + angleStep / 2;

    ringDefs.forEach((ring) => {
      const [rInner, rOuter] = ringRadius[ring.key];
      const path = createSvgElement("path");
      path.setAttribute("d", wedgePath(cx, cy, rInner, rOuter, startAngle, endAngle));
      path.setAttribute("class", `segment ring-${ring.key}`);
      path.dataset.num = String(num);
      path.dataset.ring = ring.key;
      svg.appendChild(path);
    });

    const label = createSvgElement("text");
    const labelPos = polarToCartesian(cx, cy, rDoubleOuter + 16, centerAngle);
    label.setAttribute("x", labelPos.x);
    label.setAttribute("y", labelPos.y);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("class", "board-label");
    label.textContent = String(num);
    svg.appendChild(label);
  });

  const bullSingle = createSvgElement("circle");
  bullSingle.setAttribute("cx", cx);
  bullSingle.setAttribute("cy", cy);
  bullSingle.setAttribute("r", rBullOuter);
  bullSingle.setAttribute("class", "bull");
  bullSingle.dataset.type = "bull";
  bullSingle.dataset.bull = "single";
  svg.appendChild(bullSingle);

  const bullDouble = createSvgElement("circle");
  bullDouble.setAttribute("cx", cx);
  bullDouble.setAttribute("cy", cy);
  bullDouble.setAttribute("r", rBullInner);
  bullDouble.setAttribute("class", "bull");
  bullDouble.dataset.type = "bull";
  bullDouble.dataset.bull = "double";
  svg.appendChild(bullDouble);

  boardReady = true;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function mixColor(low, high, t) {
  const a = hexToRgb(low);
  const b = hexToRgb(high);
  const mix = {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
  return `rgb(${mix.r}, ${mix.g}, ${mix.b})`;
}

function mixColorStops(palette, t) {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped <= 0.5) {
    return mixColor(palette.low, palette.mid, clamped * 2);
  }
  return mixColor(palette.mid, palette.high, (clamped - 0.5) * 2);
}

function getActiveRings(mode) {
  if (mode === "single") return ["inner", "outer"];
  if (mode === "single-inner") return ["inner"];
  if (mode === "single-outer") return ["outer"];
  if (mode === "double") return ["double"];
  if (mode === "triple") return ["triple"];
  return ringDefs.map((ring) => ring.key);
}

function getRingValue(counts, ring, mode) {
  if (mode === "rings") return counts[ring];
  if (mode === "total") return counts.total;
  if (mode === "single") return counts.inner + counts.outer;
  if (mode === "single-inner") return ring === "inner" ? counts.inner : null;
  if (mode === "single-outer") return ring === "outer" ? counts.outer : null;
  if (mode === "double") return ring === "double" ? counts.double : null;
  if (mode === "triple") return ring === "triple" ? counts.triple : null;
  return counts[ring];
}

function updateBoard(mode) {
  if (!currentData || !boardReady) return;

  const activeRings = getActiveRings(mode);
  const values = [];

  Object.values(currentData.byNumber).forEach((counts) => {
    activeRings.forEach((ring) => {
      const value = getRingValue(counts, ring, mode);
      if (value !== null) {
        values.push(value);
      }
    });
  });

  values.push(currentData.bull.single, currentData.bull.double);

  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const range = maxValue - minValue;

  updateLegendScale(minValue, maxValue);

  svg.querySelectorAll(".segment").forEach((segment) => {
    const num = segment.dataset.num;
    const ring = segment.dataset.ring;
    const counts = currentData.byNumber[num];
    const value = getRingValue(counts, ring, mode);

    if (value === null || !activeRings.includes(ring)) {
      segment.setAttribute("fill", neutralFill);
      segment.setAttribute("opacity", "0.22");
      return;
    }

    const palette = mode === "total" ? totalPalette : heatPalette;
    const t = range > 0 ? (value - minValue) / range : maxValue > 0 ? 1 : 0;
    const color = mixColorStops(palette, t);
    segment.setAttribute("fill", color);
    segment.setAttribute("opacity", "1");
  });

  const bullSingle = svg.querySelector('[data-bull="single"]');
  const bullDouble = svg.querySelector('[data-bull="double"]');
  const bullSingleT = range > 0 ? (currentData.bull.single - minValue) / range : maxValue > 0 ? 1 : 0;
  const bullDoubleT = range > 0 ? (currentData.bull.double - minValue) / range : maxValue > 0 ? 1 : 0;

  const bullSingleColor = mixColorStops(bullPalette, bullSingleT);
  const bullDoubleColor = mixColorStops(bullPalette, bullDoubleT);

  bullSingle.setAttribute("fill", bullSingleColor);
  bullDouble.setAttribute("fill", bullDoubleColor);
}

function updateLegendScale(minValue, maxValue) {
  if (!legendMinEl || !legendMaxEl || !currentData) return;
  const total = currentData.totals.overall || 0;
  legendMinEl.textContent = formatPercent(minValue, total);
  legendMaxEl.textContent = formatPercent(maxValue, total);
}

function formatNumber(value) {
  return value.toLocaleString("ja-JP");
}

function formatPercent(value, total) {
  if (!total) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function updateTotals() {
  const totals = currentData.totals;
  const singleTotal = totals.inner + totals.outer;
  const bullTotal = totals.bullSingle + totals.bullDouble;
  const inBoard = totals.overall - totals.out;

  totalsEl.innerHTML = "";
  const cards = [
    { label: "総投数", value: totals.overall },
    { label: "インボード", value: inBoard },
    { label: "OUT", value: totals.out },
    { label: "シングル", value: singleTotal },
    { label: "ダブル", value: totals.double },
    { label: "トリプル", value: totals.triple },
    { label: "BULL", value: bullTotal },
  ];

  cards.forEach((item) => {
    const card = document.createElement("div");
    card.className = "total-card";
    const label = document.createElement("span");
    label.textContent = item.label;
    const strong = document.createElement("strong");
    strong.textContent = formatNumber(item.value);
    card.appendChild(label);
    card.appendChild(strong);
    totalsEl.appendChild(card);
  });
}

function updateRingBars() {
  const totals = currentData.totals;
  const total = totals.overall || 1;

  ringBarsEl.innerHTML = "";

  const rows = [
    { label: "シングル(内)", value: totals.inner, color: ringBarColors.inner },
    { label: "シングル(外)", value: totals.outer, color: ringBarColors.outer },
    { label: "ダブル", value: totals.double, color: ringBarColors.double },
    { label: "トリプル", value: totals.triple, color: ringBarColors.triple },
    { label: "BULL", value: totals.bullSingle + totals.bullDouble, color: ringBarColors.bull },
    { label: "OUT", value: totals.out, color: ringBarColors.out },
  ];

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "bar-item";

    const label = document.createElement("span");
    label.textContent = row.label;

    const track = document.createElement("div");
    track.className = "bar-track";

    const bar = document.createElement("span");
    const width = Math.min(100, (row.value / total) * 100);
    bar.style.width = `${width}%`;
    bar.style.background = row.color;
    track.appendChild(bar);

    const value = document.createElement("span");
    value.textContent = `${formatNumber(row.value)} (${formatPercent(row.value, total)})`;

    item.appendChild(label);
    item.appendChild(track);
    item.appendChild(value);
    ringBarsEl.appendChild(item);
  });
}

function buildEditableTable() {
  numberTableBody.innerHTML = "";
  order.forEach((num) => {
    const row = document.createElement("tr");
    row.dataset.num = String(num);
    row.innerHTML = `
      <td class="row-label">${num}</td>
      <td><input class="cell-input" type="number" min="0" data-field="inner" /></td>
      <td><input class="cell-input" type="number" min="0" data-field="outer" /></td>
      <td><input class="cell-input" type="number" min="0" data-field="double" /></td>
      <td><input class="cell-input" type="number" min="0" data-field="triple" /></td>
      <td class="total-cell" data-total="${num}">0</td>
    `;
    numberTableBody.appendChild(row);
  });
}

function setTableValues(data) {
  order.forEach((num) => {
    const counts = data.byNumber[String(num)];
    const row = numberTableBody.querySelector(`tr[data-num="${num}"]`);
    if (!row || !counts) return;
    row.querySelector('input[data-field="inner"]').value = counts.inner;
    row.querySelector('input[data-field="outer"]').value = counts.outer;
    row.querySelector('input[data-field="double"]').value = counts.double;
    row.querySelector('input[data-field="triple"]').value = counts.triple;
    row.querySelector("[data-total]").textContent = formatNumber(counts.total);
  });

  if (bullSingleInput) bullSingleInput.value = data.bull.single;
  if (bullDoubleInput) bullDoubleInput.value = data.bull.double;
  if (outCountInput) outCountInput.value = data.out;
}

function updateTableTotals(data) {
  order.forEach((num) => {
    const counts = data.byNumber[String(num)];
    const row = numberTableBody.querySelector(`tr[data-num="${num}"]`);
    if (!row || !counts) return;
    row.querySelector("[data-total]").textContent = formatNumber(counts.total);
  });
}

function readTableData() {
  const data = {
    byNumber: {},
    bull: { single: 0, double: 0 },
    out: 0,
    totals: {},
  };

  order.forEach((num) => {
    const row = numberTableBody.querySelector(`tr[data-num="${num}"]`);
    if (!row) return;
    const inner = toInt(row.querySelector('input[data-field="inner"]').value);
    const outer = toInt(row.querySelector('input[data-field="outer"]').value);
    const double = toInt(row.querySelector('input[data-field="double"]').value);
    const triple = toInt(row.querySelector('input[data-field="triple"]').value);
    data.byNumber[String(num)] = { inner, outer, double, triple };
  });

  if (bullSingleInput) data.bull.single = toInt(bullSingleInput.value);
  if (bullDoubleInput) data.bull.double = toInt(bullDoubleInput.value);
  if (outCountInput) data.out = toInt(outCountInput.value);

  return finalizeData(data);
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function renderHoverDefault() {
  hoverInfo.innerHTML = `
    <div class="hover-title">セグメントを選択</div>
    <div class="hover-body">ホバーするとリング別の命中数が表示されます。</div>
  `;
  lastHoverKey = null;
}

function renderHoverForNumber(num) {
  const counts = currentData.byNumber[String(num)];
  if (!counts) return;
  const key = `num-${num}`;
  if (lastHoverKey === key) return;
  lastHoverKey = key;
  const total = currentData.totals.overall || 0;

  hoverInfo.innerHTML = `
    <div class="hover-title">No.${num}</div>
    <div class="hover-grid">
      <div class="hover-item"><span>シングル(内)</span><strong>${formatNumber(
        counts.inner
      )} (${formatPercent(counts.inner, total)})</strong></div>
      <div class="hover-item"><span>シングル(外)</span><strong>${formatNumber(
        counts.outer
      )} (${formatPercent(counts.outer, total)})</strong></div>
      <div class="hover-item"><span>ダブル</span><strong>${formatNumber(
        counts.double
      )} (${formatPercent(counts.double, total)})</strong></div>
      <div class="hover-item"><span>トリプル</span><strong>${formatNumber(
        counts.triple
      )} (${formatPercent(counts.triple, total)})</strong></div>
      <div class="hover-item"><span>合計</span><strong>${formatNumber(
        counts.total
      )} (${formatPercent(counts.total, total)})</strong></div>
    </div>
  `;
}

function renderHoverForBull(kind) {
  const key = `bull-${kind}`;
  if (lastHoverKey === key) return;
  lastHoverKey = key;
  const value = kind === "double" ? currentData.bull.double : currentData.bull.single;
  const total = currentData.totals.overall || 0;
  hoverInfo.innerHTML = `
    <div class="hover-title">${kind === "double" ? "D-BULL" : "S-BULL"}</div>
    <div class="hover-grid">
      <div class="hover-item"><span>命中数</span><strong>${formatNumber(
        value
      )} (${formatPercent(value, total)})</strong></div>
    </div>
  `;
}

function applyHoverTarget(target) {
  if (target.classList.contains("segment")) {
    renderHoverForNumber(target.dataset.num);
    return;
  }
  if (target.dataset.type === "bull") {
    renderHoverForBull(target.dataset.bull);
    return;
  }
  renderHoverDefault();
}

function bindHover() {
  svg.addEventListener("pointermove", (event) => {
    applyHoverTarget(event.target);
  });

  svg.addEventListener("pointerdown", (event) => {
    applyHoverTarget(event.target);
  });

  svg.addEventListener("pointerleave", () => {
    renderHoverDefault();
  });
}

function renderAll() {
  updateBoard("rings");
  updateTotals();
  updateRingBars();
  updateTableTotals(currentData);
  renderHoverDefault();
}

function loadCsv(text) {
  try {
    currentData = parseCsv(text);
    if (!boardReady) {
      buildBoard();
      buildLegend();
      bindHover();
    }
    setTableValues(currentData);
    renderAll();
    setStatus("読み込み完了: 表に反映しました。", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

useSampleBtn.addEventListener("click", () => {
  loadCsv(sampleCsv.trim());
});

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    loadCsv(reader.result);
  };
  reader.readAsText(file);
});

function applyTableData() {
  currentData = readTableData();
  renderAll();
}

numberTableBody.addEventListener("input", () => {
  applyTableData();
});

if (bullSingleInput) bullSingleInput.addEventListener("input", applyTableData);
if (bullDoubleInput) bullDoubleInput.addEventListener("input", applyTableData);
if (outCountInput) outCountInput.addEventListener("input", applyTableData);

buildEditableTable();
loadCsv(sampleCsv.trim());
