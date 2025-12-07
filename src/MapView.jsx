import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { getGenderAbbreviation } from "./pinUtils";

const DEFAULT_EMOJI = "📍";
const FEET_TO_METERS = 0.3048;
const PENDING_RADIUS_FEET = 1500;
const EARTH_RADIUS_METERS = 6378137;
const CIRCLE_STEPS = 90;

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

const styleUrl = import.meta.env.VITE_MAPTILER_STYLE_URL;

function MapView({
  pins,
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
  const selectedPinRef = useRef(null);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onPinSelectRef.current = onPinSelect;
  }, [onPinSelect]);

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
          "circle-radius": 11,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#22c55e",
            "#d1d5db",
          ],
        },
      });

      map.addLayer({
        id: "pins-emoji",
        type: "symbol",
        source: "pins",
        layout: {
          "icon-image": ["coalesce", ["get", "iconImageId"], emojiId(DEFAULT_EMOJI)],
          "icon-size": 0.68,
          "icon-allow-overlap": true,
        },
        paint: {
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1,
        },
      });

      map.addLayer({
        id: "pin-labels",
        type: "symbol",
        source: "pins",
        layout: {
          "text-field": ["get", "labelText"],
          "text-size": 13,
          "text-font": ["Inter Regular", "Open Sans Regular", "Arial Unicode MS Regular"],
          "text-variable-anchor": ["left", "right"],
          "text-justify": "auto",
          "text-offset": [1.2, 0],
          "text-max-width": 12,
          "text-optional": true,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "symbol-sort-key": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            1,
          ],
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
      setMapLoaded(true);
    });

    map.on("error", (evt) => {
      const message = evt?.error?.message || "Map could not load";
      setMapError(message);
    });

    const handlePinClick = (event) => {
      const [target] = event.features || [];
      if (target && onPinSelectRef.current) {
        onPinSelectRef.current(target.properties);
      }
    };

    ["pins-layer", "pins-emoji", "pin-labels"].forEach((layerId) => {
      map.on("click", layerId, handlePinClick);
      map.on("mouseenter", layerId, () =>
        map.getCanvas().style.setProperty("cursor", "pointer")
      );
      map.on("mouseleave", layerId, () =>
        map.getCanvas().style.removeProperty("cursor")
      );
    });

    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["pins-layer", "pins-emoji", "pin-labels"],
      });

      if (features?.length) {
        const target = features[0];
        if (onPinSelectRef.current) {
          onPinSelectRef.current(target.properties);
        }
        return;
      }

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
    if (!mapLoaded) return;
    let cancelled = false;

    const updatePins = async () => {
      const map = mapRef.current;
      if (!map) return;

      const source = map.getSource("pins");
      if (!source) return;

      const emojisToLoad = new Set([DEFAULT_EMOJI]);
      (pins || []).forEach((p) => {
        if (p.icon) emojisToLoad.add(p.icon);
      });

      await Promise.all(Array.from(emojisToLoad).map((emoji) => ensureEmojiImage(emoji)));
      if (cancelled) return;

      const features = (pins || []).map((p) => {
        const genderAbbr = getGenderAbbreviation(p.genders, p.gender_identity);
        const ageText = p.age ? `${p.age}` : "";
        const detailLine = [ageText, genderAbbr].filter(Boolean).join(" · ");
        const labelText = `${p.nickname || "Unknown"}${detailLine ? `\n${detailLine}` : ""}`;

        return {
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
            labelText,
          },
        };
      });

      source.setData({
        type: "FeatureCollection",
        features,
      });
    };

    updatePins();

    return () => {
      cancelled = true;
    };
  }, [pins, mapLoaded, ensureEmojiImage]);

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

  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current;
    if (!map || !map.getSource("pins")) return;

    const previousId = selectedPinRef.current;
    if (previousId !== null && previousId !== undefined) {
      map.setFeatureState(
        { source: "pins", id: previousId },
        { selected: false }
      );
    }

    if (selectedPinId !== null && selectedPinId !== undefined) {
      map.setFeatureState(
        { source: "pins", id: selectedPinId },
        { selected: true }
      );
      selectedPinRef.current = selectedPinId;
      return;
    }

    selectedPinRef.current = null;
  }, [selectedPinId, mapLoaded, pins]);

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
