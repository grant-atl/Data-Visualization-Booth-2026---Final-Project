const DATA_URL = "../data/survey-fixed.csv";
const GEO_URL = "../data/hcmc-districts.geojson";
const OFM_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const fmtInt = d3.format(",");
const fmtPct = d3.format(".0%");
const fmtPct1 = d3.format(".1%");

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

const colors = {
  ink: cssVar("--ink", "#0b1f3a"),
  navy: cssVar("--navy", "#0a2f5c"),
  muted: cssVar("--muted", "#5d6f86"),
  line: cssVar("--line", "#d7e0ec"),
  surface: cssVar("--surface", "#ffffff"),
  paper: cssVar("--paper", "#f7f9fc"),
  both: cssVar("--cat-both", "#6f4aa8"),
  liver: cssVar("--cat-liver", "#2166ac"),
  breast: cssVar("--cat-breast", "#c54f7d"),
  none: cssVar("--cat-none", "#c9d2de"),
  noData: cssVar("--map-no-data", "#e7ebf0"),
};

const mapPalette = ["#eef3f8", "#91a7bd", "#344b67"];

const ageBrackets = ["18-29", "30-39", "40-49", "50-59", "60+"];
let dbMap = null;
let dbMapReady = false;
let dbMapHoveredId = null;

// ---------------------------------------------------------
// Data normalization (mirrors app.js so column shapes match)
// ---------------------------------------------------------

function normalizeRow(raw) {
  const row = {};
  for (const [key, value] of Object.entries(raw)) {
    row[key.replace(/^﻿/, "")] = value;
  }
  const numericFields = [
    "age_years",
    "any_breast_symptom",
    "any_liver_symptom",
    "any_symptom",
    "total_symptom_count",
    "district_latitude",
    "district_longitude",
  ];
  for (const field of numericFields) {
    row[field] = row[field] === "" ? null : +row[field];
  }
  return row;
}

function keyDistrict(name) {
  if (!name) return "";
  const trimmed = String(name).trim();
  const m = trimmed.match(/^District\s+(\d+)$/i);
  if (m) return `quan ${m[1]}`;
  return trimmed
    .replace(/\s+District$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function displayDistrictName(name) {
  if (!name) return "—";
  return String(name).replace(/^District\s+(\d+)$/i, "District $1");
}

function healthHistoryScore(row) {
  let s = 0;
  if (row.current_liver_or_breast_cancer_label_en === "Yes") s += 1;
  if (row.prior_cancer_history_label_en === "Yes") s += 1;
  if (row.family_cancer_history_label_en === "Yes") s += 1;
  if (row.chronic_disease_label_en === "Yes") s += 1;
  return s;
}

function healthHistoryBucket(score) {
  if (score === 0) return "0";
  if (score === 1) return "1";
  if (score === 2) return "2";
  return "3-4";
}

function symptomCategory(row) {
  const b = row.any_breast_symptom === 1;
  const l = row.any_liver_symptom === 1;
  if (b && l) return "both";
  if (l) return "liver";
  if (b) return "breast";
  return "none";
}

function cleanSex(label) {
  // Strip the misleading "(assumed)" suffix per project owner.
  return String(label || "").replace(/\s*\(assumed\)\s*$/i, "").trim();
}

// ---------------------------------------------------------
// Tooltip helper
// ---------------------------------------------------------

const tooltip = d3
  .select("body")
  .append("div")
  .attr("id", "db-tooltip")
  .attr("role", "status")
  .attr("aria-live", "polite");

function showTooltip(event, html) {
  tooltip
    .style("display", "block")
    .html(html)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`);
}

function hideTooltip() {
  tooltip.style("display", "none");
}

// ---------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------

Promise.all([d3.csv(DATA_URL, normalizeRow), d3.json(GEO_URL)])
  .then(([rawRows, geo]) => {
    const rows = rawRows.filter((r) => r.respondent_id);
    const districtStats = buildDistrictStats(rows, geo);

    renderKpi(rows, districtStats);
    renderMap(geo, districtStats);
    renderDomain(rows);
    renderAge(rows);
    renderRanking("#db-top", topNDistricts(districtStats, 5, "desc"));
    renderRanking("#db-bottom", topNDistricts(districtStats, 5, "asc"));
    renderSex(rows);
    renderHistory(rows);

    window.addEventListener(
      "resize",
      debounce(() => {
        renderMap(geo, districtStats);
        renderDomain(rows);
        renderAge(rows);
        renderRanking("#db-top", topNDistricts(districtStats, 5, "desc"));
        renderRanking("#db-bottom", topNDistricts(districtStats, 5, "asc"));
        renderSex(rows);
        renderHistory(rows);
      }, 180),
      { passive: true }
    );
  })
  .catch((err) => {
    console.error("Dashboard data load failed:", err);
  });

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// ---------------------------------------------------------
// District aggregation
// ---------------------------------------------------------

function buildDistrictStats(rows, geo) {
  const grouped = d3.group(rows, (r) => keyDistrict(r.district_name_en));
  const stats = new Map();
  for (const [key, values] of grouped.entries()) {
    const n = values.length;
    const anyRate = d3.mean(values, (d) => d.any_symptom) ?? 0;
    stats.set(key, {
      key,
      name: displayDistrictName(values[0].district_name_en),
      n,
      anyRate,
      lowSample: n < 5,
    });
  }
  geo.features.forEach((f) => {
    const k = keyDistrict(f.properties.shape2);
    const stat = stats.get(k) ?? {
      key: k,
      name: f.properties.shape2,
      n: 0,
      anyRate: 0,
      lowSample: true,
    };
    Object.assign(f.properties, stat);
  });
  return Array.from(stats.values()).sort((a, b) => d3.descending(a.n, b.n));
}

function topNDistricts(stats, n, dir) {
  const eligible = stats.filter((d) => d.n >= 5);
  const sorted = eligible
    .slice()
    .sort((a, b) =>
      dir === "asc" ? d3.ascending(a.anyRate, b.anyRate) : d3.descending(a.anyRate, b.anyRate)
    );
  return sorted.slice(0, n);
}

// ---------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------

function renderKpi(rows, districtStats) {
  const n = rows.length;
  const anyCount = d3.sum(rows, (d) => (d.any_symptom === 1 ? 1 : 0));
  const bothCount = d3.sum(rows, (d) =>
    d.any_breast_symptom === 1 && d.any_liver_symptom === 1 ? 1 : 0
  );
  const districtsWithData = districtStats.filter((d) => d.n > 0).length;

  d3.select("#kpi-n").text(fmtInt(n));
  d3.select("#kpi-any").text(fmtPct(anyCount / n));
  d3.select("#kpi-any-n").text(fmtInt(anyCount));
  d3.select("#kpi-both").text(fmtPct(bothCount / n));
  d3.select("#kpi-both-n").text(fmtInt(bothCount));
  d3.select("#kpi-districts").text(fmtInt(districtsWithData));
}

// ---------------------------------------------------------
// Map — MapLibre choropleth using the same basemap as the story page.
// ---------------------------------------------------------

function renderMap(geo, districtStats) {
  const ratesWithSample = districtStats
    .filter((s) => s.n >= 5)
    .map((s) => s.anyRate);
  const minRate = d3.min(ratesWithSample) ?? 0;
  const maxRate = d3.max(ratesWithSample) ?? 1;
  const color = d3
    .scaleLinear()
    .domain([minRate, (minRate + maxRate) / 2, maxRate])
    .range(mapPalette)
    .clamp(true);

  geo.features.forEach((feature) => {
    feature.properties.mapColor =
      feature.properties.n > 0 ? color(feature.properties.anyRate) : colors.noData;
  });

  if (!dbMap) {
    try {
      dbMap = new maplibregl.Map({
        container: "db-map",
        style: OFM_STYLE,
        center: [106.704, 10.8],
        zoom: 9.55,
        pitch: 0,
        bearing: 0,
        attributionControl: true,
      });
    } catch (err) {
      showMapFallback();
      console.warn("Dashboard map could not initialize:", err);
      return;
    }
    dbMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    dbMap.on("load", () => {
      dbMapReady = true;
      buildMapLayers(geo);
      fitMapToGeo(geo);
      bindDashboardMapHover();
    });
  } else if (dbMapReady) {
    dbMap.getSource("db-districts")?.setData(geo);
    dbMap.resize();
    fitMapToGeo(geo);
  }

  // Update the scale strip beneath the map to reflect the actual domain.
  const scaleEl = d3.select("#db-map-scale").node();
  if (scaleEl) {
    scaleEl.style.background = `linear-gradient(to right, ${mapPalette[0]}, ${mapPalette[1]}, ${mapPalette[2]})`;
  }
  d3.select(".legend-scale .legend-scale-label:first-of-type").text(
    fmtPct(minRate)
  );
  d3.select(".legend-scale .legend-scale-label:last-of-type").text(
    fmtPct(maxRate)
  );
}

function showMapFallback() {
  d3.select("#db-map")
    .html("")
    .append("div")
    .attr("class", "db-map-fallback")
    .text("Map preview is unavailable in this browser. District rankings remain available below.");
}

function buildMapLayers(geo) {
  dbMap.addSource("db-districts", {
    type: "geojson",
    data: geo,
    promoteId: "key",
  });

  dbMap.addLayer({
    id: "db-district-fill",
    type: "fill",
    source: "db-districts",
    paint: {
      "fill-color": ["get", "mapColor"],
      "fill-opacity": [
        "case",
        ["==", ["get", "n"], 0],
        0.22,
        ["boolean", ["get", "lowSample"], false],
        0.48,
        0.78,
      ],
    },
  });

  dbMap.addLayer({
    id: "db-district-outline",
    type: "line",
    source: "db-districts",
    paint: {
      "line-color": "#25323c",
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.72,
        0.34,
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        2.1,
        0.8,
      ],
    },
  });
}

function bindDashboardMapHover() {
  const tooltipEl = d3.select("#db-map-tooltip");

  dbMap.on("mousemove", "db-district-fill", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    if (dbMapHoveredId !== null) {
      dbMap.setFeatureState({ source: "db-districts", id: dbMapHoveredId }, { hover: false });
    }
    dbMapHoveredId = feature.id;
    dbMap.setFeatureState({ source: "db-districts", id: dbMapHoveredId }, { hover: true });

    const p = feature.properties;
    const rateText = p.lowSample
      ? `${fmtPct1(+p.anyRate || 0)} — small sample`
      : fmtPct1(+p.anyRate || 0);
    const details = +p.n
      ? `<span>n = ${fmtInt(+p.n)} respondents</span><span>Any warning sign: ${rateText}</span>`
      : "<span>No survey respondents</span>";

    tooltipEl
      .style("display", "block")
      .style("left", `${event.point.x + 12}px`)
      .style("top", `${event.point.y + 12}px`)
      .html(`<strong>${p.name || displayDistrictName(p.shape2)}</strong>${details}`);
  });

  dbMap.on("mouseleave", "db-district-fill", () => {
    if (dbMapHoveredId !== null) {
      dbMap.setFeatureState({ source: "db-districts", id: dbMapHoveredId }, { hover: false });
    }
    dbMapHoveredId = null;
    tooltipEl.style("display", "none");
  });
}

function fitMapToGeo(geo) {
  const bounds = new maplibregl.LngLatBounds();
  geo.features.forEach((feature) => extendBounds(bounds, feature.geometry.coordinates));
  if (!bounds.isEmpty()) {
    dbMap.fitBounds(bounds, {
      padding: { top: 28, right: 26, bottom: 24, left: 26 },
      duration: 0,
    });
  }
}

function extendBounds(bounds, coordinates) {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    bounds.extend(coordinates);
    return;
  }
  coordinates.forEach((child) => extendBounds(bounds, child));
}

// ---------------------------------------------------------
// Symptom domain — single horizontal stacked bar.
// ---------------------------------------------------------

function renderDomain(rows) {
  const counts = { both: 0, liver: 0, breast: 0, none: 0 };
  rows.forEach((r) => {
    counts[symptomCategory(r)] += 1;
  });
  const total = rows.length;

  const categories = [
    { key: "both", label: "Both breast & liver", color: colors.both },
    { key: "liver", label: "Liver only", color: colors.liver },
    { key: "breast", label: "Breast only", color: colors.breast },
    { key: "none", label: "No reported signs", color: colors.none },
  ];

  const data = categories
    .map((c) => ({ ...c, count: counts[c.key], share: counts[c.key] / total }))
    .sort((a, b) => d3.descending(a.count, b.count));

  drawDomainBars("#db-domain", data, total);
}

function drawDomainBars(selector, data, total) {
  const svg = d3.select(selector);
  const node = svg.node();
  if (!node) return;
  const { width, height } = node.getBoundingClientRect();
  if (!width || !height) return;
  svg.selectAll("*").remove();

  const labelWidth = Math.min(150, Math.max(110, width * 0.42));
  const m = { top: 8, right: 60, bottom: 6, left: labelWidth + 6 };
  const innerW = Math.max(40, width - m.left - m.right);
  const innerH = Math.max(40, height - m.top - m.bottom);

  const rowH = innerH / data.length;
  const barH = Math.min(20, rowH * 0.6);

  const g = svg
    .append("g")
    .attr("transform", `translate(${m.left},${m.top})`);
  const x = d3.scaleLinear().domain([0, total]).range([0, innerW]);

  const rowG = g
    .selectAll("g.row")
    .data(data)
    .join("g")
    .attr("class", "row")
    .attr("transform", (_, i) => `translate(0,${i * rowH + rowH / 2})`);

  rowG
    .append("text")
    .attr("class", "row-label")
    .attr("x", -8)
    .attr("y", 4)
    .attr("text-anchor", "end")
    .text((d) => d.label);

  rowG
    .append("rect")
    .attr("x", 0)
    .attr("y", -barH / 2)
    .attr("width", innerW)
    .attr("height", barH)
    .attr("fill", "#eef3f8");

  rowG
    .append("rect")
    .attr("x", 0)
    .attr("y", -barH / 2)
    .attr("width", (d) => Math.max(2, x(d.count)))
    .attr("height", barH)
    .attr("fill", (d) => d.color);

  rowG
    .append("text")
    .attr("class", "value-label")
    .attr("x", (d) => Math.max(2, x(d.count)) + 6)
    .attr("y", 4)
    .text((d) => `${d.count} · ${fmtPct(d.share)}`);
}

// ---------------------------------------------------------
// Age — horizontal bars of any-symptom rate, with n shown.
// ---------------------------------------------------------

function renderAge(rows) {
  const buckets = ageBrackets.map((label) => {
    const subset = rows.filter((r) => r.age_group === label);
    const n = subset.length;
    const rate = n
      ? d3.sum(subset, (d) => (d.any_symptom === 1 ? 1 : 0)) / n
      : 0;
    return { label, n, rate };
  });

  drawHorizontalRateBars("#db-age", buckets, {
    rightPad: 50,
    subLabel: (d) => `n = ${d.n}`,
  });
}

// ---------------------------------------------------------
// Sex — two bars.
// ---------------------------------------------------------

function renderSex(rows) {
  const groups = d3.rollups(
    rows.filter((r) => r.gender_label_en_assumed),
    (v) => ({
      n: v.length,
      rate: d3.sum(v, (d) => (d.any_symptom === 1 ? 1 : 0)) / v.length,
    }),
    (d) => cleanSex(d.gender_label_en_assumed)
  );
  const data = groups
    .map(([label, stat]) => ({ label, ...stat }))
    .sort((a, b) => d3.ascending(a.label, b.label));

  drawHorizontalRateBars("#db-sex", data, {
    rightPad: 50,
    subLabel: (d) => `n = ${d.n}`,
  });
}

// ---------------------------------------------------------
// Health-history — four buckets.
// ---------------------------------------------------------

function renderHistory(rows) {
  const buckets = ["0", "1", "2", "3-4"].map((b) => {
    const subset = rows.filter((r) => healthHistoryBucket(healthHistoryScore(r)) === b);
    const n = subset.length;
    const rate = n
      ? d3.sum(subset, (d) => (d.any_symptom === 1 ? 1 : 0)) / n
      : 0;
    return { label: `${b} factor${b === "1" ? "" : "s"}`, n, rate };
  });

  drawHorizontalRateBars("#db-history", buckets, {
    rightPad: 50,
    subLabel: (d) => `n = ${d.n}`,
  });
}

// ---------------------------------------------------------
// Top / Bottom 5 — same shape as the rate bars above.
// ---------------------------------------------------------

function renderRanking(selector, items) {
  drawHorizontalRateBars(
    selector,
    items.map((s) => ({ label: s.name, n: s.n, rate: s.anyRate })),
    { rightPad: 50, subLabel: (d) => `n = ${d.n}` }
  );
}

// ---------------------------------------------------------
// Shared bar renderer for rate panels.
// One color (navy), inline % label, n shown below each row.
// ---------------------------------------------------------

function drawHorizontalRateBars(selector, data, opts = {}) {
  const svg = d3.select(selector);
  const node = svg.node();
  if (!node) return;
  const { width, height } = node.getBoundingClientRect();
  if (!width || !height) return;
  svg.selectAll("*").remove();

  const labelWidth = Math.min(118, Math.max(86, width * 0.34));
  const m = { top: 6, right: opts.rightPad ?? 46, bottom: 4, left: labelWidth + 6 };
  const innerW = Math.max(40, width - m.left - m.right);
  const innerH = Math.max(40, height - m.top - m.bottom);

  const rowCount = data.length;
  const rowH = innerH / rowCount;
  const barH = Math.min(16, rowH * 0.42);

  const g = svg
    .append("g")
    .attr("transform", `translate(${m.left},${m.top})`);

  const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);

  // Reference rule at 100%.
  g.append("line")
    .attr("x1", innerW)
    .attr("x2", innerW)
    .attr("y1", 0)
    .attr("y2", innerH)
    .attr("stroke", "#dde6f0")
    .attr("stroke-dasharray", "2,3");

  const rowG = g
    .selectAll("g.row")
    .data(data)
    .join("g")
    .attr("class", "row")
    .attr("transform", (_, i) => `translate(0,${i * rowH + rowH / 2})`);

  // Row label (left of the bar, right-aligned to the label column).
  rowG
    .append("text")
    .attr("class", "row-label")
    .attr("x", -8)
    .attr("y", -2)
    .attr("text-anchor", "end")
    .text((d) => d.label);

  if (opts.subLabel) {
    rowG
      .append("text")
      .attr("class", "row-sub")
      .attr("x", -8)
      .attr("y", 12)
      .attr("text-anchor", "end")
      .text(opts.subLabel);
  }

  // Track behind the bar.
  rowG
    .append("rect")
    .attr("x", 0)
    .attr("y", -barH / 2)
    .attr("width", innerW)
    .attr("height", barH)
    .attr("fill", "#eef3f8");

  // Bar.
  rowG
    .append("rect")
    .attr("x", 0)
    .attr("y", -barH / 2)
    .attr("width", (d) => x(d.rate))
    .attr("height", barH)
    .attr("fill", colors.navy);

  // Value label outside the bar.
  rowG
    .append("text")
    .attr("class", "value-label")
    .attr("x", (d) => x(d.rate) + 6)
    .attr("y", 4)
    .text((d) => fmtPct(d.rate));
}
