import { useFeedbackContext } from '../context/FeedbackContext';

/**
 * InfoPanel Component
 *
 * Information panel with welcome message, house rules, and policies.
 *
 * @param {Object} props
 * @param {boolean} props.loadingPins - Whether pins are currently loading
 * @param {number} props.approvedPinsCount - Count of approved pins on map
 * @param {string} props.pendingPinsLabel - Label for pending pins status
 * @param {string} props.pinsError - Error message if pins failed to load
 * @param {Function} props.onOpenPolicy - Callback to open policy modal (receives 'tos' or 'privacy')
 */
export function InfoPanel({
  loadingPins,
  approvedPinsCount,
  pendingPinsLabel,
  pinsError,
  onOpenPolicy,
}) {
  const { openFeedback } = useFeedbackContext();
  return (
    <div className="panel-body info-panel-body">
      <div className="panel-section">
        <div className="title-meta">
          <span className="pill">
            {loadingPins ? "Loading pins..." : `${approvedPinsCount} Pins on the map!`}
          </span>
          <span className="pill">{pendingPinsLabel}</span>
          {pinsError && <span className="pill error">Error loading pins</span>}
        </div>
        <div className="panel-stack info-panel-stack">
          <div className="panel-subsection">
            <span className="eyebrow">Welcome!</span>
            <p className="panel-copy">
              This community map lets people share a quick intro and the area they call home. Pins
              are lightly randomized for privacy, and moderators approve submissions so browsing
              stays safe and friendly.
            </p>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Create your pin</span>
            <p className="panel-copy">
              Tap the map, choose an emoji, and share a short intro. Your pin will stay hidden until
              a moderator approves your submission.
            </p>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Browse others</span>
            <p className="panel-copy">
              Select pins on the map to read their notes and see their interests and contact options.
            </p>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Filter what you see</span>
            <p className="panel-copy">
              Use the filter tool to narrow pins by gender, seeking preferences, interests, or age
              range. Reset anytime to view everyone again.
            </p>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">House rules</span>
            <ul className="panel-copy list">
              <li>You must be 18 or older to use this map.</li>
              <li>Share truthful information only about yourself and stay respectful.</li>
              <li>
                Protect your privacy - only share what you are comfortable with and be mindful of the
                randomized pin placement.
              </li>
              <li>Do not use this site for stalking, harassment, or other harm.</li>
              <li>No explicit sexual content and no advertising or soliciting paid sexual services.</li>
              <li>
                By browsing or posting, you agree to these guidelines and take responsibility for your
                own safety.
              </li>
            </ul>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Policies</span>
            <p className="panel-copy">
              Review the Terms of Service and Privacy Policy before using the site.
            </p>
            <div className="panel-button-row">
              <button type="button" className="tiny-button" onClick={() => onOpenPolicy("tos")}>
                View Terms of Service
              </button>
              <button type="button" className="tiny-button" onClick={() => onOpenPolicy("privacy")}>
                View Privacy Policy
              </button>
            </div>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Need to share feedback?</span>
            <p className="panel-copy">Send a quick note to the moderators.</p>
            <div className="panel-button-row">
              <button
                type="button"
                className="tiny-button"
                onClick={() => openFeedback("site_feedback")}
              >
                Give site feedback
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfoPanel;
