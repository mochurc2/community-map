import { X } from 'lucide-react';
import PinInfoPanel from './PinInfoPanel';

/**
 * Modal overlay shown before a pin submission is finalized.
 * Mirrors the pin info layout so users can review their entry.
 */
export function SubmitConfirmationModal({
  pin,
  open,
  submitted = false,
  submitting,
  onConfirm,
  onCancel,
  isInterestApproved,
  showContactWarning,
  errorMessage,
  successMessage,
  onBrowseLatestPin,
  browseDisabled = false,
}) {
  if (!open || !pin) return null;

  let expiryMessage = "Your pin will be deleted on the selected date.";
  if (pin.never_delete) {
    expiryMessage = "Your pin is set to never delete.";
  } else if (pin.expires_at) {
    const expiresDate = new Date(pin.expires_at);
    const readableDate = Number.isNaN(expiresDate.getTime())
      ? null
      : expiresDate.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
    expiryMessage = readableDate
      ? `Your pin will be deleted on ${readableDate}.`
      : "Your pin will be deleted on the selected date.";
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-backdrop" onClick={submitting ? undefined : onCancel} />
      <div className="confirm-card">
        <div className="panel-top">
          <div className="panel-title">
            <div className="panel-icon">{pin.icon || "📍"}</div>
            <div>
              <h3>{pin.nickname || "Unnamed pin"}</h3>
            </div>
          </div>
          <button type="button" className="close-button" onClick={onCancel} disabled={submitting}>
            <X size={22} />
          </button>
        </div>

        <div className="confirm-body">
          <div className="confirm-preview">
            <PinInfoPanel
              pin={pin}
              isInterestApproved={isInterestApproved || (() => true)}
              showAllInterests
            />
          </div>

          <p className="status warning" style={{ margin: 0 }}>
            {expiryMessage}
          </p>

          {errorMessage && <p className="status error">{errorMessage}</p>}
          {submitted && successMessage && <p className="status success">{successMessage}</p>}

          {showContactWarning && !submitted && (
            <p className="status warning" style={{ marginBottom: 0 }}>
              Submit without contact information? Other users will not be able to reach you :(
            </p>
          )}

          <div className="confirm-actions">
            {submitted && onBrowseLatestPin && (
              <button
                type="button"
                className="tiny-button"
                onClick={onBrowseLatestPin}
                disabled={browseDisabled}
              >
                Browse Pins
              </button>
            )}
            {!submitted && (
              <button type="button" className="ghost" onClick={onCancel} disabled={submitting}>
                Go back
              </button>
            )}
            <button
              type="button"
              className="primary"
              onClick={submitted ? onCancel : onConfirm}
              disabled={submitting}
            >
              {submitted ? "Close" : submitting ? "Submitting..." : "Confirm submission"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubmitConfirmationModal;
