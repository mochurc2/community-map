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
 * @param {React.ReactNode} props.children - Panel body content (typically PinInfoPanel)
 */
export function PinCard({ pin, placement, onClose, reportButton, children }) {
  if (!pin) return null;

  return (
    <div className={`floating-panel ${placement} pin-panel`}>
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
    </div>
  );
}

export default PinCard;
