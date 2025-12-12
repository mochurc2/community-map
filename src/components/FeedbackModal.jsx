import { X } from 'lucide-react';
import { useFeedbackContext } from '../context/FeedbackContext';

/**
 * FeedbackModal Component
 *
 * Modal overlay for submitting site feedback or reporting pins.
 * Uses FeedbackContext for all state and handlers.
 */
export function FeedbackModal() {
  const {
    feedbackPrompt,
    feedbackMessage,
    feedbackContact,
    feedbackError,
    feedbackStatus,
    feedbackSubmitting,
    closeFeedback,
    setFeedbackMessage,
    setFeedbackContact,
    handleFeedbackSubmit,
  } = useFeedbackContext();

  if (!feedbackPrompt) return null;

  return (
    <div className="feedback-overlay" role="dialog" aria-modal="true">
      <div className="feedback-backdrop" onClick={closeFeedback} />
      <div className="feedback-card">
        <div className="panel-top" style={{ marginBottom: "0.5rem" }}>
          <div className="panel-title">
            <div className="panel-icon">💬</div>
            <h3>{feedbackPrompt.kind === "pin_report" ? "Report pin" : "Share site feedback"}</h3>
          </div>
          <button type="button" className="close-button" onClick={closeFeedback}>
            <X size={22} />
          </button>
        </div>
        <div className="panel-section" style={{ padding: 0 }}>
          {feedbackPrompt.kind === "pin_report" && feedbackPrompt.pinNickname && (
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              Reporting: <strong>{feedbackPrompt.pinNickname}</strong>
            </p>
          )}
          <form onSubmit={handleFeedbackSubmit} className="form-grid compact">
            <label className="label">
              Message *
              <textarea
                className="input"
                rows={4}
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                placeholder={
                  feedbackPrompt.kind === "pin_report"
                    ? "Describe what's wrong with this pin. This does NOT contact the pin owner. Please state if this is your pin or someone else's."
                    : "Share bugs, ideas, or anything else."
                }
              />
            </label>
            <label className="label">
              Contact info (optional)
              <input
                type="text"
                className="input"
                value={feedbackContact}
                onChange={(e) => setFeedbackContact(e.target.value)}
                placeholder="Discord @name, email, or other way to reach you"
              />
              <span className="helper-text">
                Include platform + handle if you want a moderator to follow up.
              </span>
            </label>

            {feedbackError && <p className="status error">{feedbackError}</p>}
            {feedbackStatus && <p className="status success">{feedbackStatus}</p>}

            <div className="feedback-actions">
              <button type="button" className="ghost" onClick={closeFeedback} disabled={feedbackSubmitting}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={feedbackSubmitting}>
                {feedbackSubmitting ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default FeedbackModal;
