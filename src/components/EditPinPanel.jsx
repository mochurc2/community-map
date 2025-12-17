import BubbleSelector from "./BubbleSelector";
import EmojiSelector from "./EmojiSelector";
import { EMOJI_CHOICES } from "../constants/constants";
import { defaultExpiryDate } from "../util";

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

export default function EditPinPanel({
  form,
  setForm,
  selectedLocation,
  locationLabel,
  locationDetails,
  bubbleOptions,
  customInterestOptions,
  contactOptionList,
  contactPopularity,
  interestOptionsForForm,
  handleChange,
  handleContactChannels,
  handleContactInput,
  handleGenderChange,
  handleEmojiSelect,
  handleSubmit,
  handleDelete,
  loading,
  submitting,
  error,
  success,
}) {
  const orderedContactOptions = contactOptionList || bubbleOptions?.contact_methods || [];

  const setSeeking = (value) => setForm((prev) => ({ ...prev, seeking: value }));
  const setInterests = (value) => setForm((prev) => ({ ...prev, interest_tags: value }));

  return (
    <div className="panel-body">
      <div className="panel-section">
        <p className="muted">Edit your pin. Changes go back to pending for moderation.</p>
        <div className="label location-label" style={{ marginTop: "0.35rem" }}>
          <div className="label-heading">
            <span>Location</span>
            <p className="helper-text label-helper">
              Tap the map to adjust. We still randomize within ~1,500 ft to keep privacy.
            </p>
          </div>
          <div className="location-chip-row">
            <span className="location-chip">{locationLabel}</span>
            <span className="location-chip subdued">{locationDetails}</span>
          </div>
        </div>
        {loading && <p className="status muted">Loading pin…</p>}
      </div>

      {!loading && (
        <form onSubmit={handleSubmit} className="form-grid compact">
          <EmojiSelector
            emojis={EMOJI_CHOICES}
            selectedIcon={form.icon}
            selectedBaseEmoji={form.icon}
            onSelect={handleEmojiSelect}
            skinToneOptions={[]}
            hasSkinToneOptions={false}
          />

          <label className="label">
            <div className="label-heading">
              <span>Nickname</span>
            </div>
            <p className="helper-text label-helper">Leave blank to keep current.</p>
            <input
              type="text"
              name="nickname"
              value={form.nickname}
              onChange={handleChange}
              className="input"
              maxLength={12}
            />
          </label>

          <label className="label">
            <div className="label-heading">
              <span>Age</span>
            </div>
            <p className="helper-text label-helper">Leave blank to keep current. 18-120 if you change it.</p>
            <input
              type="number"
              name="age"
              value={form.age}
              onChange={handleChange}
              className="input"
              min={18}
              max={120}
            />
          </label>

          <BubbleSelector
            label="Gender"
            helper="Select all that apply."
            options={bubbleOptions.gender_identity}
            multiple
            value={form.genders}
            onChange={handleGenderChange}
          />

          <BubbleSelector
            label="Interested in"
            helper="Select all that apply."
            options={bubbleOptions.seeking}
            multiple
            value={form.seeking}
            onChange={setSeeking}
          />

          <BubbleSelector
            label="Interests and looking for"
            helper="Select as many as you like."
            options={interestOptionsForForm}
            multiple
            value={form.interest_tags}
            onChange={setInterests}
            allowCustom
            prioritizeSelected
            showHiddenCount
            footnote="Custom interests are subject to moderation."
          />

          <label className="label">
            <div className="label-heading">
              <span>Short note</span>
            </div>
            <p className="helper-text label-helper">Leave blank to keep current.</p>
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

          <div className="contact-section">
            <BubbleSelector
              label="Contact info"
              helper="Select channels to edit. Leave empty to keep current."
              options={orderedContactOptions}
              multiple
              value={form.contact_channels}
              onChange={handleContactChannels}
              showHiddenCount
            />

            {form.contact_channels.length > 0 && (
              <div className="contact-grid">
                {form.contact_channels.map((channel) => (
                  <label key={channel} className="label">
                    {channel}
                    <input
                      type="text"
                      className="input"
                      value={form.contact_methods[channel] || ""}
                      onChange={(e) => handleContactInput(channel, e.target.value)}
                      placeholder={contactPlaceholders[channel] || "Add handle or link"}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="delete-row">
            <label className="label">
              <div className="label-heading">
                <span>Delete pin after</span>
              </div>
              <p className="helper-text label-helper">
                Set a new expiry. We’ll remove it at 11:59 PM that date.
              </p>
              <div className="input-with-icon">
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
                    expires_at: e.target.checked ? "" : prev.expires_at || defaultExpiryDate(),
                  }))
                }
              />
              <span>Never delete</span>
            </label>
          </div>

          {error && <p className="status error">{error}</p>}
          {success && <p className="status success">{success}</p>}
          <p className="helper-text label-helper">
            Saving will re-submit your pin for moderation.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button type="submit" disabled={submitting} className="primary">
              {submitting ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              className="danger"
              onClick={handleDelete}
              disabled={submitting}
              style={{ background: "#b00020" }}
            >
              Delete pin
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
