import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { randomizeLocation, validateContactValue } from "../components/pinUtils";
import {
  normalizeLabel,
  getCanonicalBaseGender,
  isBaseGenderLabel,
  sanitizeGenderSelection,
} from "../utils/genderUtils";

const EMOJI_REGEX = /\p{Extended_Pictographic}/u;
const SAVE_SUCCESS_MESSAGE = "Your edits have been saved. Your pin is now pending review.";
const LINK_ERROR_MESSAGE = "Error: your pin has been deleted or there is a problem with your link.";

const emptyLocation = null;

const buildInitialState = () => ({
  icon: "",
  nickname: "",
  age: "",
  admin_email: "",
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
  const [locationDirty, setLocationDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [completionMessage, setCompletionMessage] = useState(null);
  const [fatalError, setFatalError] = useState(null);
  const [hasAdminEmail, setHasAdminEmail] = useState(false);
  const [initialAdminEmail, setInitialAdminEmail] = useState("");

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
      setError(LINK_ERROR_MESSAGE);
      setFatalError(LINK_ERROR_MESSAGE);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setFatalError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_pin_edit_state", {
        p_pin_id: pinId,
        p_secret_token: token,
      });
      if (rpcError) throw rpcError;
      if (!data?.pin) {
        setFatalError(LINK_ERROR_MESSAGE);
        setError(LINK_ERROR_MESSAGE);
        setLoading(false);
        return;
      }

      const pin = data.pin;
      const adminEmailValue = data.admin_email || "";
      const channels = deriveContactChannels(pin.contact_methods || {});
      setInitialPin(pin);
      setHasAdminEmail(Boolean(data.has_admin_email));
      setInitialAdminEmail(adminEmailValue);
      setForm({
        icon: pin.icon || "",
        nickname: pin.nickname || "",
        age: pin.age ? String(pin.age) : "",
        admin_email: adminEmailValue,
        genders: Array.isArray(pin.genders) ? pin.genders : [],
        seeking: Array.isArray(pin.seeking) ? pin.seeking : [],
        interest_tags: Array.isArray(pin.interest_tags) ? pin.interest_tags : [],
        note: pin.note || "",
        contact_methods: pin.contact_methods || {},
        contact_channels: channels,
        city: pin.city || "",
        state_province: pin.state_province || "",
        country: pin.country || "",
        country_code: pin.country_code || "",
        expires_at: toDateInput(pin.expires_at),
        never_delete: Boolean(pin.never_delete),
      });
      setSelectedLocation(
        typeof pin.lat === "number" && typeof pin.lng === "number"
          ? { lat: pin.lat, lng: pin.lng }
          : emptyLocation
      );
      setLocationDirty(false);
      setFatalError(null);
    } catch (err) {
      console.error(err);
      setFatalError(LINK_ERROR_MESSAGE);
      setError(LINK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [deriveContactChannels, pinId, token]);

  useEffect(() => {
    loadPin();
  }, [loadPin]);

  useEffect(() => {
    setHasCompleted(false);
    setCompletionMessage(null);
    setFatalError(null);
  }, [pinId, token]);

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

  const setLocationFromMap = useCallback(
    (lat, lng) => {
      setSelectedLocation({ lat, lng });
      setLocationDirty(true);
      setError(null);
      setSuccess(null);
      autofillLocation(lat, lng);
    },
    [autofillLocation]
  );

  const locationLabel = selectedLocation
    ? `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`
    : "None yet";

  const locationDetails = selectedLocation
    ? `${form.city || "Unknown city"}${form.state_province ? `, ${form.state_province}` : ""}${
        form.country || form.country_code ? `, ${form.country || form.country_code}` : ""
      }`
    : "Tap the map to pick a spot and fill in the details.";

  const buildPatch = (validatedContacts = null, adminEmailNormalized = null, adminEmailChanged = false) => {
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

    // contact_methods from selected channels
    const filteredContacts =
      validatedContacts ||
      (() => {
        const next = {};
        form.contact_channels.forEach((channel) => {
          const value = (form.contact_methods || {})[channel];
          if (value && value.trim() !== "") {
            next[channel] = value.trim();
          }
        });
        return next;
      })();
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
      locationDirty &&
      selectedLocation &&
      (selectedLocation.lat !== initialPin.lat || selectedLocation.lng !== initialPin.lng)
    ) {
      const randomized = randomizeLocation(selectedLocation, 500, 1500);
      patch.lat = randomized.lat;
      patch.lng = randomized.lng;
    }

    if (adminEmailChanged && adminEmailNormalized) {
      patch.__admin_email = adminEmailNormalized;
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
      const trimmedNickname = (form.nickname || "").trim();
      if (!trimmedNickname) {
        setError("Nickname is required (up to 12 characters).");
        setSubmitting(false);
        return;
      }
      if (EMOJI_REGEX.test(trimmedNickname)) {
        setError("Nicknames cannot include emoji characters.");
        setSubmitting(false);
        return;
      }

      const ageNumber = Number(form.age);
      if (!form.age || Number.isNaN(ageNumber)) {
        setError("Enter your age (numbers only).");
        setSubmitting(false);
        return;
      }
      if (ageNumber < 18 || ageNumber > 120) {
        setError("Enter an age between 18 and 120.");
        setSubmitting(false);
        return;
      }

      if (!Array.isArray(form.genders) || form.genders.length === 0) {
        setError("Select at least one gender option.");
        setSubmitting(false);
        return;
      }

      const interests = Array.isArray(form.interest_tags)
        ? form.interest_tags.filter(Boolean)
        : [];
      if (interests.length < 3) {
        setError("Select at least three interests so others can find you.");
        setSubmitting(false);
        return;
      }

      const contactChannels = Array.isArray(form.contact_channels) ? form.contact_channels : [];
      if (contactChannels.length === 0) {
        setError("Add at least one contact method.");
        setSubmitting(false);
        return;
      }
      const contactValidationErrors = {};
      const validatedContacts = {};
      contactChannels.forEach((channel) => {
        const value = (form.contact_methods || {})[channel] || "";
        const validation = validateContactValue(channel, value);
        if (!validation.valid) {
          contactValidationErrors[channel] = validation.message;
        } else if (validation.normalizedValue) {
          validatedContacts[channel] = validation.normalizedValue;
        } else if (value.trim()) {
          validatedContacts[channel] = value.trim();
        }
      });
      if (Object.keys(contactValidationErrors).length > 0) {
        const firstError = Object.values(contactValidationErrors)[0];
        setError(firstError || "Please add valid contact info before saving.");
        setSubmitting(false);
        return;
      }

      // Admin email handling
      const trimmedAdminEmail = (form.admin_email || "").trim();
      if (!hasAdminEmail && !trimmedAdminEmail) {
        setError("Add an admin email to receive your private edit/delete link.");
        setSubmitting(false);
        return;
      }
      let adminEmailNormalized = trimmedAdminEmail;
      let adminEmailChanged = false;
      if (trimmedAdminEmail) {
        const adminValidation = validateContactValue("Email", trimmedAdminEmail);
        if (!adminValidation.valid) {
          setError(adminValidation.message || "Please add a valid admin email.");
          setSubmitting(false);
          return;
        }
        adminEmailNormalized = adminValidation.normalizedValue || trimmedAdminEmail;
        adminEmailChanged = adminEmailNormalized !== (initialAdminEmail || "");
      }

      const patch = buildPatch(validatedContacts, adminEmailNormalized, adminEmailChanged);
      if (Object.keys(patch).length === 0) {
        setError("Change at least one field before saving.");
        setSubmitting(false);
        return;
      }
      const { data: updateResult, error: rpcError } = await supabase.rpc("update_pin_via_secret", {
        p_pin_id: pinId,
        p_secret_token: token,
        p_patch: patch,
        p_delete: false,
      });
      if (rpcError) throw rpcError;
      const secretRotated = Boolean(updateResult?.secret_rotated);
      if (secretRotated && adminEmailNormalized) {
        const rotationMsg = `We emailed a new private edit/delete link to ${adminEmailNormalized}. This link replaces the one you used.`;
        setSuccess(rotationMsg);
        setCompletionMessage(rotationMsg);
        setHasCompleted(true);
      } else {
        setSuccess(SAVE_SUCCESS_MESSAGE);
        setCompletionMessage(SAVE_SUCCESS_MESSAGE);
        setHasCompleted(true);
        await loadPin();
      }
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
      setCompletionMessage("Pin deleted.");
      setHasCompleted(true);
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
    setLocationFromMap,
    locationDirty,
    locationLabel,
    locationDetails,
    loading,
    error,
    success,
    submitting,
    setError,
    setSuccess,
    fatalError,
    hasCompleted,
    completionMessage,
    hasAdminEmail,
    handleChange,
    handleContactChannels,
    handleContactInput,
    handleGenderChange,
    handleEmojiSelect,
    handleSubmit,
    handleDelete,
    interestOptionsForForm,
    contactOptionList,
    initialPin,
  };
}

export default usePinEditForm;
