import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const styleUrl = import.meta.env.VITE_MAPTILER_STYLE_URL;

function MapView({ pins, onMapClick, pendingLocation }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !styleUrl) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [0, 20],
      zoom: 2,
    });

    mapRef.current = map;

    map.on("load", () => {
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
          "circle-radius": 6,
          "circle-color": "#ef4444",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f8fafc",
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
          "circle-radius": 8,
          "circle-color": "#111827",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#22d3ee",
        },
      });

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
  }, [styleUrl]);

  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("pins");
    if (!source) return;

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
      },
    }));

    source.setData({
      type: "FeatureCollection",
      features,
    });
  }, [pins, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current;
    if (!map) return;

    const pendingSource = map.getSource("pending-pin");
    if (!pendingSource) return;

    if (!pendingLocation) {
      pendingSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    pendingSource.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [pendingLocation.lng, pendingLocation.lat],
          },
        },
      ],
    });
  }, [pendingLocation, mapLoaded]);

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
