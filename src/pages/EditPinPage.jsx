import { useMemo, useState } from "react";
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

  return (
    <div className="app-shell">
      <TitleCard
        activePanel={null}
        onTogglePanel={confirmExit}
        projectionMode={projectionMode}
        onToggleProjection={() =>
          setProjectionMode((prev) => (prev === "mercator" ? "globe" : "mercator"))
        }
      />
      <MapView
        pins={[]} // editing only shows pending marker
        pendingPins={pendingPins}
        pendingLocation={editForm.selectedLocation}
        pendingIcon={pendingIcon}
        enableAddMode
        panelPlacement={panelPlacement}
        projection={projectionMode}
        onMapClick={(lngLat) => {
          if (!lngLat) return;
          editForm.setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
          editForm.setError(null);
          editForm.setSuccess(null);
        }}
        onMapError={(msg) => setMapErrorMessage(msg || "Map failed to load")}
      />

      <div className="overlay-rail">
        <Panel
          activePanel={activePanel}
          placement={panelPlacement}
          showFullAddForm
          titleCardHeight={0}
          onClose={() => {}}
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
