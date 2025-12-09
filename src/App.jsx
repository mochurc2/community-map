import { useState, useCallback, useMemo } from "react";
import { X, Info, Plus, Filter } from "lucide-react";
import { supabaseConfigError } from "./supabaseClient";

import ConfigErrorNotice from "./components/ConfigErrorNotice";
import MapView from "./components/MapView";
import PolicyModal from "./components/PolicyModal";
import TitleCard from "./components/TitleCard";
import FilterPanel from "./components/FilterPanel";
import InfoPanel from "./components/InfoPanel";
import PinInfoPanel from "./components/PinInfoPanel";
import PinCard from "./components/PinCard";
import AddPinPanel from "./components/AddPinPanel";
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
} from "./hooks";

import {
  AppProvider,
  PinFormProvider,
  FilterProvider,
  FeedbackProvider,
  useFeedbackContext,
} from "./context";

/**
 * Inner component that uses the feedback context
 */
function AppContent() {
  // UI state for selected pin and location
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [policyModal, setPolicyModal] = useState(null);

  // Get openFeedback from context
  const { openFeedback } = useFeedbackContext();

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

  // Policy modal
  const openPolicy = (type) => setPolicyModal(type);
  const closePolicy = () => setPolicyModal(null);

  // Computed values
  const visibleSelectedPin = selectedPin
    ? filteredPins.find((pin) => pin.id === selectedPin.id) || null
    : null;

  const getPanelTitle = () => {
    if (activePanel === "info") return { icon: <Info />, label: "About this map" };
    if (activePanel === "add") return { icon: <Plus />, label: "Add your pin" };
    return { icon: <Filter />, label: "Filter pins" };
  };
  const panelTitle = getPanelTitle();

  const isCompactAdd = panelPlacement === "bottom";
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

  // Panel content components
  const infoPanel = (
    <InfoPanel
      loadingPins={loadingPins}
      approvedPinsCount={approvedPinsCount}
      pendingPinsLabel={pendingPinsLabel}
      pinsError={pinsError}
      onOpenPolicy={openPolicy}
    />
  );

  const reportPinButton =
    visibleSelectedPin && visibleSelectedPin.id ? (
      <button
        type="button"
        className="tiny-button subtle"
        onClick={() =>
          openFeedback("pin_report", {
            pinId: visibleSelectedPin.id,
            pinNickname: visibleSelectedPin.nickname || "Unnamed pin",
          })
        }
      >
        Report pin
      </button>
    ) : null;

  const pinInfoPanel = (
    <PinInfoPanel pin={visibleSelectedPin} isInterestApproved={isInterestApproved} />
  );

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
            />

            <div className="overlay-rail">
              <TitleCard
                ref={titleCardRef}
                activePanel={activePanel}
                onTogglePanel={togglePanel}
              />

              {activePanel && panelPlacement === "side" && (
                <div
                  className={`floating-panel ${panelPlacement} ${
                    activePanel === "add" && showFullAddForm ? "expanded" : ""
                  }`}
                >
                  <div className="panel-top">
                    <div className="panel-title">
                      <div className="panel-icon">{panelTitle.icon}</div>
                      <h3>{panelTitle.label}</h3>
                    </div>
                    <button type="button" className="close-button" onClick={closePanel}>
                      <X size={24} />
                    </button>
                  </div>

                  {activePanel === "info" && infoPanel}
                  {activePanel === "add" && <div className="panel-body-wrapper"><AddPinPanel /></div>}
                  {activePanel === "filter" && <FilterPanel />}
                </div>
              )}

              {panelPlacement === "side" && visibleSelectedPin && (
                <PinCard
                  pin={visibleSelectedPin}
                  placement="side"
                  onClose={() => setSelectedPin(null)}
                  reportButton={reportPinButton}
                >
                  {pinInfoPanel}
                </PinCard>
              )}
            </div>

            {activePanel && panelPlacement === "bottom" && (
              <div
                className={`floating-panel ${panelPlacement} ${
                  activePanel === "add" && showFullAddForm ? "expanded" : ""
                }`}
                style={
                  panelPlacement === "bottom" && activePanel === "add" && showFullAddForm
                    ? { top: `${Math.max(titleCardHeight + 42, 150)}px` }
                    : undefined
                }
              >
                <div className="panel-top">
                  <div className="panel-title">
                    <div className="panel-icon">{panelTitle.icon}</div>
                    <h3>{panelTitle.label}</h3>
                  </div>
                  <button type="button" className="close-button" onClick={closePanel}>
                    <X size={24} />
                  </button>
                </div>

                {activePanel === "info" && infoPanel}
                {activePanel === "add" && (
                  <div
                    className={`panel-body-wrapper ${
                      isCompactAdd && !showFullAddForm ? "compact" : ""
                    }`}
                  >
                    <AddPinPanel />
                  </div>
                )}
                {activePanel === "filter" && <FilterPanel />}
              </div>
            )}

            {panelPlacement === "bottom" && visibleSelectedPin && (
              <PinCard
                pin={visibleSelectedPin}
                placement="bottom"
                onClose={() => setSelectedPin(null)}
                reportButton={reportPinButton}
              >
                {pinInfoPanel}
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
