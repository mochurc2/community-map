import { Chip, ChipGroup } from './Chip';
import { buildContactLink, getGenderList } from './pinUtils';

/**
 * Helper to format a list of strings into a readable sentence (e.g. "A, B, and C")
 */
function formatSeekingList(list) {
  if (!list || list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

/**
 * PinInfoPanel Component
 *
 * Displays detailed information for a selected pin including age, gender,
 * location, interests, note, and contact methods.
 *
 * @param {Object} props
 * @param {Object} props.pin - The selected pin object
 * @param {Function} props.isInterestApproved - Callback to check if interest tag is approved
 * @param {boolean} [props.showAllInterests=false] - When true, bypass interest approval filter
 */
export function PinInfoPanel({ pin, isInterestApproved, showAllInterests = false }) {
  if (!pin) return null;

  const selectedSeeking = Array.isArray(pin.seeking) ? pin.seeking : [];
  const interestFilter = showAllInterests ? () => true : isInterestApproved || (() => true);
  const selectedInterestTags = Array.isArray(pin.interest_tags)
    ? pin.interest_tags.filter(interestFilter)
    : [];
  const pinContactLinks = Object.entries(pin.contact_methods || {})
    .map(([channel, value]) => buildContactLink(channel, value))
    .filter(Boolean);

  const selectedGenderList = getGenderList(pin.genders, pin.gender_identity);
  const pinLocationText = [pin.city, pin.state_province, pin.country || pin.country_code]
    .filter(Boolean)
    .join(", ");

  const genderAgeParts = [];
  if (selectedGenderList.length > 0) genderAgeParts.push(selectedGenderList.join(", "));
  if (pin.age) genderAgeParts.push(`Age ${pin.age}`);
  const genderAgeText = genderAgeParts.length > 0 ? genderAgeParts.join(", ") : "Age & gender not shared";
  const locationText = pinLocationText || "Location not shared";
  const subtitleText = `${genderAgeText} • ${locationText}`;

  return (
    <div className="panel-body pin-panel-body">
      <div className="pin-subtitle-group">
        <p className="pin-subtitle-line">{subtitleText}</p>
        {selectedSeeking.length > 0 && (
          <p className="pin-subtitle-line">
            Interested in {formatSeekingList(selectedSeeking)}
          </p>
        )}
      </div>

      {(pin.note || selectedInterestTags.length > 0) && (
        <div className="pin-section">
          <span className="eyebrow">About</span>
          {pin.note && (
            <p className="pin-note">{pin.note}</p>
          )}
          {selectedInterestTags.length > 0 && (
            <ChipGroup>
              {selectedInterestTags.map((item) => (
                <Chip key={item} variant="static">
                  {item}
                </Chip>
              ))}
            </ChipGroup>
          )}
        </div>
      )}

      {pinContactLinks.length > 0 && (
        <div className="pin-section">
          <span className="eyebrow">Contact</span>
          <ChipGroup>
            {pinContactLinks.map(({ label, href, displayText }) => (
              <Chip
                key={href ? `${label}-${href}` : `${label}-${displayText}`}
                href={href}
                variant={href ? 'default' : 'static'}
                className={href ? 'link-bubble' : ''}
              >
                {displayText || label}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      )}
    </div>
  );
}

export default PinInfoPanel;
