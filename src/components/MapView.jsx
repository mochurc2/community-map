import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { getGenderAbbreviation } from "./pinUtils";
import { useTheme } from "../context";
import {
  PIN_DIAMETER,
  PIN_RADIUS,
  CLUSTER_COLLISION_PADDING,
  HONEYCOMB_MAX,
  LABEL_MAX_WIDTH,
  LABEL_LINE_HEIGHT,
  LABEL_HORIZONTAL_GAP,
  LABEL_PADDING_X,
  LABEL_PADDING_Y,
  LABEL_MARGIN,
  LABEL_VERTICAL_GAP,
  ANIMATION_TIMING,
  CLICK_TO_SPLIT_DELTA,
} from "../mapConstants";

const DEFAULT_EMOJI = "🙂";
const PENDING_REVIEW_EMOJI = "❗";
const CLUSTER_PLUS_EMOJI = "➕";
const FEET_TO_METERS = 0.3048;
const PENDING_RADIUS_FEET = 1500;
const EARTH_RADIUS_METERS = 6378137;
const CIRCLE_STEPS = 90;
const MAP_CLICK_TARGET_ZOOM = 15.5;
const CITY_OVERVIEW_ZOOM = 12.3;
const CLUSTER_EDGE_DROP_ALPHA = 0.3;
const DEFAULT_FALLBACK_CENTER = [12, 23];
const DEFAULT_FALLBACK_ZOOM = 3.3;
const GEOLOCATION_VIEW_ZOOM = 4.8;
const MIN_MAP_ZOOM = 2;
const MAX_MAP_ZOOM = 17;
const MAX_BASEMAP_SOURCE_ZOOM = 14;
const MAX_TILE_CACHE_ZOOM_LEVELS = 8;
const LAND_BOUNDS_COORDS = [
  [-178, -60],
  [178, 82],
];
const LAND_BOUNDS = new maplibregl.LngLatBounds(
  LAND_BOUNDS_COORDS[0],
  LAND_BOUNDS_COORDS[1]
);
const buildDefaultCameraState = () => ({
  center: [...DEFAULT_FALLBACK_CENTER],
  zoom: DEFAULT_FALLBACK_ZOOM,
  padding: null,
});
const GEOLOCATION_TIMEOUT_MS = 4500;
const GEOLOCATION_MAX_AGE_MS = 10 * 60 * 1000;
const easeOutHeavy = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
const smoothDuration = (currentZoom, targetZoom) => {
  const delta = Math.abs((targetZoom || 0) - (currentZoom || 0));
  const base = 450;
  const perStep = 180;
  return Math.min(1400, base + delta * perStep);
};
const centerThenZoom = (map, center, targetZoom, animationFrameRef) => {
  if (!map) return;
  if (animationFrameRef.current) {
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }

  const startCenter = map.getCenter();
  const startZoom = map.getZoom();
  const totalDuration = smoothDuration(startZoom, targetZoom);
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();

  const step = () => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const t = Math.min(1, (now - start) / totalDuration);
    const panT = Math.min(1, t / 0.35); // faster pan
    const zoomT = easeInOut(t);
    const panEase = easeOutHeavy(panT);

    const nextLng = startCenter.lng + (center[0] - startCenter.lng) * panEase;
    const nextLat = startCenter.lat + (center[1] - startCenter.lat) * panEase;
    const nextZoom = startZoom + (targetZoom - startZoom) * zoomT;

    map.jumpTo({ center: [nextLng, nextLat], zoom: nextZoom });

    if (t < 1) {
      animationFrameRef.current = requestAnimationFrame(step);
    } else {
      animationFrameRef.current = null;
      map.jumpTo({ center, zoom: targetZoom });
    }
  };

  animationFrameRef.current = requestAnimationFrame(step);
};
const LABEL_FONT_PRIMARY = '600 13px "Inter", "Segoe UI", system-ui, -apple-system, sans-serif';
const LABEL_FONT_SECONDARY = '12px "Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

const MAP_PALETTES = {
  light: {
    background: "#f6f4ef",
    earth: "#f1efea",
    land: "#ece9e2",
    urban: "#e8e4dd",
    farmland: "#e6eadb",
    scrub: "#dfe6d6",
    glacier: "#f7f7f5",
    beach: "#e9e3d5",
    park: "#cddbcf",
    parkDeep: "#c4d1c5",
    pier: "#dedad2",
    pedestrian: "#eae6df",
    runway: "#e5e3dd",
    airport: "#e5e3dd",
    industrial: "#d6dcdf",
    water: "#b6c8d9",
    waterLine: "#9fb5c8",
    building: "#d8d3c9",
    roadMain: "#fdfbf8",
    roadMinor: "#f3f0ea",
    roadCasing: "#d5cfc6",
    rail: "#a1a8b3",
    boundary: "#c6c0b5",
    boundaryBold: "#b8b1a3",
    labelPrimary: "#4b5563",
    labelSecondary: "#606776",
    labelHalo: "#f6f4ef",
    poi: "#4f6277",
    waterLabel: "#4f657a",
    overlayRadiusFill: "rgba(92, 115, 141, 0.18)",
    overlayRadiusStroke: "#74859d",
    overlayPendingStroke: "#4a5f82",
    pendingCircle: "#ffffff",
  },
  dark: {
    background: "#0d111c",
    earth: "#0f1624",
    land: "#111b2a",
    urban: "#0f1c2d",
    farmland: "#1a2531",
    scrub: "#1c2c35",
    glacier: "#1a2433",
    beach: "#1b2531",
    park: "#1b2f2f",
    parkDeep: "#18302e",
    pier: "#1a1f2b",
    pedestrian: "#172233",
    runway: "#1b2433",
    airport: "#1c2739",
    industrial: "#1d2738",
    water: "#1f3046",
    waterLine: "#2a4160",
    building: "#1d2735",
    roadMain: "#1c2435",
    roadMinor: "#141b29",
    roadCasing: "#2a3547",
    rail: "#334155",
    boundary: "#1f2a3d",
    boundaryBold: "#28354d",
    labelPrimary: "#cbd5e1",
    labelSecondary: "#9fb1c8",
    labelHalo: "#0d111c",
    poi: "#cbd5e1",
    waterLabel: "#9fb3cc",
    overlayRadiusFill: "rgba(124, 157, 255, 0.18)",
    overlayRadiusStroke: "#6e8ac7",
    overlayPendingStroke: "#7aa0ff",
    pendingCircle: "#161f2f",
  },
};

const applyMutedBasemapPalette = (style, palette = MAP_PALETTES.light) => {
  if (!style?.layers) return style;

  const layers = style.layers.map((layer) => {
    const next = { ...layer };
    if (layer.paint) {
      next.paint = { ...layer.paint };
    } else {
      delete next.paint;
    }
    if (layer.layout) {
      next.layout = { ...layer.layout };
    } else {
      delete next.layout;
    }
    return next;
  });

  const setPaint = (id, paintUpdates) => {
    const layer = layers.find((candidate) => candidate.id === id);
    if (!layer) return;
    layer.paint = { ...(layer.paint || {}), ...paintUpdates };
  };

  const setTextColors = (id, textColor, haloColor = palette.labelHalo) => {
    const layer = layers.find((candidate) => candidate.id === id);
    if (!layer) return;
    layer.paint = {
      ...(layer.paint || {}),
      ...(textColor ? { "text-color": textColor } : {}),
      ...(haloColor ? { "text-halo-color": haloColor } : {}),
    };
  };

  setPaint("background", { "background-color": palette.background });
  setPaint("earth", { "fill-color": palette.earth });

  const landcoverOpacity =
    layers.find((layer) => layer.id === "landcover")?.paint?.["fill-opacity"] ||
    ["interpolate", ["linear"], ["zoom"], 5, 1, 7, 0];
  setPaint("landcover", {
    "fill-color": [
      "match",
      ["get", "kind"],
      "grassland",
      palette.park,
      "barren",
      palette.beach,
      "urban_area",
      palette.urban,
      "farmland",
      palette.farmland,
      "glacier",
      palette.glacier,
      "scrub",
      palette.scrub,
      palette.land,
    ],
    "fill-opacity": landcoverOpacity,
  });

  setPaint("landuse_park", { "fill-color": palette.park });
  setPaint("landuse_urban_green", { "fill-color": palette.park });
  setPaint("landuse_hospital", { "fill-color": palette.urban });
  setPaint("landuse_industrial", { "fill-color": palette.industrial });
  setPaint("landuse_school", { "fill-color": palette.urban });
  setPaint("landuse_beach", { "fill-color": palette.beach });
  setPaint("landuse_zoo", { "fill-color": palette.parkDeep });
  setPaint("landuse_aerodrome", { "fill-color": palette.airport || palette.runway });
  setPaint("landuse_runway", { "fill-color": palette.airport || palette.runway });
  setPaint("landuse_pedestrian", { "fill-color": palette.pedestrian });
  setPaint("landuse_pier", { "fill-color": palette.pier });

  setPaint("water", { "fill-color": palette.water });
  setPaint("water_stream", { "line-color": palette.waterLine });
  setPaint("water_river", { "line-color": palette.waterLine });

  setPaint("roads_runway", { "line-color": palette.runway });
  setPaint("roads_taxiway", { "line-color": palette.runway });
  setPaint("roads_rail", { "line-color": palette.rail });

  layers.forEach((layer) => {
    if (!layer.id.startsWith("roads_") || layer.type !== "line") return;
    if (layer.id.includes("rail") || layer.id.includes("runway") || layer.id.includes("taxiway")) return;

    if (layer.id.includes("casing")) {
      layer.paint = { ...(layer.paint || {}), "line-color": palette.roadCasing };
      return;
    }

    const isMajor =
      layer.id.includes("highway") ||
      layer.id.includes("major") ||
      layer.id.includes("link") ||
      layer.id.includes("bridge");
    layer.paint = { ...(layer.paint || {}), "line-color": isMajor ? palette.roadMain : palette.roadMinor };
  });

  setPaint("buildings", { "fill-color": palette.building, "fill-opacity": 0.55 });

  setPaint("boundaries", { "line-color": palette.boundary });
  setPaint("boundaries_country", { "line-color": palette.boundaryBold });

  setTextColors("address_label", palette.labelSecondary);
  setTextColors("water_waterway_label", palette.waterLabel);
  setTextColors("places_subplace", palette.labelSecondary);
  setTextColors("places_region", palette.labelSecondary);
  setTextColors("places_locality", palette.labelPrimary);
  setTextColors("places_country", palette.labelSecondary);

  const hiddenLayers = new Set([
    "address_label",
    "water_waterway_label",
    "places_subplace",
    "places_region",
  ]);
  layers.forEach((layer) => {
    if (hiddenLayers.has(layer.id)) {
      layer.layout = { ...(layer.layout || {}), visibility: "none" };
    }
    if (layer.id === "places_locality") {
      layer.minzoom = 4.5;
      const nextLayout = { ...(layer.layout || {}), "icon-image": "" };
      // Remove any accidental minzoom from layout to avoid validation errors.
      if ("minzoom" in nextLayout) delete nextLayout.minzoom;
      layer.layout = nextLayout;
    }
  });

  // Strip most symbols except core place + road labels to keep the map calm.
  layers.forEach((layer) => {
    if (layer.type !== "symbol") return;
    const keep =
      layer.id === "places_locality" ||
      layer.id === "places_country" ||
      (typeof layer.id === "string" && layer.id.includes("road"));
    if (!keep) {
      layer.layout = { ...(layer.layout || {}), visibility: "none" };
    }
  });

  const nextStyle = { ...style, layers };
  if (style?.sources) {
    const nextSources = {};
    Object.entries(style.sources).forEach(([sourceId, source]) => {
      if (!source || typeof source !== "object") {
        nextSources[sourceId] = source;
        return;
      }
      if (source.type !== "vector") {
        nextSources[sourceId] = { ...source };
        return;
      }
      const existingMax = typeof source.maxzoom === "number" ? source.maxzoom : MAX_BASEMAP_SOURCE_ZOOM;
      nextSources[sourceId] = {
        ...source,
        maxzoom: Math.min(existingMax, MAX_BASEMAP_SOURCE_ZOOM),
      };
    });
    nextStyle.sources = nextSources;
  }
  return nextStyle;
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;
const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = (value) => clampValue(value, 0, 1);
const lngLatToUnitVector = ({ lng, lat }) => {
  const phi = toRadians(lat);
  const lambda = toRadians(lng);
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
};
const GLOBE_VISIBILITY_THRESHOLD = 0.12;
const visibilityAlphaOnGlobe = (centerVec, lng, lat, fadeDegrees = 8) => {
  if (!centerVec) return 1;
  const pointVec = lngLatToUnitVector({ lng, lat });
  const dot = centerVec[0] * pointVec[0] + centerVec[1] * pointVec[1] + centerVec[2] * pointVec[2];
  if (dot <= 0) return 0;
  const fadeStartDot = Math.cos(Math.PI / 2 - toRadians(fadeDegrees));
  if (fadeStartDot <= 0) return dot > 0 ? 1 : 0;
  return clamp01(dot / fadeStartDot);
};
const clampLngLatToBounds = (lng, lat, bounds = LAND_BOUNDS_COORDS) => ({
  lng: clampValue(lng, bounds?.[0]?.[0] ?? -180, bounds?.[1]?.[0] ?? 180),
  lat: clampValue(lat, bounds?.[0]?.[1] ?? -90, bounds?.[1]?.[1] ?? 90),
});

const normalizePadding = (padding) => {
  const source = padding || {};
  return {
    top: Number(source.top) || 0,
    bottom: Number(source.bottom) || 0,
    left: Number(source.left) || 0,
    right: Number(source.right) || 0,
  };
};

const paddingEquals = (a, b, epsilon = 0.25) => {
  const padA = normalizePadding(a);
  const padB = normalizePadding(b);
  return (
    Math.abs(padA.top - padB.top) <= epsilon &&
    Math.abs(padA.bottom - padB.bottom) <= epsilon &&
    Math.abs(padA.left - padB.left) <= epsilon &&
    Math.abs(padA.right - padB.right) <= epsilon
  );
};

const cameraMatches = (map, destination, zoom, padding) => {
  if (!map || !destination) return false;
  const currentCenter = map.getCenter();
  const currentZoom = map.getZoom();
  const currentPadding = map.getPadding ? map.getPadding() : null;
  const epsilonCenter = 1e-6;
  const epsilonZoom = 0.01;
  return (
    Math.abs(currentCenter.lng - destination[0]) <= epsilonCenter &&
    Math.abs(currentCenter.lat - destination[1]) <= epsilonCenter &&
    Math.abs(currentZoom - zoom) <= epsilonZoom &&
    paddingEquals(currentPadding, padding)
  );
};

const styleCache = new Map();

const buildCircleFeatureCollection = (center, radiusFeet) => {
  if (!center) return { type: "FeatureCollection", features: [] };

  const radiusMeters = radiusFeet * FEET_TO_METERS;
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const centerLat = toRadians(center.lat);
  const centerLng = toRadians(center.lng);

  const coordinates = [];
  for (let step = 0; step <= CIRCLE_STEPS; step += 1) {
    const bearing = (step / CIRCLE_STEPS) * 2 * Math.PI;
    const pointLat = Math.asin(
      Math.sin(centerLat) * Math.cos(angularDistance) +
        Math.cos(centerLat) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const pointLng =
      centerLng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLat),
        Math.cos(angularDistance) - Math.sin(centerLat) * Math.sin(pointLat)
      );

    coordinates.push([((toDegrees(pointLng) + 540) % 360) - 180, toDegrees(pointLat)]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
        properties: {},
      },
    ],
  };
};

const emojiId = (emoji) =>
  `emoji-icon-${Array.from(emoji || DEFAULT_EMOJI)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-")}`;

const renderEmojiImage = async (emoji) => {
  const size = 72;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${Math.round(size * 0.7)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  context.fillText(emoji || DEFAULT_EMOJI, size / 2, size / 2 + 1);

  return createImageBitmap(canvas);
};

class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = Array.from({ length: size }, () => 0);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return false;
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
    } else {
      this.parent[rootB] = rootA;
      this.rank[rootA] += 1;
    }
    return true;
  }
}

const axialDirections = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const generateHoneycombOffsets = (count) => {
  const offsets = [{ dx: 0, dy: 0 }];
  if (count === 1) return offsets;

  // Compact spacing to keep pins touching without overlap.
  const spacing = PIN_DIAMETER * 1.02 + CLUSTER_COLLISION_PADDING * 0.3;
  const a = spacing / Math.sqrt(3);
  let ring = 1;

  while (offsets.length < count) {
    let q = -ring;
    let r = ring;
    for (let side = 0; side < 6 && offsets.length < count; side += 1) {
      const [dq, dr] = axialDirections[side];
      for (let step = 0; step < ring && offsets.length < count; step += 1) {
        const dx = a * Math.sqrt(3) * (q + r / 2);
        const dy = a * 1.5 * r;
        offsets.push({ dx, dy });
        q += dq;
        r += dr;
      }
    }
    ring += 1;
  }

  return offsets.slice(0, count);
};

const boxesOverlap = (a, b) =>
  !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);

const buildClusterKey = (items) => {
  const ids = items.map((item) => item.__key).sort();
  return `${ids[0]}-${items.length}-${ids[ids.length - 1]}`;
};

// Simple Hungarian/Munkres for square cost matrix
const hungarian = (matrix) => {
  const n = matrix.length;
  const u = Array(n + 1).fill(0);
  const v = Array(n + 1).fill(0);
  const p = Array(n + 1).fill(0);
  const way = Array(n + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(n + 1).fill(Infinity);
    const used = Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const cur = matrix[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = Array(n).fill(-1);
  for (let j = 1; j <= n; j += 1) {
    if (p[j] > 0 && p[j] <= n) {
      assignment[p[j] - 1] = j - 1;
    }
  }
  return assignment;
};

const formatLabelText = (pin) => {
  if (pin.__kind === "pending") return "Pending";
  const nickname = pin.nickname?.toString().trim() || "Unknown";
  const base = nickname.length > 12 ? `${nickname.slice(0, 11)}…` : nickname;
  const gender = getGenderAbbreviation(pin.genders, pin.gender_identity);
  const age = pin.age ? `${pin.age}` : "";
  const detail = [age, gender].filter(Boolean).join(" · ");
  return detail ? `${base}\n${detail}` : base;
};

const findDensestPoint = (points, radius = PIN_DIAMETER * 2) => {
  if (!points || points.length === 0) return null;
  const radiusSq = radius * radius;
  let best = null;
  let bestScore = -Infinity;

  points.forEach((candidate) => {
    let score = 0;
    points.forEach((other) => {
      const dx = candidate.x - other.x;
      const dy = candidate.y - other.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radiusSq) {
        score += 1 - distSq / (radiusSq * 1.1);
      }
    });
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return best;
};

const measureLabel = (ctx, text) => {
  const lines = text.split("\n");
  let maxWidth = 0;
  let height = 0;
  lines.forEach((line, index) => {
    const isPrimary = index === 0;
    if (ctx) {
      ctx.font = isPrimary ? LABEL_FONT_PRIMARY : LABEL_FONT_SECONDARY;
      maxWidth = Math.max(maxWidth, Math.min(ctx.measureText(line).width, LABEL_MAX_WIDTH));
    } else {
      maxWidth = Math.max(maxWidth, Math.min(line.length * 7.2, LABEL_MAX_WIDTH));
    }
    height += LABEL_LINE_HEIGHT;
  });
  return {
    width: Math.min(maxWidth + LABEL_PADDING_X * 2, LABEL_MAX_WIDTH + LABEL_PADDING_X * 2),
    height: height + LABEL_PADDING_Y * 2,
  };
};

const buildLabelBoxes = (candidates, obstacles, ctx, bounds) => {
  const placed = [];
  const cellSize = 80;
  const grid = new Map();

  const addToGrid = (box) => {
    const startX = Math.floor(box.minX / cellSize);
    const endX = Math.floor(box.maxX / cellSize);
    const startY = Math.floor(box.minY / cellSize);
    const endY = Math.floor(box.maxY / cellSize);
    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        const key = `${gx}:${gy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(box);
      }
    }
  };

  obstacles.forEach(addToGrid);

  const sorted = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.key.localeCompare(b.key);
  });

  sorted.forEach((candidate) => {
    const { width, height } = measureLabel(ctx, candidate.text);
    const centerOffset = PIN_RADIUS * 0.35;
    const left =
      candidate.side === "left"
        ? candidate.x - centerOffset - LABEL_HORIZONTAL_GAP - width
        : candidate.x + centerOffset + LABEL_HORIZONTAL_GAP;
    const top = candidate.y - height / 2;
    const box = {
      key: candidate.key,
      minX: left - LABEL_MARGIN,
      maxX: left + width + LABEL_MARGIN,
      minY: top - LABEL_MARGIN,
      maxY: top + height + LABEL_MARGIN,
      width,
      height,
      text: candidate.text,
      lines: candidate.text.split("\n"),
      anchorX: left,
      anchorY: top,
      category: candidate.category,
      side: candidate.side,
      pinKey: candidate.pinKey,
      priority: candidate.priority,
    };

    if (box.maxX < 0 || box.minX > bounds.width || box.maxY < 0 || box.minY > bounds.height) {
      return;
    }

    const startX = Math.floor(box.minX / cellSize);
    const endX = Math.floor(box.maxX / cellSize);
    const startY = Math.floor(box.minY / cellSize);
    const endY = Math.floor(box.maxY / cellSize);

    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        const key = `${gx}:${gy}`;
        const bucket = grid.get(key);
        if (!bucket) continue;
        if (
          bucket.some(
            (boxB) =>
              boxB.pinKey !== candidate.pinKey &&
              boxesOverlap(box, boxB)
          )
        ) {
          return;
        }
      }
    }

    addToGrid(box);
    placed.push(box);
  });

  return placed;
};

function MapView({
  pins,
  pendingPins = [],
  onMapClick,
  onPinSelect,
  pendingLocation,
  pendingIcon,
  selectedPinId,
  enableAddMode = false,
  panelPlacement = "side",
  titleCardBounds = { top: 0, bottom: 0, height: 0 },
  pinPanelBounds = null,
  projection = "mercator",
  onMapReady = () => {},
}) {
  const { mode: themeMode } = useTheme();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const onPinSelectRef = useRef(onPinSelect);
  const enableAddModeRef = useRef(enableAddMode);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [resolvedStyle, setResolvedStyle] = useState(null);
  const [resolvedStyleKey, setResolvedStyleKey] = useState(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const loadedIconsRef = useRef(new Set());
  const loadingIconsRef = useRef(new Map());
  const [visualNodes, setVisualNodes] = useState([]);
  const [labelNodes, setLabelNodes] = useState([]);
  const measureContextRef = useRef(null);
  const scheduledLayoutRef = useRef(false);
  const isMapMovingRef = useRef(false);
  const lastGoodNodesRef = useRef([]);
  const lastGoodLabelsRef = useRef([]);
  const lastGoodCacheRef = useRef(new Map());
  const pinOffsetCacheRef = useRef(new Map());
  const mapPalette = useMemo(() => MAP_PALETTES[themeMode] || MAP_PALETTES.light, [themeMode]);
  const styleUrlMemo = useMemo(() => {
    const fallback = STYLE_URLS.light || STYLE_URLS.dark || null;
    if (themeMode === "dark") return STYLE_URLS.dark || fallback;
    return STYLE_URLS.light || STYLE_URLS.dark || null;
  }, [themeMode]);
  const projectionName = projection === "globe" ? "globe" : "mercator";
  const dataSignatureRef = useRef("");
  const animationFrameRef = useRef(null);
  const dataAnimationUntilRef = useRef(0);
  const activeTouchIdsRef = useRef(new Set());
  const cachedTouchEventsRef = useRef(new Map());
  const forwardingMultiTouchRef = useRef(false);
  const lastFocusedPinRef = useRef(null);
  const prevSelectedPinIdRef = useRef(null);
  const lastCameraRef = useRef(buildDefaultCameraState());
  const currentStyleKeyRef = useRef(null);
  const cameraEaseFrameRef = useRef(null);
  const geolocationAttemptedRef = useRef(false);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onPinSelectRef.current = onPinSelect;
  }, [onPinSelect]);

  useEffect(() => {
    enableAddModeRef.current = enableAddMode;
  }, [enableAddMode]);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    measureContextRef.current = canvas.getContext("2d");
  }, []);

  useEffect(() => {
    if (geolocationAttemptedRef.current) return undefined;
    geolocationAttemptedRef.current = true;

    if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.geolocation) {
      return undefined;
    }

    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const { lng, lat } = clampLngLatToBounds(
          Number(position.coords.longitude),
          Number(position.coords.latitude),
          LAND_BOUNDS_COORDS
        );
        const nextCamera = {
          center: [lng, lat],
          zoom: Math.min(GEOLOCATION_VIEW_ZOOM, MAX_MAP_ZOOM),
          padding: null,
        };
        lastCameraRef.current = nextCamera;
        const map = mapRef.current;
        if (map) {
          map.easeTo({
            center: nextCamera.center,
            zoom: nextCamera.zoom,
            duration: 900,
            essential: true,
          });
        }
      },
      (error) => {
        if (import.meta.env.DEV) {
          console.debug("[MapView] geolocation unavailable", error);
        }
      },
      {
        enableHighAccuracy: false,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
        timeout: GEOLOCATION_TIMEOUT_MS,
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const ensureEmojiImage = useCallback(async (emoji) => {
    const map = mapRef.current;
    if (!map) return null;

    const id = emojiId(emoji);
    if (loadedIconsRef.current.has(id) || map.hasImage(id)) {
      loadedIconsRef.current.add(id);
      return id;
    }

    if (loadingIconsRef.current.has(id)) {
      return loadingIconsRef.current.get(id);
    }

    const loadPromise = (async () => {
      const imageBitmap = await renderEmojiImage(emoji || DEFAULT_EMOJI);
      if (imageBitmap && mapRef.current && !mapRef.current.hasImage(id)) {
        mapRef.current.addImage(id, imageBitmap, { pixelRatio: 2 });
        loadedIconsRef.current.add(id);
      }
      return id;
    })();

    loadingIconsRef.current.set(id, loadPromise);

    try {
      return await loadPromise;
    } finally {
      loadingIconsRef.current.delete(id);
    }
  }, []);

  const installCustomLayers = useCallback(
    async (mapInstance) => {
      const map = mapInstance || mapRef.current;
      if (!map) return;

      if (!map.getSource("pending-pin")) {
        map.addSource("pending-pin", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      if (!map.getSource("pending-radius")) {
        map.addSource("pending-radius", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      if (!map.getLayer("pending-radius-fill")) {
        map.addLayer({
          id: "pending-radius-fill",
          type: "fill",
          source: "pending-radius",
          paint: {
            "fill-color": mapPalette.overlayRadiusFill,
            "fill-opacity": 1,
          },
        });
      } else {
        map.setPaintProperty("pending-radius-fill", "fill-color", mapPalette.overlayRadiusFill);
      }

      if (!map.getLayer("pending-radius-outline")) {
        map.addLayer({
          id: "pending-radius-outline",
          type: "line",
          source: "pending-radius",
          paint: {
            "line-color": mapPalette.overlayRadiusStroke,
            "line-width": 2,
            "line-dasharray": [2, 2],
          },
        });
      } else {
        map.setPaintProperty("pending-radius-outline", "line-color", mapPalette.overlayRadiusStroke);
      }

      if (!map.getLayer("pending-pin-layer")) {
        map.addLayer({
          id: "pending-pin-layer",
          type: "circle",
          source: "pending-pin",
          paint: {
            "circle-radius": 14,
            "circle-color": mapPalette.pendingCircle || "#ffffff",
            "circle-stroke-width": 3,
            "circle-stroke-color": mapPalette.overlayPendingStroke,
          },
        });
      } else {
        map.setPaintProperty("pending-pin-layer", "circle-stroke-color", mapPalette.overlayPendingStroke);
        map.setPaintProperty("pending-pin-layer", "circle-color", mapPalette.pendingCircle || "#ffffff");
      }

      if (!map.getLayer("pending-pin-emoji")) {
        map.addLayer({
          id: "pending-pin-emoji",
          type: "symbol",
          source: "pending-pin",
          layout: {
            "icon-image": ["coalesce", ["get", "iconImageId"], emojiId(DEFAULT_EMOJI)],
            "icon-size": 0.55,
            "icon-allow-overlap": true,
          },
          paint: {
            "icon-halo-color": "#ffffff",
            "icon-halo-width": 1,
          },
        });
      }

      await ensureEmojiImage(DEFAULT_EMOJI);
      await ensureEmojiImage(PENDING_REVIEW_EMOJI);
    },
    [ensureEmojiImage, mapPalette]
  );

  const combinedPins = useMemo(() => {
    const approved = (pins || []).map((pin, index) => ({
      ...pin,
      __kind: "approved",
      __order: index,
      __key: `approved-${pin.id ?? index}`,
    }));

    const pending = (pendingPins || []).map((pin, index) => ({
      ...pin,
      __kind: "pending",
      icon: PENDING_REVIEW_EMOJI,
      nickname: pin.nickname || "Pending",
      __order: index,
      __key: `pending-${pin.id ?? `${pin.lat}-${pin.lng}-${index}`}`,
    }));

    return [...approved, ...pending];
  }, [pins, pendingPins]);

  const requestCameraEase = useCallback(
    ({ center, zoom, padding, duration, easing, force = false }) => {
      const map = mapRef.current;
      if (!map || !center || typeof zoom !== "number") return;
      const normalizedPadding = normalizePadding(padding);
      if (!force && cameraMatches(map, center, zoom, normalizedPadding)) {
        lastCameraRef.current = { center, zoom, padding: normalizedPadding };
        return;
      }
      if (cameraEaseFrameRef.current) {
        cancelAnimationFrame(cameraEaseFrameRef.current);
        cameraEaseFrameRef.current = null;
      }
      cameraEaseFrameRef.current = requestAnimationFrame(() => {
        cameraEaseFrameRef.current = null;
        map.easeTo({
          center,
          zoom,
          duration,
          easing,
          ...(normalizedPadding ? { padding: normalizedPadding } : {}),
        });
        lastCameraRef.current = { center, zoom, padding: normalizedPadding };
      });
    },
    []
  );

  const applyVisualNodes = useCallback((nextNodes) => {
    setVisualNodes(nextNodes.map((node) => ({ ...node, phase: "active" })));
  }, []);

  const applyLabelNodes = useCallback((nextLabels) => {
    setLabelNodes(nextLabels.map((label) => ({ ...label, phase: "active" })));
  }, []);


  const computeLayout = useCallback(() => {
    try {
      const map = mapRef.current;
      if (!map) return;
      const ctx = measureContextRef.current;
      const projectionInfo = map.getProjection?.();
      const projectionType =
        typeof projectionInfo === "string"
          ? projectionInfo
          : projectionInfo?.type || projectionInfo?.name;
      const isGlobeProjection = projectionType === "globe";
      const mapCenter = map.getCenter();
      const centerVec =
        isGlobeProjection && mapCenter
          ? lngLatToUnitVector({ lng: mapCenter.lng, lat: mapCenter.lat })
          : null;
      const zoom = map.getZoom?.() ?? 0;
      const packingScale = zoom <= 4 ? 0.9 : zoom <= 5.5 ? 0.94 : 1;

      const container = map.getContainer();
      const bounds = {
        width: container?.clientWidth || 0,
        height: container?.clientHeight || 0,
      };
      if (bounds.width < 10 || bounds.height < 10) return;

      const projected = [];

      combinedPins.forEach((pin) => {
        if (typeof pin.lat !== "number" || typeof pin.lng !== "number") return;
        const visibilityAlpha =
          isGlobeProjection && centerVec
            ? visibilityAlphaOnGlobe(centerVec, pin.lng, pin.lat, 18)
            : 1;
        if (isGlobeProjection && (visibilityAlpha <= GLOBE_VISIBILITY_THRESHOLD || visibilityAlpha < CLUSTER_EDGE_DROP_ALPHA)) return;
        const { x, y } = map.project([pin.lng, pin.lat]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const labelText = formatLabelText(pin);
        projected.push({
          ...pin,
          __idx: projected.length,
          x,
          y,
          labelText,
          isSelected: selectedPinId !== null && selectedPinId !== undefined && pin.id === selectedPinId,
          visibilityAlpha,
        });
      });

      if (projected.length === 0) {
        if (combinedPins.length === 0) {
          applyVisualNodes([]);
          applyLabelNodes([]);
          lastGoodNodesRef.current = [];
          lastGoodLabelsRef.current = [];
        }
        return;
      }

      const cellSize = PIN_DIAMETER + CLUSTER_COLLISION_PADDING;
      const grid = new Map();
      projected.forEach((pin, index) => {
        const gx = Math.floor(pin.x / cellSize);
        const gy = Math.floor(pin.y / cellSize);
        const key = `${gx}:${gy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(index);
      });

      const uf = new UnionFind(projected.length);

      projected.forEach((pin, index) => {
        const gx = Math.floor(pin.x / cellSize);
        const gy = Math.floor(pin.y / cellSize);
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            const bucket = grid.get(`${gx + dx}:${gy + dy}`);
            if (!bucket) continue;
            bucket.forEach((other) => {
              if (other === index) return;
              const neighbor = projected[other];
              const distSq = (pin.x - neighbor.x) ** 2 + (pin.y - neighbor.y) ** 2;
              const collideDist = PIN_DIAMETER + CLUSTER_COLLISION_PADDING;
              if (distSq <= collideDist * collideDist) {
                uf.union(index, other);
              }
            });
          }
        }
      });

      const buildClusters = () => {
        const clustersMap = new Map();
        projected.forEach((pin, index) => {
          const root = uf.find(index);
          if (!clustersMap.has(root)) clustersMap.set(root, []);
          clustersMap.get(root).push(pin);
        });
        return Array.from(clustersMap.entries()).map(([root, pins]) => ({ root, pins }));
      };

      const nodes = [];
      const maxIterations = 8;
      let iteration = 0;
      while (iteration < maxIterations) {
        const clusters = buildClusters();
        nodes.length = 0;

        clusters.forEach(({ root, pins: clusterPins }) => {
          const centerX = clusterPins.reduce((sum, pin) => sum + pin.x, 0) / clusterPins.length;
          const centerY = clusterPins.reduce((sum, pin) => sum + pin.y, 0) / clusterPins.length;
          const centerLngLat = map.unproject([centerX, centerY]);
          const clusterKey = buildClusterKey(clusterPins);
          const clusterAlpha = clusterPins.reduce(
            (max, pin) => Math.max(max, pin.visibilityAlpha ?? 1),
            0
          );

          const cache = pinOffsetCacheRef.current;

          if (clusterPins.length === 1) {
            const pin = clusterPins[0];
            nodes.push({
              key: pin.__key,
              x: pin.x,
              y: pin.y,
              pin,
              icon: pin.icon || DEFAULT_EMOJI,
              clusterSize: 1,
              center: centerLngLat,
              isPlus: false,
              labelText: pin.labelText,
              category: pin.__kind,
              sortOrder: pin.__order ?? 0,
              isSelected: pin.isSelected,
              clusterRoot: root,
              visibilityAlpha: clusterAlpha,
            });
            cache.set(pin.__key, { dx: 0, dy: 0, idx: 0 });
            return;
          }

          const withAngles = clusterPins.map((pin) => ({
            pin,
            angle: Math.atan2(pin.y - centerY, pin.x - centerX),
            dist: (pin.x - centerX) ** 2 + (pin.y - centerY) ** 2,
          }));

          const bounds = clusterPins.reduce(
            (acc, pin) => ({
              minX: Math.min(acc.minX, pin.x),
              maxX: Math.max(acc.maxX, pin.x),
              minY: Math.min(acc.minY, pin.y),
              maxY: Math.max(acc.maxY, pin.y),
            }),
            { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
          );
          const clusterSpan = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
          const densePin = findDensestPoint(clusterPins, PIN_DIAMETER * 2.6);
          const denseCenter = densePin ? map.unproject([densePin.x, densePin.y]) : centerLngLat;

          const usingPlus = clusterPins.length > HONEYCOMB_MAX;
          const maxVisiblePins = usingPlus ? HONEYCOMB_MAX : clusterPins.length;
          const visiblePinCount = Math.max(
            1,
            Math.min(clusterPins.length - (usingPlus ? 1 : 0), maxVisiblePins)
          );
          const offsetPadding = usingPlus ? 1 : 0;
          const slack = usingPlus ? 3 : 2;
          const desiredOffsetCount = Math.max(
            visiblePinCount + offsetPadding + slack,
            Math.ceil((visiblePinCount + offsetPadding) * 1.12)
          );
          const offsetsWithIdx = generateHoneycombOffsets(desiredOffsetCount).map((off, idx) => ({
            ...off,
            idx,
          }));
          const offsetsForPins = usingPlus ? offsetsWithIdx.slice(1) : offsetsWithIdx;

          if (usingPlus) {
            nodes.push({
              key: `${clusterKey}-plus`,
              x: centerX,
              y: centerY,
              isPlus: true,
              clusterSize: clusterPins.length,
              center: centerLngLat,
              focusCenter: denseCenter,
              clusterSpan,
              labelText: `${clusterPins.length} pins`,
              category: "cluster",
              sortOrder: -1,
              clusterRoot: root,
              visibilityAlpha: clusterAlpha,
            });
          }

          const clusterCache = new Map();
          const spacing = (PIN_DIAMETER * 1.02 + CLUSTER_COLLISION_PADDING * 0.3) * packingScale;
          clusterPins.forEach((pin) => {
            const cached = cache.get(pin.__key);
            if (cached && cached.idx !== undefined && cached.idx >= 0) {
              clusterCache.set(pin.__key, cached);
            }
          });

          let availableOffsets = offsetsForPins
            .map((off) => ({
              ...off,
              radius: Math.hypot(off.dx, off.dy),
              angle: Math.atan2(off.dy, off.dx),
              neighborCount: 0,
            }))
            .sort((a, b) => a.radius - b.radius || a.angle - b.angle);

          if (availableOffsets.length > visiblePinCount + 6) {
            availableOffsets = availableOffsets.slice(0, visiblePinCount + 6);
          }

          const offsetByIdx = new Map();
          availableOffsets.forEach((off) => offsetByIdx.set(off.idx, off));
          const occupiedOffsets = new Set(
            clusterPins
              .map((pin) => clusterCache.get(pin.__key)?.idx)
              .filter((idx) => idx !== undefined && idx >= 0 && offsetByIdx.has(idx))
          );
          const adjacency = availableOffsets.map((off) =>
            availableOffsets
              .filter((other) => other.idx !== off.idx && Math.hypot(off.dx - other.dx, off.dy - other.dy) <= spacing * 1.05)
              .map((other) => other.idx)
          );

          availableOffsets = availableOffsets.map((off, i, arr) => {
            const neighbors = arr.reduce((count, other) => {
              if (other.idx === off.idx) return count;
              const dist = Math.hypot(off.dx - other.dx, off.dy - other.dy);
              return dist <= spacing * 1.05 ? count + 1 : count;
            }, 0);
            return { ...off, neighborCount: neighbors };
          });

          const visiblePins = [...withAngles]
            .sort((a, b) => a.dist - b.dist || (a.pin.__order ?? 0) - (b.pin.__order ?? 0))
            .slice(0, visiblePinCount)
            .sort((a, b) => a.angle - b.angle || (a.pin.__order ?? 0) - (b.pin.__order ?? 0));

          const pinCount = visiblePins.length;

          const maxExistingIdx = availableOffsets.reduce((m, off) => Math.max(m, off.idx), -1);
          if (availableOffsets.length < pinCount) {
            const target = Math.max(pinCount + 12, availableOffsets.length + 12);
            const expanded = generateHoneycombOffsets(target + (usingPlus ? 1 : 0));
            const expandedForPins = usingPlus ? expanded.slice(1) : expanded;
            const extras = expandedForPins
              .slice(availableOffsets.length)
              .map((off, i) => ({
                dx: off.dx,
                dy: off.dy,
                idx: maxExistingIdx + 1 + i,
                radius: Math.hypot(off.dx, off.dy),
                angle: Math.atan2(off.dy, off.dx),
              }));
            availableOffsets = [...availableOffsets, ...extras].sort(
              (a, b) => a.radius - b.radius || a.angle - b.angle
            );
          }

          const compactRadius =
            availableOffsets[Math.min(pinCount, availableOffsets.length) - 1]?.radius || PIN_DIAMETER;
          const relaxedRadius =
            availableOffsets[Math.min(pinCount + 3, availableOffsets.length) - 1]?.radius || compactRadius;
          const radiusTightening = packingScale;
          const desiredRadius = compactRadius * 0.74 * radiusTightening || PIN_DIAMETER;
          const radiusHardCap = (relaxedRadius + PIN_RADIUS * 0.6) * radiusTightening;
          const preferredMaxIdx = Math.max(
            0,
            Math.min(availableOffsets.length - 1, pinCount + 3)
          );
          const cachedOwnerByIdx = new Map();
          clusterPins.forEach((pin) => {
            const cached = cache.get(pin.__key);
            if (cached && cached.idx !== undefined && cached.idx >= 0) {
              cachedOwnerByIdx.set(cached.idx, pin.__key);
            }
          });
          const dim = Math.max(pinCount, availableOffsets.length);
          const pinnedOffsets = new Map();

          const costMatrix = Array.from({ length: dim }, () => Array(dim).fill(1e6));
          visiblePins.forEach((entry, i) => {
            const cached = cache.get(entry.pin.__key);
            const cacheWeight = clusterPins.length <= 6 ? 0.35 : 1;
            const desiredDx = Math.cos(entry.angle) * desiredRadius;
            const desiredDy = Math.sin(entry.angle) * desiredRadius;
            availableOffsets.forEach((off, j) => {
              const owner = cachedOwnerByIdx.get(off.idx);
              const isOwner = owner && owner === entry.pin.__key;
              const centerAvailable = !owner && !occupiedOffsets.has(off.idx);
              if (
                off.idx === 0 &&
                clusterPins.length > 1 &&
                !isOwner &&
                !centerAvailable &&
                usingPlus
              ) {
                costMatrix[i][j] = 1e12;
                return;
              }
              const angleDiff = Math.abs(off.angle - entry.angle);
              const wrapped = Math.min(angleDiff, Math.abs(angleDiff - Math.PI * 2));
              const distCost = (off.dx - desiredDx) ** 2 + (off.dy - desiredDy) ** 2;
              const angleCost = off.radius < PIN_RADIUS * 0.9 ? 0 : wrapped * wrapped * 220;
              const radiusBias =
                off.radius <= compactRadius ? 0 : (off.radius - compactRadius) ** 2 * 0.85;
              const overflowPenalty =
                off.radius > radiusHardCap ? (off.radius - radiusHardCap) ** 2 * 3.4 : 0;
              const slotPenalty = off.idx > preferredMaxIdx ? (off.idx - preferredMaxIdx) * 2600 : 0;
              const centerBonus =
                !usingPlus && off.idx === 0
                  ? (clusterPins.length <= 7 ? -16000 : -2200)
                  : 0;
              const centerGuard = 0;
              const displacementPenalty =
                occupiedOffsets.has(off.idx) && (!cached || cached.idx !== off.idx) ? 6000 : 0;
              const neighborBonus = !occupiedOffsets.has(off.idx) ? -off.neighborCount * 420 : 0;
              const ownerPenalty = owner && owner !== entry.pin.__key ? 1.2e7 : 0;
              const lockedPenalty =
                owner && owner !== entry.pin.__key && off.neighborCount >= 6 ? 5e8 : 0;
              const cacheBonus =
                cached && cached.idx !== undefined && cached.idx === off.idx ? -42000 * cacheWeight : 0;
              const cachePenalty =
                cached && cached.idx !== undefined && cached.idx !== off.idx ? 4800 * cacheWeight : 0;
              costMatrix[i][j] =
                distCost +
                angleCost +
                radiusBias +
                overflowPenalty +
                slotPenalty +
                cacheBonus +
                cachePenalty +
                centerBonus +
                centerGuard +
                displacementPenalty +
                neighborBonus +
                ownerPenalty +
                lockedPenalty;
            });
          });

          while (costMatrix.length < dim) costMatrix.push(Array(dim).fill(1e6));
          const assignment = pinCount > 0 ? hungarian(costMatrix).slice(0, pinCount) : [];
          assignment.forEach((offsetIdx, pinIdx) => {
            const pin = visiblePins[pinIdx].pin;
            const off = availableOffsets[offsetIdx] || { dx: 0, dy: 0, idx: -1 };
            pinnedOffsets.set(pin.__key, off);
          });

          // Resolve inner "holes": empty slots with dense neighbors pull in the farthest neighbor occupant.
          const occupancy = new Map();
          pinnedOffsets.forEach((off, pinKey) => {
            if (!off || off.idx === undefined || off.idx < 0) return;
            occupancy.set(off.idx, pinKey);
          });
          // Gentle hole fix: single move from a sparsely connected outer pin into the densest hole.
          const holes = availableOffsets
            .map((off, idx) => {
              if (occupancy.has(off.idx)) return null;
              const neighIdxs = adjacency[idx] || [];
              const occupiedNeighbors = neighIdxs.filter((nIdx) => occupancy.has(nIdx));
              if (occupiedNeighbors.length < 4) return null;
              return { off, neighbors: occupiedNeighbors };
            })
            .filter(Boolean)
            .sort((a, b) => a.off.radius - b.off.radius);
          if (holes.length > 0) {
            const hole = holes[0];
            const candidates = hole.neighbors
              .map((nIdx) => {
                const key = occupancy.get(nIdx);
                const off = offsetByIdx.get(nIdx);
                if (!key || !off) return null;
                if (off.neighborCount > 3) return null; // only move sparsely connected pins
                const cachedIdx = cache.get(key)?.idx;
                const prefer = cachedIdx !== nIdx; // prefer moving pins not anchored by cache
                return { nIdx, key, off, prefer };
              })
              .filter(Boolean)
              .filter(({ off }) => off.radius > hole.off.radius + PIN_RADIUS * 0.05); // only pull inward
            if (candidates.length > 0) {
              candidates.sort((a, b) => {
                if (a.prefer !== b.prefer) return a.prefer ? -1 : 1;
                return b.off.radius - a.off.radius || a.key.localeCompare(b.key);
              });
              const best = candidates[0];
              pinnedOffsets.set(best.key, hole.off);
              occupancy.delete(best.nIdx);
              occupancy.set(hole.off.idx, best.key);
            }
          }

          // Ensure the inner-most positions are always filled so no visible gaps remain.
          const mustFillOffsets = availableOffsets
            .filter((off) => off.idx !== 0 || !usingPlus)
            .slice(0, visiblePinCount);
          mustFillOffsets.forEach((off) => {
            if (occupancy.has(off.idx)) return;
            let candidateKey = null;
            let candidateOff = null;
            pinnedOffsets.forEach((assignedOff, pinKey) => {
              if (!assignedOff || assignedOff.idx === off.idx) return;
              if (assignedOff.radius <= off.radius + PIN_RADIUS * 0.05) return;
              if (!candidateOff || assignedOff.radius > candidateOff.radius) {
                candidateKey = pinKey;
                candidateOff = assignedOff;
              }
            });
            if (candidateKey && candidateOff) {
              pinnedOffsets.set(candidateKey, off);
              occupancy.delete(candidateOff.idx);
              occupancy.set(off.idx, candidateKey);
            }
          });

          visiblePins.forEach(({ pin }) => {
            const offset = pinnedOffsets.get(pin.__key) || { dx: 0, dy: 0, idx: -1 };
            nodes.push({
              key: pin.__key,
              x: centerX + offset.dx,
              y: centerY + offset.dy,
              pin,
              icon: pin.icon || DEFAULT_EMOJI,
              clusterSize: clusterPins.length,
              center: centerLngLat,
              focusCenter: denseCenter,
              clusterSpan,
              isPlus: false,
              labelText: pin.labelText,
              category: pin.__kind,
              sortOrder: pin.__order ?? 0,
              isSelected: pin.isSelected,
              clusterRoot: root,
              visibilityAlpha: pin.visibilityAlpha ?? clusterAlpha,
            });
            cache.set(pin.__key, { dx: offset.dx, dy: offset.dy, idx: offset.idx });
          });
        });

        const nodeGrid = new Map();
        nodes.forEach((node, idx) => {
          const gx = Math.floor(node.x / cellSize);
          const gy = Math.floor(node.y / cellSize);
          const key = `${gx}:${gy}`;
          if (!nodeGrid.has(key)) nodeGrid.set(key, []);
          nodeGrid.get(key).push(idx);
        });

        let merged = false;
        nodes.forEach((node, idx) => {
          const gx = Math.floor(node.x / cellSize);
          const gy = Math.floor(node.y / cellSize);
          for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
              const bucket = nodeGrid.get(`${gx + dx}:${gy + dy}`);
              if (!bucket) continue;
              bucket.forEach((otherIdx) => {
                if (otherIdx === idx) return;
                const other = nodes[otherIdx];
                if (other.clusterRoot === node.clusterRoot) return;
                const distSq = (node.x - other.x) ** 2 + (node.y - other.y) ** 2;
                const collideDist = PIN_DIAMETER + CLUSTER_COLLISION_PADDING;
                if (distSq <= collideDist * collideDist) {
                  const repA = projected.findIndex((p) => uf.find(p.__idx) === node.clusterRoot);
                  const repB = projected.findIndex((p) => uf.find(p.__idx) === other.clusterRoot);
                  if (repA >= 0 && repB >= 0) {
                    merged = uf.union(repA, repB) || merged;
                  }
                }
              });
            }
          }
        });

        if (!merged) break;
        iteration += 1;
      }

      if (nodes.length === 0) {
        const cached = lastGoodCacheRef.current.get(dataSignatureRef.current);
        if (cached) {
          applyVisualNodes(cached.nodes);
          applyLabelNodes(cached.labels);
        }
        return;
      }

      applyVisualNodes(nodes);

      const iconBoxes = nodes.map((node) => ({
        minX: node.x - PIN_RADIUS - 2,
        maxX: node.x + PIN_RADIUS + 2,
        minY: node.y - PIN_RADIUS - 2,
        maxY: node.y + PIN_RADIUS + 2,
        pinKey: node.key,
      }));

      const labelCandidates = nodes
        .filter((node) => Boolean(node.labelText) && !node.isPlus && node.clusterSize <= 1)
        .flatMap((node) => {
          const basePriority =
            (node.clusterSize > 1 ? node.clusterSize * 10 : 0) + (node.sortOrder ?? 0);
          return [
            {
              key: `label-${node.key}-right`,
              text: node.labelText,
              x: node.x,
              y: node.y,
              category: node.category,
              priority: basePriority,
              side: "right",
              pinKey: node.key,
              visibilityAlpha: node.visibilityAlpha ?? 1,
            },
            {
              key: `label-${node.key}-left`,
              text: node.labelText,
              x: node.x,
              y: node.y,
              category: node.category,
              priority: basePriority + 1,
              side: "left",
              pinKey: node.key,
              visibilityAlpha: node.visibilityAlpha ?? 1,
            },
          ];
        });

      const placedLabels = buildLabelBoxes(labelCandidates, iconBoxes, ctx, bounds);
      const deduped = [];
      const perPin = new Map();
      placedLabels.forEach((label) => {
        const existing = perPin.get(label.pinKey);
        if (!existing || label.priority < existing.priority) {
          perPin.set(label.pinKey, label);
        }
      });
      perPin.forEach((label) => deduped.push(label));

      lastGoodNodesRef.current = nodes;
      lastGoodLabelsRef.current = deduped;
      lastGoodCacheRef.current.set(dataSignatureRef.current, { nodes, labels: deduped });
      applyLabelNodes(
        deduped.map((label) => ({
          ...label,
          key: `label-${label.pinKey}`,
        }))
      );
    } catch (error) {
      console.error("layout error", error);
      const cached = lastGoodCacheRef.current.get(dataSignatureRef.current);
      if (cached) {
        applyVisualNodes(cached.nodes);
        applyLabelNodes(cached.labels);
      }
    }
  }, [applyLabelNodes, applyVisualNodes, combinedPins, selectedPinId]);


  const scheduleLayout = useCallback(() => {
    if (scheduledLayoutRef.current) return;
    scheduledLayoutRef.current = true;
    requestAnimationFrame(() => {
      scheduledLayoutRef.current = false;
      computeLayout();
    });
  }, [computeLayout]);

  const scheduleLayoutRef = useRef(scheduleLayout);
  const runLayout = useCallback(() => scheduleLayoutRef.current?.(), []);

  useEffect(() => {
    scheduleLayoutRef.current = scheduleLayout;
  }, [scheduleLayout]);

  useEffect(() => {
    const map = mapRef.current;
    const canvas = map?.getCanvas?.();
    if (!canvas) return undefined;
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = enableAddMode ? "crosshair" : "";
    return () => {
      canvas.style.cursor = previousCursor;
    };
  }, [enableAddMode]);

  useEffect(() => {
    let cancelled = false;

    const loadStyle = async () => {
    if (!styleUrlMemo) {
      setResolvedStyle(null);
      setResolvedStyleKey(null);
      return;
    }
    try {
      setMapError(null);
      const cacheKey = `${styleUrlMemo}|${themeMode}`;
      const cached = cacheKey ? styleCache.get(cacheKey) : null;
      const stylePromise = cached || (async () => {
        const response = await fetch(styleUrlMemo, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Style request failed: ${response.status}`);
        const baseStyle = await response.json();
        const styleClone = JSON.parse(JSON.stringify(baseStyle));
        return applyMutedBasemapPalette(styleClone, mapPalette);
      })();
      if (!cached && cacheKey) styleCache.set(cacheKey, stylePromise);
      const styled = await stylePromise;
      if (!cancelled) {
        setResolvedStyle(styled);
        setResolvedStyleKey(cacheKey || null);
      }
    } catch (error) {
      console.error("map style load error", error);
      if (!cancelled) {
        setResolvedStyle(null);
        setResolvedStyleKey(null);
        setMapError("Map style failed to load");
      }
    }
  };

    loadStyle();

    return () => {
      cancelled = true;
    };
  }, [mapPalette, styleUrlMemo, themeMode]);

  // Initialize the map once; keep dependencies minimal so the instance persists.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !resolvedStyle) return;

    if (import.meta.env.DEV) {
      console.debug("[MapView] initializing MapLibre map once");
    }

    const initialCamera = lastCameraRef.current || buildDefaultCameraState();
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: resolvedStyle,
      center: initialCamera.center || [...DEFAULT_FALLBACK_CENTER],
      zoom:
        typeof initialCamera.zoom === "number" ? initialCamera.zoom : DEFAULT_FALLBACK_ZOOM,
      padding: initialCamera.padding || undefined,
      minZoom: MIN_MAP_ZOOM,
      maxZoom: MAX_MAP_ZOOM,
      fadeDuration: 0,
      maxTileCacheSize: 2048,
      maxTileCacheZoomLevels: MAX_TILE_CACHE_ZOOM_LEVELS,
      reuseMaps: true,
      renderWorldCopies: false,
      projection: { type: projectionName, name: projectionName },
    });

    map.setMaxBounds(LAND_BOUNDS);

    mapRef.current = map;
    onMapReady(map);

    map.on("load", async () => {
      await installCustomLayers(map);
      currentStyleKeyRef.current = styleUrlMemo ? `${styleUrlMemo}|${themeMode}` : "inline";
      setMapLoaded(true);
      runLayout();
    });

    map.on("error", (evt) => {
      const message = evt?.error?.message || "Map could not load";
      setMapError(message);
    });

    map.on("movestart", () => {
      isMapMovingRef.current = true;
      setIsInteracting(true);
    });

    const recordCamera = () => {
      const center = map.getCenter();
      const padding = map.getPadding && map.getPadding();
      lastCameraRef.current = {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        padding: padding || null,
      };
    };

    map.on("moveend", () => {
      isMapMovingRef.current = false;
      setIsInteracting(false);
      recordCamera();
      runLayout();
    });

    map.on("zoomstart", () => {
      isMapMovingRef.current = true;
      setIsInteracting(true);
    });

    map.on("zoomend", () => {
      isMapMovingRef.current = false;
      setIsInteracting(false);
      recordCamera();
      runLayout();
    });

    map.on("idle", () => {
      isMapMovingRef.current = false;
      setIsInteracting(false);
      recordCamera();
      runLayout();
    });
    map.on("resize", runLayout);

    map.on("click", (e) => {
      if (!enableAddModeRef.current) return;
      const zoomTarget = map.getZoom();
      map.flyTo({
        center: [e.lngLat.lng, e.lngLat.lat],
        zoom: zoomTarget >= MAP_CLICK_TARGET_ZOOM ? zoomTarget : MAP_CLICK_TARGET_ZOOM,
      });

      if (onMapClickRef.current) {
        onMapClickRef.current(e.lngLat);
      }
    });
  }, [resolvedStyle, ensureEmojiImage, installCustomLayers, projectionName, runLayout, styleUrlMemo, themeMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !resolvedStyle) return;
    const targetKey = styleUrlMemo ? `${styleUrlMemo}|${themeMode}` : null;
    if (!targetKey || resolvedStyleKey !== targetKey) return;
    if (currentStyleKeyRef.current === targetKey) return;

    setMapLoaded(false);

    const handleStyleData = () => {
      installCustomLayers(map).then(() => {
        currentStyleKeyRef.current = targetKey;
        setMapLoaded(true);
        scheduleLayoutRef.current?.();
      });
    };

    map.once("styledata", handleStyleData);
    const nextStyle = JSON.parse(JSON.stringify(resolvedStyle));
    map.setStyle(nextStyle, { diff: false });

    return () => {
      map.off("styledata", handleStyleData);
    };
  }, [installCustomLayers, resolvedStyle, resolvedStyleKey, styleUrlMemo, themeMode]);

  useEffect(() => () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (cameraEaseFrameRef.current) {
      cancelAnimationFrame(cameraEaseFrameRef.current);
      cameraEaseFrameRef.current = null;
    }
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    onMapReady(null);
    setMapLoaded(false);
  }, [onMapReady]);

  useEffect(() => {
    const signature = `${combinedPins.length}:${combinedPins
      .map((p) => p.__key)
      .sort()
      .join("|")}`;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (signature !== dataSignatureRef.current) {
      dataAnimationUntilRef.current = now + 650;
    }
    dataSignatureRef.current = signature;
    scheduledLayoutRef.current = false;
    computeLayout();
  }, [combinedPins, computeLayout]);

  useEffect(() => {
    scheduledLayoutRef.current = false;
    computeLayout();
  }, [computeLayout, selectedPinId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleMove = () => scheduleLayout();
    const handleZoom = () => scheduleLayout();
    map.on("move", handleMove);
    map.on("zoom", handleZoom);
    return () => {
      map.off("move", handleMove);
      map.off("zoom", handleZoom);
    };
  }, [scheduleLayout]);

  useEffect(() => {
    // Forward multi-touch gestures from pin overlay buttons to the map canvas so pinch-zoom works on clusters.
    const overlayEl = overlayRef.current;
    const map = mapRef.current;
    const canvas = map?.getCanvas?.();
    const activeTouchIds = activeTouchIdsRef.current;
    const cachedTouchEvents = cachedTouchEventsRef.current;
    if (!overlayEl || !map || !canvas) return undefined;
    if (typeof PointerEvent === "undefined") return undefined;

    const forwardPointerEvent = (sourceEvent, typeOverride) => {
      const eventType = typeOverride || sourceEvent.type;
      const clone = new PointerEvent(eventType, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: sourceEvent.pointerId,
        pointerType: sourceEvent.pointerType,
        clientX: sourceEvent.clientX,
        clientY: sourceEvent.clientY,
        screenX: sourceEvent.screenX,
        screenY: sourceEvent.screenY,
        buttons: sourceEvent.buttons,
        ctrlKey: sourceEvent.ctrlKey,
        shiftKey: sourceEvent.shiftKey,
        altKey: sourceEvent.altKey,
        metaKey: sourceEvent.metaKey,
        width: sourceEvent.width,
        height: sourceEvent.height,
        pressure: sourceEvent.pressure,
        tangentialPressure: sourceEvent.tangentialPressure || 0,
        tiltX: sourceEvent.tiltX || 0,
        tiltY: sourceEvent.tiltY || 0,
        twist: sourceEvent.twist || 0,
        isPrimary: sourceEvent.isPrimary,
      });
      canvas.dispatchEvent(clone);
    };

    const handlePointerDown = (event) => {
      if (event.pointerType !== "touch") return;
      activeTouchIdsRef.current.add(event.pointerId);
      cachedTouchEventsRef.current.set(event.pointerId, event);
      if (forwardingMultiTouchRef.current || activeTouchIdsRef.current.size >= 2) {
        forwardingMultiTouchRef.current = true;
        event.preventDefault();
        if (activeTouchIdsRef.current.size === 2 && cachedTouchEventsRef.current.size >= 2) {
          cachedTouchEventsRef.current.forEach((cachedEvent) => {
            forwardPointerEvent(cachedEvent, "pointerdown");
          });
        } else {
          forwardPointerEvent(event, "pointerdown");
        }
      }
    };

    const handlePointerMove = (event) => {
      if (event.pointerType !== "touch") return;
      if (!forwardingMultiTouchRef.current) return;
      cachedTouchEventsRef.current.set(event.pointerId, event);
      event.preventDefault();
      forwardPointerEvent(event, "pointermove");
    };

    const handlePointerEnd = (event) => {
      if (event.pointerType !== "touch") return;
      if (forwardingMultiTouchRef.current) {
        event.preventDefault();
        forwardPointerEvent(event, event.type);
      }
      activeTouchIdsRef.current.delete(event.pointerId);
      cachedTouchEventsRef.current.delete(event.pointerId);
      if (activeTouchIdsRef.current.size < 2) {
        forwardingMultiTouchRef.current = false;
      }
    };

    const listenerOptions = { passive: false };
    overlayEl.addEventListener("pointerdown", handlePointerDown, listenerOptions);
    overlayEl.addEventListener("pointermove", handlePointerMove, listenerOptions);
    overlayEl.addEventListener("pointerup", handlePointerEnd, listenerOptions);
    overlayEl.addEventListener("pointercancel", handlePointerEnd, listenerOptions);

    const cloneTouches = (touchList) => {
      if (!touchList || typeof Touch === "undefined") return [];
      return Array.from(touchList).map(
        (touch) =>
          new Touch({
            identifier: touch.identifier,
            target: canvas,
            clientX: touch.clientX,
            clientY: touch.clientY,
            screenX: touch.screenX,
            screenY: touch.screenY,
            pageX: touch.pageX,
            pageY: touch.pageY,
            radiusX: touch.radiusX,
            radiusY: touch.radiusY,
            rotationAngle: touch.rotationAngle,
            force: touch.force,
          })
      );
    };

    const forwardTouchEvent = (type, sourceEvent) => {
      if (typeof TouchEvent === "undefined") return;
      const touches = cloneTouches(sourceEvent.touches);
      const changedTouches = cloneTouches(sourceEvent.changedTouches);
      const eventInit = {
        touches,
        targetTouches: touches,
        changedTouches,
        ctrlKey: sourceEvent.ctrlKey,
        shiftKey: sourceEvent.shiftKey,
        altKey: sourceEvent.altKey,
        metaKey: sourceEvent.metaKey,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      const cloned = new TouchEvent(type, eventInit);
      canvas.dispatchEvent(cloned);
    };

    const handleTouchStart = (event) => {
      if (event.touches.length < 2) return;
      forwardingMultiTouchRef.current = true;
      event.preventDefault();
      forwardTouchEvent("touchstart", event);
    };

    const handleTouchMove = (event) => {
      if (!forwardingMultiTouchRef.current) return;
      event.preventDefault();
      forwardTouchEvent("touchmove", event);
    };

    const handleTouchEnd = (event) => {
      if (!forwardingMultiTouchRef.current) return;
      event.preventDefault();
      forwardTouchEvent("touchend", event);
      if (event.touches.length === 0 || event.changedTouches.length >= 1) {
        forwardingMultiTouchRef.current = false;
      }
    };

    const handleWheel = (event) => {
      if (!canvas) return;
      event.preventDefault();
      const wheel = new WheelEvent("wheel", {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      canvas.dispatchEvent(wheel);
    };

    overlayEl.addEventListener("touchstart", handleTouchStart, listenerOptions);
    overlayEl.addEventListener("touchmove", handleTouchMove, listenerOptions);
    overlayEl.addEventListener("touchend", handleTouchEnd, listenerOptions);
    overlayEl.addEventListener("touchcancel", handleTouchEnd, listenerOptions);
    overlayEl.addEventListener("wheel", handleWheel, listenerOptions);

    return () => {
      overlayEl.removeEventListener("pointerdown", handlePointerDown, listenerOptions);
      overlayEl.removeEventListener("pointermove", handlePointerMove, listenerOptions);
      overlayEl.removeEventListener("pointerup", handlePointerEnd, listenerOptions);
      overlayEl.removeEventListener("pointercancel", handlePointerEnd, listenerOptions);
      overlayEl.removeEventListener("touchstart", handleTouchStart, listenerOptions);
      overlayEl.removeEventListener("touchmove", handleTouchMove, listenerOptions);
      overlayEl.removeEventListener("touchend", handleTouchEnd, listenerOptions);
      overlayEl.removeEventListener("touchcancel", handleTouchEnd, listenerOptions);
      overlayEl.removeEventListener("wheel", handleWheel, listenerOptions);
      forwardingMultiTouchRef.current = false;
      activeTouchIds.clear();
      cachedTouchEvents.clear();
    };
  }, [mapLoaded]);

  useEffect(() => {
    if (isInteracting) return;
    scheduleLayout();
  }, [isInteracting, scheduleLayout]);

  useEffect(() => {
    if (isInteracting) return;
    if (!mapLoaded) return;
    if (combinedPins.length === 0) return;
    if (visualNodes.length === 0 && lastGoodNodesRef.current.length > 0) {
      applyVisualNodes(lastGoodNodesRef.current);
    }
    if (labelNodes.length === 0 && lastGoodLabelsRef.current.length > 0) {
      applyLabelNodes(lastGoodLabelsRef.current);
    }
    if (selectedPinId !== null && selectedPinId !== undefined) {
      const selectedExists =
        (visualNodes.length ? visualNodes : lastGoodNodesRef.current).some((n) => n.pin?.id === selectedPinId);
      if (!selectedExists && lastGoodNodesRef.current.length > 0) {
        applyVisualNodes(
          lastGoodNodesRef.current.map((node) =>
            node.pin?.id === selectedPinId ? { ...node, isSelected: true } : node
          )
        );
      }
    }
  }, [
    applyLabelNodes,
    applyVisualNodes,
    combinedPins,
    isInteracting,
    labelNodes,
    mapLoaded,
    selectedPinId,
    visualNodes,
  ]);

  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current;
    if (!map || !map.getSource("pending-pin") || !map.getSource("pending-radius")) return;

    let cancelled = false;

    const updatePendingPin = async () => {
      const pendingSource = map.getSource("pending-pin");
      const radiusSource = map.getSource("pending-radius");
      if (!pendingSource || !radiusSource) return;

      if (!pendingLocation) {
        const empty = { type: "FeatureCollection", features: [] };
        pendingSource.setData(empty);
        radiusSource.setData(empty);
        return;
      }

      const iconToUse = pendingIcon || DEFAULT_EMOJI;
      await ensureEmojiImage(iconToUse);
      if (cancelled) return;

      const circleFeature = buildCircleFeatureCollection(pendingLocation, PENDING_RADIUS_FEET);

      radiusSource.setData(circleFeature);
      pendingSource.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [pendingLocation.lng, pendingLocation.lat],
            },
            properties: {
              iconImageId: emojiId(iconToUse),
            },
          },
        ],
      });
    };

    updatePendingPin();

    return () => {
      cancelled = true;
    };
  }, [pendingLocation, pendingIcon, mapLoaded, ensureEmojiImage]);

  const computeMobilePadding = useCallback(() => {
    if (panelPlacement !== "bottom") return null;
    const map = mapRef.current;
    const containerHeight =
      map?.getContainer?.()?.clientHeight ||
      (typeof window !== "undefined"
        ? window.visualViewport?.height || window.innerHeight || 0
        : 0);

    const topPadding = Math.max(0, titleCardBounds?.bottom || 0);
    const pinPanelTop = pinPanelBounds?.top;
    const bottomPadding =
      typeof pinPanelTop === "number" ? Math.max(0, containerHeight - pinPanelTop) : 0;

    return {
      top: topPadding,
      bottom: bottomPadding,
      left: 12,
      right: 12,
    };
  }, [panelPlacement, pinPanelBounds, titleCardBounds]);

  useEffect(() => {
    if (!mapLoaded) return;
    if (selectedPinId === null || selectedPinId === undefined) return;
    if (prevSelectedPinIdRef.current === selectedPinId) return;
    if (lastFocusedPinRef.current === selectedPinId) return; // click already handled centering
    prevSelectedPinIdRef.current = selectedPinId;
    const map = mapRef.current;
    if (!map) return;
    const selectedPin = combinedPins.find((pin) => pin.id === selectedPinId);
    if (!selectedPin || typeof selectedPin.lng !== "number" || typeof selectedPin.lat !== "number") return;

    const destination = [selectedPin.lng, selectedPin.lat];
    const mobilePadding = panelPlacement === "bottom" ? computeMobilePadding() : null;
    const targetZoom = Math.min(map.getMaxZoom() || 20, CITY_OVERVIEW_ZOOM);

    requestCameraEase({
      center: destination,
      zoom: targetZoom,
      padding: mobilePadding || undefined,
      duration: smoothDuration(map.getZoom(), targetZoom),
      easing: easeInOut,
    });
  }, [combinedPins, computeMobilePadding, mapLoaded, panelPlacement, requestCameraEase, selectedPinId]);

  useEffect(() => {
    if (selectedPinId === null || selectedPinId === undefined) {
      prevSelectedPinIdRef.current = null;
      lastFocusedPinRef.current = null;
    }
  }, [selectedPinId]);

  const computeClusterZoomTarget = useCallback((map, node) => {
    const container = map.getContainer();
    const viewportSpan = Math.max(container?.clientWidth || 0, container?.clientHeight || 0);
    const clusterSpan = node.clusterSpan || 0;
    const focusCenter = node.focusCenter || node.center;
    const effectiveSpan = clusterSpan > 0 ? clusterSpan : PIN_DIAMETER * 2.5;
    const desiredSpan =
      viewportSpan > 0 ? Math.max(effectiveSpan * 0.9, viewportSpan * 0.32) : effectiveSpan;
    const zoomDelta =
      viewportSpan > 0 && desiredSpan > 0
        ? Math.log2(Math.max(viewportSpan, 1) / Math.max(desiredSpan, 1))
        : 1.2;
    const clampedDelta = Math.max(0.8, Math.min(zoomDelta, 2.6));
    const targetZoom = Math.min(map.getMaxZoom() || 20, map.getZoom() + clampedDelta);
    return { targetZoom, focusCenter };
  }, []);

  const handleNodeClick = useCallback(
    (event, node) => {
      event.stopPropagation();
      event.preventDefault();
      const map = mapRef.current;
      if (!map) return;

      if (node.category === "pending") {
        if (node.pin && onPinSelectRef.current) {
          onPinSelectRef.current(node.pin);
        }
        return;
      }

      if (node.isPlus) {
        const { focusCenter, targetZoom } = computeClusterZoomTarget(map, node);
        centerThenZoom(
          map,
          [focusCenter.lng, focusCenter.lat],
          targetZoom,
          animationFrameRef
        );
        return;
      }

      if (node.pin && onPinSelectRef.current) {
        onPinSelectRef.current(node.pin);
      }
      if (node.pin?.id !== undefined && node.pin?.id !== null) {
        lastFocusedPinRef.current = node.pin.id;
      }

      if (node.clusterSize > 3 && node.focusCenter) {
        const { focusCenter, targetZoom } = computeClusterZoomTarget(map, node);
        centerThenZoom(
          map,
          [focusCenter.lng, focusCenter.lat],
          targetZoom,
          animationFrameRef
        );
        return;
      }

      const destination = node.pin
        ? [Number(node.pin.lng), Number(node.pin.lat)]
        : node.center
          ? [Number(node.center.lng), Number(node.center.lat)]
          : null;

      const mobilePadding = panelPlacement === "bottom" ? computeMobilePadding() : null;
      const currentZoom = map.getZoom();
      const targetZoomForClick = Math.min(map.getMaxZoom() || 20, CITY_OVERVIEW_ZOOM);

      if (destination) {
        const normalizedPadding = mobilePadding ? normalizePadding(mobilePadding) : null;
        requestCameraEase({
          center: destination,
          zoom: targetZoomForClick,
          padding: normalizedPadding || undefined,
          duration: smoothDuration(currentZoom, targetZoomForClick),
          easing: easeInOut,
          force: true,
        });
      }
    },
    [computeMobilePadding, panelPlacement, requestCameraEase]
  );

  if (!styleUrlMemo) {
    return (
      <div className="map-placeholder">
        <div>
          <h2>Map style missing</h2>
          <p style={{ marginTop: "0.5rem", maxWidth: 480 }}>
            Set <code>VITE_PROTOMAPS_KEY</code> (or <code>VITE_PROTOMAPS_STYLE_URL</code>)
            in your <code>.env</code> file to load the hosted Protomaps basemap.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrapper">
      {!mapLoaded && !mapError && <div className="map-banner">Loading map tiles…</div>}
      {mapError && (
        <div className="map-banner error">
          <span>{mapError}</span>
          <span style={{ fontWeight: 500 }}>Check your style URL or network.</span>
        </div>
      )}
      <div ref={mapContainerRef} className="map-container" />
      <div className="pin-overlay" ref={overlayRef}>
        {(visualNodes.length
          ? visualNodes
          : lastGoodCacheRef.current.get(dataSignatureRef.current)?.nodes || [])
          .map((node) =>
            selectedPinId !== null && selectedPinId !== undefined && node.pin?.id === selectedPinId
              ? { ...node, isSelected: true }
              : node
          )
          .map((node) => {
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          const shouldAnimate = !isInteracting && now < dataAnimationUntilRef.current;
          const emoji = node.isPlus ? CLUSTER_PLUS_EMOJI : node.category === "pending" ? PENDING_REVIEW_EMOJI : node.icon || DEFAULT_EMOJI;
          const transitionSpeed = shouldAnimate ? Math.round(ANIMATION_TIMING.move * 1.25) : 0;
          const baseScale = node.clusterSize > 1 ? 0.97 : 1;
          const opacity = node.visibilityAlpha ?? 1;
          const style = {
            transform: `translate(${node.x - PIN_RADIUS}px, ${node.y - PIN_RADIUS}px) scale(${baseScale})`,
            opacity,
            transition: shouldAnimate
              ? `transform ${transitionSpeed}ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity ${ANIMATION_TIMING.filter}ms ease`
              : "transform 0ms linear, opacity 0ms linear",
          };
          const className = [
            "pin-node",
            node.isPlus ? "plus" : "",
            node.category === "pending" ? "pending" : "",
            node.isSelected ? "selected" : "",
            node.clusterSize > 1 ? "cluster-member" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={node.key}
              type="button"
              className={className}
              style={style}
              onClick={(event) => handleNodeClick(event, node)}
              aria-label={node.isPlus ? `${node.clusterSize} pins` : node.labelText || "Map pin"}
            >
              <span className="pin-circle">
                <span className="pin-emoji" aria-hidden>
                  {emoji}
                </span>
              </span>
            </button>
          );
        })}

        {(labelNodes.length
          ? labelNodes
          : lastGoodCacheRef.current.get(dataSignatureRef.current)?.labels || []).map((label) => {
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          const shouldAnimate = !isInteracting && now < dataAnimationUntilRef.current;
          const transitionSpeed = shouldAnimate ? Math.round(ANIMATION_TIMING.label * 1.1) : 0;
          const alpha = label.visibilityAlpha ?? 1;
          const baseOpacity = alpha * (shouldAnimate && label.phase === "exit" ? 0 : 1);
          const style = {
            left: `${label.anchorX}px`,
            top: `${label.anchorY}px`,
            width: `${label.width}px`,
            height: `${label.height}px`,
            opacity: baseOpacity,
            transition: shouldAnimate ? `opacity ${transitionSpeed}ms ease` : "opacity 0ms linear",
            textAlign: label.side === "left" ? "right" : "left",
          };
          const className = [
            "pin-label",
            label.category === "pending" ? "pending" : "",
            label.side === "left" ? "left" : "right",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={label.key} className={className} style={style} aria-hidden>
              <span className="pin-label-line primary">{label.lines[0]}</span>
              {label.lines[1] && <span className="pin-label-line secondary">{label.lines[1]}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const protomapsKey = import.meta.env.VITE_PROTOMAPS_KEY || import.meta.env.VITE_PROTOMAPS_API_KEY;
const STYLE_URLS = {
  light:
    import.meta.env.VITE_PROTOMAPS_STYLE_URL ||
    (protomapsKey ? `https://api.protomaps.com/styles/v5/light/en.json?key=${protomapsKey}` : null),
  dark:
    import.meta.env.VITE_PROTOMAPS_DARK_STYLE_URL ||
    (protomapsKey ? `https://api.protomaps.com/styles/v5/dark/en.json?key=${protomapsKey}` : null),
};

export default MapView;
