import { X } from 'lucide-react';

/**
 * FeedbackModal Component
 *
 * Modal overlay for submitting site feedback or reporting pins.
 *
 * @param {Object} props
 * @param {Object} props.prompt - Feedback prompt with kind and optional pinNickname
 * @param {string} props.message - Feedback message text
 * @param {string} props.contact - Optional contact info
 * @param {string} props.error - Error message to display
 * @param {string} props.status - Success status message
 * @param {boolean} props.submitting - Whether form is submitting
 * @param {Function} props.onClose - Callback to close modal
 * @param {Function} props.onMessageChange - Message change handler
 * @param {Function} props.onContactChange - Contact change handler
 * @param {Function} props.onSubmit - Form submit handler
 */
export function FeedbackModal({
  prompt,
  message,
  contact,
  error,
  status,
  submitting,
  onClose,
  onMessageChange,
  onContactChange,
  onSubmit,
}) {
  if (!prompt) return null;

  return (
    <div className="feedback-overlay" role="dialog" aria-modal="true">
      <div className="feedback-backdrop" onClick={onClose} />
      <div className="feedback-card">
        <div className="panel-top" style={{ marginBottom: "0.5rem" }}>
          <div className="panel-title">
            <div className="panel-icon">💬</div>
            <h3>{prompt.kind === "pin_report" ? "Report pin" : "Share site feedback"}</h3>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        <div className="panel-section" style={{ padding: 0 }}>
          {prompt.kind === "pin_report" && prompt.pinNickname && (
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              Reporting: <strong>{prompt.pinNickname}</strong>
            </p>
          )}
          <form onSubmit={onSubmit} className="form-grid compact">
            <label className="label">
              Message *
              <textarea
                className="input"
                rows={4}
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder={
                  prompt.kind === "pin_report"
                    ? "Describe what's wrong with this pin."
                    : "Share bugs, ideas, or anything else."
                }
              />
            </label>
            <label className="label">
              Contact info (optional)
              <input
                type="text"
                className="input"
                value={contact}
                onChange={(e) => onContactChange(e.target.value)}
                placeholder="Discord @name, email, or other way to reach you"
              />
              <span className="helper-text">
                Include platform + handle if you want a moderator to follow up.
              </span>
            </label>

            {error && <p className="status error">{error}</p>}
            {status && <p className="status success">{status}</p>}

            <div className="feedback-actions">
              <button type="button" className="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={submitting}>
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default FeedbackModal;
