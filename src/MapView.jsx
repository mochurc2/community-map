import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";
import "maplibre-gl/dist/maplibre-gl.css";

import { getGenderAbbreviation } from "./pinUtils";

const DEFAULT_EMOJI = "📍";
const PENDING_REVIEW_EMOJI = "❗";
const FEET_TO_METERS = 0.3048;
const PENDING_RADIUS_FEET = 1500;
const EARTH_RADIUS_METERS = 6378137;
const CIRCLE_STEPS = 90;
const MAP_CLICK_TARGET_ZOOM = 15.5;
const PLUS_CLUSTER_EMOJI = "➕";
const CLUSTER_RADIUS = 70;
const CLUSTER_MAX_ZOOM = 18;
const HONEYCOMB_MAX_CLUSTER_PINS = 30;
const HONEYCOMB_SAMPLE_PINS = 18;
const HONEYCOMB_SPACING_PX = 30;
const LABEL_CHAR_WIDTH = 6.8;
const LABEL_LINE_HEIGHT = 15;
const LABEL_PADDING_X = 12;
const LABEL_PADDING_Y = 6;
const LABEL_OFFSET_X = 18;
const ICON_BOX_HALF = 14;
const ANIMATION_DURATION = 280;
const PIN_BASE_RADIUS = 11;
const PIN_BASE_STROKE = 2;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const buildPinLabelText = (pin) => {
  const genderAbbr = getGenderAbbreviation(pin.genders, pin.gender_identity);
  const ageText = pin.age ? `${pin.age}` : "";
  const detailLine = [ageText, genderAbbr].filter(Boolean).join(" · ");
  return `${pin.nickname || "Unknown"}${detailLine ? `\n${detailLine}` : ""}`;
};

const estimateLabelBox = (point, text) => {
  const lines = (text || "").split("\n");
  const maxLineLength = Math.max(...lines.map((line) => line.length), 1);
  const width = maxLineLength * LABEL_CHAR_WIDTH + LABEL_PADDING_X;
  const height = lines.length * LABEL_LINE_HEIGHT + LABEL_PADDING_Y;
  const minX = point.x + LABEL_OFFSET_X;
  const minY = point.y - height / 2;
  return {
    minX,
    maxX: minX + width,
    minY,
    maxY: minY + height,
  };
};

const buildIconBox = (point, halfSize = ICON_BOX_HALF) => ({
  minX: point.x - halfSize,
  maxX: point.x + halfSize,
  minY: point.y - halfSize,
  maxY: point.y + halfSize,
});

const boxesIntersect = (a, b) =>
  !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);

const axialToPixel = (q, r, spacing) => ({
  x: spacing * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
  y: spacing * (1.5 * r),
});

const buildHoneycombOffsets = (count, spacing) => {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0 }];

  const offsets = [{ x: 0, y: 0 }];
  let ring = 1;
  const directions = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];

  while (offsets.length < count) {
    let q = ring;
    let r = 0;
    for (let dirIndex = 0; dirIndex < directions.length; dirIndex += 1) {
      const [dq, dr] = directions[dirIndex];
      for (let step = 0; step < ring; step += 1) {
        if (offsets.length >= count) break;
        offsets.push(axialToPixel(q, r, spacing));
        q += dq;
        r += dr;
      }
    }
    ring += 1;
  }

  return offsets.slice(0, count);
};

const offsetToLngLat = (map, center, offset) => {
  const projected = map.project({ lng: center[0], lat: center[1] });
  return map.unproject({
    x: projected.x + offset.x,
    y: projected.y + offset.y,
  });
};

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

const styleUrl = import.meta.env.VITE_MAPTILER_STYLE_URL;

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
  const onMapClickRef = useRef(onMapClick);
  const onPinSelectRef = useRef(onPinSelect);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const loadedIconsRef = useRef(new Set());
  const loadingIconsRef = useRef(new Map());
  const clusterIndexRef = useRef(null);
  const displayedStateRef = useRef(new Map());
  const animationFrameRef = useRef(null);
  const clusterMetaRef = useRef(new Map());

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onPinSelectRef.current = onPinSelect;
  }, [onPinSelect]);

  const startAnimation = useCallback((targets) => {
    const map = mapRef.current;
    const source = map?.getSource("pins");
    if (!map || !source) return;

    const previous = displayedStateRef.current;
    const merged = new Map(targets.map((item) => [item.key, item]));

    previous.forEach((prev, key) => {
      if (!merged.has(key)) {
        merged.set(key, {
          ...prev,
          alpha: 0,
          labelAlpha: 0,
          scale: Math.max(prev.scale ?? 1, 0.7),
        });
      }
    });

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const start = performance.now();

    const step = () => {
      const now = performance.now();
      const t = Math.min((now - start) / ANIMATION_DURATION, 1);
      const eased = easeOutCubic(t);
      const nextState = new Map();
      const features = [];

      merged.forEach((target, key) => {
        const prev = previous.get(key) || {
          lngLat: target.lngLat,
          alpha: 0,
          labelAlpha: 0,
          scale: 0.7,
          properties: target.properties,
        };

        const lng = lerp(prev.lngLat[0], target.lngLat[0], eased);
        const lat = lerp(prev.lngLat[1], target.lngLat[1], eased);
        const alpha = lerp(prev.alpha ?? 0, target.alpha ?? 1, eased);
        const labelAlpha = lerp(prev.labelAlpha ?? 0, target.labelAlpha ?? 0, eased);
        const scale = lerp(prev.scale ?? 1, target.scale ?? 1, eased);

        if (alpha > 0.01 || (prev.alpha ?? 0) > 0.01) {
          features.push({
            type: "Feature",
            id: key,
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {
              ...target.properties,
              alpha,
              labelAlpha,
              scale,
            },
          });
        }

        nextState.set(key, {
          ...target,
          lngLat: [lng, lat],
          alpha,
          labelAlpha,
          scale,
        });
      });

      source.setData({
        type: "FeatureCollection",
        features,
      });

      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        const cleaned = new Map();
        nextState.forEach((value, key) => {
          if ((value.alpha ?? 0) > 0.02) {
            cleaned.set(key, value);
          }
        });
        displayedStateRef.current = cleaned;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }, []);

  const computeLabelVisibility = useCallback((itemsWithScreen) => {
    const occupied = itemsWithScreen.map((item) => ({
      key: item.key,
      box: buildIconBox(item.screen, ICON_BOX_HALF * (item.scale || 1)),
    }));
    const accepted = new Set();

    const candidates = itemsWithScreen
      .filter((item) => item.properties.labelText)
      .sort((a, b) =>
        String(a.properties.pinId || a.key).localeCompare(String(b.properties.pinId || b.key))
      );

    candidates.forEach((item) => {
      const labelBox = estimateLabelBox(item.screen, item.properties.labelText);
      const collides = occupied.some(
        (entry) => entry.key !== item.key && boxesIntersect(entry.box, labelBox)
      );

      if (!collides) {
        accepted.add(item.key);
        occupied.push({ key: `label-${item.key}`, box: labelBox });
      }
    });

    return accepted;
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

  const recomputeLayout = useCallback(() => {
    const map = mapRef.current;
    const clusterIndex = clusterIndexRef.current;
    if (!map || !clusterIndex) return;

    const zoom = Math.max(0, Math.min(CLUSTER_MAX_ZOOM, Math.round(map.getZoom())));
    const bounds = map.getBounds();
    const clusters = clusterIndex.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom
    );

    const targets = [];
    const itemsWithScreen = [];
    clusterMetaRef.current.clear();

    clusters.forEach((feature) => {
      if (feature.properties.cluster) {
        const clusterId = feature.properties.cluster_id;
        const count = feature.properties.point_count;
        const center = feature.geometry.coordinates;
        const leaves =
          count <= HONEYCOMB_MAX_CLUSTER_PINS
            ? clusterIndex.getLeaves(clusterId, count, 0)
            : clusterIndex.getLeaves(clusterId, HONEYCOMB_SAMPLE_PINS, 0);

        leaves.sort((a, b) => String(a.properties.id || "").localeCompare(String(b.properties.id || "")));

        const includePlus = count > HONEYCOMB_MAX_CLUSTER_PINS;
        const offsets = buildHoneycombOffsets(
          leaves.length + (includePlus ? 1 : 0),
          HONEYCOMB_SPACING_PX
        );

        let offsetIndex = 0;

        if (includePlus) {
          const plusPosition = offsetToLngLat(map, center, offsets[offsetIndex]);
          offsetIndex += 1;

          const plusItem = {
            key: `cluster-${clusterId}-plus`,
            lngLat: [plusPosition.lng, plusPosition.lat],
            alpha: 1,
            scale: 1,
            labelAlpha: 0,
            properties: {
              iconImageId: emojiId(PLUS_CLUSTER_EMOJI),
              labelText: "",
              isPlus: true,
              isClusterMember: true,
              rootClusterId: clusterId,
              clusterSize: count,
              pinId: null,
              labelOffset: [1.2, 0],
            },
          };

          itemsWithScreen.push({
            ...plusItem,
            screen: map.project(plusPosition),
          });
          targets.push(plusItem);
        }

        leaves.forEach((leaf) => {
          const pos = offsetToLngLat(map, center, offsets[offsetIndex]);
          offsetIndex += 1;
          const isSelected = leaf.properties.id === selectedPinId;

          const memberItem = {
            key: `cluster-${clusterId}-${leaf.properties.id}`,
            lngLat: [pos.lng, pos.lat],
            alpha: 1,
            scale: isSelected ? 1.08 : 1,
            labelAlpha: 1,
            properties: {
              ...leaf.properties,
              pinId: leaf.properties.id,
              isClusterMember: true,
              rootClusterId: clusterId,
              clusterSize: count,
              isPlus: false,
              isSelected,
              labelOffset: [1.2, 0],
            },
          };

          itemsWithScreen.push({
            ...memberItem,
            screen: map.project(pos),
          });
          targets.push(memberItem);
        });

        clusterMetaRef.current.set(clusterId, { center, count });
        return;
      }

      const [lng, lat] = feature.geometry.coordinates;
      const isSelected = feature.properties.id === selectedPinId;
      const soloItem = {
        key: `pin-${feature.properties.id}`,
        lngLat: [lng, lat],
        alpha: 1,
        scale: isSelected ? 1.08 : 1,
        labelAlpha: 1,
        properties: {
          ...feature.properties,
          pinId: feature.properties.id,
          isClusterMember: false,
          rootClusterId: null,
          clusterSize: 1,
          isPlus: false,
          isSelected,
          labelOffset: [1.2, 0],
        },
      };

      itemsWithScreen.push({
        ...soloItem,
        screen: map.project({ lng, lat }),
      });
      targets.push(soloItem);
    });

    const acceptedLabels = computeLabelVisibility(itemsWithScreen);
    const finalized = targets.map((item) => ({
      ...item,
      labelAlpha: acceptedLabels.has(item.key) ? item.labelAlpha ?? 1 : 0,
    }));

    startAnimation(finalized);
  }, [computeLabelVisibility, selectedPinId, startAnimation]);

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
      map.addSource("pins", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "pins-layer",
        type: "circle",
        source: "pins",
        paint: {
          "circle-radius": [
            "*",
            PIN_BASE_RADIUS,
            ["coalesce", ["get", "scale"], 1],
          ],
          "circle-color": "#ffffff",
          "circle-stroke-width": [
            "*",
            PIN_BASE_STROKE,
            ["coalesce", ["get", "scale"], 1],
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["get", "isPlus"], false],
            "#2563eb",
            ["boolean", ["get", "isSelected"], false],
            "#22c55e",
            "#d1d5db",
          ],
          "circle-opacity": ["coalesce", ["get", "alpha"], 1],
        },
      });

      map.addLayer({
        id: "pins-emoji",
        type: "symbol",
        source: "pins",
        layout: {
          "icon-image": ["coalesce", ["get", "iconImageId"], emojiId(DEFAULT_EMOJI)],
          "icon-size": ["*", 0.68, ["coalesce", ["get", "scale"], 1]],
          "icon-allow-overlap": true,
        },
        paint: {
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1,
          "icon-opacity": ["coalesce", ["get", "alpha"], 1],
        },
      });

      map.addLayer({
        id: "pin-labels",
        type: "symbol",
        source: "pins",
        layout: {
          "text-field": ["coalesce", ["get", "labelText"], ""],
          "text-size": 13,
          "text-font": ["Inter Regular", "Open Sans Regular", "Arial Unicode MS Regular"],
          "text-justify": "left",
          "text-offset": ["coalesce", ["get", "labelOffset"], ["literal", [1.2, 0]]],
          "text-max-width": 14,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-line-height": 1.2,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 0.5,
          "text-opacity": ["coalesce", ["get", "labelAlpha"], 0],
        },
      });

      map.setPaintProperty("pins-layer", "circle-opacity-transition", { duration: 220 });
      map.setPaintProperty("pins-layer", "circle-radius-transition", { duration: 220 });
      map.setPaintProperty("pins-emoji", "icon-opacity-transition", { duration: 220 });
      map.setPaintProperty("pins-emoji", "icon-size-transition", { duration: 220 });
      map.setPaintProperty("pin-labels", "text-opacity-transition", { duration: 180 });

      map.addSource("pending-review-pins", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "pending-review-layer",
        type: "circle",
        source: "pending-review-pins",
        paint: {
          "circle-radius": 11,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#d1d5db",
        },
      });

      map.addLayer({
        id: "pending-review-emoji",
        type: "symbol",
        source: "pending-review-pins",
        layout: {
          "icon-image": ["coalesce", ["get", "iconImageId"], emojiId(PENDING_REVIEW_EMOJI)],
          "icon-size": 0.68,
          "icon-allow-overlap": true,
        },
        paint: {
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1,
        },
      });

      map.addLayer({
        id: "pending-review-labels",
        type: "symbol",
        source: "pending-review-pins",
        layout: {
          "text-field": ["get", "labelText"],
          "text-size": 13,
          "text-font": ["Inter Regular", "Open Sans Regular", "Arial Unicode MS Regular"],
          "text-variable-anchor": ["left", "right"],
          "text-justify": "auto",
          "text-offset": [1.2, 0],
          "text-max-width": 12,
          "text-optional": true,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 0.5,
          "text-opacity": 0.92,
        },
      });

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
      await ensureEmojiImage(PLUS_CLUSTER_EMOJI);
      setMapLoaded(true);
    });

    map.on("error", (evt) => {
      const message = evt?.error?.message || "Map could not load";
      setMapError(message);
    });

    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["pins-layer", "pins-emoji", "pin-labels"],
      });

      if (features?.length) {
        const target = features[0];
        const rootClusterId = target.properties?.rootClusterId;
        const clusterSize = Number(target.properties?.clusterSize || 0);

        const clusterKey =
          rootClusterId === null || rootClusterId === undefined
            ? null
            : Number(rootClusterId);

        if (clusterKey && clusterSize > 1 && clusterIndexRef.current) {
          const expansionZoom = clusterIndexRef.current.getClusterExpansionZoom(clusterKey);
          const center =
            clusterMetaRef.current.get(clusterKey)?.center ||
            target.geometry?.coordinates ||
            [e.lngLat.lng, e.lngLat.lat];

          map.easeTo({
            center,
            zoom: Math.max(expansionZoom, map.getZoom() + 0.5),
            duration: 600,
          });
          return;
        }

        if (onPinSelectRef.current) {
          onPinSelectRef.current(target.properties);
        }
        return;
      }

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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      clusterIndexRef.current = null;
      displayedStateRef.current = new Map();
      setMapLoaded(false);
    };
  }, [ensureEmojiImage]);

  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current;
    if (!map) return;

    const handleMove = () => recomputeLayout();
    map.on("moveend", handleMove);
    map.on("zoomend", handleMove);
    map.on("resize", handleMove);

    recomputeLayout();

    return () => {
      map.off("moveend", handleMove);
      map.off("zoomend", handleMove);
      map.off("resize", handleMove);
    };
  }, [mapLoaded, recomputeLayout]);

  useEffect(() => {
    if (!mapLoaded) return;
    recomputeLayout();
  }, [selectedPinId, mapLoaded, recomputeLayout]);

  useEffect(() => {
    if (!mapLoaded) return;
    let cancelled = false;

    const updatePins = async () => {
      const map = mapRef.current;
      if (!map) return;

      const emojisToLoad = new Set([DEFAULT_EMOJI, PLUS_CLUSTER_EMOJI]);
      (pins || []).forEach((p) => {
        if (p.icon) emojisToLoad.add(p.icon);
      });

      await Promise.all(Array.from(emojisToLoad).map((emoji) => ensureEmojiImage(emoji)));
      if (cancelled) return;

      const pinFeatures = (pins || []).map((p) => ({
        type: "Feature",
        id: p.id,
        geometry: {
          type: "Point",
          coordinates: [p.lng, p.lat],
        },
        properties: {
          id: p.id,
          city: p.city,
          gender_identity: p.gender_identity,
          note: p.note,
          iconImageId: emojiId(p.icon || DEFAULT_EMOJI),
          nickname: p.nickname,
          age: p.age,
          genders: p.genders,
          seeking: p.seeking,
          interest_tags: p.interest_tags,
          contact_methods: p.contact_methods,
          icon: p.icon,
          labelText: buildPinLabelText(p),
        },
      }));

      if (cancelled) return;

      const clusterIndex = new Supercluster({
        radius: CLUSTER_RADIUS,
        maxZoom: CLUSTER_MAX_ZOOM,
      });
      clusterIndex.load(pinFeatures);
      clusterIndexRef.current = clusterIndex;
      recomputeLayout();
    };

    updatePins();

    return () => {
      cancelled = true;
    };
  }, [pins, mapLoaded, ensureEmojiImage, recomputeLayout]);

  useEffect(() => {
    if (!mapLoaded) return;
    let cancelled = false;

    const updatePendingReviewPins = async () => {
      const map = mapRef.current;
      if (!map) return;

      const source = map.getSource("pending-review-pins");
      if (!source) return;

      await ensureEmojiImage(PENDING_REVIEW_EMOJI);
      if (cancelled) return;

      const features = (pendingPins || []).map((pin) => ({
        type: "Feature",
        id: pin.id ?? `${pin.lat}-${pin.lng}`,
        geometry: {
          type: "Point",
          coordinates: [pin.lng, pin.lat],
        },
        properties: {
          iconImageId: emojiId(PENDING_REVIEW_EMOJI),
          labelText: "Pending",
        },
      }));

      source.setData({
        type: "FeatureCollection",
        features,
      });
    };

    updatePendingReviewPins();

    return () => {
      cancelled = true;
    };
  }, [pendingPins, mapLoaded, ensureEmojiImage]);

  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current;
    if (!map) return;

    const pendingSource = map.getSource("pending-pin");
    const radiusSource = map.getSource("pending-radius");
    if (!pendingSource || !radiusSource) return;

    let cancelled = false;

    const updatePendingPin = async () => {
      if (!pendingLocation) {
        const empty = { type: "FeatureCollection", features: [] };
        pendingSource.setData(empty);
        radiusSource.setData(empty);
        return;
      }

      const iconToUse = pendingIcon || DEFAULT_EMOJI;
      await ensureEmojiImage(iconToUse);
      if (cancelled) return;

      const circleFeature = buildCircleFeatureCollection(
        pendingLocation,
        PENDING_RADIUS_FEET
      );

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
      {!mapLoaded && !mapError && (
        <div className="map-banner">Loading map tiles…</div>
      )}
      {mapError && (
        <div className="map-banner error">
          <span>{mapError}</span>
          <span style={{ fontWeight: 500 }}>Check your style URL or network.</span>
        </div>
      )}
      <div ref={mapContainerRef} className="map-container" />
    </div>
  );
}

export default MapView;
