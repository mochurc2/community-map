import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { randomizeLocation, validateContactValue } from '../components/pinUtils';
import { defaultExpiryDate } from '../util';
import {
  normalizeLabel,
  getCanonicalBaseGender,
  isBaseGenderLabel,
  isTransLabel,
  sanitizeGenderSelection,
} from '../utils/genderUtils';
import { SKIN_TONE_GROUPS } from '../constants/constants';

const getBaseEmoji = (emoji) => {
  if (!emoji) return "";
  return (
    Object.entries(SKIN_TONE_GROUPS).find(([, variants]) => variants.includes(emoji))?.[0] ||
    emoji
  );
};

const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

const buildInitialFormState = () => ({
  icon: "",
  nickname: "",
  age: "",
  genders: [],
  seeking: [],
  interest_tags: [],
  note: "",
  contact_methods: {},
  contact_channels: [],
  city: "",
  state_province: "",
  country: "",
  country_code: "",
  expires_at: defaultExpiryDate(),
  never_delete: false,
});

/**
 * Hook to manage pin form state, validation, and submission
 */
export function usePinForm({
  selectedLocation,
  setSelectedLocation,
  refreshPendingPins,
  orderedInterestOptions,
  customInterestOptions,
  interestPopularity,
}) {
  const [form, setForm] = useState(buildInitialFormState);
  const [contactErrors, setContactErrors] = useState({});
  const [submitMsg, setSubmitMsg] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

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

  const handleGenderChange = (next) => {
    setForm((prev) => ({
      ...prev,
      genders: sanitizeGenderSelection(next),
    }));
  };

  const handleEmojiSelect = (emoji) => {
    setForm((prev) => ({ ...prev, icon: emoji }));
  };

  const autofillLocation = useCallback(async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "community-map/1.0",
          },
        }
      );
      if (!response.ok) return;
      const data = await response.json();
      const cityCandidate =
        data?.address?.city ||
        data?.address?.town ||
        data?.address?.village ||
        data?.address?.hamlet ||
        data?.address?.county ||
        "";
      const countryCandidate = data?.address?.country || "";
      const countryCode = data?.address?.country_code
        ? data.address.country_code.toUpperCase()
        : "";

      const regionIso =
        data?.address?.state_code ||
        data?.address?.["ISO3166-2-lvl4"] ||
        data?.address?.["ISO3166-2-lvl6"] ||
        "";
      const regionName =
        data?.address?.state ||
        data?.address?.region ||
        data?.address?.province ||
        data?.address?.county ||
        "";
      const regionAbbr = regionIso ? regionIso.split("-").pop() : "";
      const region = regionAbbr || regionName;

      setForm((prev) => ({
        ...prev,
        city: cityCandidate || prev.city,
        state_province: region || prev.state_province,
        country: countryCode || countryCandidate || prev.country,
        country_code: countryCode || prev.country_code,
      }));
    } catch (err) {
      console.error("Error reverse geocoding", err);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitMsg(null);

    if (!selectedLocation) {
      setSubmitError("Click on the map to choose a location first.");
      return;
    }

    if (!form.icon) {
      setSubmitError("Please pick an icon for your pin.");
      return;
    }

    const trimmedNickname = form.nickname.trim();
    if (!trimmedNickname) {
      setSubmitError("Add a nickname so others can recognize your pin.");
      return;
    }
    if (EMOJI_REGEX.test(trimmedNickname)) {
      setSubmitError("Nicknames cannot include emoji characters.");
      return;
    }

    const ageNumber = Number(form.age);
    if (!form.age || Number.isNaN(ageNumber)) {
      setSubmitError("Enter your age (numbers only).");
      return;
    }

    if (ageNumber < 18 || ageNumber > 120) {
      setSubmitError("Enter an age between 18 and 120.");
      return;
    }

    if (form.genders.length === 0) {
      setSubmitError("Select at least one gender option.");
      return;
    }

    if (!Array.isArray(form.interest_tags) || form.interest_tags.length < 3) {
      setSubmitError("Select at least three interests so others can find you.");
      return;
    }

    const hasTransSelection = form.genders.some(isTransLabel);
    const baseGenderSelection = form.genders.find(isBaseGenderLabel);
    if (hasTransSelection && !baseGenderSelection) {
      setSubmitError("Select Man, Woman, or Non-binary in addition to Trans.");
      return;
    }

    const contactValidationErrors = {};
    const contactPayload = {};
    form.contact_channels.forEach((channel) => {
      const value = form.contact_methods[channel];
      const validation = validateContactValue(channel, value);
      if (!validation.valid) {
        contactValidationErrors[channel] = validation.message;
      } else if (validation.normalizedValue) {
        contactPayload[channel] = validation.normalizedValue;
      }
    });

    if (Object.keys(contactValidationErrors).length > 0) {
      setContactErrors(contactValidationErrors);
      setSubmitError("Please fix the highlighted contact info before submitting.");
      return;
    }

    setContactErrors({});

    const expiresAt = form.never_delete || !form.expires_at
      ? null
      : new Date(`${form.expires_at}T23:59:00`);

    const isoCountry = (form.country || form.country_code || "").trim().toUpperCase();

    const primaryGender = getCanonicalBaseGender(baseGenderSelection) || form.genders[0] || "unspecified";

    const submissionPayload = {
      city: form.city || null,
      state_province: form.state_province || null,
      country: isoCountry || null,
      country_code: isoCountry || null,
      icon: form.icon || "📍",
      nickname: trimmedNickname,
      age: ageNumber,
      genders: form.genders,
      gender_identity: primaryGender,
      seeking: form.seeking,
      interest_tags: form.interest_tags,
      note: form.note || null,
      contact_methods: contactPayload,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      never_delete: Boolean(form.never_delete),
      status: "pending",
      approved: false,
    };

    const previewPin = {
      ...submissionPayload,
      contact_methods: contactPayload,
    };

    setPendingSubmission({
      previewPin,
      submissionPayload,
      location: selectedLocation,
      hasContactInfo: Object.keys(contactPayload).length > 0,
    });
  };

  const cancelConfirmation = () => {
    setPendingSubmission(null);
  };

  const confirmSubmission = async () => {
    if (!pendingSubmission) return;
    if (!pendingSubmission.location) {
      setSubmitError("Click on the map to choose a location first.");
      setPendingSubmission(null);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitMsg(null);

    try {
      const randomizedLocation = randomizeLocation(pendingSubmission.location, 500, 1500);

      const { error } = await supabase.from("pins").insert({
        ...pendingSubmission.submissionPayload,
        lat: randomizedLocation.lat,
        lng: randomizedLocation.lng,
      });

      if (error) {
        console.error(error);
        if (error.message?.includes("age")) {
          setSubmitError(
            "The Supabase schema is missing the 'age' column. Please run the latest SQL in supabase/schema.sql to update your database."
          );
        } else {
          setSubmitError(error.message);
        }
        return;
      }

      setSubmitMsg("Thanks! Your pin has been submitted for review. Please only submit one pin at a time.");
      setForm(buildInitialFormState());
      setContactErrors({});
      setHasSubmitted(true);
      setSelectedLocation(null);
      refreshPendingPins();
      setPendingSubmission((prev) => (prev ? { ...prev, submitted: true } : prev));
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || "Failed to submit your pin. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Computed form values
  const selectedBaseEmoji = useMemo(() => getBaseEmoji(form.icon), [form.icon]);
  const skinToneOptions = SKIN_TONE_GROUPS[selectedBaseEmoji];
  const hasSkinToneOptions = Boolean(skinToneOptions?.length > 1);

  const locationLabel = selectedLocation
    ? `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`
    : "None yet";

  const locationDetails = selectedLocation
    ? `${form.city || "Unknown city"}${form.state_province ? `, ${form.state_province}` : ""}${
        form.country || form.country_code ? `, ${form.country || form.country_code}` : ""
      }`
    : "Tap the map to pick a spot and fill in the details.";

  // Order interest options for form (prioritize selected)
  const interestOptionsForForm = useMemo(() => {
    const selected = Array.isArray(form.interest_tags) ? form.interest_tags : [];
    const selectedNormalized = new Set(selected.map((label) => normalizeLabel(label)));
    const combined = [...selected, ...orderedInterestOptions, ...customInterestOptions];
    const seen = new Set();

    const deduped = combined.filter((label) => {
      const key = normalizeLabel(label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.sort((a, b) => {
      const aKey = normalizeLabel(a);
      const bKey = normalizeLabel(b);
      const aSelected = selectedNormalized.has(aKey);
      const bSelected = selectedNormalized.has(bKey);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      const countA = interestPopularity.get(aKey) || 0;
      const countB = interestPopularity.get(bKey) || 0;
      if (countA !== countB) return countB - countA;
      return a.localeCompare(b);
    });
  }, [customInterestOptions, form.interest_tags, interestPopularity, orderedInterestOptions]);

  return {
    form,
    setForm,
    contactErrors,
    submitMsg,
    submitError,
    setSubmitMsg,
    setSubmitError,
    hasSubmitted,
    submitting,
    pendingSubmission,
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
    confirmSubmission,
    cancelConfirmation,
    autofillLocation,
  };
}

export default usePinForm;
