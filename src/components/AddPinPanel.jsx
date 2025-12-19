import { CalendarClock } from 'lucide-react';
import BubbleSelector from './BubbleSelector';
import EmojiSelector from './EmojiSelector';
import { EMOJI_CHOICES } from '../constants/constants';
import { defaultExpiryDate } from '../util.js';
import { usePinFormContext } from '../context';
import { useAppContext } from '../context';

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
  Recon: "username only",
  recon: "username only",
  "recon.com": "username only",
  Signal: "+1 555 123 4567",
  Telegram: "@username or t.me/link",
  WhatsApp: "+1 555 123 4567",
  Bluesky: "@name.bsky.social",
};

/**
 * AddPinPanel Component
 *
 * Complete panel for adding a new pin with location, emoji, profile, and contact info.
 * Uses PinFormContext and AppContext to access form state and handlers.
 */
export function AddPinPanel() {
  // Get form state and handlers from context
  const {
    form,
    setForm,
    contactErrors,
    adminEmailError,
    submitMsg,
    submitError,
    hasSubmitted,
    submitting,
    selectedBaseEmoji,
    skinToneOptions,
    hasSkinToneOptions,
    locationLabel,
    locationDetails,
    interestOptionsForForm,
    handleChange,
    handleContactChannels,
    handleContactInput,
    handleGenderChange,
    handleEmojiSelect,
    handleSubmit,
    selectedLocation,
  } = usePinFormContext();

  // Get app-level state from context
  const {
    bubbleOptions,
    handleCustomOption,
    isInterestApproved,
    orderedContactOptions,
    panelPlacement,
    showFullAddForm,
    setShowFullAddForm,
  } = useAppContext();

  const ageNumber = Number(form.age);
  const showAgeWarning =
    form.age !== "" && (Number.isNaN(ageNumber) || ageNumber < 18 || ageNumber > 120);

  const addPanelIntro = hasSubmitted ? null : (
    <div className="panel-section">
      <div className="label location-label">
        <div className="label-heading">
          <span>Location</span>
          <p className="helper-text label-helper">
            Required. We randomize your pin within 1,500 ft of this spot to help keep your exact
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
          onClick={() => setShowFullAddForm(true)}
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
        <form onSubmit={handleSubmit} className="form-grid compact">
          <EmojiSelector
            emojis={EMOJI_CHOICES}
            selectedIcon={form.icon}
            selectedBaseEmoji={selectedBaseEmoji}
            onSelect={handleEmojiSelect}
            skinToneOptions={skinToneOptions}
            hasSkinToneOptions={hasSkinToneOptions}
          />

          <label className="label">
            <div className="label-heading">
              <span>Nickname</span>
            </div>
            <p className="helper-text label-helper">Required. Up to 12 characters.</p>
            <input
              type="text"
              name="nickname"
              value={form.nickname}
              onChange={handleChange}
              className="input"
              maxLength={12}
              required
            />
          </label>

          <label className="label">
            <div className="label-heading">
              <span>Age</span>
            </div>
            <p className="helper-text label-helper">Required. Enter a number between 18 and 120.</p>
            <input
              type="number"
              name="age"
              value={form.age}
              onChange={handleChange}
              className="input"
              min={18}
              max={120}
              required
            />
            {showAgeWarning && (
              <span className="field-error">Enter an age between 18 and 120.</span>
            )}
          </label>

          <BubbleSelector
            label="Gender"
            helper="Required. Select all that apply."
            options={bubbleOptions.gender_identity}
            multiple
            value={form.genders}
            onChange={handleGenderChange}
          />

          <BubbleSelector
            label="Interested in"
            helper="Optional. Select all that apply."
            options={bubbleOptions.seeking}
            multiple
            value={form.seeking}
            onChange={(value) => setForm((f) => ({ ...f, seeking: value }))}
          />

          <BubbleSelector
            label="Interests and looking for"
            helper="Required. Select ALL that apply because interests are used for filtering and finding users. You must select at least 3 to continue."
            options={interestOptionsForForm}
            multiple
            value={form.interest_tags}
            onChange={(value) => setForm((f) => ({ ...f, interest_tags: value }))}
            onAddOption={(option) => handleCustomOption("interest_tags", option)}
            allowCustom
            prioritizeSelected
            showHiddenCount
            footnote="Custom interests are subject to moderation and may not appear until they are approved."
          />

          <label className="label">
            <div className="label-heading">
              <span>Short note</span>
            </div>
            <p className="helper-text label-helper">
              Anything you want others to know. Your note is subject to moderation.
            </p>
            <textarea
              name="note"
              value={form.note}
              onChange={handleChange}
              rows={3}
              maxLength={250}
              className="input"
            />
            <span className="helper-text">{form.note.length}/250</span>
          </label>

          <label className="label">
            <div className="label-heading">
              <span>Admin email (private)</span>
            </div>
            <p className="helper-text label-helper">
              Required. We will email you a private edit/delete link. This email is never shown on the
              map and cannot be changed later, so use one you can access.
            </p>
            <input
              type="email"
              name="admin_email"
              value={form.admin_email}
              onChange={handleChange}
              className="input"
              required
            />
            {adminEmailError && <span className="field-error">{adminEmailError}</span>}
          </label>

          <div className="contact-section">
            <BubbleSelector
              label="Contact info"
              helper="You must provide at least one contact method."
              options={orderedContactOptions}
              multiple
              value={form.contact_channels}
              onChange={handleContactChannels}
              showHiddenCount
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
                        onChange={(e) => handleContactInput(channel, e.target.value)}
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
              <p className="helper-text label-helper">
                We will remove at 11:59 PM on that date. The default is in one year. This feature is
                great for trips to another city.
              </p>
              <div className="input-with-icon">
                <CalendarClock size={18} />
                <input
                  type="date"
                  className="input"
                  value={form.expires_at}
                  disabled={form.never_delete}
                  onChange={(e) =>
                    setForm((prev) => ({
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
                  setForm((prev) => ({
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
          <p className="helper-text label-helper">
            You will get a private link by email to edit or delete your pin later. Keep it safe.
          </p>

          <button type="submit" disabled={submitting} className="primary">
            {submitting ? "Submitting…" : "Submit pin for review"}
          </button>
        </form>
      )}
    </div>
  );
}

export default AddPinPanel;
