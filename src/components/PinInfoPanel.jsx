import { Chip, ChipGroup } from './Chip';
import { getGenderList, buildContactLink } from './pinUtils';

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
  const selectedGenderList = getGenderList(pin.genders, pin.gender_identity);
  const pinLocationText = [pin.city, pin.state_province, pin.country || pin.country_code]
    .filter(Boolean)
    .join(", ");
  const pinContactLinks = Object.entries(pin.contact_methods || {})
    .map(([channel, value]) => buildContactLink(channel, value))
    .filter(Boolean);

  return (
    <div className="panel-body pin-panel-body">
      <div className="pin-chip-row">
        {pin.age && <Chip variant="static">Age {pin.age}</Chip>}
        {selectedGenderList.map((gender) => (
          <Chip key={gender} variant="static">
            {gender}
          </Chip>
        ))}
        {!pin.age && selectedGenderList.length === 0 && (
          <Chip variant="static">No age or gender shared</Chip>
        )}
      </div>

      <div className="pin-chip-row">
        {pinLocationText ? (
          <Chip variant="static">{pinLocationText}</Chip>
        ) : (
          <Chip variant="static">Location not shared</Chip>
        )}
      </div>

      {selectedSeeking.length > 0 && (
        <div className="pin-section">
          <span className="eyebrow">Interested in</span>
          <ChipGroup>
            {selectedSeeking.map((item) => (
              <Chip key={item} variant="static">
                {item}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      )}

      {selectedInterestTags.length > 0 && (
        <div className="pin-section">
          <span className="eyebrow">Interests</span>
          <ChipGroup>
            {selectedInterestTags.map((item) => (
              <Chip key={item} variant="static">
                {item}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      )}

      {pin.note && (
        <div className="pin-section">
          <span className="eyebrow">Note</span>
          <p className="pin-note">{pin.note}</p>
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
