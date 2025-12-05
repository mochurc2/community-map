import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const styleUrl = import.meta.env.VITE_MAPTILER_STYLE_URL;

function MapView({ pins, onMapClick }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // 1. Create the map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [0, 20],
      zoom: 2,
    });

    mapRef.current = map;

    map.on("load", () => {
      // base source for pins
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
          "circle-color": "#e11d48",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      setMapLoaded(true);
    });

    // click handler for selecting location
    map.on("click", (e) => {
      if (onMapClick) {
        onMapClick(e.lngLat);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [onMapClick]);

  // 2. Update pins when data changes AND map is ready
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

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: "100%",
        height: "100vh",
        borderRadius: 0,
        overflow: "hidden",
        borderLeft: "1px solid #ddd",
      }}
    />
  );
}

export default MapView;
