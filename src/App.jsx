import { useState, useCallback, useMemo } from "react";
import { supabaseConfigError } from "./supabaseClient";

import ConfigErrorNotice from "./components/ConfigErrorNotice";
import MapView from "./components/MapView";
import PolicyModal from "./components/PolicyModal";
import TitleCard from "./components/TitleCard";
import Panel from "./components/Panel";
import PanelContent from "./components/PanelContent";
import PinInfoPanel from "./components/PinInfoPanel";
import PinCard from "./components/PinCard";
import ReportPinButton from "./components/ReportPinButton";
import FeedbackModal from "./components/FeedbackModal";
import privacyPolicyContent from "../PrivacyPolicy.md?raw";
import termsContent from "../ToS.md?raw";

import {
  useViewport,
  useBubbleOptions,
  usePins,
  useFilters,
  useOrderedOptions,
  usePinForm,
  usePanelState,
  usePolicyModal,
} from "./hooks";

import {
  AppProvider,
  PinFormProvider,
  FilterProvider,
  FeedbackProvider,
} from "./context";

/**
 * Inner component that uses the feedback context
 */
function AppContent() {
  // UI state for selected pin and location
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);

  // Initialize hooks
  useViewport();

  const bubbleOptionsHook = useBubbleOptions();
  const {
    bubbleOptions,
    customInterestOptions,
    isInterestApproved,
    handleCustomOption,
  } = bubbleOptionsHook;

  const filtersHook = useFilters();
  const {
    filters,
    filtersActive,
  } = filtersHook;

  // Pins hook needs filters and isInterestApproved
  const pinsHook = usePins(filters, isInterestApproved);
  const {
    filteredPins,
    pendingPins,
    loadingPins,
    pinsError,
    approvedPinsCount,
    pendingPinsLabel,
    interestPopularity,
    contactPopularity,
    refreshPendingPins,
  } = pinsHook;

  // Ordered options based on popularity
  const { orderedInterestOptions, orderedContactOptions } = useOrderedOptions(
    bubbleOptions,
    interestPopularity,
    contactPopularity
  );

  // Pin form hook
  const pinFormHook = usePinForm({
    selectedLocation,
    setSelectedLocation,
    refreshPendingPins,
    orderedInterestOptions,
    customInterestOptions,
    interestPopularity,
  });
  const {
    form,
    setSubmitMsg,
    setSubmitError,
    hasSubmitted,
    autofillLocation,
  } = pinFormHook;

  // Panel state hook
  const panelStateHook = usePanelState({ selectedLocation, hasSubmitted });
  const {
    activePanel,
    panelPlacement,
    showFullAddForm,
    setShowFullAddForm,
    titleCardHeight,
    titleCardRef,
    togglePanel,
    closePanel,
  } = panelStateHook;

  // Map interaction handlers
  const handleMapClick = useCallback(
    (lngLat) => {
      if (hasSubmitted) return;

      setSelectedPin(null);
      setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
      if (!hasSubmitted) {
        setSubmitMsg(null);
      }
      setSubmitError(null);
      autofillLocation(lngLat.lat, lngLat.lng);
    },
    [autofillLocation, hasSubmitted, setSubmitMsg, setSubmitError]
  );

  const handlePinSelect = useCallback((pin) => {
    setSelectedPin(pin);
    setSelectedLocation(null);
  }, []);

  // Policy modal hook
  const { policyModal, openPolicy, closePolicy } = usePolicyModal();

  // Computed values
  const visibleSelectedPin = selectedPin
    ? filteredPins.find((pin) => pin.id === selectedPin.id) || null
    : null;

  const policyTitle = policyModal === "tos" ? "Terms of Service" : "Privacy Policy";
  const policyContent = policyModal === "tos" ? termsContent : privacyPolicyContent;

  // Build context values
  const appContextValue = useMemo(() => ({
    bubbleOptions,
    isInterestApproved,
    handleCustomOption,
    orderedInterestOptions,
    orderedContactOptions,
    panelPlacement,
    showFullAddForm,
    setShowFullAddForm,
  }), [
    bubbleOptions,
    isInterestApproved,
    handleCustomOption,
    orderedInterestOptions,
    orderedContactOptions,
    panelPlacement,
    showFullAddForm,
    setShowFullAddForm,
  ]);

  const pinFormContextValue = useMemo(() => ({
    ...pinFormHook,
    selectedLocation,
  }), [pinFormHook, selectedLocation]);

  const filterContextValue = useMemo(() => ({
    ...filtersHook,
    orderedInterestOptions,
  }), [filtersHook, orderedInterestOptions]);

  return (
    <AppProvider value={appContextValue}>
      <PinFormProvider value={pinFormContextValue}>
        <FilterProvider value={filterContextValue}>
          <div className="app-shell">
            <MapView
              pins={filteredPins}
              pendingPins={filtersActive ? [] : pendingPins}
              onMapClick={handleMapClick}
              onPinSelect={handlePinSelect}
              pendingLocation={!hasSubmitted && activePanel === "add" ? selectedLocation : null}
              pendingIcon={!hasSubmitted && activePanel === "add" ? form.icon : null}
              selectedPinId={visibleSelectedPin?.id}
              enableAddMode={activePanel === "add" && !hasSubmitted}
            />

            <div className="overlay-rail">
              <TitleCard
                ref={titleCardRef}
                activePanel={activePanel}
                onTogglePanel={togglePanel}
              />

              {activePanel && panelPlacement === "side" && (
                <Panel
                  activePanel={activePanel}
                  placement={panelPlacement}
                  showFullAddForm={showFullAddForm}
                  titleCardHeight={titleCardHeight}
                  onClose={closePanel}
                >
                  <PanelContent
                    activePanel={activePanel}
                    panelPlacement={panelPlacement}
                    showFullAddForm={showFullAddForm}
                    loadingPins={loadingPins}
                    approvedPinsCount={approvedPinsCount}
                    pendingPinsLabel={pendingPinsLabel}
                    pinsError={pinsError}
                    onOpenPolicy={openPolicy}
                  />
                </Panel>
              )}

              {panelPlacement === "side" && visibleSelectedPin && (
                <PinCard
                  pin={visibleSelectedPin}
                  placement="side"
                  onClose={() => setSelectedPin(null)}
                  reportButton={<ReportPinButton pin={visibleSelectedPin} />}
                >
                  <PinInfoPanel pin={visibleSelectedPin} isInterestApproved={isInterestApproved} />
                </PinCard>
              )}
            </div>

            {activePanel && panelPlacement === "bottom" && (
              <Panel
                activePanel={activePanel}
                placement={panelPlacement}
                showFullAddForm={showFullAddForm}
                titleCardHeight={titleCardHeight}
                onClose={closePanel}
              >
                <PanelContent
                  activePanel={activePanel}
                  panelPlacement={panelPlacement}
                  showFullAddForm={showFullAddForm}
                  loadingPins={loadingPins}
                  approvedPinsCount={approvedPinsCount}
                  pendingPinsLabel={pendingPinsLabel}
                  pinsError={pinsError}
                  onOpenPolicy={openPolicy}
                />
              </Panel>
            )}

            {panelPlacement === "bottom" && visibleSelectedPin && (
              <PinCard
                pin={visibleSelectedPin}
                placement="bottom"
                onClose={() => setSelectedPin(null)}
                reportButton={<ReportPinButton pin={visibleSelectedPin} />}
              >
                <PinInfoPanel pin={visibleSelectedPin} isInterestApproved={isInterestApproved} />
              </PinCard>
            )}

            {policyModal && (
              <PolicyModal title={policyTitle} content={policyContent} onClose={closePolicy} />
            )}

            <FeedbackModal />
          </div>
        </FilterProvider>
      </PinFormProvider>
    </AppProvider>
  );
}

/**
 * Main App component - wraps content with FeedbackProvider
 */
function App() {
  // Early return for config error
  if (supabaseConfigError) {
    return <ConfigErrorNotice message={supabaseConfigError.message} />;
  }

  return (
    <FeedbackProvider>
      <AppContent />
    </FeedbackProvider>
  );
}

export default App;
