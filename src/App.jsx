import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Filter, Info, Plus, Scissors, X } from "lucide-react";
import { supabase } from "./supabaseClient";
import MapView from "./MapView";
import { fetchBubbleOptions, getDefaultBubbleOptions } from "./bubbleOptions";
import { buildContactLink, getGenderAbbreviation, getGenderList } from "./pinUtils";

const MAX_VISIBLE_BUBBLES = 6;
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
  "👋🏻",
  "👋🏼",
  "👋🏽",
  "👋🏾",
  "👋🏿",
  "💅",
  "💅🏻",
  "💅🏼",
  "💅🏽",
  "💅🏾",
  "💅🏿",
  "👀",
  "👅",
  "👄",
  "👱‍♀️",
  "👱🏻‍♀️",
  "👱🏼‍♀️",
  "👱🏽‍♀️",
  "👱🏾‍♀️",
  "👱🏿‍♀️",
  "👱‍♂️",
  "👱🏻‍♂️",
  "👱🏼‍♂️",
  "👱🏽‍♂️",
  "👱🏾‍♂️",
  "👱🏿‍♂️",
  "👨",
  "👨🏻",
  "👨🏼",
  "👨🏽",
  "👨🏾",
  "👨🏿",
  "👩",
  "👩🏻",
  "👩🏼",
  "👩🏽",
  "👩🏾",
  "👩🏿",
  "👴",
  "👴🏻",
  "👴🏼",
  "👴🏽",
  "👴🏾",
  "👴🏿",
  "👵",
  "👵🏻",
  "👵🏼",
  "👵🏽",
  "👵🏾",
  "👵🏿",
  "👸",
  "👸🏻",
  "👸🏼",
  "👸🏽",
  "👸🏾",
  "👸🏿",
  "🤴",
  "🤴🏻",
  "🤴🏼",
  "🤴🏽",
  "🤴🏾",
  "🤴🏿",
  "💇‍♂️",
  "💇🏻‍♂️",
  "💇🏼‍♂️",
  "💇🏽‍♂️",
  "💇🏾‍♂️",
  "💇🏿‍♂️",
  "💇‍♀️",
  "💇🏻‍♀️",
  "💇🏼‍♀️",
  "💇🏽‍♀️",
  "💇🏾‍♀️",
  "💇🏿‍♀️",
  "👭",
  "👭🏻",
  "👭🏼",
  "👭🏽",
  "👭🏾",
  "👭🏿",
  "👩‍🤝‍👨",
  "👩🏻‍🤝‍👨🏻",
  "👩🏼‍🤝‍👨🏼",
  "👩🏽‍🤝‍👨🏽",
  "👩🏾‍🤝‍👨🏾",
  "👩🏿‍🤝‍👨🏿",
  "👬",
  "👬🏻",
  "👬🏼",
  "👬🏽",
  "👬🏾",
  "👬🏿",
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
  "❤️",
  "🩷",
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

const contactPlaceholders = {
  Email: "name@example.com",
  Discord: "name#1234",
  Reddit: "u/username",
  Instagram: "@username",
  Tumblr: "username",
  "X/Twitter": "@username",
  Youtube: "channel link",
  Website: "https://example.com",
  OnlyFans: "@username",
};

const defaultExpiryDate = () => {
  const now = new Date();
  now.setFullYear(now.getFullYear() + 1);
  return now.toISOString().split("T")[0];
};

const buildInitialFormState = () => ({
  icon: "💈",
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
}) {
  const [showAll, setShowAll] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const displayOptions = useMemo(
    () => (showAll ? options : options.slice(0, MAX_VISIBLE_BUBBLES)),
    [options, showAll]
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
    <label className="label">
      <div className="label-heading">
        <span>{label}</span>
        {helper && <span className="helper-text">{helper}</span>}
      </div>
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
        {options.length > MAX_VISIBLE_BUBBLES && (
          <button
            type="button"
            className="bubble ghost"
            onClick={() => setShowAll((v) => !v)}
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
    </label>
  );
}

function App() {
  const [pins, setPins] = useState([]);
  const [pinsError, setPinsError] = useState(null);
  const [loadingPins, setLoadingPins] = useState(true);

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [bubbleOptions, setBubbleOptions] = useState(getDefaultBubbleOptions);
  const [form, setForm] = useState(buildInitialFormState);
  const [submitMsg, setSubmitMsg] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [panelPlacement, setPanelPlacement] = useState("side");
  const [showFullAddForm, setShowFullAddForm] = useState(false);
  const [titleCardHeight, setTitleCardHeight] = useState(0);
  const [filters, setFilters] = useState({
    gender_identity: "",
    seeking: [],
    interest_tags: [],
  });
  const titleCardRef = useRef(null);

  useEffect(() => {
    async function fetchPins() {
      setLoadingPins(true);
      const { data, error } = await supabase
        .from("pins")
        .select(
          "id, lat, lng, city, state_province, country, country_code, icon, nickname, age, genders, gender_identity, seeking, interest_tags, note, contact_methods, expires_at"
        )
        .eq("status", "approved");

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
    fetchBubbleOptions()
      .then((options) => setBubbleOptions(options))
      .catch(() => setBubbleOptions(getDefaultBubbleOptions()));
  }, []);

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
      setSelectedPin(null);
      setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
      setSubmitMsg(null);
      setSubmitError(null);
      autofillLocation(lngLat.lat, lngLat.lng);
    },
    [autofillLocation]
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
  };

  const handleContactInput = (channel, value) => {
    setForm((prev) => ({
      ...prev,
      contact_methods: { ...prev.contact_methods, [channel]: value },
    }));
  };

  const handleCustomOption = useCallback((field, option) => {
    setBubbleOptions((prev) => {
      const current = prev[field] || [];
      if (current.includes(option)) return prev;
      return { ...prev, [field]: [...current, option] };
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedLocation) {
      setSubmitError("Click on the map to choose a location first.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitMsg(null);

    const { lng, lat } = selectedLocation;
    const contactPayload = {};
    form.contact_channels.forEach((channel) => {
      const value = form.contact_methods[channel];
      if (value && value.trim()) {
        contactPayload[channel] = value.trim();
      }
    });

    const expiresAt = form.never_delete || !form.expires_at
      ? null
      : new Date(`${form.expires_at}T23:59:00`);

    const isoCountry = (form.country || form.country_code || "").trim().toUpperCase();

    const { error } = await supabase.from("pins").insert({
      lat,
      lng,
      city: form.city || null,
      state_province: form.state_province || null,
      country: isoCountry || null,
      country_code: isoCountry || null,
      icon: form.icon || "📍",
      nickname: form.nickname || null,
      age: form.age ? Number(form.age) : null,
      genders: form.genders,
      gender_identity: form.genders[0] || "unspecified",
      seeking: form.seeking,
      interest_tags: form.interest_tags,
      note: form.note || null,
      contact_methods: contactPayload,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
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
      setSubmitMsg("Thanks! Your pin has been submitted for review.");
      setForm(buildInitialFormState());
    }

    setSubmitting(false);
  };

  useEffect(() => {
    const handlePlacement = () => {
      const isWideEnough = window.innerWidth >= 960;
      const placement = isWideEnough ? "side" : "bottom";
      setPanelPlacement(placement);

      if (activePanel === "add") {
        if (placement === "bottom") {
          setShowFullAddForm(false);
        } else if (selectedLocation) {
          setShowFullAddForm(true);
        }
      }
    };

    handlePlacement();
    window.addEventListener("resize", handlePlacement);
    return () => window.removeEventListener("resize", handlePlacement);
  }, [activePanel, selectedLocation]);

  useEffect(() => {
    const updateHeight = () => {
      if (!titleCardRef.current) return;
      const rect = titleCardRef.current.getBoundingClientRect();
      setTitleCardHeight(rect.height);
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const filteredPins = useMemo(() => {
    return pins.filter((pin) => {
      const matchesGender =
        !filters.gender_identity ||
        (pin.genders || []).includes(filters.gender_identity) ||
        pin.gender_identity === filters.gender_identity;
      const matchesSeeking =
        filters.seeking.length === 0 ||
        filters.seeking.some((opt) => (pin.seeking || []).includes(opt));
      const matchesInterests =
        filters.interest_tags.length === 0 ||
        filters.interest_tags.some((opt) => (pin.interest_tags || []).includes(opt));

      return matchesGender && matchesSeeking && matchesInterests;
    });
  }, [filters.gender_identity, filters.interest_tags, filters.seeking, pins]);

  const visibleSelectedPin =
    selectedPin && filteredPins.some((pin) => pin.id === selectedPin.id)
      ? selectedPin
      : null;

  const togglePanel = (panel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
    if (panel === "add") {
      const shouldExpand = panelPlacement !== "bottom" && Boolean(selectedLocation);
      setShowFullAddForm(shouldExpand);
    }
  };

  const closePanel = () => setActivePanel(null);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () =>
    setFilters({ gender_identity: "", seeking: [], interest_tags: [] });

  const approvedPinsCount = pins.length;
  const locationLabel = selectedLocation
    ? `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`
    : "None yet";
  const locationDetails = selectedLocation
    ? `${form.city || "Unknown city"}${form.state_province ? `, ${form.state_province}` : ""}${
        form.country || form.country_code ? `, ${form.country || form.country_code}` : ""
      }`
    : "Tap the map to pick a spot and fill in the details.";

  const addPanelIntro = (
    <div className="panel-section">
      <div className="label location-label">
        <div className="label-heading">
          <span>Location</span>
        </div>
        <div className="location-chip-row">
          <span className="location-chip">{locationLabel}</span>
          <span className="location-chip subdued">{locationDetails}</span>
        </div>
      </div>
      {panelPlacement === "bottom" && !showFullAddForm && (
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
    <div className="panel-body">
      <div className="panel-section">
        <div className="title-meta">
          <span className="pill">
            {loadingPins ? "Loading pins…" : `${approvedPinsCount} pins`}
          </span>
          {pinsError && <span className="pill error">Error loading pins</span>}
        </div>
        <p className="muted">
          Drop a pin to share who you are, what you enjoy, and where you are based.
          Moderators approve submissions before they appear on the public map so
          everyone can browse safely.
        </p>
        <ul className="list">
          <li>Use the icons on the title card to toggle info, add pins, or filter.</li>
          <li>Tap on the map to pick your spot, then submit a short intro.</li>
          <li>Contact handles stay hidden until your pin is approved.</li>
        </ul>
      </div>
    </div>
  );

  const addPanel = (
    <div className="panel-body">
      <div className="panel-section">
        {panelPlacement !== "bottom" && (
          <p className="muted">
            Select location for your pin and fill out the form. All pins are subject to
            moderation before appearing on the map.
          </p>
        )}
        {addPanelIntro}
      </div>

      {showFullAddForm && (
        <form onSubmit={handleSubmit} className="form-grid compact">
          <div className="label">
            <div className="label-heading">
              <span>Icon</span>
              <span className="helper-text">Pick an emoji for your pin</span>
            </div>
            <div className="emoji-scroll" role="listbox" aria-label="Pick an emoji">
              <div className="emoji-grid">
                {EMOJI_CHOICES.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`emoji-chip ${form.icon === emoji ? "selected" : ""}`}
                    aria-pressed={form.icon === emoji}
                    onClick={() => setForm((f) => ({ ...f, icon: emoji }))}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="label">
            Nickname
            <input
              type="text"
              name="nickname"
              value={form.nickname}
              onChange={handleChange}
              placeholder="Up to 12 characters"
              className="input"
              maxLength={12}
            />
          </label>

          <label className="label">
            Age
            <input
              type="number"
              name="age"
              value={form.age}
              onChange={handleChange}
              className="input"
              min={0}
              max={120}
            />
          </label>

          <BubbleSelector
            label="Gender"
            helper="Select all that apply"
            options={bubbleOptions.gender_identity}
            multiple
            value={form.genders}
            onChange={(value) => setForm((f) => ({ ...f, genders: value }))}
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
            options={bubbleOptions.interest_tags}
            multiple
            value={form.interest_tags}
            onChange={(value) => setForm((f) => ({ ...f, interest_tags: value }))}
            onAddOption={(option) => handleCustomOption("interest_tags", option)}
            allowCustom
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
              options={bubbleOptions.contact_methods}
              multiple
              value={form.contact_channels}
              onChange={handleContactChannels}
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
                <span className="helper-text">We will remove at 11:59 PM on that date</span>
              </div>
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
                      ? prev.expires_at
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
          label="Gender identity"
          helper="Show one"
          options={bubbleOptions.gender_identity}
          value={filters.gender_identity}
          onChange={(value) => handleFilterChange("gender_identity", value)}
        />
        <BubbleSelector
          label="Interested in"
          helper="Show any"
          options={bubbleOptions.seeking}
          multiple
          value={filters.seeking}
          onChange={(value) => handleFilterChange("seeking", value)}
        />
        <BubbleSelector
          label="Interests"
          helper="Show any"
          options={bubbleOptions.interest_tags}
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

  const selectedGenderList = visibleSelectedPin
    ? getGenderList(visibleSelectedPin.genders, visibleSelectedPin.gender_identity)
    : [];
  const selectedGenderAbbr = visibleSelectedPin
    ? getGenderAbbreviation(visibleSelectedPin.genders, visibleSelectedPin.gender_identity)
    : "";
  const pinAgeGenderLine = visibleSelectedPin
    ? [visibleSelectedPin.age ? `${visibleSelectedPin.age}` : "", selectedGenderAbbr]
      .filter(Boolean)
      .join(" · ")
    : "";
  const pinContactLinks = visibleSelectedPin
    ? Object.entries(visibleSelectedPin.contact_methods || {})
      .map(([channel, value]) => buildContactLink(channel, value))
      .filter(Boolean)
    : [];

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

        {visibleSelectedPin.seeking && visibleSelectedPin.seeking.length > 0 && (
          <div className="pin-section">
            <span className="eyebrow">Interested in</span>
            <div className="bubble-row">
              {visibleSelectedPin.seeking.map((item) => (
                <span key={item} className="bubble static">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {visibleSelectedPin.interest_tags && visibleSelectedPin.interest_tags.length > 0 && (
          <div className="pin-section">
            <span className="eyebrow">Interests</span>
            <div className="bubble-row">
              {visibleSelectedPin.interest_tags.map((item) => (
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
              {pinContactLinks.map(({ label, href }) => (
                <a
                  key={`${label}-${href}`}
                  className="bubble link-bubble"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {label}
                </a>
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
        onMapClick={handleMapClick}
        onPinSelect={handlePinSelect}
        pendingLocation={activePanel === "add" ? selectedLocation : null}
        pendingIcon={activePanel === "add" ? form.icon : null}
        selectedPinId={visibleSelectedPin?.id}
      />

      <div className="overlay-rail" ref={titleCardRef}>
        <div className="title-card">
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
                <div>
                  <h3>{visibleSelectedPin.nickname || "Unnamed pin"}</h3>
                  {pinAgeGenderLine && (
                    <p className="pin-subtitle">{pinAgeGenderLine}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setSelectedPin(null)}
              >
                <X size={24} />
              </button>
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
              <div>
                <h3>{visibleSelectedPin.nickname || "Unnamed pin"}</h3>
                {pinAgeGenderLine && <p className="pin-subtitle">{pinAgeGenderLine}</p>}
              </div>
            </div>
            <button
              type="button"
              className="close-button"
              onClick={() => setSelectedPin(null)}
            >
              <X size={24} />
            </button>
          </div>

          {pinInfoPanel}
        </div>
      )}
    </div>
  );
}

export default App;
