import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Filter, Info, Plus, Scissors, X } from "lucide-react";
import ConfigErrorNotice from "./ConfigErrorNotice";
import { supabase, supabaseConfigError } from "./supabaseClient";
import MapView from "./MapView";
import PolicyModal from "./PolicyModal";
import privacyPolicyContent from "../PrivacyPolicy.md?raw";
import termsContent from "../ToS.md?raw";
import {
  ensurePendingBubbleOption,
  fetchBubbleOptions,
  getDefaultBubbleOptions,
  getDefaultStatusMap,
} from "./bubbleOptions";
import {
  buildContactLink,
  getGenderList,
  randomizeLocation,
  validateContactValue,
} from "./pinUtils";

const MAX_VISIBLE_BUBBLES = 6;

const SKIN_TONE_GROUPS = {
  "👋": ["👋", "👋🏻", "👋🏼", "👋🏽", "👋🏾", "👋🏿"],
  "💅": ["💅", "💅🏻", "💅🏼", "💅🏽", "💅🏾", "💅🏿"],
  "👱‍♀️": ["👱‍♀️", "👱🏻‍♀️", "👱🏼‍♀️", "👱🏽‍♀️", "👱🏾‍♀️", "👱🏿‍♀️"],
  "👱‍♂️": ["👱‍♂️", "👱🏻‍♂️", "👱🏼‍♂️", "👱🏽‍♂️", "👱🏾‍♂️", "👱🏿‍♂️"],
  "👨": ["👨", "👨🏻", "👨🏼", "👨🏽", "👨🏾", "👨🏿"],
  "👩": ["👩", "👩🏻", "👩🏼", "👩🏽", "👩🏾", "👩🏿"],
  "👴": ["👴", "👴🏻", "👴🏼", "👴🏽", "👴🏾", "👴🏿"],
  "👵": ["👵", "👵🏻", "👵🏼", "👵🏽", "👵🏾", "👵🏿"],
  "👸": ["👸", "👸🏻", "👸🏼", "👸🏽", "👸🏾", "👸🏿"],
  "🤴": ["🤴", "🤴🏻", "🤴🏼", "🤴🏽", "🤴🏾", "🤴🏿"],
  "💇‍♂️": ["💇‍♂️", "💇🏻‍♂️", "💇🏼‍♂️", "💇🏽‍♂️", "💇🏾‍♂️", "💇🏿‍♂️"],
  "💇‍♀️": ["💇‍♀️", "💇🏻‍♀️", "💇🏼‍♀️", "💇🏽‍♀️", "💇🏾‍♀️", "💇🏿‍♀️"],
  "👭": ["👭", "👭🏻", "👭🏼", "👭🏽", "👭🏾", "👭🏿"],
  "👩‍🤝‍👨": ["👩‍🤝‍👨", "👩🏻‍🤝‍👨🏻", "👩🏼‍🤝‍👨🏼", "👩🏽‍🤝‍👨🏽", "👩🏾‍🤝‍👨🏾", "👩🏿‍🤝‍👨🏿"],
  "👬": ["👬", "👬🏻", "👬🏼", "👬🏽", "👬🏾", "👬🏿"],
};

const EMOJI_CHOICES = [
  "😊",
  "😅",
  "😁",
  "😉",
  "😇",
  "😘",
  "😍",
  "😋",
  "😜",
  "😏",
  "😵",
  "😎",
  "😳",
  "😈",
  "👻",
  "🤠",
  "😺",
  "😽",
  "🙈",
  "🙉",
  "🙊",
  "👽",
  "💋",
  "💦",
  "👋",
  "💅",
  "👀",
  "👅",
  "👄",
  "👱‍♀️",
  "👱‍♂️",
  "👨",
  "👩",
  "👴",
  "👵",
  "👸",
  "🤴",
  "💇‍♂️",
  "💇‍♀️",
  "👭",
  "👩‍🤝‍👨",
  "👬",
  "🐵",
  "🐺",
  "🐱",
  "🐴",
  "🐷",
  "🐖",
  "🐽",
  "🍆",
  "🍑",
  "💈",
  "🌚",
  "🌝",
  "🌞",
  "🌈",
  "🔥",
  "✨",
  "🔒",
  "⛓️",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🤎",
  "🖤",
  "🤍",
  "🪒",
  "✂️",
];

const getBaseEmoji = (emoji) => {
  if (!emoji) return "";
  return (
    Object.entries(SKIN_TONE_GROUPS).find(([, variants]) => variants.includes(emoji))?.[0] ||
    emoji
  );
};

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

const MIN_AGE = 18;
const MAX_AGE = 100;

const normalizeLabel = (label) => label?.toString().trim().toLowerCase();

const isBaseGenderLabel = (label) => {
  const normalized = normalizeLabel(label);
  return (
    normalized === "man" ||
    normalized === "men" ||
    normalized === "woman" ||
    normalized === "women" ||
    normalized === "nonbinary" ||
    normalized === "non-binary"
  );
};

const getCanonicalBaseGender = (label) => {
  const normalized = normalizeLabel(label);
  if (normalized === "man" || normalized === "men" || normalized === "male" || normalized === "m") return "Man";
  if (normalized === "woman" || normalized === "women" || normalized === "female" || normalized === "f") return "Woman";
  if (normalized === "nonbinary" || normalized === "non-binary" || normalized === "nb" || normalized === "enby") {
    return "Non-binary";
  }
  return "";
};

const isTransLabel = (label) => normalizeLabel(label)?.startsWith("trans");

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

function BubbleSelector({
  label,
  helper,
  options,
  multiple = false,
  value,
  onChange,
  allowCustom = false,
  onAddOption = () => {},
  prioritizeSelected = false,
  alwaysShowAll = false,
  footnote,
}) {
  const [userShowAll, setUserShowAll] = useState(alwaysShowAll);
  const [customInput, setCustomInput] = useState("");

  const showAll = alwaysShowAll || userShowAll;

  const selectedValues = useMemo(() => {
    if (multiple) {
      return new Set(Array.isArray(value) ? value : []);
    }
    return value ? new Set([value]) : new Set();
  }, [multiple, value]);

  const orderedOptions = useMemo(() => {
    const base = Array.isArray(options) ? [...options] : [];
    if (!prioritizeSelected) return base;

    return base.sort((a, b) => {
      const aSelected = selectedValues.has(a);
      const bSelected = selectedValues.has(b);
      if (aSelected === bSelected) return a.localeCompare(b);
      return aSelected ? -1 : 1;
    });
  }, [options, prioritizeSelected, selectedValues]);

  const displayOptions = useMemo(
    () => (showAll ? orderedOptions : orderedOptions.slice(0, MAX_VISIBLE_BUBBLES)),
    [orderedOptions, showAll]
  );

  const toggleOption = (option) => {
    if (multiple) {
      if (value.includes(option)) {
        onChange(value.filter((v) => v !== option));
      } else {
        onChange([...value, option]);
      }
    } else {
      onChange(value === option ? "" : option);
    }
  };

  const handleAddCustom = (e) => {
    e?.preventDefault?.();
    const normalized = customInput.trim();
    if (!normalized) return;
    if (multiple) {
      onChange(value.includes(normalized) ? value : [...value, normalized]);
    } else {
      onChange(normalized);
    }
    if (!options.includes(normalized)) {
      onAddOption(normalized);
    }
    setCustomInput("");
  };

  return (
    <div className="label">
      <div className="label-heading">
        <span>{label}</span>
      </div>
      {helper && <p className="helper-text label-helper">{helper}</p>}
      <div className="bubble-grid">
        {displayOptions.map((option) => (
          <button
            key={option}
            type="button"
            className={`bubble ${
              multiple
                ? value.includes(option)
                  ? "selected"
                  : ""
                : value === option
                  ? "selected"
                  : ""
            }`}
            onClick={() => toggleOption(option)}
          >
            {option}
          </button>
        ))}
        {orderedOptions.length > MAX_VISIBLE_BUBBLES && !alwaysShowAll && (
          <button
            type="button"
            className="bubble ghost"
            onClick={() => setUserShowAll((v) => !v)}
          >
            {showAll ? "Show less" : "+ more"}
          </button>
        )}
      </div>
      {allowCustom && (
        <div className="custom-row">
          <input
            type="text"
            className="input"
            placeholder="Add interest"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
          />
          <button type="button" className="bubble add" onClick={handleAddCustom}>
            +
          </button>
        </div>
      )}
      {footnote && <p className="subtle-footnote">{footnote}</p>}
    </div>
  );
}

function App() {
  if (supabaseConfigError) {
    return <ConfigErrorNotice message={supabaseConfigError.message} />;
  }

  const [pins, setPins] = useState([]);
  const [pinsError, setPinsError] = useState(null);
  const [loadingPins, setLoadingPins] = useState(true);
  const [pendingPinsCount, setPendingPinsCount] = useState(null);
  const [pendingPinsLoading, setPendingPinsLoading] = useState(true);
  const [pendingPinsError, setPendingPinsError] = useState(null);
  const [pendingPins, setPendingPins] = useState([]);

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [bubbleOptions, setBubbleOptions] = useState(getDefaultBubbleOptions);
  const [bubbleStatusMap, setBubbleStatusMap] = useState(getDefaultStatusMap);
  const [form, setForm] = useState(buildInitialFormState);
  const [contactErrors, setContactErrors] = useState({});
  const [submitMsg, setSubmitMsg] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activePanel, setActivePanel] = useState("info");
  const [panelPlacement, setPanelPlacement] = useState("side");
  const [showFullAddForm, setShowFullAddForm] = useState(false);
  const [titleCardHeight, setTitleCardHeight] = useState(0);
  const [filters, setFilters] = useState({
    genders: [],
    seeking: [],
    interest_tags: [],
    ageRange: [MIN_AGE, MAX_AGE],
  });
  const [customInterestOptions, setCustomInterestOptions] = useState([]);
  const [feedbackPrompt, setFeedbackPrompt] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const [policyModal, setPolicyModal] = useState(null);
  const titleCardRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      root.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
    };

    updateViewportHeight();

    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, []);

  const refreshPendingPins = useCallback(async () => {
    if (!supabase) return;
    setPendingPinsLoading(true);
    setPendingPinsError(null);
    try {
      const { data, error } = await supabase
        .from("pending_pin_locations")
        .select("pin_id, lat, lng");
      if (error) {
        throw error;
      }
      const sanitized = (data || [])
        .filter((pin) => typeof pin.lat === "number" && typeof pin.lng === "number")
        .map((pin) => ({
          id: pin.pin_id,
          lat: pin.lat,
          lng: pin.lng,
        }));
      setPendingPins(sanitized);
      setPendingPinsCount(sanitized.length);
    } catch (err) {
      console.error(err);
      setPendingPins([]);
      setPendingPinsError(err.message);
    } finally {
      setPendingPinsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function fetchPins() {
      setLoadingPins(true);
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("pins")
        .select(
          "id, lat, lng, city, state_province, country, country_code, icon, nickname, age, genders, gender_identity, seeking, interest_tags, note, contact_methods, expires_at, never_delete"
        )
        .eq("status", "approved")
        .or(`never_delete.eq.true,expires_at.is.null,expires_at.gt.${nowIso}`);

      if (error) {
        console.error(error);
        if (error.message?.includes("age")) {
          setPinsError(
            "The Supabase schema is missing the 'age' column. Please run the SQL in supabase/schema.sql to refresh your database."
          );
        } else {
          setPinsError(error.message);
        }
      } else {
        setPins(data || []);
      }
      setLoadingPins(false);
    }

    fetchPins();
    refreshPendingPins();
    fetchBubbleOptions()
      .then(({ options, statusMap }) => {
        setBubbleOptions(options);
        setBubbleStatusMap(statusMap);
      })
      .catch(() => {
        setBubbleOptions(getDefaultBubbleOptions());
        setBubbleStatusMap(getDefaultStatusMap());
      });
  }, [refreshPendingPins]);

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

  const handleMapClick = useCallback(
    (lngLat) => {
      if (hasSubmitted) return;

      setSelectedPin(null);
      setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
      if (!hasSubmitted) {
        setSubmitMsg(null);
      }
      setSubmitError(null);
      autofillLocation(lngLat.lat, lngLat.lng);
    },
    [autofillLocation, hasSubmitted]
  );

  const handlePinSelect = useCallback((pin) => {
    setSelectedPin(pin);
    setSelectedLocation(null);
    setActivePanel(null);
  }, []);

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

  const handleCustomOption = useCallback(async (field, option) => {
    const normalized = option.trim();
    if (!normalized) return;

    if (field === "interest_tags") {
      setCustomInterestOptions((prev) => {
        const exists = prev.some((label) => label.toLowerCase() === normalized.toLowerCase());
        return exists ? prev : [...prev, normalized];
      });

      setBubbleStatusMap((prev) => ({
        ...prev,
        interest_tags: { ...prev.interest_tags, [normalized.toLowerCase()]: "pending" },
      }));

      try {
        await ensurePendingBubbleOption(field, normalized);
      } catch (err) {
        console.error("Error saving pending bubble", err);
      }

      return;
    }

    setBubbleOptions((prev) => {
      const current = prev[field] || [];
      if (current.includes(normalized)) return prev;
      return { ...prev, [field]: [...current, normalized] };
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
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

    const ageNumber = Number(form.age);
    if (!form.age || Number.isNaN(ageNumber)) {
      setSubmitError("Enter your age (numbers only).");
      return;
    }

    if (ageNumber < 18) {
      setSubmitError("You must be 18 or older to post a pin.");
      return;
    }

    if (form.genders.length === 0) {
      setSubmitError("Select at least one gender option.");
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
    setSubmitting(true);
    setSubmitError(null);
    setSubmitMsg(null);

    const randomizedLocation = randomizeLocation(selectedLocation, 500, 1500);

    const expiresAt = form.never_delete || !form.expires_at
      ? null
      : new Date(`${form.expires_at}T23:59:00`);

    const isoCountry = (form.country || form.country_code || "").trim().toUpperCase();

    const primaryGender = getCanonicalBaseGender(baseGenderSelection) || form.genders[0] || "unspecified";

    const { error } = await supabase.from("pins").insert({
      lat: randomizedLocation.lat,
      lng: randomizedLocation.lng,
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
    } else {
      setSubmitMsg("Thanks! Your pin has been submitted for review. Please only submit one pin at a time.");
      setForm(buildInitialFormState());
      setContactErrors({});
      setHasSubmitted(true);
      setShowFullAddForm(false);
      setSelectedLocation(null);
      refreshPendingPins();
    }

    setSubmitting(false);
  };

  const handleFeedbackSubmit = async (event) => {
    event.preventDefault();
    if (!feedbackPrompt) return;

    const trimmedMessage = feedbackMessage.trim();
    if (!trimmedMessage) {
      setFeedbackError("Please add a message before sending.");
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackError(null);
    setFeedbackStatus(null);

    const payload = {
      kind: feedbackPrompt.kind,
      message: trimmedMessage,
      contact_info: feedbackContact.trim() || null,
      pin_id: feedbackPrompt.pinId || null,
      status: "open",
    };

    const { error } = await supabase.from("messages").insert(payload);

    if (error) {
      console.error(error);
      setFeedbackError(error.message);
    } else {
      setFeedbackStatus("Thanks for your note! A moderator will review it soon.");
      setFeedbackMessage("");
      setFeedbackContact("");
    }

    setFeedbackSubmitting(false);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 960px)");

    const handlePlacement = (isWideEnough) => {
      const placement = isWideEnough ? "side" : "bottom";

      setPanelPlacement((prev) => (prev === placement ? prev : placement));

      if (activePanel === "add") {
        if (!isWideEnough || hasSubmitted) {
          setShowFullAddForm(false);
        } else if (selectedLocation) {
          setShowFullAddForm(true);
        }
      }
    };

    handlePlacement(mediaQuery.matches);

    const handleChange = (event) => handlePlacement(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [activePanel, selectedLocation, hasSubmitted]);

  useEffect(() => {
    const node = titleCardRef.current;
    if (!node) return;

    const root = document.documentElement;
    const updateHeight = () => {
      const rect = node.getBoundingClientRect();
      const nextHeight = rect.height;
      setTitleCardHeight(nextHeight);
      root.style.setProperty("--title-card-height", `${nextHeight}px`);
    };

    updateHeight();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateHeight()) : null;
    resizeObserver?.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      resizeObserver?.disconnect();
    };
  }, []);

  const isInterestApproved = useCallback(
    (label) => (bubbleStatusMap.interest_tags?.[label?.toLowerCase?.() || ""] || "approved") === "approved",
    [bubbleStatusMap.interest_tags]
  );

  const filtersActive =
    filters.genders.length > 0 ||
    filters.seeking.length > 0 ||
    filters.interest_tags.length > 0 ||
    filters.ageRange[0] !== MIN_AGE ||
    filters.ageRange[1] !== MAX_AGE;

  const filteredPins = useMemo(() => {
    const matchesGenderSelection = (pin) => {
      if (filters.genders.length === 0) return true;

      const pinGenders = Array.isArray(pin.genders)
        ? pin.genders
        : pin.gender_identity
          ? [pin.gender_identity]
          : [];

      const selectedNormalized = filters.genders.map(normalizeLabel).filter(Boolean);
      const baseSelections = Array.from(
        new Set(
          selectedNormalized
            .map(getCanonicalBaseGender)
            .filter(Boolean)
            .map(normalizeLabel)
        )
      );
      const hasTransSelected = selectedNormalized.some(isTransLabel);

      const pinNormalized = pinGenders.map(normalizeLabel).filter(Boolean);
      const pinHasTrans = pinNormalized.some(isTransLabel);
      const pinBaseLabels = Array.from(
        new Set(
          pinNormalized
            .map(getCanonicalBaseGender)
            .filter(Boolean)
            .map(normalizeLabel)
        )
      );

      if (hasTransSelected && baseSelections.length === 0) {
        return pinHasTrans;
      }

      if (hasTransSelected) {
        return baseSelections.some(
          (selection) => pinHasTrans && pinBaseLabels.includes(selection)
        );
      }

      return baseSelections.some((selection) => pinBaseLabels.includes(selection));
    };

    const matchesSeekingSelection = (pin) => {
      if (filters.seeking.length === 0) return true;

      const pinSeeking = Array.isArray(pin.seeking) ? pin.seeking : [];
      const selectedNormalized = filters.seeking.map(normalizeLabel).filter(Boolean);
      const baseSelections = Array.from(
        new Set(
          selectedNormalized
            .map(getCanonicalBaseGender)
            .filter(Boolean)
            .map(normalizeLabel)
        )
      );
      const hasTransSelected = selectedNormalized.some(isTransLabel);

      const pinNormalized = pinSeeking.map(normalizeLabel).filter(Boolean);
      const pinHasTrans = pinNormalized.some(isTransLabel);
      const pinBaseLabels = Array.from(
        new Set(
          pinNormalized
            .map(getCanonicalBaseGender)
            .filter(Boolean)
            .map(normalizeLabel)
        )
      );

      if (hasTransSelected && baseSelections.length === 0) {
        return pinHasTrans;
      }

      if (hasTransSelected) {
        return baseSelections.some(
          (selection) => pinHasTrans && pinBaseLabels.includes(selection)
        );
      }

      return baseSelections.some((selection) => pinBaseLabels.includes(selection));
    };

    const matchesAgeRange = (pin) => {
      if (!pin.age) return true;
      const [minAge, maxAge] = filters.ageRange;
      const ageNumber = Number(pin.age);
      if (Number.isNaN(ageNumber)) return true;
      return ageNumber >= minAge && ageNumber <= maxAge;
    };

    const matchesInterestSelection = (pin) => {
      const approvedInterests = (pin.interest_tags || []).filter(isInterestApproved);
      return (
        filters.interest_tags.length === 0 ||
        filters.interest_tags.some((opt) => approvedInterests.includes(opt))
      );
    };

    return pins.filter(
      (pin) =>
        matchesGenderSelection(pin) &&
        matchesSeekingSelection(pin) &&
        matchesInterestSelection(pin) &&
        matchesAgeRange(pin)
    );
  }, [filters.ageRange, filters.genders, filters.interest_tags, filters.seeking, isInterestApproved, pins]);

  const visibleSelectedPin = selectedPin
    ? filteredPins.find((pin) => pin.id === selectedPin.id) || null
    : null;

  const openFeedback = (kind, details = {}) => {
    setFeedbackPrompt({ kind, ...details });
    setFeedbackMessage("");
    setFeedbackContact("");
    setFeedbackError(null);
    setFeedbackStatus(null);
  };

  const closeFeedback = () => {
    setFeedbackPrompt(null);
  };

  const openPolicy = (type) => setPolicyModal(type);
  const closePolicy = () => setPolicyModal(null);

  const togglePanel = (panel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
    if (panel === "add") {
      const shouldExpand =
        panelPlacement !== "bottom" && Boolean(selectedLocation) && !hasSubmitted;
      setShowFullAddForm(shouldExpand);
    }
  };

  const closePanel = () => setActivePanel(null);

  const sanitizeGenderSelection = (next) => {
    const incoming = Array.isArray(next) ? next : [];
    const seen = new Set();
    const uniqueNext = incoming.filter((gender) => {
      const normalized = normalizeLabel(gender);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    const baseCandidate = uniqueNext.find(isBaseGenderLabel);
    const baseLabel = baseCandidate ? getCanonicalBaseGender(baseCandidate) : "";
    const hasTrans = uniqueNext.some(isTransLabel);

    const extras = uniqueNext.filter(
      (gender) => !isBaseGenderLabel(gender) && !isTransLabel(gender)
    );

    const sanitized = [];
    if (baseLabel) sanitized.push(baseLabel);
    if (hasTrans) sanitized.push("Trans");
    sanitized.push(...extras);
    return sanitized;
  };

  const handleGenderChange = (next) => {
    setForm((prev) => ({
      ...prev,
      genders: sanitizeGenderSelection(next),
    }));
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleEmojiSelect = (emoji) => {
    setForm((prev) => ({ ...prev, icon: emoji }));
  };

  const handleAgeRangeChange = (index, value) => {
    setFilters((prev) => {
      const numericValue = Number(value);
      const nextRange = [...prev.ageRange];
      if (index === 0) {
        nextRange[0] = Math.min(numericValue, nextRange[1]);
      } else {
        nextRange[1] = Math.max(numericValue, nextRange[0]);
      }
      return { ...prev, ageRange: nextRange };
    });
  };

  const clearFilters = () =>
    setFilters({ genders: [], seeking: [], interest_tags: [], ageRange: [MIN_AGE, MAX_AGE] });

  const ageRangeStyle = useMemo(() => {
    const [minAge, maxAge] = filters.ageRange;
    const startPercent = ((minAge - MIN_AGE) / (MAX_AGE - MIN_AGE)) * 100;
    const endPercent = ((maxAge - MIN_AGE) / (MAX_AGE - MIN_AGE)) * 100;
    return {
      background: `linear-gradient(to right, #e5e7eb ${startPercent}%, #2563eb ${startPercent}%, #2563eb ${endPercent}%, #e5e7eb ${endPercent}%)`,
    };
  }, [filters.ageRange]);

  const interestPopularity = useMemo(() => {
    const counts = new Map();
    pins.forEach((pin) => {
      (pin.interest_tags || []).forEach((tag) => {
        const normalized = normalizeLabel(tag);
        if (!normalized) return;
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
    });
    return counts;
  }, [pins]);

  const orderedInterestOptions = useMemo(() => {
    const uniqueOptions = Array.from(new Set(bubbleOptions.interest_tags || []));
    return uniqueOptions.sort((a, b) => {
      const countA = interestPopularity.get(normalizeLabel(a)) || 0;
      const countB = interestPopularity.get(normalizeLabel(b)) || 0;
      if (countA !== countB) return countB - countA;
      return a.localeCompare(b);
    });
  }, [bubbleOptions.interest_tags, interestPopularity]);

  const contactPopularity = useMemo(() => {
    const counts = new Map();
    pins.forEach((pin) => {
      Object.entries(pin.contact_methods || {}).forEach(([channel, value]) => {
        if (!value) return;
        const normalized = normalizeLabel(channel);
        if (!normalized) return;
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
    });
    return counts;
  }, [pins]);

  const orderedContactOptions = useMemo(() => {
    const uniqueOptions = Array.from(new Set(bubbleOptions.contact_methods || []));
    return uniqueOptions.sort((a, b) => {
      const countA = contactPopularity.get(normalizeLabel(a)) || 0;
      const countB = contactPopularity.get(normalizeLabel(b)) || 0;
      if (countA !== countB) return countB - countA;
      return a.localeCompare(b);
    });
  }, [bubbleOptions.contact_methods, contactPopularity]);

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

  const selectedBaseEmoji = useMemo(() => getBaseEmoji(form.icon), [form.icon]);
  const skinToneOptions = SKIN_TONE_GROUPS[selectedBaseEmoji];
  const hasSkinToneOptions = Boolean(skinToneOptions?.length > 1);

  const approvedPinsCount = pins.length;
  const pendingPinsLabel = pendingPinsLoading
    ? "Loading pending pins..."
    : pendingPinsError
      ? "Pending count unavailable"
      : `${typeof pendingPinsCount === "number" ? pendingPinsCount : 0} Pins pending!`;
  const locationLabel = selectedLocation
    ? `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`
    : "None yet";
  const locationDetails = selectedLocation
    ? `${form.city || "Unknown city"}${form.state_province ? `, ${form.state_province}` : ""}${
        form.country || form.country_code ? `, ${form.country || form.country_code}` : ""
      }`
    : "Tap the map to pick a spot and fill in the details.";

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
          onClick={() => setShowFullAddForm(true)}
          disabled={!selectedLocation}
        >
          Continue to form
        </button>
      )}
    </div>
  );

  const infoPanel = (
    <div className="panel-body info-panel-body">
      <div className="panel-section">
        <div className="title-meta">
          <span className="pill">
            {loadingPins ? "Loading pins..." : `${approvedPinsCount} Pins on the map!`}
          </span>
          <span className="pill">{pendingPinsLabel}</span>
          {pinsError && <span className="pill error">Error loading pins</span>}
        </div>
        <div className="panel-stack info-panel-stack">
          <div className="panel-subsection">
            <span className="eyebrow">Welcome!</span>
            <p className="panel-copy">
              This community map lets people share a quick intro and the area they call home. Pins
              are lightly randomized for privacy, and moderators approve submissions so browsing
              stays safe and friendly.
            </p>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Create your pin</span>
            <p className="panel-copy">
              Tap the map, choose an emoji, and share a short intro. Your pin will stay hidden until
              a moderator approves your submission.
            </p>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Browse others</span>
            <p className="panel-copy">
              Select pins on the map to read their notes and see their interests and contact options.
            </p>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Filter what you see</span>
            <p className="panel-copy">
              Use the filter tool to narrow pins by gender, seeking preferences, interests, or age
              range. Reset anytime to view everyone again.
            </p>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">House rules</span>
            <ul className="panel-copy list">
              <li>You must be 18 or older to use this map.</li>
              <li>Share truthful information only about yourself and stay respectful.</li>
              <li>
                Protect your privacy - only share what you are comfortable with and be mindful of the
                randomized pin placement.
              </li>
              <li>Do not use this site for stalking, harassment, or other harm.</li>
              <li>No explicit sexual content and no advertising or soliciting paid sexual services.</li>
              <li>
                By browsing or posting, you agree to these guidelines and take responsibility for your
                own safety.
              </li>
            </ul>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Policies</span>
            <p className="panel-copy">
              Review the Terms of Service and Privacy Policy before using the site.
            </p>
            <div className="panel-button-row">
              <button type="button" className="tiny-button" onClick={() => openPolicy("tos")}>
                View Terms of Service
              </button>
              <button type="button" className="tiny-button" onClick={() => openPolicy("privacy")}>
                View Privacy Policy
              </button>
            </div>
          </div>
          <div className="panel-subsection">
            <span className="eyebrow">Need to share feedback?</span>
            <p className="panel-copy">Send a quick note to the moderators.</p>
            <div className="panel-button-row">
              <button
                type="button"
                className="tiny-button"
                onClick={() => openFeedback("site_feedback")}
              >
                Give site feedback
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const addPanel = (
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
          <div className="label">
            <div className="label-heading">
              <span>Icon *</span>
            </div>
            <p className="helper-text label-helper">Required. Pick an emoji for your pin.</p>
            <div className="emoji-scroll" role="listbox" aria-label="Pick an emoji">
              <div className="emoji-grid">
                {EMOJI_CHOICES.map((emoji) => {
                  const isSelected = selectedBaseEmoji === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`emoji-chip ${isSelected ? "selected" : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => handleEmojiSelect(emoji)}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
            {hasSkinToneOptions && (
              <div className="emoji-tone-panel">
                <p className="helper-text label-helper">Choose a skin tone.</p>
                <div className="emoji-scroll" role="listbox" aria-label="Pick a skin tone">
                  <div className="emoji-grid">
                    {skinToneOptions.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`emoji-chip ${form.icon === emoji ? "selected" : ""}`}
                        aria-pressed={form.icon === emoji}
                        onClick={() => handleEmojiSelect(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <label className="label">
            Nickname *
            <input
              type="text"
              name="nickname"
              value={form.nickname}
              onChange={handleChange}
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
              onChange={handleChange}
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
            onChange={handleGenderChange}
          />

          <BubbleSelector
            label="Interested in"
            helper="Select all that apply"
            options={bubbleOptions.seeking}
            multiple
            value={form.seeking}
            onChange={(value) => setForm((f) => ({ ...f, seeking: value }))}
          />

          <BubbleSelector
            label="Interests"
            helper="Select all that apply"
            options={interestOptionsForForm}
            multiple
            value={form.interest_tags}
          onChange={(value) => setForm((f) => ({ ...f, interest_tags: value }))}
          onAddOption={(option) => handleCustomOption("interest_tags", option)}
          allowCustom
          prioritizeSelected
          footnote="Custom interests are subject to moderation and may not appear until they are approved."
        />

          <label className="label">
            Short note
            <textarea
              name="note"
              value={form.note}
              onChange={handleChange}
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
              onChange={handleContactChannels}
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
              <p className="helper-text label-helper">We will remove at 11:59 PM on that date.</p>
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
          {submitMsg && <p className="status success">{submitMsg}</p>}

          <button type="submit" disabled={submitting} className="primary">
            {submitting ? "Submitting…" : "Submit pin for review"}
          </button>
        </form>
      )}
    </div>
  );

  const filterPanel = (
    <div className="panel-body">
      <div className="panel-section">
        <p className="muted">Narrow down visible pins by selecting the traits below.</p>
      </div>
      <div className="form-grid compact">
        <BubbleSelector
          label="Gender"
          options={bubbleOptions.gender_identity}
          multiple
          value={filters.genders}
          onChange={(value) => handleFilterChange("genders", value)}
        />
        <BubbleSelector
          label="Interested in"
          options={bubbleOptions.seeking}
          multiple
          value={filters.seeking}
          onChange={(value) => handleFilterChange("seeking", value)}
        />
        <div className="label age-filter">
          <div className="label-heading">
            <span>Age range</span>
            <span className="helper-text label-helper">{filters.ageRange[0]}–{filters.ageRange[1]}</span>
          </div>
          <div className="age-range-slider">
            <div className="age-range-track" style={ageRangeStyle} aria-hidden="true" />
            <input
              type="range"
              min={MIN_AGE}
              max={MAX_AGE}
              value={filters.ageRange[0]}
              onChange={(e) => handleAgeRangeChange(0, e.target.value)}
            />
            <input
              type="range"
              min={MIN_AGE}
              max={MAX_AGE}
              value={filters.ageRange[1]}
              className="upper-thumb"
              onChange={(e) => handleAgeRangeChange(1, e.target.value)}
            />
          </div>
        </div>
        <BubbleSelector
          label="Interests"
          options={orderedInterestOptions}
          multiple
          value={filters.interest_tags}
          onChange={(value) => handleFilterChange("interest_tags", value)}
        />
        <div className="filter-actions">
          <button type="button" className="ghost" onClick={clearFilters}>
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );

  const panelTitle =
    activePanel === "info"
      ? { icon: <Info />, label: "About this map" }
      : activePanel === "add"
        ? { icon: <Plus />, label: "Add your pin" }
        : { icon: <Filter />, label: "Filter pins" };

  const isCompactAdd = panelPlacement === "bottom";

  const selectedSeeking = Array.isArray(visibleSelectedPin?.seeking)
    ? visibleSelectedPin.seeking
    : [];
  const selectedInterestTags = Array.isArray(visibleSelectedPin?.interest_tags)
    ? visibleSelectedPin.interest_tags.filter(isInterestApproved)
    : [];
  const selectedGenderList = visibleSelectedPin
    ? getGenderList(visibleSelectedPin.genders, visibleSelectedPin.gender_identity)
    : [];
  const pinLocationText = visibleSelectedPin
    ? [
        visibleSelectedPin.city,
        visibleSelectedPin.state_province,
        visibleSelectedPin.country || visibleSelectedPin.country_code,
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const pinContactLinks = visibleSelectedPin
    ? Object.entries(visibleSelectedPin.contact_methods || {})
      .map(([channel, value]) => buildContactLink(channel, value))
      .filter(Boolean)
    : [];
  const policyTitle = policyModal === "tos" ? "Terms of Service" : "Privacy Policy";
  const policyContent = policyModal === "tos" ? termsContent : privacyPolicyContent;

  const reportPinButton =
    visibleSelectedPin && visibleSelectedPin.id
      ? (
          <button
            type="button"
            className="tiny-button subtle"
            onClick={() =>
              openFeedback("pin_report", {
                pinId: visibleSelectedPin.id,
                pinNickname: visibleSelectedPin.nickname || "Unnamed pin",
              })
            }
          >
            Report pin
          </button>
        )
      : null;

  const pinInfoPanel =
    visibleSelectedPin && (
      <div className="panel-body pin-panel-body">
        <div className="pin-chip-row top-row">
          {visibleSelectedPin.age && (
            <span className="bubble static">Age {visibleSelectedPin.age}</span>
          )}
          {selectedGenderList.map((gender) => (
            <span key={gender} className="bubble static">
              {gender}
            </span>
          ))}
          {!visibleSelectedPin.age && selectedGenderList.length === 0 && (
            <span className="bubble static">No age or gender shared</span>
          )}
        </div>

        <div className="pin-chip-row">
          {pinLocationText ? (
            <span className="bubble static">{pinLocationText}</span>
          ) : (
            <span className="bubble static">Location not shared</span>
          )}
        </div>

        {selectedSeeking.length > 0 && (
          <div className="pin-section">
            <span className="eyebrow">Interested in</span>
            <div className="bubble-row">
              {selectedSeeking.map((item) => (
                <span key={item} className="bubble static">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {selectedInterestTags.length > 0 && (
          <div className="pin-section">
            <span className="eyebrow">Interests</span>
            <div className="bubble-row">
              {selectedInterestTags.map((item) => (
                <span key={item} className="bubble static">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {visibleSelectedPin.note && (
          <div className="pin-section">
            <span className="eyebrow">Note</span>
            <p className="pin-note">{visibleSelectedPin.note}</p>
          </div>
        )}

        {pinContactLinks.length > 0 && (
          <div className="pin-section">
            <span className="eyebrow">Contact</span>
            <div className="bubble-row">
              {pinContactLinks.map(({ label, href, displayText }) => (
                href ? (
                  <a
                    key={`${label}-${href}`}
                    className="bubble link-bubble"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {displayText || label}
                  </a>
                ) : (
                  <span key={`${label}-${displayText}`} className="bubble static">
                    {displayText || label}
                  </span>
                )
              ))}
            </div>
          </div>
        )}
      </div>
    );

  return (
    <div className="app-shell">
      <MapView
        pins={filteredPins}
        pendingPins={pendingPins}
        onMapClick={handleMapClick}
        onPinSelect={handlePinSelect}
        pendingLocation={!hasSubmitted && activePanel === "add" ? selectedLocation : null}
        pendingIcon={!hasSubmitted && activePanel === "add" ? form.icon : null}
        selectedPinId={visibleSelectedPin?.id}
        enableAddMode={activePanel === "add" && !hasSubmitted}
      />

      <div className="overlay-rail">
        <div className="title-card" ref={titleCardRef}>
          <div className="title-row">
            <Scissors className="title-icon" aria-hidden />
            <div className="title-text">
              <h1>The Hair Fetish Map</h1>
            </div>
          </div>

          <div className="title-actions">
            <button
              type="button"
              className={`icon-pill ${activePanel === "info" ? "active" : ""}`}
              onClick={() => togglePanel("info")}
            >
              <Info size={18} />
              <span>Info</span>
            </button>
            <button
              type="button"
              className={`icon-pill ${activePanel === "add" ? "active" : ""}`}
              onClick={() => togglePanel("add")}
            >
              <Plus size={18} />
              <span>Add pin</span>
            </button>
            <button
              type="button"
              className={`icon-pill ${activePanel === "filter" ? "active" : ""}`}
              onClick={() => togglePanel("filter")}
            >
              <Filter size={18} />
              <span>Filter</span>
            </button>
          </div>
        </div>

        {activePanel && panelPlacement === "side" && (
          <div
            className={`floating-panel ${panelPlacement} ${
              activePanel === "add" && showFullAddForm ? "expanded" : ""
            }`}
          >
            <div className="panel-top">
              <div className="panel-title">
                <div className="panel-icon">{panelTitle.icon}</div>
                <h3>{panelTitle.label}</h3>
              </div>
              <button type="button" className="close-button" onClick={closePanel}>
                <X size={24} />
              </button>
            </div>

              {activePanel === "info" && infoPanel}
              {activePanel === "add" && (
                <div className="panel-body-wrapper">{addPanel}</div>
              )}
              {activePanel === "filter" && filterPanel}
          </div>
        )}

        {panelPlacement === "side" && visibleSelectedPin && (
          <div className="floating-panel side pin-panel">
            <div className="panel-top">
              <div className="panel-title">
                <div className="panel-icon">{visibleSelectedPin.icon || "📍"}</div>
                <h3>{visibleSelectedPin.nickname || "Unnamed pin"}</h3>
              </div>
              <div className="panel-actions">
                {reportPinButton}
                <button
                  type="button"
                  className="close-button"
                  onClick={() => setSelectedPin(null)}
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {pinInfoPanel}
          </div>
        )}
      </div>

      {activePanel && panelPlacement === "bottom" && (
        <div
          className={`floating-panel ${panelPlacement} ${
            activePanel === "add" && showFullAddForm ? "expanded" : ""
          }`}
          style={
            panelPlacement === "bottom" && activePanel === "add" && showFullAddForm
              ? { top: `${Math.max(titleCardHeight + 42, 150)}px` }
              : undefined
          }
        >
          <div className="panel-top">
            <div className="panel-title">
              <div className="panel-icon">{panelTitle.icon}</div>
              <h3>{panelTitle.label}</h3>
            </div>
            <button type="button" className="close-button" onClick={closePanel}>
              <X size={24} />
            </button>
          </div>

          {activePanel === "info" && infoPanel}
          {activePanel === "add" && (
            <div
              className={`panel-body-wrapper ${
                isCompactAdd && !showFullAddForm ? "compact" : ""
              }`}
            >
              {addPanel}
            </div>
          )}
          {activePanel === "filter" && filterPanel}
        </div>
      )}

      {panelPlacement === "bottom" && visibleSelectedPin && (
        <div className="floating-panel bottom pin-panel">
          <div className="panel-top">
            <div className="panel-title">
              <div className="panel-icon">{visibleSelectedPin.icon || "📍"}</div>
              <h3>{visibleSelectedPin.nickname || "Unnamed pin"}</h3>
            </div>
            <div className="panel-actions">
              {reportPinButton}
              <button
                type="button"
                className="close-button"
                onClick={() => setSelectedPin(null)}
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {pinInfoPanel}
        </div>
      )}

      {policyModal && (
        <PolicyModal title={policyTitle} content={policyContent} onClose={closePolicy} />
      )}

      {feedbackPrompt && (
        <div className="feedback-overlay" role="dialog" aria-modal="true">
          <div className="feedback-backdrop" onClick={closeFeedback} />
          <div className="feedback-card">
            <div className="panel-top" style={{ marginBottom: "0.5rem" }}>
              <div className="panel-title">
                <div className="panel-icon">💬</div>
                <h3>{feedbackPrompt.kind === "pin_report" ? "Report pin" : "Share site feedback"}</h3>
              </div>
              <button type="button" className="close-button" onClick={closeFeedback}>
                <X size={22} />
              </button>
            </div>
            <div className="panel-section" style={{ padding: 0 }}>
              {feedbackPrompt.kind === "pin_report" && feedbackPrompt.pinNickname && (
                <p className="muted" style={{ marginBottom: "0.5rem" }}>
                  Reporting: <strong>{feedbackPrompt.pinNickname}</strong>
                </p>
              )}
              <form onSubmit={handleFeedbackSubmit} className="form-grid compact">
                <label className="label">
                  Message *
                  <textarea
                    className="input"
                    rows={4}
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    placeholder={
                      feedbackPrompt.kind === "pin_report"
                        ? "Describe what's wrong with this pin."
                        : "Share bugs, ideas, or anything else."
                    }
                  />
                </label>
                <label className="label">
                  Contact info (optional)
                  <input
                    type="text"
                    className="input"
                    value={feedbackContact}
                    onChange={(e) => setFeedbackContact(e.target.value)}
                    placeholder="Discord @name, email, or other way to reach you"
                  />
                  <span className="helper-text">
                    Include platform + handle if you want a moderator to follow up.
                  </span>
                </label>

                {feedbackError && <p className="status error">{feedbackError}</p>}
                {feedbackStatus && <p className="status success">{feedbackStatus}</p>}

                <div className="feedback-actions">
                  <button type="button" className="ghost" onClick={closeFeedback} disabled={feedbackSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="primary" disabled={feedbackSubmitting}>
                    {feedbackSubmitting ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
