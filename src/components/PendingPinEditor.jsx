import { useEffect, useMemo, useState } from "react";
import EmojiSelector from "./EmojiSelector";
import BubbleSelector from "./BubbleSelector";
import { EMOJI_CHOICES, SKIN_TONE_GROUPS } from "../constants/constants";
import { validateContactValue } from "./pinUtils";
import {
  getCanonicalBaseGender,
  isBaseGenderLabel,
  isTransLabel,
  sanitizeGenderSelection,
} from "../utils/genderUtils";
import { ensurePendingBubbleOption } from "./bubbleOptions";

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

const getBaseEmoji = (emoji) => {
  if (!emoji) return "";
  const entry = Object.entries(SKIN_TONE_GROUPS).find(([, variants]) => variants.includes(emoji));
  return entry ? entry[0] : emoji;
};

const formatDateInput = (isoDate) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const normalizeCountry = (value) => (value ? value.toString().trim().toUpperCase() : "");

const buildInitialForm = (pin) => ({
  icon: pin?.icon || "",
  nickname: pin?.nickname || "",
  age: pin?.age?.toString?.() || "",
  genders: Array.isArray(pin?.genders) ? pin.genders : pin?.genders ? [pin.genders] : [],
  seeking: Array.isArray(pin?.seeking) ? pin.seeking : [],
  interest_tags: Array.isArray(pin?.interest_tags) ? pin.interest_tags : [],
  note: pin?.note || "",
  contact_methods: pin?.contact_methods || {},
  contact_channels: Object.keys(pin?.contact_methods || {}),
  expires_at: formatDateInput(pin?.expires_at),
  never_delete: Boolean(pin?.never_delete),
  city: pin?.city || "",
  state_province: pin?.state_province || "",
  country: pin?.country || pin?.country_code || "",
  country_code: pin?.country_code || "",
});

const mergeOptions = (options, selections) => {
  const base = Array.isArray(options) ? [...options] : [];
  const values = Array.isArray(selections) ? selections : [];
  values.forEach((value) => {
    if (value && !base.includes(value)) {
      base.push(value);
    }
  });
  return base;
};

function PendingPinEditor({
  pin,
  bubbleOptions,
  statusMap,
  onSave,
  onCancel,
  saving = false,
  serverError = null,
}) {
  const [form, setForm] = useState(() => buildInitialForm(pin));
  const [error, setError] = useState(null);
  const [contactErrors, setContactErrors] = useState({});

  useEffect(() => {
    setForm(buildInitialForm(pin));
    setError(null);
    setContactErrors({});
  }, [pin]);

  const selectedBaseEmoji = useMemo(() => getBaseEmoji(form.icon), [form.icon]);
  const skinToneOptions = SKIN_TONE_GROUPS[selectedBaseEmoji] || [];
  const hasSkinToneOptions = Boolean(skinToneOptions.length > 1);

  const genderOptions = useMemo(
    () => mergeOptions(bubbleOptions?.gender_identity, form.genders),
    [bubbleOptions?.gender_identity, form.genders]
  );
  const seekingOptions = useMemo(
    () => mergeOptions(bubbleOptions?.seeking, form.seeking),
    [bubbleOptions?.seeking, form.seeking]
  );
  const interestOptions = useMemo(
    () => mergeOptions(bubbleOptions?.interest_tags, form.interest_tags),
    [bubbleOptions?.interest_tags, form.interest_tags]
  );
  const contactOptions = useMemo(
    () => mergeOptions(bubbleOptions?.contact_methods, form.contact_channels),
    [bubbleOptions?.contact_methods, form.contact_channels]
  );

  const pendingInterestNote = useMemo(() => {
    const pendingTags = (form.interest_tags || []).filter((tag) => {
      const status = statusMap?.interest_tags?.[tag?.toLowerCase?.() || ""];
      return status !== "approved";
    });
    if (pendingTags.length === 0) return "";
    return `These interests stay hidden until approved: ${pendingTags.join(", ")}`;
  }, [form.interest_tags, statusMap]);

  const handleContactChannels = (channels) => {
    setForm((prev) => {
      const nextMethods = { ...prev.contact_methods };
      Object.keys(nextMethods).forEach((key) => {
        if (!channels.includes(key)) {
          delete nextMethods[key];
        }
      });
      channels.forEach((channel) => {
        if (!nextMethods[channel]) {
          nextMethods[channel] = "";
        }
      });
      return { ...prev, contact_channels: channels, contact_methods: nextMethods };
    });
    setContactErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (!channels.includes(key)) {
          delete next[key];
        }
      });
      return next;
    });
  };

  const handleContactInput = (channel, value) => {
    setForm((prev) => ({
      ...prev,
      contact_methods: { ...prev.contact_methods, [channel]: value },
    }));

    const validation = value.trim() ? validateContactValue(channel, value) : { valid: true };
    setContactErrors((prev) => {
      const next = { ...prev };
      if (validation.valid) {
        delete next[channel];
      } else {
        next[channel] = validation.message;
      }
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!pin || pin.status !== "pending") {
      setError("Only pending pins can be edited.");
      return;
    }

    if (!form.icon) {
      setError("Pick an icon for this pin.");
      return;
    }

    const trimmedNickname = form.nickname.trim();
    if (!trimmedNickname) {
      setError("Nickname is required.");
      return;
    }
    if (trimmedNickname.length > 32) {
      setError("Nickname should stay under 32 characters.");
      return;
    }

    const ageNumber = Number(form.age);
    if (!form.age || Number.isNaN(ageNumber) || ageNumber < 18) {
      setError("Age must be 18 or older.");
      return;
    }

    const sanitizedGenders = sanitizeGenderSelection(form.genders);
    if (sanitizedGenders.length === 0) {
      setError("Add at least one gender.");
      return;
    }
    const hasTrans = sanitizedGenders.some(isTransLabel);
    const baseGender = sanitizedGenders.find(isBaseGenderLabel);
    if (hasTrans && !baseGender) {
      setError("Keep a base gender (Man, Woman, Non-binary) when selecting Trans.");
      return;
    }

    const trimmedInterests = (form.interest_tags || []).map((tag) => tag?.toString?.().trim()).filter(Boolean);

    const contactValidationErrors = {};
    const contactPayload = {};
    form.contact_channels.forEach((channel) => {
      const value = form.contact_methods[channel] || "";
      const validation = validateContactValue(channel, value);
      if (!validation.valid) {
        contactValidationErrors[channel] = validation.message;
      } else if (validation.normalizedValue) {
        contactPayload[channel] = validation.normalizedValue;
      }
    });

    if (Object.keys(contactValidationErrors).length > 0) {
      setContactErrors(contactValidationErrors);
      setError("Fix the contact info before saving.");
      return;
    }

    const expiresAtIso =
      form.never_delete || !form.expires_at
        ? null
        : new Date(`${form.expires_at}T23:59:00`).toISOString();

    try {
      await Promise.all(
        trimmedInterests.map(async (tag) => {
          const status = statusMap?.interest_tags?.[tag?.toLowerCase?.() || ""];
          if (status === "approved") return;
          await ensurePendingBubbleOption("interest_tags", tag);
        })
      );
    } catch (err) {
      console.error("Error ensuring interest bubbles", err);
    }

    const primaryGender = getCanonicalBaseGender(baseGender) || sanitizedGenders[0];
    const updatePayload = {
      icon: form.icon,
      nickname: trimmedNickname,
      age: ageNumber,
      genders: sanitizedGenders,
      gender_identity: primaryGender,
      seeking: form.seeking || [],
      interest_tags: trimmedInterests,
      note: form.note?.trim() || null,
      contact_methods: contactPayload,
      expires_at: expiresAtIso,
      never_delete: Boolean(form.never_delete),
      city: form.city?.trim() || null,
      state_province: form.state_province?.trim() || null,
      country: normalizeCountry(form.country) || null,
      country_code: normalizeCountry(form.country || form.country_code) || null,
    };

    try {
      const result = await onSave(pin.id, updatePayload);
      if (!result?.ok) {
        setError(result?.message || "Could not save changes.");
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not save changes.");
    }
  };

  return (
    <div
      style={{
        marginTop: "0.75rem",
        padding: "0.9rem 0.85rem 0.4rem",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        background: "var(--surface-raised)",
      }}
    >
      <div className="flex-between" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Editing pending pin</p>
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            Save updates directly to the pending record. Location stays unchanged.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>

      {(error || serverError) && (
        <p className="status error" style={{ marginTop: "0.75rem" }}>
          {error || serverError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="form-grid compact" style={{ marginTop: "0.6rem" }}>
        <EmojiSelector
          emojis={EMOJI_CHOICES}
          selectedIcon={form.icon}
          selectedBaseEmoji={selectedBaseEmoji}
          onSelect={(emoji) => setForm((prev) => ({ ...prev, icon: emoji }))}
          skinToneOptions={skinToneOptions}
          hasSkinToneOptions={hasSkinToneOptions}
          helper="Pick a replacement icon if needed."
        />

        <label className="label">
          Nickname *
          <input
            type="text"
            name="nickname"
            value={form.nickname}
            onChange={(e) => setForm((prev) => ({ ...prev, nickname: e.target.value }))}
            placeholder="Up to 32 characters"
            className="input"
            maxLength={32}
            required
          />
        </label>

        <label className="label">
          Age *
          <input
            type="number"
            name="age"
            value={form.age}
            onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value }))}
            className="input"
            min={18}
            max={120}
            required
          />
        </label>

        <BubbleSelector
          label="Gender *"
          helper="Required. Keep a base gender when using Trans."
          options={genderOptions}
          multiple
          value={form.genders}
          onChange={(value) => setForm((prev) => ({ ...prev, genders: value }))}
          prioritizeSelected
          alwaysShowAll
        />

        <BubbleSelector
          label="Interested in"
          helper="Optional. Update or clear selections."
          options={seekingOptions}
          multiple
          value={form.seeking}
          onChange={(value) => setForm((prev) => ({ ...prev, seeking: value }))}
          prioritizeSelected
          alwaysShowAll
        />

        <BubbleSelector
          label="Interests"
          helper="Keep approved tags; new ones are held as pending."
          options={interestOptions}
          multiple
          value={form.interest_tags}
          onChange={(value) => setForm((prev) => ({ ...prev, interest_tags: value }))}
          onAddOption={(option) =>
            setForm((prev) => ({
              ...prev,
              interest_tags: prev.interest_tags.includes(option)
                ? prev.interest_tags
                : [...prev.interest_tags, option],
            }))
          }
          allowCustom
          prioritizeSelected
          alwaysShowAll
          footnote={pendingInterestNote}
        />

        <label className="label">
          Short note
          <textarea
            name="note"
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            rows={3}
            maxLength={250}
            placeholder="Optional context"
            className="input"
          />
          <span className="helper-text">{(form.note || "").length}/250</span>
        </label>

        <div className="contact-section">
          <BubbleSelector
            label="Contact info"
            helper="Select services to keep and update handles."
            options={contactOptions}
            multiple
            value={form.contact_channels}
            onChange={handleContactChannels}
            prioritizeSelected
            alwaysShowAll
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

        <label className="label">
          City / Region (optional)
          <input
            type="text"
            className="input"
            value={form.city}
            onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
            placeholder="City"
          />
        </label>

        <label className="label">
          State / Province
          <input
            type="text"
            className="input"
            value={form.state_province}
            onChange={(e) => setForm((prev) => ({ ...prev, state_province: e.target.value }))}
            placeholder="State or province"
          />
        </label>

        <label className="label">
          Country code
          <input
            type="text"
            className="input"
            value={form.country}
            onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
            placeholder="US"
            maxLength={3}
          />
        </label>

        <div className="delete-row">
          <label className="label">
            <div className="label-heading">
              <span>Delete pin after</span>
            </div>
            <p className="helper-text label-helper">We remove at 11:59 PM on that date.</p>
            <div className="input-with-icon">
              <input
                type="date"
                className="input"
                value={form.expires_at}
                disabled={form.never_delete}
                onChange={(e) => setForm((prev) => ({ ...prev, expires_at: e.target.value }))}
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
                  expires_at: e.target.checked ? "" : prev.expires_at,
                }))
              }
            />
            <span>Never delete</span>
          </label>
        </div>

        <div className="flex-between" style={{ gridColumn: "1 / -1", marginTop: "0.2rem" }}>
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Saves keep the pin pending. Approve only after verifying details.
            </p>
          </div>
          <div className="flex-row gap-md">
            <button type="button" className="ghost-button" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default PendingPinEditor;
