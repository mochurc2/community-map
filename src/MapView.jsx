import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const DEFAULT_EMOJI = "📍";

const emojiId = (emoji) =>
  `emoji-icon-${Array.from(emoji || DEFAULT_EMOJI)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-")}`;

const renderEmojiImage = async (emoji) => {
  const size = 64;
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

function MapView({ pins, onMapClick, pendingLocation, pendingIcon }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const loadedIconsRef = useRef(new Set());
  const loadingIconsRef = useRef(new Map());

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

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
          "circle-radius": 13,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#d1d5db",
        },
      });

      map.addLayer({
        id: "pins-emoji",
        type: "symbol",
        source: "pins",
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

      map.addSource("pending-pin", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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

    map.on("click", (e) => {
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

      const features = (pins || []).map((p) => ({
        type: "Feature",
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
        },
      }));

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
    if (!pendingSource) return;

    let cancelled = false;

    const updatePendingPin = async () => {
      if (!pendingLocation) {
        pendingSource.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      const iconToUse = pendingIcon || DEFAULT_EMOJI;
      await ensureEmojiImage(iconToUse);
      if (cancelled) return;

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
