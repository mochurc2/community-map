import { useFeedbackContext } from "../context";

/**
 * ReportPinButton Component
 *
 * Button to report a pin to moderators.
 * Uses FeedbackContext to open the pin report modal.
 *
 * @param {Object} props
 * @param {Object} props.pin - Pin object with id and nickname
 */
export function ReportPinButton({ pin }) {
  const { openFeedback } = useFeedbackContext();

  if (!pin?.id) return null;

  return (
    <button
      type="button"
      className="tiny-button subtle"
      onClick={() =>
        openFeedback("pin_report", {
          pinId: pin.id,
          pinNickname: pin.nickname || "Unnamed pin",
        })
      }
    >
      Report pin
    </button>
  );
}

export default ReportPinButton;
