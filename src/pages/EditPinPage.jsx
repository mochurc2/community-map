import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MapView from "../components/MapView";
import Panel from "../components/Panel";
import EditPinPanel from "../components/EditPinPanel";
import { useBubbleOptions, usePins } from "../hooks";
import usePinEditForm from "../hooks/usePinEditForm";

export default function EditPinPage() {
  const [params] = useSearchParams();
  const pinId = params.get("id");
  const token = params.get("token");

  const { bubbleOptions, customInterestOptions, isInterestApproved } = useBubbleOptions();
  // Minimal pins hook to reuse popularity calculations and pending overlay styles
  const { interestPopularity, contactPopularity } = usePins(null, isInterestApproved);

  const editForm = usePinEditForm({
    pinId,
    token,
    bubbleOptions,
    customInterestOptions,
    interestPopularity,
  });

  const [panelPlacement] = useState("side");
  const [activePanel] = useState("edit");

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

  return (
    <div className="app-shell">
      <MapView
        pins={[]} // editing only shows pending marker
        pendingPins={pendingPins}
        pendingLocation={editForm.selectedLocation}
        pendingIcon={pendingIcon}
        enableAddMode
        panelPlacement={panelPlacement}
        onMapClick={(lngLat) => {
          if (!lngLat) return;
          editForm.setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
          editForm.setError(null);
          editForm.setSuccess(null);
        }}
        onMapError={() => {}}
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
      </div>
    </div>
  );
}
