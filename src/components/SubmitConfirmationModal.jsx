import { X } from 'lucide-react';
import PinInfoPanel from './PinInfoPanel';

/**
 * Modal overlay shown before a pin submission is finalized.
 * Mirrors the pin info layout so users can review their entry.
 */
export function SubmitConfirmationModal({
  pin,
  open,
  submitting,
  onConfirm,
  onCancel,
  isInterestApproved,
  showContactWarning,
  errorMessage,
}) {
  if (!open || !pin) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-backdrop" onClick={submitting ? undefined : onCancel} />
      <div className="confirm-card">
        <div className="panel-top">
          <div className="panel-title">
            <div className="panel-icon">{pin.icon || "📍"}</div>
            <div>
              <h3>{pin.nickname || "Unnamed pin"}</h3>
              <p className="muted" style={{ margin: 0 }}>
                Confirm your pin details before submitting for review.
              </p>
            </div>
          </div>
          <button type="button" className="close-button" onClick={onCancel} disabled={submitting}>
            <X size={22} />
          </button>
        </div>

        <div className="confirm-body">
          <p className="muted" style={{ margin: 0 }}>
            Review your info exactly as it will appear on the map.
          </p>

          <div className="confirm-preview">
            <PinInfoPanel
              pin={pin}
              isInterestApproved={isInterestApproved || (() => true)}
              showAllInterests
            />
          </div>

          {errorMessage && <p className="status error">{errorMessage}</p>}

          {showContactWarning && (
            <p className="status warning" style={{ marginBottom: 0 }}>
              Submit without contact information? Other users will not be able to reach you :(
            </p>
          )}

          <div className="confirm-actions">
            <button type="button" className="ghost" onClick={onCancel} disabled={submitting}>
              Go back
            </button>
            <button type="button" className="primary" onClick={onConfirm} disabled={submitting}>
              {submitting ? "Submitting..." : "Confirm submission"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubmitConfirmationModal;
