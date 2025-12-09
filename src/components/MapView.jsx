import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { getGenderAbbreviation } from "./pinUtils";
import {
  PIN_DIAMETER,
  PIN_RADIUS,
  CLUSTER_COLLISION_PADDING,
  HONEYCOMB_MAX,
  LARGE_CLUSTER_SAMPLE,
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

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;

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
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const onPinSelectRef = useRef(onPinSelect);
  const enableAddModeRef = useRef(enableAddMode);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
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
  const dataSignatureRef = useRef("");
  const animationFrameRef = useRef(null);
  const dataAnimationUntilRef = useRef(0);
  const activeTouchIdsRef = useRef(new Set());
  const cachedTouchEventsRef = useRef(new Map());
  const forwardingMultiTouchRef = useRef(false);
  const lastMobileCenterRef = useRef("");

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

      const container = map.getContainer();
      const bounds = {
        width: container?.clientWidth || 0,
        height: container?.clientHeight || 0,
      };
      if (bounds.width < 10 || bounds.height < 10) return;

      const projected = [];

      combinedPins.forEach((pin) => {
        if (typeof pin.lat !== "number" || typeof pin.lng !== "number") return;
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
            });
            cache.set(pin.__key, { dx: 0, dy: 0, idx: 0 });
            return;
          }

          const withAngles = clusterPins.map((pin) => ({
            pin,
            angle: Math.atan2(pin.y - centerY, pin.x - centerX),
            dist: (pin.x - centerX) ** 2 + (pin.y - centerY) ** 2,
          }));

          const usingPlus = clusterPins.length > HONEYCOMB_MAX;
          const visiblePinCount = usingPlus
            ? Math.min(LARGE_CLUSTER_SAMPLE, HONEYCOMB_MAX - 1, clusterPins.length)
            : clusterPins.length;
          const offsetPoolCount = Math.min(
            HONEYCOMB_MAX,
            Math.max(visiblePinCount + 8, Math.ceil(visiblePinCount * 1.35))
          );
          const desiredOffsetCount = Math.max(
            offsetPoolCount + (usingPlus ? 1 : 0),
            visiblePinCount + (usingPlus ? 1 : 0),
            visiblePinCount + 14
          );
          const offsets = generateHoneycombOffsets(desiredOffsetCount);
          const offsetsForPins = usingPlus ? offsets.slice(1) : offsets;

          if (usingPlus) {
            nodes.push({
              key: `${clusterKey}-plus`,
              x: centerX,
              y: centerY,
              isPlus: true,
              clusterSize: clusterPins.length,
              center: centerLngLat,
              labelText: `${clusterPins.length} pins`,
              category: "cluster",
              sortOrder: -1,
              clusterRoot: root,
            });
          }

          const clusterCache = new Map();
          const occupiedOffsets = new Set();
          const spacing = PIN_DIAMETER * 1.02 + CLUSTER_COLLISION_PADDING * 0.3;
          clusterPins.forEach((pin) => {
            const cached = cache.get(pin.__key);
            if (cached && cached.idx !== undefined && cached.idx >= 0) {
              clusterCache.set(pin.__key, cached);
              occupiedOffsets.add(cached.idx);
            }
          });

          let availableOffsets = offsetsForPins
            .map((off, idx) => ({
              ...off,
              idx,
              radius: Math.hypot(off.dx, off.dy),
              angle: Math.atan2(off.dy, off.dx),
              neighborCount: 0,
            }))
            .sort((a, b) => a.radius - b.radius || a.angle - b.angle);

          const offsetByIdx = new Map();
          availableOffsets.forEach((off) => offsetByIdx.set(off.idx, off));
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
            .sort((a, b) => a.angle - b.angle || (a.pin.__order ?? 0) - (b.pin.__order ?? 0))
            .slice(0, visiblePinCount);

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
          const desiredRadius = (usingPlus ? compactRadius * 0.92 : compactRadius * 0.74) || PIN_DIAMETER;
          const radiusHardCap = relaxedRadius + PIN_RADIUS * 0.6;
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
                !centerAvailable
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
              const centerBonus = !usingPlus && off.idx === 0 ? -1400 : 0;
              const centerGuard =
                off.idx === 0 && clusterPins.length > 1 && (!cached || cached.idx !== 0) ? 24000 : 0;
              const displacementPenalty =
                occupiedOffsets.has(off.idx) && (!cached || cached.idx !== off.idx) ? 12000 : 0;
              const neighborBonus = !occupiedOffsets.has(off.idx) ? -off.neighborCount * 520 : 0;
              const ownerPenalty = owner && owner !== entry.pin.__key ? 1.2e7 : 0;
              const lockedPenalty =
                owner && owner !== entry.pin.__key && off.neighborCount >= 6 ? 5e8 : 0;
              const cacheBonus =
                cached && cached.idx !== undefined && cached.idx === off.idx ? -25000 * cacheWeight : 0;
              const cachePenalty =
                cached && cached.idx !== undefined && cached.idx !== off.idx ? 5200 * cacheWeight : 0;
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
          const pinnedOffsets = new Map();
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
              if (occupiedNeighbors.length < 5) return null;
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
                if (off.neighborCount > 2) return null; // only move sparsely connected pins
                const cachedIdx = cache.get(key)?.idx;
                const prefer = cachedIdx !== nIdx; // prefer moving pins not anchored by cache
                return { nIdx, key, off, prefer };
              })
              .filter(Boolean)
              .filter(({ off }) => off.radius > hole.off.radius + PIN_RADIUS * 0.1); // only pull inward
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
              isPlus: false,
              labelText: pin.labelText,
              category: pin.__kind,
              sortOrder: pin.__order ?? 0,
              isSelected: pin.isSelected,
              clusterRoot: root,
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
    if (!mapContainerRef.current || mapRef.current || !styleUrl) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [0, 20],
      zoom: 2,
    });

    mapRef.current = map;

    map.on("load", async () => {
      map.addSource("pending-pin", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addSource("pending-radius", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "pending-radius-fill",
        type: "fill",
        source: "pending-radius",
        paint: {
          "fill-color": "#bfdbfe",
          "fill-opacity": 0.2,
        },
      });

      map.addLayer({
        id: "pending-radius-outline",
        type: "line",
        source: "pending-radius",
        paint: {
          "line-color": "#60a5fa",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });

      map.addLayer({
        id: "pending-pin-layer",
        type: "circle",
        source: "pending-pin",
        paint: {
          "circle-radius": 14,
          "circle-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#2563eb",
        },
      });

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

      await ensureEmojiImage(DEFAULT_EMOJI);
      await ensureEmojiImage(PENDING_REVIEW_EMOJI);
      setMapLoaded(true);
      scheduleLayout();
    });

    map.on("error", (evt) => {
      const message = evt?.error?.message || "Map could not load";
      setMapError(message);
    });

    map.on("movestart", () => {
      isMapMovingRef.current = true;
      setIsInteracting(true);
    });

    map.on("moveend", () => {
      isMapMovingRef.current = false;
      setIsInteracting(false);
      scheduleLayout();
    });

    map.on("zoomstart", () => {
      isMapMovingRef.current = true;
      setIsInteracting(true);
    });

    map.on("zoomend", () => {
      isMapMovingRef.current = false;
      setIsInteracting(false);
      scheduleLayout();
    });

    map.on("idle", () => {
      isMapMovingRef.current = false;
      setIsInteracting(false);
      scheduleLayout();
    });
    map.on("resize", scheduleLayout);

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

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [ensureEmojiImage]);

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
      activeTouchIdsRef.current.clear();
      cachedTouchEventsRef.current.clear();
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
    const selectedExists =
      selectedPinId !== null &&
      selectedPinId !== undefined &&
      (visualNodes.length ? visualNodes : lastGoodNodesRef.current).some((n) => n.pin?.id === selectedPinId);
    if (!selectedExists && lastGoodNodesRef.current.length > 0) {
      applyVisualNodes(
        lastGoodNodesRef.current.map((node) =>
          selectedPinId !== null && selectedPinId !== undefined && node.pin?.id === selectedPinId
            ? { ...node, isSelected: true }
            : node
        )
      );
    }
  }, [
    applyLabelNodes,
    applyVisualNodes,
    combinedPins.length,
    isInteracting,
    labelNodes.length,
    mapLoaded,
    selectedPinId,
    visualNodes.length,
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
    if (panelPlacement !== "bottom") {
      lastMobileCenterRef.current = "";
      return;
    }
    if (!mapLoaded) return;
    if (!selectedPinId) {
      lastMobileCenterRef.current = "";
      return;
    }
    if (isInteracting) return;
    const map = mapRef.current;
    if (!map) return;
    const padding = computeMobilePadding();
    if (!padding) return;

    const selectedPin = combinedPins.find((pin) => pin.id === selectedPinId);
    if (!selectedPin || typeof selectedPin.lng !== "number" || typeof selectedPin.lat !== "number") return;

    const signature = `${selectedPinId}:${padding.top}-${padding.bottom}-${padding.left}-${padding.right}:${map.getZoom()}`;
    if (lastMobileCenterRef.current === signature) return;
    lastMobileCenterRef.current = signature;

    map.easeTo({
      center: [selectedPin.lng, selectedPin.lat],
      zoom: map.getZoom(),
      padding,
      duration: 320,
      easing: easeInOut,
    });
  }, [
    combinedPins,
    computeMobilePadding,
    isInteracting,
    mapLoaded,
    panelPlacement,
    pinPanelBounds,
    selectedPinId,
    titleCardBounds,
  ]);

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

      const targetZoom = Math.min(map.getMaxZoom() || 20, CITY_OVERVIEW_ZOOM);

      if (node.isPlus) {
        centerThenZoom(map, [node.center.lng, node.center.lat], targetZoom, animationFrameRef);
        return;
      }

      const destination = node.pin
        ? [node.pin.lng, node.pin.lat]
        : node.center
          ? [node.center.lng, node.center.lat]
          : null;

      if (node.pin && onPinSelectRef.current) {
        onPinSelectRef.current(node.pin);
      }

      const mobilePadding = panelPlacement === "bottom" ? computeMobilePadding() : null;

      if (mobilePadding && destination) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        map.easeTo({
          center: destination,
          zoom: targetZoom,
          padding: mobilePadding,
          duration: smoothDuration(map.getZoom(), targetZoom),
          easing: easeInOut,
        });
        return;
      }

      if (destination) {
        centerThenZoom(map, destination, targetZoom, animationFrameRef);
      }
    },
    [computeMobilePadding, panelPlacement]
  );

  if (!styleUrl) {
    return (
      <div className="map-placeholder">
        <div>
          <h2>Map style missing</h2>
          <p style={{ marginTop: "0.5rem", maxWidth: 480 }}>
            Set <code>VITE_MAPTILER_STYLE_URL</code> in your <code>.env</code> file to
            load the basemap. You can copy a style URL from your MapTiler account.
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
          const baseScale = node.isPlus ? 1 : node.clusterSize > 1 ? 0.97 : 1;
          const opacity = 1;
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
          const baseOpacity = shouldAnimate && label.phase === "exit" ? 0 : 1;
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

const styleUrl = import.meta.env.VITE_MAPTILER_STYLE_URL;

export default MapView;
