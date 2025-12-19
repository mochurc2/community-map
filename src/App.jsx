import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { supabaseConfigError } from "./supabaseClient";

import ConfigErrorNotice from "./components/ConfigErrorNotice";
import MapView from "./components/MapView";
import PolicyModal from "./components/PolicyModal";
import TitleCard from "./components/TitleCard";
import ErrorStack from "./components/ErrorStack";
import Panel from "./components/Panel";
import PanelContent from "./components/PanelContent";
import PinInfoPanel from "./components/PinInfoPanel";
import PinCard from "./components/PinCard";
import ReportPinButton from "./components/ReportPinButton";
import FeedbackModal from "./components/FeedbackModal";
import SubmitConfirmationModal from "./components/SubmitConfirmationModal";
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

const pinApprovalScore = (pin) => {
  const approvedAtMs = parseApprovedAtMs(pin?.approved_at ?? pin?.approvedAt ?? pin?.approvedAtMs);
  const fallbackScore = typeof pin.id === "number" ? pin.id : 0;
  return Number.isFinite(approvedAtMs) ? approvedAtMs : fallbackScore;
};

const parseApprovedAtMs = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const isoLike = trimmed.replace(" ", "T");
    let ms = Date.parse(isoLike);
    if (!Number.isFinite(ms)) {
      const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(?::?(\d{2}))?$/.exec(
        trimmed
      );
      if (match) {
        const [, ymd, hms, offHour, offMin] = match;
        const offset = `${offHour}:${offMin || "00"}`;
        ms = Date.parse(`${ymd}T${hms}${offset}`);
      } else {
        ms = Date.parse(`${isoLike}Z`);
      }
    }
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
};

/**
 * Inner component that uses the feedback context
 */
function AppContent({ hasTurnstileSession = false }) {
  // UI state for selected pin and location
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [projectionMode, setProjectionMode] = useState("mercator");
  // MapLibre instance is kept here so the globe toggle can call setProjection on the live map.
  const mapInstanceRef = useRef(null);
  const styleLoadHandlerRef = useRef(null);
  const projectionModeRef = useRef("mercator");

  // Initialize hooks
  useViewport();

  const bubbleOptionsHook = useBubbleOptions({ enabled: hasTurnstileSession });
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
    pendingPinsError,
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
    pendingSubmission,
    submitting,
    submitError,
    submitMsg,
    confirmSubmission,
    cancelConfirmation,
    autofillLocation,
  } = pinFormHook;

  // Panel state hook
  const panelStateHook = usePanelState({ selectedLocation, hasSubmitted });
  const {
    activePanel,
    panelPlacement,
    showFullAddForm,
    setShowFullAddForm,
    titleCardBounds,
    titleCardHeight,
    titleCardRef,
    togglePanel,
    openAddPanel,
    closePanel,
  } = panelStateHook;

  useEffect(() => {
    if (pendingSubmission) {
      closePanel();
    }
  }, [pendingSubmission, closePanel]);

  const confirmationPin = pendingSubmission?.previewPin;
  const confirmationOpen = Boolean(pendingSubmission);
  const confirmationSubmitted = Boolean(pendingSubmission?.submitted);
  const showContactWarning = pendingSubmission ? !pendingSubmission.hasContactInfo : false;

  const handleConfirmationCancel = useCallback(() => {
    cancelConfirmation();
    openAddPanel();
    setShowFullAddForm(true);
  }, [cancelConfirmation, openAddPanel, setShowFullAddForm]);

  const handleConfirmationClose = useCallback(() => {
    cancelConfirmation();
  }, [cancelConfirmation]);

  const pinPanelRef = useRef(null);
  const [pinPanelBounds, setPinPanelBounds] = useState(null);
  const [mapErrorMessage, setMapErrorMessage] = useState(null);

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
    closePanel();
  }, [closePanel]);

  const applyProjection = useCallback((mode) => {
    const map = mapInstanceRef.current;
    const projection =
      mode === "globe"
        ? { type: "globe", name: "globe" }
        : { type: "mercator", name: "mercator" };
    // Apply projection on the existing map instance; wait for style.load when needed.

    const currentProjection = map?.getProjection?.();
    const currentType =
      typeof currentProjection === "string"
        ? currentProjection
        : currentProjection?.type || currentProjection?.name;

    console.debug("[ProjectionToggle] applyProjection", {
      requested: projection.type,
      mapReady: !!map,
      hasSetProjection: typeof map?.setProjection,
      isStyleLoaded: map?.isStyleLoaded?.(),
      currentType,
    });

    if (!map || typeof map.setProjection !== "function") return;
    if (currentType === projection.type) return;

    const performSet = () => {
      try {
        map.setProjection(projection);
      } catch (error) {
        console.error("[ProjectionToggle] setProjection failed", error);
      }
    };

    if (!map.isStyleLoaded || map.isStyleLoaded()) {
      performSet();
    } else {
      map.once("style.load", () => {
        performSet();
      });
    }
  }, []);

  useEffect(() => {
    projectionModeRef.current = projectionMode;
  }, [projectionMode]);

  const handleMapReady = useCallback(
    (map) => {
      const previous = mapInstanceRef.current;
      if (previous && styleLoadHandlerRef.current) {
        previous.off("style.load", styleLoadHandlerRef.current);
      }

      mapInstanceRef.current = map;
      if (!map) {
        styleLoadHandlerRef.current = null;
        return;
      }

      const onStyleLoad = () => applyProjection(projectionModeRef.current);
      styleLoadHandlerRef.current = onStyleLoad;
      map.on("style.load", onStyleLoad);
      applyProjection(projectionModeRef.current);
    },
    [applyProjection]
  );

  const toggleProjectionMode = useCallback(() => {
    setProjectionMode((prev) => {
      const next = prev === "globe" ? "mercator" : "globe";
      console.debug("[ProjectionToggle] click", {
        nextMode: next,
        mapReady: !!mapInstanceRef.current,
        hasSetProjection: typeof mapInstanceRef.current?.setProjection,
      });
      applyProjection(next);
      return next;
    });
  }, [applyProjection]);

  useEffect(() => {
    applyProjection(projectionMode);
  }, [applyProjection, projectionMode]);

  // Policy modal hook
  const { policyModal, openPolicy, closePolicy } = usePolicyModal();

  // Computed values
  const visibleSelectedPin = selectedPin
    ? filteredPins.find((pin) => pin.id === selectedPin.id) || null
    : null;
  const visibleSelectedPinId = visibleSelectedPin?.id;

  const newestApprovedPin = useMemo(() => {
    if (!filteredPins || filteredPins.length === 0) return null;

    let newest = null;
    let newestScore = -Infinity;

    filteredPins.forEach((pin) => {
      const score = pinApprovalScore(pin);
      if (score > newestScore) {
        newestScore = score;
        newest = pin;
      }
    });

    return newest;
  }, [filteredPins]);

  const handleBrowseLatestPin = useCallback(() => {
    if (!newestApprovedPin) return;
    setSelectedPin(newestApprovedPin);
    cancelConfirmation();
    closePanel();
  }, [cancelConfirmation, closePanel, newestApprovedPin]);

  const approvedPinsOrdered = useMemo(() => {
    return [...filteredPins]
      .map((pin) => ({ pin, score: pinApprovalScore(pin) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.pin);
  }, [filteredPins]);

  const navigatePin = useCallback(
    (direction) => {
      if (!approvedPinsOrdered.length) return;
      const currentId = visibleSelectedPin?.id;
      let currentIndex = approvedPinsOrdered.findIndex((pin) => pin.id === currentId);
      if (currentIndex === -1) {
        currentIndex = 0;
      }
      const nextIndex =
        (currentIndex + direction + approvedPinsOrdered.length) % approvedPinsOrdered.length;
      const nextPin = approvedPinsOrdered[nextIndex];
      if (!nextPin) return;
      setSelectedPin(nextPin);
      closePanel();
    },
    [approvedPinsOrdered, closePanel, visibleSelectedPinId]
  );

  const handleNextPin = useCallback(() => navigatePin(1), [navigatePin]);
  const handlePrevPin = useCallback(() => navigatePin(-1), [navigatePin]);
  const canNavigatePins = approvedPinsOrdered.length > 1;

  useEffect(() => {
    const node = pinPanelRef.current;
    let frameId = null;

    const updateBounds = () => {
      if (!pinPanelRef.current) return;
      const rect = pinPanelRef.current.getBoundingClientRect();
      setPinPanelBounds({ top: rect.top, bottom: rect.bottom, height: rect.height });
    };

    if (!node) {
      frameId = requestAnimationFrame(() => setPinPanelBounds(null));
      return () => {
        if (frameId) cancelAnimationFrame(frameId);
      };
    }

    frameId = requestAnimationFrame(updateBounds);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateBounds) : null;
    resizeObserver?.observe(node);

    window.addEventListener("resize", updateBounds);
    window.visualViewport?.addEventListener("resize", updateBounds);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateBounds);
      window.visualViewport?.removeEventListener("resize", updateBounds);
    };
  }, [visibleSelectedPin, panelPlacement]);

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
    openAddPanel,
    closePanel,
  }), [
    bubbleOptions,
    isInterestApproved,
    handleCustomOption,
    orderedInterestOptions,
    orderedContactOptions,
    panelPlacement,
    showFullAddForm,
    setShowFullAddForm,
    openAddPanel,
    closePanel,
  ]);

  const pinFormContextValue = useMemo(() => ({
    ...pinFormHook,
    selectedLocation,
  }), [pinFormHook, selectedLocation]);

  const filterContextValue = useMemo(() => ({
    ...filtersHook,
    orderedInterestOptions,
  }), [filtersHook, orderedInterestOptions]);

  const appErrors = useMemo(() => {
    const errors = [];
    if (mapErrorMessage) {
      errors.push({ id: "map", source: "Map", message: mapErrorMessage });
    }
    if (pinsError) {
      errors.push({ id: "pins", source: "Pins", message: pinsError });
    }
    if (pendingPinsError) {
      errors.push({
        id: "pendingPins",
        source: "Pending pins",
        message: pendingPinsError,
      });
    }
    return errors;
  }, [mapErrorMessage, pendingPinsError, pinsError]);

  const handleMapError = useCallback((message) => {
    setMapErrorMessage(message || null);
  }, []);

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
              panelPlacement={panelPlacement}
              titleCardBounds={titleCardBounds}
              pinPanelBounds={pinPanelBounds}
              onMapReady={handleMapReady}
              projection={projectionMode}
              onMapError={handleMapError}
            />

            <div className="overlay-rail">
              <TitleCard
                ref={titleCardRef}
                activePanel={activePanel}
                onTogglePanel={togglePanel}
                projectionMode={projectionMode}
                onToggleProjection={toggleProjectionMode}
              />

              <ErrorStack errors={appErrors} />

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
                    onBrowseLatestPin={handleBrowseLatestPin}
                    canBrowsePins={Boolean(newestApprovedPin)}
                  />
              </Panel>
            )}

              {panelPlacement === "side" && visibleSelectedPin && (
                <PinCard
                  pin={visibleSelectedPin}
                  placement="side"
                  onClose={() => setSelectedPin(null)}
                  onPrevPin={handlePrevPin}
                  onNextPin={handleNextPin}
                  navDisabled={!canNavigatePins}
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
                  onBrowseLatestPin={handleBrowseLatestPin}
                  canBrowsePins={Boolean(newestApprovedPin)}
                />
              </Panel>
            )}

            {panelPlacement === "bottom" && visibleSelectedPin && (
                <PinCard
                  pin={visibleSelectedPin}
                  placement="bottom"
                  panelRef={pinPanelRef}
                  onClose={() => setSelectedPin(null)}
                  onPrevPin={handlePrevPin}
                  onNextPin={handleNextPin}
                  navDisabled={!canNavigatePins}
                  reportButton={<ReportPinButton pin={visibleSelectedPin} />}
                >
                  <PinInfoPanel pin={visibleSelectedPin} isInterestApproved={isInterestApproved} />
                </PinCard>
              )}

            {policyModal && (
              <PolicyModal title={policyTitle} content={policyContent} onClose={closePolicy} />
            )}

            <SubmitConfirmationModal
              pin={confirmationPin}
              open={confirmationOpen}
              submitted={confirmationSubmitted}
              submitting={submitting}
              onConfirm={confirmSubmission}
              onCancel={confirmationSubmitted ? handleConfirmationClose : handleConfirmationCancel}
              isInterestApproved={isInterestApproved}
              showContactWarning={!confirmationSubmitted && showContactWarning}
              errorMessage={submitError}
              successMessage={submitMsg}
              onBrowseLatestPin={handleBrowseLatestPin}
              browseDisabled={!newestApprovedPin}
            />

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
function App({ hasTurnstileSession = false }) {
  // Early return for config error
  if (supabaseConfigError) {
    return <ConfigErrorNotice message={supabaseConfigError.message} />;
  }

  return (
    <FeedbackProvider>
      <AppContent hasTurnstileSession={hasTurnstileSession} />
    </FeedbackProvider>
  );
}

export default App;
