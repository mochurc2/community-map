import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { randomizeLocation } from "../components/pinUtils";
import {
  normalizeLabel,
  getCanonicalBaseGender,
  isBaseGenderLabel,
  sanitizeGenderSelection,
} from "../utils/genderUtils";
import { defaultExpiryDate } from "../util";

const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

const emptyLocation = null;

const buildInitialState = () => ({
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
  expires_at: "",
  never_delete: false,
});

const toDateInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

export function usePinEditForm({ pinId, token, bubbleOptions, customInterestOptions, interestPopularity }) {
  const [form, setForm] = useState(buildInitialState);
  const [initialPin, setInitialPin] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(emptyLocation);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const contactOptionList = bubbleOptions?.contact_methods || [];

  const deriveContactChannels = useCallback(
    (methods = {}) => {
      const channels = [];
      contactOptionList.forEach((label) => {
        if (methods[label] !== undefined && methods[label] !== null && methods[label] !== "") {
          channels.push(label);
        }
      });
      // include anything else present
      Object.keys(methods || {}).forEach((key) => {
        if (!channels.includes(key)) channels.push(key);
      });
      return channels;
    },
    [contactOptionList]
  );

  const loadPin = useCallback(async () => {
    if (!pinId || !token) {
      setError("Missing pin id or token.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_pin_via_secret", {
        p_pin_id: pinId,
        p_secret_token: token,
      });
      if (rpcError) throw rpcError;
      if (!data) throw new Error("Pin not found.");

      const channels = deriveContactChannels(data.contact_methods || {});
      setInitialPin(data);
      setForm({
        icon: data.icon || "",
        nickname: data.nickname || "",
        age: data.age ? String(data.age) : "",
        genders: Array.isArray(data.genders) ? data.genders : [],
        seeking: Array.isArray(data.seeking) ? data.seeking : [],
        interest_tags: Array.isArray(data.interest_tags) ? data.interest_tags : [],
        note: data.note || "",
        contact_methods: data.contact_methods || {},
        contact_channels: channels,
        city: data.city || "",
        state_province: data.state_province || "",
        country: data.country || "",
        country_code: data.country_code || "",
        expires_at: toDateInput(data.expires_at),
        never_delete: Boolean(data.never_delete),
      });
      setSelectedLocation(
        typeof data.lat === "number" && typeof data.lng === "number"
          ? { lat: data.lat, lng: data.lng }
          : emptyLocation
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to load pin.");
    } finally {
      setLoading(false);
    }
  }, [deriveContactChannels, pinId, token]);

  useEffect(() => {
    loadPin();
  }, [loadPin]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    setError(null);
    setSuccess(null);
  };

  const handleContactChannels = (channels) => {
    setForm((prev) => {
      const nextMethods = { ...prev.contact_methods };
      Object.keys(nextMethods).forEach((key) => {
        if (!channels.includes(key)) delete nextMethods[key];
      });
      channels.forEach((channel) => {
        if (!nextMethods[channel]) nextMethods[channel] = "";
      });
      return { ...prev, contact_channels: channels, contact_methods: nextMethods };
    });
    setError(null);
    setSuccess(null);
  };

  const handleContactInput = (channel, value) => {
    setForm((prev) => ({
      ...prev,
      contact_methods: { ...prev.contact_methods, [channel]: value },
    }));
    setError(null);
    setSuccess(null);
  };

  const handleGenderChange = (next) => {
    setForm((prev) => ({
      ...prev,
      genders: sanitizeGenderSelection(next),
    }));
    setError(null);
    setSuccess(null);
  };

  const handleEmojiSelect = (emoji) => {
    setForm((prev) => ({ ...prev, icon: emoji }));
    setError(null);
    setSuccess(null);
  };

  const locationLabel = selectedLocation
    ? `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`
    : "None yet";

  const locationDetails = selectedLocation
    ? `${form.city || "Unknown city"}${form.state_province ? `, ${form.state_province}` : ""}${
        form.country || form.country_code ? `, ${form.country || form.country_code}` : ""
      }`
    : "Tap the map to pick a spot and fill in the details.";

  const buildPatch = () => {
    if (!initialPin) return {};
    const patch = {};

    const numAge = form.age ? Number(form.age) : null;
    const ageValid = !form.age || (!Number.isNaN(numAge) && numAge >= 18 && numAge <= 120);
    if (!ageValid) {
      throw new Error("Age must be a number between 18 and 120.");
    }

    const baseGender = getCanonicalBaseGender(form.genders.find(isBaseGenderLabel)) ||
      form.genders[0] ||
      initialPin.gender_identity;

    const comparer = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

    if (form.icon && form.icon !== initialPin.icon) patch.icon = form.icon;
    if (form.nickname.trim() && form.nickname !== initialPin.nickname) {
      if (EMOJI_REGEX.test(form.nickname.trim())) throw new Error("Nicknames cannot include emoji characters.");
      patch.nickname = form.nickname.trim();
    }
    if (form.age && numAge !== initialPin.age) patch.age = numAge;
    if (comparer(form.genders, initialPin.genders)) patch.genders = form.genders;
    if (baseGender && baseGender !== initialPin.gender_identity) patch.gender_identity = baseGender;
    if (comparer(form.seeking, initialPin.seeking)) patch.seeking = form.seeking;
    if (comparer(form.interest_tags, initialPin.interest_tags)) patch.interest_tags = form.interest_tags;
    if (form.note !== initialPin.note) patch.note = form.note || null;
    ["contact_discord", "contact_reddit", "contact_instagram"].forEach((field) => {
      if ((form[field] || "") !== (initialPin[field] || "")) {
        patch[field] = form[field] || null;
      }
    });

    // contact_methods from selected channels
    const filteredContacts = {};
    form.contact_channels.forEach((channel) => {
      const value = (form.contact_methods || {})[channel];
      if (value && value.trim() !== "") {
        filteredContacts[channel] = value.trim();
      }
    });
    if (comparer(filteredContacts, initialPin.contact_methods)) {
      patch.contact_methods = filteredContacts;
    }

    const isoCountry = (form.country || form.country_code || "").trim().toUpperCase();
    if (isoCountry && isoCountry !== (initialPin.country || "").toUpperCase()) {
      patch.country = isoCountry;
      patch.country_code = isoCountry;
    }
    if (form.city !== initialPin.city) patch.city = form.city || null;
    if (form.state_province !== initialPin.state_province) patch.state_province = form.state_province || null;

    if (form.never_delete !== initialPin.never_delete) patch.never_delete = Boolean(form.never_delete);
    const expiresIso = form.never_delete || !form.expires_at ? null : `${form.expires_at}T23:59:00Z`;
    if ((expiresIso || null) !== (initialPin.expires_at || null)) {
      patch.expires_at = expiresIso;
    }

    if (
      selectedLocation &&
      (selectedLocation.lat !== initialPin.lat || selectedLocation.lng !== initialPin.lng)
    ) {
      const randomized = randomizeLocation(selectedLocation, 500, 1500);
      patch.lat = randomized.lat;
      patch.lng = randomized.lng;
    }

    return patch;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pinId || !token) {
      setError("Missing pin id or token.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const patch = buildPatch();
      if (Object.keys(patch).length === 0) {
        setError("Change at least one field before saving.");
        setSubmitting(false);
        return;
      }
      const { error: rpcError } = await supabase.rpc("update_pin_via_secret", {
        p_pin_id: pinId,
        p_secret_token: token,
        p_patch: patch,
        p_delete: false,
      });
      if (rpcError) throw rpcError;
      setSuccess("Saved. Your pin is now pending review.");
      await loadPin();
    } catch (err) {
      setError(err.message || "Unable to update pin.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!pinId || !token) {
      setError("Missing pin id or token.");
      return;
    }
    if (!window.confirm("Delete this pin? This cannot be undone.")) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: rpcError } = await supabase.rpc("update_pin_via_secret", {
        p_pin_id: pinId,
        p_secret_token: token,
        p_patch: {},
        p_delete: true,
      });
      if (rpcError) throw rpcError;
      setSuccess("Pin deleted.");
    } catch (err) {
      setError(err.message || "Unable to delete pin.");
    } finally {
      setSubmitting(false);
    }
  };

  const interestOptionsForForm = useMemo(() => {
    const selected = Array.isArray(form.interest_tags) ? form.interest_tags : [];
    const selectedNormalized = new Set(selected.map((label) => normalizeLabel(label)));
    const combined = [
      ...selected,
      ...(bubbleOptions?.interest_tags || []),
      ...(customInterestOptions || []),
    ];
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
      const countA = interestPopularity?.get?.(aKey) || 0;
      const countB = interestPopularity?.get?.(bKey) || 0;
      if (countA !== countB) return countB - countA;
      return a.localeCompare(b);
    });
  }, [bubbleOptions?.interest_tags, customInterestOptions, form.interest_tags, interestPopularity]);

  return {
    form,
    setForm,
    selectedLocation,
    setSelectedLocation,
    locationLabel,
    locationDetails,
    loading,
    error,
    success,
    submitting,
    setError,
    setSuccess,
    handleChange,
    handleContactChannels,
    handleContactInput,
    handleGenderChange,
    handleEmojiSelect,
    handleSubmit,
    handleDelete,
    interestOptionsForForm,
    contactOptionList,
  };
}

export default usePinEditForm;
