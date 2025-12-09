import { CalendarClock } from 'lucide-react';
import BubbleSelector from './BubbleSelector';
import EmojiSelector from './EmojiSelector';
import { EMOJI_CHOICES } from '../constants/constants';



const contactPlaceholders = {
  Email: "name@example.com",
  Discord: "username1234",
  Reddit: "u/username",
  Instagram: "@username",
  Snapchat: "@username",
  Tumblr: "username",
  "X/Twitter": "@username",
  Youtube: "Full YouTube link",
  Website: "https://example.com",
  OnlyFans: "@username",
};

const defaultExpiryDate = () => {
  const now = new Date();
  now.setFullYear(now.getFullYear() + 1);
  return now.toISOString().split("T")[0];
};

/**
 * AddPinPanel Component
 *
 * Complete panel for adding a new pin with location, emoji, profile, and contact info.
 *
 * @param {Object} props
 * @param {string} props.panelPlacement - "side" or "bottom"
 * @param {boolean} props.hasSubmitted - Whether form has been submitted
 * @param {string} props.submitMsg - Success message to display
 * @param {string} props.submitError - Error message to display
 * @param {boolean} props.showFullAddForm - Whether to show full form
 * @param {Function} props.onShowFullAddForm - Callback to show full form
 * @param {Object} props.selectedLocation - Selected map location {lat, lng}
 * @param {string} props.locationLabel - Formatted location coordinates
 * @param {string} props.locationDetails - City, state, country details
 * @param {Object} props.form - Form state object
 * @param {Function} props.onFormChange - Generic form change handler
 * @param {Function} props.onFormUpdate - Direct form setter
 * @param {string} props.selectedBaseEmoji - Base emoji (without skin tone)
 * @param {Array<string>} props.skinToneOptions - Skin tone variants for selected emoji
 * @param {boolean} props.hasSkinToneOptions - Whether skin tones available
 * @param {Function} props.onEmojiSelect - Emoji selection handler
 * @param {Object} props.bubbleOptions - Available bubble options (gender_identity, seeking)
 * @param {Function} props.onGenderChange - Gender change handler
 * @param {Array<string>} props.interestOptionsForForm - Ordered interest options
 * @param {Function} props.onCustomOption - Custom option handler
 * @param {Array<string>} props.orderedContactOptions - Ordered contact method options
 * @param {Function} props.onContactChannels - Contact channels change handler
 * @param {Function} props.onContactInput - Contact input change handler
 * @param {Object} props.contactErrors - Contact validation errors by channel
 * @param {boolean} props.submitting - Whether form is submitting
 * @param {Function} props.onSubmit - Form submit handler
 */
export function AddPinPanel({
  panelPlacement,
  hasSubmitted,
  submitMsg,
  submitError,
  showFullAddForm,
  onShowFullAddForm,
  selectedLocation,
  locationLabel,
  locationDetails,
  form,
  onFormChange,
  onFormUpdate,
  selectedBaseEmoji,
  skinToneOptions,
  hasSkinToneOptions,
  onEmojiSelect,
  bubbleOptions,
  onGenderChange,
  interestOptionsForForm,
  onCustomOption,
  orderedContactOptions,
  onContactChannels,
  onContactInput,
  contactErrors,
  submitting,
  onSubmit,
}) {
  const addPanelIntro = hasSubmitted ? null : (
    <div className="panel-section">
      <div className="label location-label">
        <div className="label-heading">
          <span>Location *</span>
          <p className="helper-text label-helper">
            We randomize your pin within 1,500 ft of this spot to help keep your exact
            location private.
          </p>
        </div>
        <div className="location-chip-row">
          <span className="location-chip">{locationLabel}</span>
          <span className="location-chip subdued">{locationDetails}</span>
        </div>
      </div>
      {panelPlacement === "bottom" && !showFullAddForm && !hasSubmitted && (
        <button
          type="button"
          className="primary"
          onClick={onShowFullAddForm}
          disabled={!selectedLocation}
        >
          Continue to form
        </button>
      )}
    </div>
  );

  return (
    <div className="panel-body">
      <div className="panel-section">
        {panelPlacement !== "bottom" && !hasSubmitted && (
          <p className="muted">
            Select location for your pin and fill out the form. All pins are subject to
            moderation before appearing on the map.
          </p>
        )}
        {addPanelIntro}
        {hasSubmitted && submitMsg && (
          <p className="status success" style={{ marginTop: "0.35rem" }}>
            {submitMsg}
          </p>
        )}
      </div>

      {showFullAddForm && !hasSubmitted && (
        <form onSubmit={onSubmit} className="form-grid compact">
          <EmojiSelector
            emojis={EMOJI_CHOICES}
            selectedIcon={form.icon}
            selectedBaseEmoji={selectedBaseEmoji}
            onSelect={onEmojiSelect}
            skinToneOptions={skinToneOptions}
            hasSkinToneOptions={hasSkinToneOptions}
          />

          <label className="label">
            Nickname *
            <input
              type="text"
              name="nickname"
              value={form.nickname}
              onChange={onFormChange}
              placeholder="Up to 12 characters"
              className="input"
              maxLength={12}
              required
            />
          </label>

          <label className="label">
            Age *
            <input
              type="number"
              name="age"
              value={form.age}
              onChange={onFormChange}
              className="input"
              min={18}
              max={120}
              required
            />
          </label>

          <BubbleSelector
            label="Gender *"
            helper="Required. Select all that apply."
            options={bubbleOptions.gender_identity}
            multiple
            value={form.genders}
            onChange={onGenderChange}
          />

          <BubbleSelector
            label="Interested in"
            helper="Select all that apply"
            options={bubbleOptions.seeking}
            multiple
            value={form.seeking}
            onChange={(value) => onFormUpdate((f) => ({ ...f, seeking: value }))}
          />

          <BubbleSelector
            label="Interests"
            helper="Select all that apply"
            options={interestOptionsForForm}
            multiple
            value={form.interest_tags}
            onChange={(value) => onFormUpdate((f) => ({ ...f, interest_tags: value }))}
            onAddOption={(option) => onCustomOption("interest_tags", option)}
            allowCustom
            prioritizeSelected
            footnote="Custom interests are subject to moderation and may not appear until they are approved."
          />

          <label className="label">
            Short note
            <textarea
              name="note"
              value={form.note}
              onChange={onFormChange}
              rows={3}
              maxLength={250}
              placeholder="Anything you want others to know."
              className="input"
            />
            <span className="helper-text">{form.note.length}/250</span>
          </label>

          <div className="contact-section">
            <BubbleSelector
              label="Contact info"
              helper="Select services to show and add your handle or link"
              options={orderedContactOptions}
              multiple
              value={form.contact_channels}
              onChange={onContactChannels}
            />

            {form.contact_channels.length > 0 && (
              <div className="contact-grid">
                {form.contact_channels.map((channel) => {
                  const contactError = contactErrors[channel];
                  return (
                    <label key={channel} className="label">
                      {channel}
                      <input
                        type="text"
                        className="input"
                        value={form.contact_methods[channel] || ""}
                        onChange={(e) => onContactInput(channel, e.target.value)}
                        placeholder={contactPlaceholders[channel] || "Add handle or link"}
                      />
                      {contactError && <span className="field-error">{contactError}</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="delete-row">
            <label className="label">
              <div className="label-heading">
                <span>Delete pin after</span>
              </div>
              <p className="helper-text label-helper">We will remove at 11:59 PM on that date.</p>
              <div className="input-with-icon">
                <CalendarClock size={18} />
                <input
                  type="date"
                  className="input"
                  value={form.expires_at}
                  disabled={form.never_delete}
                  onChange={(e) =>
                    onFormUpdate((prev) => ({
                      ...prev,
                      expires_at: e.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="checkbox-label below-date">
              <input
                type="checkbox"
                checked={form.never_delete}
                onChange={(e) =>
                  onFormUpdate((prev) => ({
                    ...prev,
                    never_delete: e.target.checked,
                    expires_at: e.target.checked
                      ? ""
                      : prev.expires_at || defaultExpiryDate(),
                  }))
                }
              />
              <span>Never delete</span>
            </label>
          </div>

          {submitError && <p className="status error">{submitError}</p>}
          {submitMsg && <p className="status success">{submitMsg}</p>}

          <button type="submit" disabled={submitting} className="primary">
            {submitting ? "Submitting…" : "Submit pin for review"}
          </button>
        </form>
      )}
    </div>
  );
}

export default AddPinPanel;
