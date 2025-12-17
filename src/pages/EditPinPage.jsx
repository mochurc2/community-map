import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MapView from "../components/MapView";
import Panel from "../components/Panel";
import EditPinPanel from "../components/EditPinPanel";
import TitleCard from "../components/TitleCard";
import { useBubbleOptions } from "../hooks";
import usePinEditForm from "../hooks/usePinEditForm";

export default function EditPinPage() {
  const [params] = useSearchParams();
  const pinId = params.get("id");
  const token = params.get("token");
  const navigate = useNavigate();

  const { bubbleOptions, customInterestOptions } = useBubbleOptions();
  const interestPopularity = useMemo(() => new Map(), []);
  const contactPopularity = useMemo(() => new Map(), []);

  const editForm = usePinEditForm({
    pinId,
    token,
    bubbleOptions,
    customInterestOptions,
    interestPopularity,
  });

  const [panelPlacement] = useState("side");
  const [activePanel] = useState("edit");
  const [projectionMode, setProjectionMode] = useState("mercator");
  const [mapErrorMessage, setMapErrorMessage] = useState(null);
  const titleCardRef = useRef(null);
  const pinPanelRef = useRef(null);
  const [titleCardBounds, setTitleCardBounds] = useState({ top: 0, bottom: 0, height: 0 });
  const [pinPanelBounds, setPinPanelBounds] = useState(null);

  const pendingPins = useMemo(() => {
    if (!editForm.selectedLocation) return [];
    return [
      {
        id: pinId || "pending-edit",
        lat: editForm.selectedLocation.lat,
        lng: editForm.selectedLocation.lng,
      },
    ];
  }, [editForm.selectedLocation, pinId]);

  const pendingIcon = editForm.form.icon || "🧭";

  const confirmExit = () => {
    if (!editForm.submitting && !window.confirm("Discard changes and return to the map?")) {
      return;
    }
    navigate("/");
  };

  useEffect(() => {
    const updateTitleBounds = () => {
      const node = titleCardRef.current;
      if (!node) {
        setTitleCardBounds({ top: 0, bottom: 0, height: 0 });
        return;
      }
      const rect = node.getBoundingClientRect();
      setTitleCardBounds({ top: rect.top, bottom: rect.bottom, height: rect.height });
    };
    updateTitleBounds();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateTitleBounds) : null;
    if (ro && titleCardRef.current) ro.observe(titleCardRef.current);
    window.addEventListener("resize", updateTitleBounds);
    return () => {
      window.removeEventListener("resize", updateTitleBounds);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    const updatePanelBounds = () => {
      const node = pinPanelRef.current;
      if (!node) {
        setPinPanelBounds(null);
        return;
      }
      const rect = node.getBoundingClientRect();
      setPinPanelBounds({ top: rect.top, bottom: rect.bottom, height: rect.height });
    };
    updatePanelBounds();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePanelBounds) : null;
    if (ro && pinPanelRef.current) ro.observe(pinPanelRef.current);
    window.addEventListener("resize", updatePanelBounds);
    return () => {
      window.removeEventListener("resize", updatePanelBounds);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className="app-shell">
      <TitleCard
        activePanel={null}
        onTogglePanel={confirmExit}
        projectionMode={projectionMode}
        onToggleProjection={() =>
          setProjectionMode((prev) => (prev === "mercator" ? "globe" : "mercator"))
        }
        ref={titleCardRef}
      />
      <MapView
        pins={[]} // editing only shows pending marker
        pendingPins={pendingPins}
        pendingLocation={editForm.selectedLocation}
        pendingIcon={pendingIcon}
        enableAddMode
        panelPlacement={panelPlacement}
        projection={projectionMode}
        titleCardBounds={titleCardBounds}
        pinPanelBounds={pinPanelBounds}
        onMapClick={(lngLat) => {
          if (!lngLat) return;
          editForm.setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
          editForm.setError(null);
          editForm.setSuccess(null);
        }}
        onMapError={(msg) => setMapErrorMessage(msg || "Map failed to load")}
      />

      <div className="overlay-rail" style={{ marginTop: `${titleCardBounds.height + 12}px` }}>
        <Panel
          activePanel={activePanel}
          placement={panelPlacement}
          showFullAddForm
          titleCardHeight={titleCardBounds.height}
          offsetTop={titleCardBounds.height + 24}
          onClose={confirmExit}
          ref={pinPanelRef}
        >
          <EditPinPanel
            pinId={pinId}
            token={token}
            bubbleOptions={bubbleOptions}
            contactPopularity={contactPopularity}
            customInterestOptions={customInterestOptions}
            {...editForm}
          />
        </Panel>
        {mapErrorMessage && (
          <div className="status error" style={{ margin: "0.75rem" }}>
            {mapErrorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
