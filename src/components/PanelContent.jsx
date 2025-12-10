import InfoPanel from "./InfoPanel";
import AddPinPanel from "./AddPinPanel";
import FilterPanel from "./FilterPanel";
import SearchPanel from "./SearchPanel";

/**
 * PanelContent Component
 *
 * Routes to the appropriate panel content based on activePanel.
 * Handles panel-specific wrapper classes and rendering logic.
 *
 * @param {Object} props
 * @param {string} props.activePanel - Active panel type: 'info', 'search', 'add', or 'filter'
 * @param {string} props.panelPlacement - Panel placement: 'side' or 'bottom'
 * @param {boolean} props.showFullAddForm - Whether add form is expanded
 * @param {boolean} props.loadingPins - Whether pins are loading
 * @param {number} props.approvedPinsCount - Count of approved pins
 * @param {string} props.pendingPinsLabel - Label for pending pins
 * @param {string} props.pinsError - Error message if pins failed to load
 * @param {Function} props.onOpenPolicy - Handler to open policy modal
 * @param {Function} props.onLocationSelect - Handler for when a search result is selected
 */
export function PanelContent({
  activePanel,
  panelPlacement,
  showFullAddForm,
  loadingPins,
  approvedPinsCount,
  pendingPinsLabel,
  pinsError,
  onOpenPolicy,
  onLocationSelect,
}) {
  if (activePanel === "info") {
    return (
      <InfoPanel
        loadingPins={loadingPins}
        approvedPinsCount={approvedPinsCount}
        pendingPinsLabel={pendingPinsLabel}
        pinsError={pinsError}
        onOpenPolicy={onOpenPolicy}
      />
    );
  }

  if (activePanel === "search") {
    return <SearchPanel onLocationSelect={onLocationSelect} />;
  }

  if (activePanel === "add") {
    const isCompact = panelPlacement === "bottom" && !showFullAddForm;
    return (
      <div className={`panel-body-wrapper ${isCompact ? "compact" : ""}`}>
        <AddPinPanel />
      </div>
    );
  }

  if (activePanel === "filter") {
    return <FilterPanel />;
  }

  return null;
}

export default PanelContent;
