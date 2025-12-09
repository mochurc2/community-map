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
  ANIMATION_TIMING,
  CLICK_TO_SPLIT_DELTA,
} from "./mapConstants";

const DEFAULT_EMOJI = "🙂";
const PENDING_REVIEW_EMOJI = "❗";
const FEET_TO_METERS = 0.3048;
const PENDING_RADIUS_FEET = 1500;
const EARTH_RADIUS_METERS = 6378137;
const CIRCLE_STEPS = 90;
const MAP_CLICK_TARGET_ZOOM = 15.5;
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
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
    } else {
      this.parent[rootB] = rootA;
      this.rank[rootA] += 1;
    }
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

  const spacing = PIN_DIAMETER * 1.05;
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
    const left = candidate.x + LABEL_HORIZONTAL_GAP;
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
        if (bucket.some((boxB) => boxesOverlap(box, boxB))) {
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
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const onPinSelectRef = useRef(onPinSelect);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const loadedIconsRef = useRef(new Set());
  const loadingIconsRef = useRef(new Map());
  const [visualNodes, setVisualNodes] = useState([]);
  const [labelNodes, setLabelNodes] = useState([]);
  const measureContextRef = useRef(null);
  const scheduledLayoutRef = useRef(false);
  const isMapMovingRef = useRef(false);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onPinSelectRef.current = onPinSelect;
  }, [onPinSelect]);

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
    setVisualNodes((prev) => {
      const prevMap = new Map(prev.map((node) => [node.key, node]));
      const merged = nextNodes.map((node) => {
        const previous = prevMap.get(node.key);
        prevMap.delete(node.key);
        return previous
          ? { ...previous, ...node, phase: "active" }
          : { ...node, phase: "enter" };
      });

      prevMap.forEach((node) => {
        merged.push({ ...node, phase: "exit" });
      });

      return merged;
    });
  }, []);

  const applyLabelNodes = useCallback((nextLabels) => {
    setLabelNodes((prev) => {
      const prevMap = new Map(prev.map((label) => [label.key, label]));
      const merged = nextLabels.map((label) => {
        const previous = prevMap.get(label.key);
        prevMap.delete(label.key);
        return previous ? { ...previous, ...label, phase: "active" } : { ...label, phase: "enter" };
      });

      prevMap.forEach((label) => merged.push({ ...label, phase: "exit" }));
      return merged;
    });
  }, []);

  const computeLayout = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const ctx = measureContextRef.current;

    const container = map.getContainer();
    const bounds = {
      width: container.clientWidth,
      height: container.clientHeight,
    };

    const padding = PIN_DIAMETER * 2;
    const projected = [];

    combinedPins.forEach((pin) => {
      if (typeof pin.lat !== "number" || typeof pin.lng !== "number") return;
      const { x, y } = map.project([pin.lng, pin.lat]);
      if (x < -padding || x > bounds.width + padding || y < -padding || y > bounds.height + padding) {
        return;
      }
      const labelText = formatLabelText(pin);
      projected.push({
        ...pin,
        x,
        y,
        labelText,
        isSelected: selectedPinId !== null && selectedPinId !== undefined && pin.id === selectedPinId,
      });
    });

    if (projected.length === 0) {
      applyVisualNodes([]);
      applyLabelNodes([]);
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

    const clustersMap = new Map();
    projected.forEach((pin, index) => {
      const root = uf.find(index);
      if (!clustersMap.has(root)) clustersMap.set(root, []);
      clustersMap.get(root).push(pin);
    });

    const clusters = Array.from(clustersMap.values());
    const nodes = [];

    clusters.forEach((clusterPins) => {
      const centerX = clusterPins.reduce((sum, pin) => sum + pin.x, 0) / clusterPins.length;
      const centerY = clusterPins.reduce((sum, pin) => sum + pin.y, 0) / clusterPins.length;
      const centerLngLat = map.unproject([centerX, centerY]);
      const clusterKey = buildClusterKey(clusterPins);

      const sortedPins = [...clusterPins].sort((a, b) => {
        if (a.__kind !== b.__kind) return a.__kind === "approved" ? -1 : 1;
        if (a.__order !== b.__order) return a.__order - b.__order;
        return a.__key.localeCompare(b.__key);
      });

      const usingPlus = clusterPins.length > HONEYCOMB_MAX;
      const visiblePinCount = usingPlus
        ? Math.min(LARGE_CLUSTER_SAMPLE, HONEYCOMB_MAX - 1, clusterPins.length)
        : clusterPins.length;
      const offsets = generateHoneycombOffsets(visiblePinCount + (usingPlus ? 1 : 0));

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
        });
      }

      const pinList = sortedPins.slice(0, visiblePinCount);
      pinList.forEach((pin, idx) => {
        const offset = offsets[usingPlus ? idx + 1 : idx] || { dx: 0, dy: 0 };
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
          sortOrder: pin.__order ?? idx,
          isSelected: pin.isSelected,
        });
      });
    });

    applyVisualNodes(nodes);

    const iconBoxes = nodes.map((node) => ({
      minX: node.x - PIN_RADIUS - 2,
      maxX: node.x + PIN_RADIUS + 2,
      minY: node.y - PIN_RADIUS - 2,
      maxY: node.y + PIN_RADIUS + 2,
    }));

    const labelCandidates = nodes
      .filter((node) => Boolean(node.labelText))
      .map((node) => ({
        key: `label-${node.key}`,
        text: node.labelText,
        x: node.x + PIN_RADIUS,
        y: node.y,
        category: node.category,
        priority:
          (node.category === "approved" ? 0 : 1) * 1_000_000 +
          (node.clusterSize > 1 ? node.clusterSize * 10 : node.sortOrder),
      }));

    const placedLabels = buildLabelBoxes(labelCandidates, iconBoxes, ctx, bounds);
    applyLabelNodes(placedLabels);
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
    visualNodes.some((node) => node.phase === "enter") &&
      requestAnimationFrame(() => {
        setVisualNodes((prev) => prev.map((node) => (node.phase === "enter" ? { ...node, phase: "active" } : node)));
      });
  }, [visualNodes]);

  useEffect(() => {
    const exiting = visualNodes.some((node) => node.phase === "exit");
    if (!exiting) return undefined;
    const timeout = setTimeout(() => {
      setVisualNodes((prev) => prev.filter((node) => node.phase !== "exit"));
    }, ANIMATION_TIMING.exit + 60);
    return () => clearTimeout(timeout);
  }, [visualNodes]);

  useEffect(() => {
    labelNodes.some((node) => node.phase === "enter") &&
      requestAnimationFrame(() => {
        setLabelNodes((prev) => prev.map((node) => (node.phase === "enter" ? { ...node, phase: "active" } : node)));
      });
  }, [labelNodes]);

  useEffect(() => {
    const exiting = labelNodes.some((node) => node.phase === "exit");
    if (!exiting) return undefined;
    const timeout = setTimeout(() => {
      setLabelNodes((prev) => prev.filter((node) => node.phase !== "exit"));
    }, ANIMATION_TIMING.exit + 60);
    return () => clearTimeout(timeout);
  }, [labelNodes]);

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
    });

    map.on("moveend", () => {
      isMapMovingRef.current = false;
      scheduleLayout();
    });

    map.on("zoomstart", () => {
      isMapMovingRef.current = true;
    });

    map.on("zoomend", () => {
      isMapMovingRef.current = false;
      scheduleLayout();
    });

    map.on("resize", scheduleLayout);

    map.on("click", (e) => {
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
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [ensureEmojiImage]);

  useEffect(() => {
    scheduleLayout();
  }, [combinedPins, scheduleLayout]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleMove = () => scheduleLayout();
    map.on("move", handleMove);
    return () => map.off("move", handleMove);
  }, [scheduleLayout]);

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

  const handleNodeClick = useCallback(
    (event, node) => {
      event.stopPropagation();
      event.preventDefault();
      const map = mapRef.current;
      if (!map) return;

      if (node.isPlus || node.clusterSize > 1) {
        const targetZoom = Math.min(map.getMaxZoom() || 20, map.getZoom() + CLICK_TO_SPLIT_DELTA);
        map.easeTo({ center: [node.center.lng, node.center.lat], zoom: targetZoom });
        return;
      }

      if (node.pin && onPinSelectRef.current) {
        onPinSelectRef.current(node.pin);
      }

      const zoomTarget = Math.max(map.getZoom(), MAP_CLICK_TARGET_ZOOM);
      map.easeTo({ center: [node.pin.lng, node.pin.lat], zoom: zoomTarget });
    },
    []
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
        {visualNodes.map((node) => {
          const emoji = node.isPlus ? "＋" : node.category === "pending" ? PENDING_REVIEW_EMOJI : node.icon || DEFAULT_EMOJI;
          const transitionSpeed = isMapMovingRef.current ? 60 : ANIMATION_TIMING.move;
          const isEntering = node.phase === "enter";
          const isExiting = node.phase === "exit";
          const baseScale = isEntering ? 0.7 : isExiting ? 0.85 : 1;
          const opacity = isEntering || isExiting ? 0 : 1;
          const style = {
            transform: `translate(${node.x - PIN_RADIUS}px, ${node.y - PIN_RADIUS}px) scale(${baseScale})`,
            opacity,
            transition: `transform ${transitionSpeed}ms ease, opacity ${ANIMATION_TIMING.filter}ms ease`,
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

        {labelNodes.map((label) => {
          const transitionSpeed = isMapMovingRef.current ? 80 : ANIMATION_TIMING.label;
          const baseOpacity = label.phase === "enter" || label.phase === "exit" ? 0 : 1;
          const style = {
            left: `${label.anchorX}px`,
            top: `${label.anchorY}px`,
            width: `${label.width}px`,
            height: `${label.height}px`,
            opacity: baseOpacity,
            transition: `opacity ${transitionSpeed}ms ease`,
          };
          const className = [
            "pin-label",
            label.category === "pending" ? "pending" : "",
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
