import { X } from 'lucide-react';

/**
 * PinCard Component
 *
 * Floating panel displaying a selected pin with header and close controls.
 *
 * @param {Object} props
 * @param {Object} props.pin - The selected pin object
 * @param {string} props.placement - Panel placement ("side" or "bottom")
 * @param {Function} props.onClose - Callback when close button is clicked
 * @param {React.ReactNode} props.reportButton - Report button element to display
 * @param {Function} [props.onPrevPin] - Navigate to previous pin (older)
 * @param {Function} [props.onNextPin] - Navigate to next pin (newer)
 * @param {boolean} [props.navDisabled] - Disable navigation buttons
 * @param {React.ReactNode} props.children - Panel body content (typically PinInfoPanel)
 * @param {React.Ref} [props.panelRef] - Optional ref to the panel container (used for layout calculations)
 */
export function PinCard({
  pin,
  placement,
  onClose,
  reportButton,
  onPrevPin,
  onNextPin,
  navDisabled = false,
  children,
  panelRef,
}) {
  if (!pin) return null;

  return (
    <div className={`floating-panel ${placement} pin-panel`} ref={panelRef}>
      <div className="panel-top">
        <div className="panel-title">
          <div className="panel-icon">{pin.icon || "📍"}</div>
          <h3>{pin.nickname || "Unnamed pin"}</h3>
        </div>
        <div className="panel-actions">
          {reportButton}
          <button type="button" className="close-button" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
      </div>

      {children}

      {(onPrevPin || onNextPin) && (
        <div className="pin-nav-row">
          <button
            type="button"
            className="tiny-button subtle"
            onClick={onPrevPin}
            disabled={navDisabled}
          >
            Prev Pin
          </button>
          <button
            type="button"
            className="tiny-button"
            onClick={onNextPin}
            disabled={navDisabled}
          >
            Next Pin
          </button>
        </div>
      )}
    </div>
  );
}

export default PinCard;
