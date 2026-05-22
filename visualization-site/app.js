const DATA_URL = "data/survey-fixed.csv";
const GEO_URL = "data/hcmc-districts.geojson";
const OFM_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

const colors = {
  ink: "#16202a",
  chartInk: cssVar("--ink", "#0b1f3a"),
  muted: cssVar("--muted", "#5d6f86"),
  line: cssVar("--line", "#d7e0ec"),
  surface: cssVar("--surface", "#ffffff"),
  noData: cssVar("--map-no-data", "#e7ebf0"),
  lowSample: cssVar("--low", "#e8edf4"),
  correlationNegative: cssVar("--corr-negative", "#9a6a28"),
  correlationPositive: cssVar("--corr-positive", "#2f6f68"),
  lifestyleCircle: "#16202a",
};

const categoryOrder = ["both", "liver", "breast", "none"];
const categoryColors = {
  both: cssVar("--cat-both", "#6f4aa8"),
  liver: cssVar("--cat-liver", "#2166ac"),
  breast: cssVar("--cat-breast", "#c54f7d"),
  none: cssVar("--cat-none", "#c9d2de"),
};
const categoryStrokes = {
  both: cssVar("--cat-both-stroke", "#4d3178"),
  liver: cssVar("--cat-liver-stroke", "#164a7f"),
  breast: cssVar("--cat-breast-stroke", "#8d3558"),
  none: cssVar("--cat-none-stroke", "#9faabd"),
};
const symptomRatePalettes = {
  any: ["#eef3f8", "#91a7bd", "#344b67"],
  breast: ["#fbedf3", "#e99ab6", categoryColors.breast],
  liver: ["#edf5fc", "#86b7df", categoryColors.liver],
  general: ["#eef3f8", "#b8c2ce", "#344b67"],
};

function symptomCategory(row) {
  const b = row.any_breast_symptom === 1;
  const l = row.any_liver_symptom === 1;
  if (b && l) return "both";
  if (l) return "liver";
  if (b) return "breast";
  return "none";
}

const fmt = d3.format(",");
const pct = d3.format(".0%");
const one = d3.format(".1f");

let surveyRows = [];
let districtGeo = null;
let districtStats = [];
let districtRowsByKey = new Map();
let currentMode = "lifestyle";
let map;

const symptomOptions = [
  { label: "Any Symptom", field: "any_symptom", kind: "flag", group: "any" },
  { label: "Breast Lump", field: "breast_lump_or_swelling_label_en", kind: "yes", group: "breast" },
  { label: "Breast Shape Change", field: "breast_size_or_shape_change_label_en", kind: "yes", group: "breast" },
  { label: "Breast Skin Dimpling", field: "breast_dimpling_or_skin_thickening_label_en", kind: "yes", group: "breast" },
  { label: "Nipple Discharge", field: "nipple_discharge_or_blood_label_en", kind: "yes", group: "breast" },
  { label: "Breast Pain", field: "persistent_breast_or_nipple_pain_label_en", kind: "yes", group: "breast" },
  { label: "Rib Cage Lump", field: "hard_lump_right_below_rib_cage_label_en", kind: "yes", group: "liver" },
  { label: "Upper Right Abdominal Pain", field: "right_upper_abdominal_discomfort_or_pain_label_en", kind: "yes", group: "liver" },
  { label: "Jaundice", field: "jaundice_skin_or_eyes_label_en", kind: "yes", group: "liver" },
  { label: "Weight Loss", field: "unexplained_weight_loss_recent_label_en", kind: "yes", group: "liver" },
  { label: "Fatigue", field: "unusual_fatigue_or_weakness_recent_label_en", kind: "yes", group: "liver" },
];

const lifestyleOptions = [
  { label: "Red meat meals/week", field: "red_meat_meals_per_week", unit: "meals/week" },
  { label: "Vegetable meals/week", field: "vegetable_meals_per_week", unit: "meals/week" },
  { label: "Alcohol times/week", field: "alcohol_times_per_week", unit: "times/week" },
  { label: "Exercise times/week", field: "exercise_times_per_week", unit: "times/week" },
  { label: "Sleep hours/day", field: "sleep_hours_per_day_clean", unit: "hours/day" },
  { label: "Social support hours/week", field: "social_support_hours_per_week", unit: "hours/week" },
  { label: "BMI", field: "bmi", unit: "BMI" },
];

let selectedSymptomLabel = symptomOptions[0].label;
let selectedLifestyleLabel = lifestyleOptions[0].label;

const mapCopy = {
  lifestyle: {
    title: "Warning signs and lifestyle by district",
    note: "District shading shows the selected warning sign; circle size shows the selected lifestyle or support measure.",
    center: [106.72, 10.8],
    zoom: 10.2,
  },
};

Promise.all([d3.csv(DATA_URL, normalizeRow), d3.json(GEO_URL)]).then(
  ([rows, geo]) => {
    surveyRows = rows.filter((row) => row.respondent_id);
    districtGeo = geo;
    districtStats = buildDistrictStats(surveyRows, districtGeo);
    updateSelectedSymptomRates(false);
    setupControls();
    updateSelectedLifestyleValues(false);
    hydrateHero();
    initMap();
    drawAllCharts();
    window.addEventListener("resize", debounce(drawAllCharts, 180), { passive: true });
  }
);

function normalizeRow(raw) {
  const row = {};
  for (const [key, value] of Object.entries(raw)) {
    row[key.replace(/^\uFEFF/, "")] = value;
  }

  const numericFields = [
    "age_years",
    "bmi",
    "current_liver_or_breast_cancer_code",
    "red_meat_meals_per_week",
    "vegetable_meals_per_week",
    "alcohol_times_per_week",
    "exercise_times_per_week",
    "sleep_hours_per_day_clean",
    "breast_symptom_count",
    "liver_symptom_count",
    "total_symptom_count",
    "any_breast_symptom",
    "any_liver_symptom",
    "any_symptom",
    "social_support_hours_per_week",
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
  const districtMatch = trimmed.match(/^District\s+(\d+)$/i);
  if (districtMatch) return `quan ${districtMatch[1]}`;
  return trimmed
    .replace(/\s+District$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function displayDistrictName(name) {
  if (!name) return "No district label";
  return String(name).replace(/^District\s+(\d+)$/i, "District $1");
}

function mean(rows, accessor) {
  return d3.mean(rows, accessor) ?? 0;
}

function correlation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = d3.mean(xs);
  const my = d3.mean(ys);
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denominator = Math.sqrt(dx2 * dy2);
  return denominator ? numerator / denominator : 0;
}

function selectedSymptom() {
  return symptomOptions.find((option) => option.label === selectedSymptomLabel) ?? symptomOptions[0];
}

function selectedLifestyle() {
  return lifestyleOptions.find((option) => option.label === selectedLifestyleLabel) ?? lifestyleOptions[0];
}

function selectedSymptomRatePalette() {
  return symptomRatePalettes[selectedSymptom().group] ?? symptomRatePalettes.any;
}

function symptomValue(row, option = selectedSymptom()) {
  if (option.kind === "flag") return +(row[option.field] === 1);
  return +(row[option.field] === "Yes");
}

function setupControls() {
  const symptomSelect = d3.select("#map-symptom-select");
  symptomSelect
    .selectAll("option")
    .data(symptomOptions)
    .join("option")
    .attr("value", (d) => d.label)
    .text((d) => d.label);
  symptomSelect.property("value", selectedSymptomLabel);
  symptomSelect.on("change", (event) => {
    selectedSymptomLabel = event.target.value;
    updateSelectedSymptomRates();
    if (currentMode === "selected") setMapMode("selected", false);
    if (currentMode === "lifestyle") setMapMode("lifestyle", false);
  });

  const lifestyleControls = d3.selectAll("#lifestyle-select, #map-lifestyle-select");
  lifestyleControls
    .selectAll("option")
    .data(lifestyleOptions)
    .join("option")
    .attr("value", (d) => d.label)
    .text((d) => d.label);
  lifestyleControls.property("value", selectedLifestyleLabel);
  lifestyleControls.on("change", (event) => {
    selectedLifestyleLabel = event.target.value;
    lifestyleControls.property("value", selectedLifestyleLabel);
    updateSelectedLifestyleValues();
  });
}

function buildDistrictStats(rows, geo) {
  const grouped = d3.group(rows, (row) => keyDistrict(row.district_name_en));
  districtRowsByKey = grouped;
  const stats = new Map();

  for (const [key, values] of grouped.entries()) {
    const n = values.length;
    const avgSymptoms = mean(values, (d) => d.total_symptom_count);
    const anySymptomRate = mean(values, (d) => d.any_symptom);
    const breastRate = mean(values, (d) => d.any_breast_symptom);
    const liverRate = mean(values, (d) => d.any_liver_symptom);
    const redMeatMean = mean(values, (d) => d.red_meat_meals_per_week);
    const currentCancerRate = mean(
      values,
      (d) => +(d.current_liver_or_breast_cancer_label_en === "Yes")
    );
    const familyHistoryRate = mean(
      values,
      (d) => +(d.family_cancer_history_label_en === "Yes")
    );
    const priorCancerRate = mean(
      values,
      (d) => +(d.prior_cancer_history_label_en === "Yes")
    );
    const chronicDiseaseRate = mean(
      values,
      (d) => +(d.chronic_disease_label_en === "Yes")
    );
    const healthHistoryRate = mean(
      values,
      (d) =>
        +(d.current_liver_or_breast_cancer_label_en === "Yes" ||
          d.family_cancer_history_label_en === "Yes" ||
          d.prior_cancer_history_label_en === "Yes" ||
          d.chronic_disease_label_en === "Yes")
    );
    const priority = n >= 5 ? avgSymptoms * 0.58 + anySymptomRate * 2.6 + Math.min(n, 18) * 0.045 : 0;

    stats.set(key, {
      key,
      name: displayDistrictName(values[0].district_name_en),
      n,
      avgSymptoms,
      anySymptomRate,
      breastRate,
      liverRate,
      redMeatMean,
      selectedLifestyleMean: redMeatMean,
      selectedSymptomRate: 0,
      currentCancerRate,
      familyHistoryRate,
      priorCancerRate,
      chronicDiseaseRate,
      healthHistoryRate,
      priority,
      lowSample: n < 5,
      lng: mean(values, (d) => d.district_longitude),
      lat: mean(values, (d) => d.district_latitude),
    });
  }

  geo.features.forEach((feature) => {
    const key = keyDistrict(feature.properties.shape2);
    const stat = stats.get(key) ?? {
      key,
      name: feature.properties.shape2,
      n: 0,
      avgSymptoms: 0,
      anySymptomRate: 0,
      breastRate: 0,
      liverRate: 0,
      redMeatMean: 0,
      selectedLifestyleMean: 0,
      selectedSymptomRate: 0,
      currentCancerRate: 0,
      familyHistoryRate: 0,
      priorCancerRate: 0,
      chronicDiseaseRate: 0,
      healthHistoryRate: 0,
      priority: 0,
      lowSample: true,
      lng: null,
      lat: null,
    };
    Object.assign(feature.properties, stat);
  });

  return Array.from(stats.values()).sort((a, b) => d3.descending(a.n, b.n));
}

function updateSelectedSymptomRates(refreshMap = true) {
  if (!districtGeo) return;

  districtGeo.features.forEach((feature) => {
    const rows = districtRowsByKey.get(feature.properties.key) ?? [];
    const selectedSymptomRate = mean(rows, (row) => symptomValue(row));
    feature.properties.selectedSymptomRate = selectedSymptomRate;
    feature.properties.selectedSymptomLabel = selectedSymptomLabel;
  });

  districtStats.forEach((stat) => {
    const rows = districtRowsByKey.get(stat.key) ?? [];
    stat.selectedSymptomRate = mean(rows, (row) => symptomValue(row));
  });

  if (refreshMap && map?.getSource("districts")) {
    map.getSource("districts").setData(districtGeo);
  }
}

function updateSelectedLifestyleValues(refreshMap = true) {
  const metric = selectedLifestyle();

  districtGeo?.features.forEach((feature) => {
    const rows = districtRowsByKey.get(feature.properties.key) ?? [];
    feature.properties.selectedLifestyleMean = mean(rows, (row) => row[metric.field]);
    feature.properties.selectedLifestyleLabel = selectedLifestyleLabel;
  });

  districtStats.forEach((stat) => {
    const rows = districtRowsByKey.get(stat.key) ?? [];
    stat.selectedLifestyleMean = mean(rows, (row) => row[metric.field]);
  });

  if (refreshMap && map?.getSource("districts")) {
    map.getSource("districts").setData(districtGeo);
  }
  if (refreshMap && map?.getSource("district-points")) {
    map.getSource("district-points").setData(pointGeoJSON());
  }
}

function hydrateHero() {
  d3.select("#stat-n").text(fmt(surveyRows.length));
  d3.select("#stat-symptoms").text(pct(mean(surveyRows, (d) => d.any_symptom)));
  d3.select("#stat-both").text(
    pct(
      mean(surveyRows, (d) =>
        d.any_breast_symptom === 1 && d.any_liver_symptom === 1 ? 1 : 0
      )
    )
  );
  d3.select("#stat-districts").text(fmt(districtStats.length));

  const counts = { both: 0, liver: 0, breast: 0, none: 0 };
  surveyRows.forEach((row) => {
    counts[symptomCategory(row)] += 1;
  });
  d3.select("#legend-both").text(fmt(counts.both));
  d3.select("#legend-liver").text(fmt(counts.liver));
  d3.select("#legend-breast").text(fmt(counts.breast));
  d3.select("#legend-none").text(fmt(counts.none));
}

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: OFM_STYLE,
    center: [106.704, 10.78],
    zoom: 10.2,
    pitch: 20,
    bearing: -7,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  map.on("load", () => {
    map.addSource("districts", {
      type: "geojson",
      data: districtGeo,
      promoteId: "key",
    });

    map.addLayer({
      id: "district-fill",
      type: "fill",
      source: "districts",
      paint: {
        "fill-color": colorExpression("lifestyle"),
        "fill-opacity": opacityExpression(),
      },
    });

    map.addLayer({
      id: "district-outline",
      type: "line",
      source: "districts",
      paint: {
        "line-color": "#25323c",
        "line-opacity": 0.38,
        "line-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.4,
          0.8,
        ],
      },
    });

    map.addSource("district-points", {
      type: "geojson",
      data: pointGeoJSON(),
    });

    map.addLayer({
      id: "district-points",
      type: "circle",
      source: "district-points",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "n"], 1, 4, 31, 16],
        "circle-color": colors.lifestyleCircle,
        "circle-opacity": 0.68,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": colors.surface,
      },
    });

    bindMapHover();
    setMapMode("lifestyle", false);
  });
}

function colorExpression(mode) {
  if (mode === "footprint") {
    return [
      "case",
      ["==", ["get", "n"], 0],
      colors.noData,
      [
        "interpolate",
        ["linear"],
        ["get", "n"],
        1,
        "#dbe8f5",
        8,
        "#7cb7ae",
        18,
        "#147985",
        31,
        "#063d49",
      ],
    ];
  }

  if (mode === "symptoms") {
    return [
      "case",
      ["==", ["get", "n"], 0],
      colors.noData,
      [
        "interpolate",
        ["linear"],
        ["get", "avgSymptoms"],
        0,
        symptomRatePalettes.general[0],
        3,
        symptomRatePalettes.general[1],
        6,
        "#7d8fa2",
        8,
        symptomRatePalettes.general[2],
      ],
    ];
  }

  if (mode === "selected") {
    const [low, mid, high] = selectedSymptomRatePalette();
    return [
      "case",
      ["==", ["get", "n"], 0],
      colors.noData,
      [
        "interpolate",
        ["linear"],
        ["get", "selectedSymptomRate"],
        0,
        low,
        0.5,
        mid,
        1,
        high,
      ],
    ];
  }

  if (mode === "lifestyle") {
    return colorExpression("selected");
  }

  return [
    "case",
    ["==", ["get", "n"], 0],
    colors.noData,
    [
      "interpolate",
      ["linear"],
      ["get", "priority"],
      0,
      symptomRatePalettes.general[0],
      3,
      symptomRatePalettes.general[1],
      5,
      "#7d8fa2",
      7,
      symptomRatePalettes.general[2],
    ],
  ];
}

function opacityExpression() {
  return [
    "case",
    ["==", ["get", "n"], 0],
    0.28,
    0.82,
  ];
}

function pointGeoJSON() {
  return {
    type: "FeatureCollection",
    features: districtStats
      .filter((d) => Number.isFinite(d.lng) && Number.isFinite(d.lat))
      .map((d) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [d.lng, d.lat] },
        properties: d,
      })),
  };
}

function bindMapHover() {
  let hoveredId = null;
  const tooltip = d3.select("#map-tooltip");

  map.on("mousemove", "district-fill", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    if (hoveredId !== null) {
      map.setFeatureState({ source: "districts", id: hoveredId }, { hover: false });
    }
    hoveredId = feature.id;
    map.setFeatureState({ source: "districts", id: hoveredId }, { hover: true });

    const p = feature.properties;
    tooltip
      .style("display", "block")
      .style("left", `${event.point.x + 14}px`)
      .style("top", `${event.point.y + 14}px`)
      .html(
        `<strong>${p.name}</strong>
        <span>n = ${fmt(+p.n || 0)}</span>
        <span>${selectedSymptomLabel}: ${pct(+p.selectedSymptomRate || 0)}</span>
        <span>Avg. symptom count: ${one(+p.avgSymptoms || 0)}</span>
        <span>${selectedLifestyleLabel}: ${one(+p.selectedLifestyleMean || 0)} ${selectedLifestyle().unit}</span>`
      );
  });

  map.on("mouseleave", "district-fill", () => {
    if (hoveredId !== null) {
      map.setFeatureState({ source: "districts", id: hoveredId }, { hover: false });
    }
    hoveredId = null;
    tooltip.style("display", "none");
  });
}

function setMapMode(mode, shouldFly = true) {
  currentMode = "lifestyle";
  const copy = { ...mapCopy.lifestyle };
  copy.title = `${selectedSymptomLabel} and ${selectedLifestyleLabel}`;
  copy.note = `District shading shows ${selectedSymptomLabel.toLowerCase()}; circle size shows ${selectedLifestyleLabel.toLowerCase()}.`;
  d3.select("#map-title").text(copy.title);
  d3.select("#map-note").text(copy.note);

  if (map?.getLayer("district-fill")) {
    map.setPaintProperty("district-fill", "fill-color", colorExpression("lifestyle"));
    map.setPaintProperty(
      "district-points",
      "circle-opacity",
      0.68
    );
    map.setPaintProperty(
      "district-points",
      "circle-radius",
      ["interpolate", ["linear"], ["get", "selectedLifestyleMean"], 0, 4, 5, 9, 12, 18, 32, 24]
    );
  }

  if (shouldFly && map) {
    map.flyTo({
      center: copy.center,
      zoom: window.innerWidth < 700 ? copy.zoom - 0.8 : copy.zoom,
      pitch: 35,
      bearing: -18,
      duration: 1100,
      essential: true,
    });
  }
}

function drawAllCharts() {
  drawSymptomRates();
  drawSymptomChord();
  drawLifestyleMatrix();
  drawAgeReportingSankey();
}

function debounce(fn, wait) {
  let timeout;
  return () => {
    clearTimeout(timeout);
    timeout = setTimeout(fn, wait);
  };
}

function chartSize(selector) {
  const node = document.querySelector(selector);
  const width = Math.max(320, node.getBoundingClientRect().width);
  const height = width < 560 ? 380 : 460;
  return { width, height };
}

function clearSvg(selector) {
  return d3.select(selector).selectAll("*").remove();
}

function drawSymptomRates() {
  const selector = "#symptom-rate-chart";
  clearSvg(selector);
  const node = document.querySelector(selector);
  const width = Math.max(320, node.getBoundingClientRect().width);
  const height = width < 560 ? 380 : 440;
  const margin = { top: 8, right: 16, bottom: 58, left: 16 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const symptomRows = surveyRows
    .map((row, index) => ({ ...row, index, category: symptomCategory(row) }))
    .sort((a, b) => {
      const order =
        categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
      if (order !== 0) return order;
      return d3.descending(a.total_symptom_count, b.total_symptom_count);
    });

  const counts = d3.rollup(
    symptomRows,
    (v) => v.length,
    (d) => d.category
  );

  const columns = width < 560 ? 10 : 17;
  const rows = Math.ceil(symptomRows.length / columns);
  const cell = Math.min(innerW / columns, innerH / rows);
  const radius = Math.max(4, Math.min(9, cell * 0.34));
  const gridW = columns * cell;
  const gridH = rows * cell;
  const gridX = (innerW - gridW) / 2;

  const svg = d3.select(selector).attr("viewBox", [0, 0, width, height]);
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  g.selectAll("circle")
    .data(symptomRows)
    .join("circle")
    .attr("cx", (d, i) => gridX + (i % columns) * cell + cell / 2)
    .attr("cy", (d, i) => Math.floor(i / columns) * cell + cell / 2)
    .attr("r", 0)
    .attr("fill", (d) => categoryColors[d.category])
    .attr("stroke", (d) => categoryStrokes[d.category])
    .attr("stroke-width", 1)
    .transition()
    .delay((d, i) => i * 2.5)
    .duration(420)
    .attr("r", radius);

  // Direct annotations: label the "reported any" vs "reported none" split.
  const reportedCount =
    (counts.get("both") || 0) +
    (counts.get("liver") || 0) +
    (counts.get("breast") || 0);
  const noneCount = counts.get("none") || 0;
  const splitIndex = reportedCount;
  const splitCol = splitIndex % columns;
  const splitRow = Math.floor(splitIndex / columns);
  const splitY = splitRow * cell + cell / 2;
  const annotateY = gridH + 24;
  const stackLabels = width < 560;

  const annotate = g
    .append("g")
    .attr("transform", `translate(0,${annotateY})`)
    .attr("font-family", '"Plus Jakarta Sans", sans-serif');

  annotate
    .append("text")
    .attr("class", "direct-label")
    .attr("x", gridX)
    .attr("y", 0)
    .attr("fill", colors.chartInk)
    .text(`${reportedCount} reported any warning sign`);

  annotate
    .append("text")
    .attr("class", "direct-label")
    .attr("x", stackLabels ? gridX : gridX + gridW)
    .attr("y", stackLabels ? 20 : 0)
    .attr("text-anchor", stackLabels ? "start" : "end")
    .attr("fill", categoryStrokes.none)
    .text(`${noneCount} reported none`);

  // Subtle marker line at the split column on the last "any" row.
  if (splitRow < rows && cell > 14) {
    const markerX =
      gridX + (splitCol === 0 ? 0 : splitCol * cell);
    annotate
      .append("line")
      .attr("x1", markerX)
      .attr("x2", markerX)
      .attr("y1", -annotateY + splitY - cell / 2)
      .attr("y2", -annotateY + splitY + cell / 2)
      .attr("stroke", colors.chartInk)
      .attr("stroke-width", 1.25)
      .attr("opacity", 0.45);
  }
}

function drawSymptomChord() {
  const selector = "#symptom-chord";
  clearSvg(selector);
  const node = document.querySelector(selector);
  const width = Math.max(360, node.getBoundingClientRect().width);
  const isNarrow = width < 480;
  const labelPad = isNarrow ? 70 : 92;
  const height = Math.min(width, 560);
  const outerRadius = Math.min(width, height) / 2 - labelPad;
  const innerRadius = outerRadius - 14;

  const shortLabels = {
    "Breast Lump": "Breast Lump",
    "Breast Shape Change": "Shape Change",
    "Breast Skin Dimpling": "Skin Dimpling",
    "Nipple Discharge": "Nipple Discharge",
    "Breast Pain": "Breast Pain",
    "Rib Cage Lump": "Rib Cage Lump",
    "Upper Right Abdominal Pain": "Abdominal Pain",
    Jaundice: "Jaundice",
    "Weight Loss": "Weight Loss",
    Fatigue: "Fatigue",
  };
  const labelFor = (full) =>
    isNarrow ? shortLabels[full] || full : full;

  const signs = symptomOptions.filter((d) => d.label !== "Any Symptom");
  const breastFields = new Set([
    "breast_lump_or_swelling_label_en",
    "breast_size_or_shape_change_label_en",
    "breast_dimpling_or_skin_thickening_label_en",
    "nipple_discharge_or_blood_label_en",
    "persistent_breast_or_nipple_pain_label_en",
  ]);
  // Order: breast signs first, then liver signs — gives two visually grouped halves.
  const ordered = [
    ...signs.filter((s) => breastFields.has(s.field)),
    ...signs.filter((s) => !breastFields.has(s.field)),
  ];
  const n = ordered.length;

  // Build symmetric co-occurrence matrix (diagonal = 0 so arcs reflect
  // co-occurrence with *other* signs, not self-prevalence).
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  surveyRows.forEach((row) => {
    const flags = ordered.map((s) => +(row[s.field] === "Yes"));
    for (let i = 0; i < n; i += 1) {
      if (!flags[i]) continue;
      for (let j = 0; j < n; j += 1) {
        if (i === j || !flags[j]) continue;
        matrix[i][j] += 1;
      }
    }
  });

  const breastColor = categoryColors.breast;
  const liverColor = categoryColors.liver;
  const sideColor = (i) => (i < 5 ? breastColor : liverColor);

  const chord = d3
    .chord()
    .padAngle(0.035)
    .sortSubgroups(d3.descending)
    .sortChords(d3.descending);
  const chords = chord(matrix);

  const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);
  const ribbon = d3.ribbon().radius(innerRadius - 1);

  const svg = d3
    .select(selector)
    .attr("viewBox", [-width / 2, -height / 2, width, height]);

  const tooltip = d3.select("body").select("#chord-tooltip").size()
    ? d3.select("#chord-tooltip")
    : d3.select("body").append("div").attr("id", "chord-tooltip");

  // Ribbons first so arcs sit on top.
  const ribbonG = svg
    .append("g")
    .attr("fill-opacity", 0.3);

  const isConnectedToGroup = (ribbonDatum, groupIndex) =>
    ribbonDatum.source.index === groupIndex ||
    ribbonDatum.target.index === groupIndex;

  let selectedGroupIndex = null;
  const setSpotlight = (groupIndex) => {
    if (groupIndex === null) {
      ribbonPaths
        .classed("is-spotlighted", false)
        .classed("is-muted", false)
        .attr("fill-opacity", null)
        .attr("stroke-opacity", 0.22);
      return;
    }

    ribbonPaths
      .classed("is-spotlighted", (r) => isConnectedToGroup(r, groupIndex))
      .classed("is-muted", (r) => !isConnectedToGroup(r, groupIndex))
      .attr("fill-opacity", (r) =>
        isConnectedToGroup(r, groupIndex) ? 0.78 : 0.06
      )
      .attr("stroke-opacity", (r) =>
        isConnectedToGroup(r, groupIndex) ? 0.55 : 0.08
      );
  };
  const setSelectedArc = (groupIndex) => {
    selectedGroupIndex = groupIndex;
    arcPaths
      .classed("is-selected", (d) => selectedGroupIndex === d.index)
      .attr("stroke-width", (d) => (selectedGroupIndex === d.index ? 2 : 0.5));
    setSpotlight(selectedGroupIndex);
  };

  const ribbonPaths = ribbonG
    .selectAll("path")
    .data(chords)
    .join("path")
    .attr("class", "chord-ribbon")
    .attr("d", ribbon)
    .attr("fill", (d) => sideColor(d.source.index))
    .attr("stroke", (d) =>
      d3.color(sideColor(d.source.index)).darker(0.6).toString()
    )
    .attr("stroke-opacity", 0.22)
    .attr("stroke-width", 0.6)
    .on("mousemove", (event, d) => {
      const a = ordered[d.source.index].label;
      const b = ordered[d.target.index].label;
      const count = matrix[d.source.index][d.target.index];
      tooltip
        .style("display", "block")
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY + 14}px`)
        .html(
          `<strong>${a} &amp; ${b}</strong><span>${count} respondents reported both</span>`
        );
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  svg.on("click", () => setSelectedArc(null));

  // Arcs.
  const arcPaths = svg
    .append("g")
    .selectAll("path")
    .data(chords.groups)
    .join("path")
    .attr("class", "chord-arc")
    .attr("d", arc)
    .attr("fill", (d) => sideColor(d.index))
    .attr("stroke", (d) =>
      d3.color(sideColor(d.index)).darker(0.6).toString()
    )
    .attr("stroke-width", 0.5)
    .on("mouseenter", (event, d) => {
      if (selectedGroupIndex === null) setSpotlight(d.index);
    })
    .on("mousemove", (event, d) => {
      const label = ordered[d.index].label;
      const total = d3.sum(matrix[d.index]);
      tooltip
        .style("display", "block")
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY + 14}px`)
        .html(
          `<strong>${label}</strong><span>${total} co-occurrences with other signs</span>`
        );
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      setSelectedArc(selectedGroupIndex === d.index ? null : d.index);
    })
    .on("mouseleave", () => {
      if (selectedGroupIndex === null) setSpotlight(null);
      tooltip.style("display", "none");
    });

  // Labels.
  svg
    .append("g")
    .attr("font-family", '"Plus Jakarta Sans", sans-serif')
    .attr("font-size", width < 520 ? 10.5 : 11.5)
    .attr("font-weight", 600)
    .selectAll("text")
    .data(chords.groups)
    .join("text")
    .attr("class", "chord-label")
    .each(function (d) {
      d.angle = (d.startAngle + d.endAngle) / 2;
    })
    .attr("transform", (d) => {
      const angleDeg = (d.angle * 180) / Math.PI - 90;
      const flip = d.angle > Math.PI;
      return `rotate(${angleDeg}) translate(${outerRadius + 8}) ${
        flip ? "rotate(180)" : ""
      }`;
    })
    .attr("text-anchor", (d) => (d.angle > Math.PI ? "end" : null))
    .attr("dy", "0.35em")
    .attr("fill", colors.chartInk)
    .text((d) => labelFor(ordered[d.index].label));
}

function drawLifestyleMatrix() {
  const selector = "#lifestyle-matrix";
  clearSvg(selector);
  const node = document.querySelector(selector);
  // Enforce a minimum chart width so cells stay readable; on narrow viewports
  // the figure container handles horizontal scrolling via .scrollable.
  const width = Math.max(540, node.getBoundingClientRect().width);
  const symptoms = symptomOptions.filter((d) => d.label !== "Any Symptom");
  const metrics = lifestyleOptions;
  const metricShort = {
    "Red meat meals/week": "Red meat",
    "Vegetable meals/week": "Vegetables",
    "Alcohol times/week": "Alcohol",
    "Exercise times/week": "Exercise",
    "Sleep hours/day": "Sleep",
    "Social support hours/week": "Social support",
    BMI: "BMI",
  };
  const shortLabel = (label) => metricShort[label] || label;

  const height = width < 620 ? 560 : 520;
  const margin = {
    top: 118,
    right: 24,
    bottom: 24,
    left: width < 620 ? 160 : 220,
  };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const cells = symptoms.flatMap((symptom) =>
    metrics.map((metric) => {
      const values = surveyRows
        .map((row) => ({ x: row[metric.field], y: symptomValue(row, symptom) }))
        .filter((d) => Number.isFinite(d.x));
      return {
        symptom: symptom.label,
        metric: shortLabel(metric.label),
        value:
          correlation(
            values.map((d) => d.x),
            values.map((d) => d.y)
          ) ?? 0,
      };
    })
  );

  const svg = d3.select(selector).attr("viewBox", [0, 0, width, height]);
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(metrics.map((d) => shortLabel(d.label)))
    .range([0, innerW])
    .padding(0.08);
  const y = d3
    .scaleBand()
    .domain(symptoms.map((d) => d.label))
    .range([0, innerH])
    .padding(0.08);
  const shade = d3
    .scaleLinear()
    .domain([-0.7, 0, 0.7])
    .range([colors.correlationNegative, "#f7f9fc", colors.correlationPositive]);

  g.selectAll(".matrix-cell")
    .data(cells)
    .join("rect")
    .attr("class", "matrix-cell")
    .attr("x", (d) => x(d.metric))
    .attr("y", (d) => y(d.symptom))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 2)
    .attr("fill", colors.surface)
    .attr("stroke", colors.line)
    .transition()
    .duration(600)
    .attr("fill", (d) => shade(d.value));

  g.selectAll(".matrix-label")
    .data(cells)
    .join("text")
    .attr("class", "matrix-label")
    .attr("x", (d) => x(d.metric) + x.bandwidth() / 2)
    .attr("y", (d) => y(d.symptom) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("font-size", width < 620 ? 11 : 12)
    .attr("font-weight", 600)
    .attr("fill", (d) =>
      Math.abs(d.value) > 0.42 ? colors.surface : colors.chartInk
    )
    .text((d) => d3.format("+.2f")(d.value));

  // Y-axis (warning signs)
  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickSize(0))
    .call((axis) => axis.select(".domain").remove());

  // X-axis (lifestyle measures) — rotated for legibility at all widths.
  const xAxis = g
    .append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0,-8)")
    .call(d3.axisTop(x).tickSize(0))
    .call((axis) => axis.select(".domain").remove());

  xAxis
    .selectAll("text")
    .attr("text-anchor", "start")
    .attr("dx", "0.4em")
    .attr("dy", "0.4em")
    .attr("transform", "rotate(-38)");

  g.selectAll(".axis text").attr("font-size", width < 620 ? 10 : 11.5);
}

function drawAgeReportingSankey() {
  const selector = "#age-sankey";
  clearSvg(selector);
  const node = document.querySelector(selector);
  const width = Math.max(560, node.getBoundingClientRect().width);
  const height = width < 720 ? 460 : 480;

  // Age groups: order by their lower bound, then "Unknown" / blank last.
  const ageGroups = Array.from(
    new Set(surveyRows.map((r) => (r.age_group || "").trim()).filter(Boolean))
  ).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return d3.ascending(a, b);
  });

  const categories = [
    { id: "both", label: "Reported both breast & liver" },
    { id: "liver", label: "Reported liver signs only" },
    { id: "breast", label: "Reported breast signs only" },
    { id: "none", label: "Reported no warning signs" },
  ];

  // Count respondents per (age group, category).
  const counts = new Map();
  surveyRows.forEach((row) => {
    const ag = (row.age_group || "").trim();
    if (!ag) return;
    const cat = symptomCategory(row);
    const key = `${ag}\t${cat}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const ageNodeId = (ag) => `age:${ag}`;
  const catNodeId = (id) => `cat:${id}`;

  const nodes = [
    ...ageGroups.map((ag) => ({
      id: ageNodeId(ag),
      label: ag,
      side: "age",
    })),
    ...categories.map((c) => ({
      id: catNodeId(c.id),
      label: c.label,
      catId: c.id,
      side: "category",
    })),
  ];

  const links = [];
  counts.forEach((value, key) => {
    const [ag, cat] = key.split("\t");
    links.push({
      source: ageNodeId(ag),
      target: catNodeId(cat),
      value,
      catId: cat,
    });
  });

  // Sort links so within each age node, "both" sits at the top, then liver,
  // breast, none — matches the dot-grid reading order.
  const catOrder = { both: 0, liver: 1, breast: 2, none: 3 };
  links.sort((a, b) => catOrder[a.catId] - catOrder[b.catId]);

  const margin = { top: 18, right: width < 720 ? 200 : 240, bottom: 18, left: 88 };

  const sankeyGen = d3
    .sankey()
    .nodeId((d) => d.id)
    .nodeAlign(d3.sankeyJustify)
    .nodeWidth(16)
    .nodePadding(width < 720 ? 14 : 18)
    .nodeSort((a, b) => {
      if (a.side === "age" && b.side === "age") {
        const na = parseInt(a.label, 10);
        const nb = parseInt(b.label, 10);
        return na - nb;
      }
      if (a.side === "category" && b.side === "category") {
        return catOrder[a.catId] - catOrder[b.catId];
      }
      return 0;
    })
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ]);

  const graph = sankeyGen({
    nodes: nodes.map((d) => ({ ...d })),
    links: links.map((d) => ({ ...d })),
  });

  const svg = d3.select(selector).attr("viewBox", [0, 0, width, height]);
  const tooltip = d3.select("#sankey-tooltip");

  // Links
  svg
    .append("g")
    .attr("fill", "none")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", (d) => categoryColors[d.catId])
    .attr("stroke-opacity", 0.5)
    .attr("stroke-width", (d) => Math.max(1.2, d.width))
    .on("mousemove", (event, d) => {
      const ag = d.source.label;
      const catLabel =
        categories.find((c) => c.id === d.catId)?.label || d.target.label;
      tooltip
        .style("display", "block")
        .style("left", `${event.clientX + 14}px`)
        .style("top", `${event.clientY + 14}px`)
        .html(
          `<strong>${ag} &rarr; ${catLabel}</strong><span>${d.value} respondents</span>`
        );
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  // Nodes (rectangles)
  svg
    .append("g")
    .selectAll("rect")
    .data(graph.nodes)
    .join("rect")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .attr("height", (d) => Math.max(2, d.y1 - d.y0))
    .attr("fill", (d) =>
      d.side === "category" ? categoryColors[d.catId] : colors.chartInk
    )
    .attr("opacity", 0.95);

  // Age labels (left side)
  svg
    .append("g")
    .attr("font-family", '"Plus Jakarta Sans", sans-serif')
    .attr("font-size", 12.5)
    .attr("font-weight", 700)
    .attr("fill", colors.chartInk)
    .selectAll("text")
    .data(graph.nodes.filter((d) => d.side === "age"))
    .join("text")
    .attr("x", (d) => d.x0 - 12)
    .attr("y", (d) => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .each(function (d) {
      const total = d3.sum(
        graph.links.filter((l) => l.source.id === d.id),
        (l) => l.value
      );
      const sel = d3.select(this);
      sel.text("");
      sel
        .append("tspan")
        .attr("x", d.x0 - 12)
        .attr("dy", "-0.1em")
        .text(d.label);
      sel
        .append("tspan")
        .attr("x", d.x0 - 12)
        .attr("dy", "1.2em")
        .attr("font-size", 10.5)
        .attr("font-weight", 500)
        .attr("fill", colors.muted)
        .text(`n = ${total}`);
    });

  // Category labels (right side)
  svg
    .append("g")
    .attr("font-family", '"Plus Jakarta Sans", sans-serif')
    .attr("font-size", 12.5)
    .attr("font-weight", 700)
    .selectAll("text")
    .data(graph.nodes.filter((d) => d.side === "category"))
    .join("text")
    .attr("x", (d) => d.x1 + 12)
    .attr("y", (d) => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "start")
    .attr("fill", (d) => categoryColors[d.catId])
    .each(function (d) {
      const total = d3.sum(
        graph.links.filter((l) => l.target.id === d.id),
        (l) => l.value
      );
      const sel = d3.select(this);
      sel.text("");
      sel
        .append("tspan")
        .attr("x", d.x1 + 12)
        .attr("dy", "-0.1em")
        .text(d.label);
      sel
        .append("tspan")
        .attr("x", d.x1 + 12)
        .attr("dy", "1.2em")
        .attr("font-size", 10.5)
        .attr("font-weight", 500)
        .attr("fill", colors.muted)
        .text(`n = ${total}`);
    });
}
