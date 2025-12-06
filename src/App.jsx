import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Info, MapPin, Plus, Scissors, X } from "lucide-react";
import { supabase } from "./supabaseClient";
import MapView from "./MapView";
import { fetchBubbleOptions, getDefaultBubbleOptions } from "./bubbleOptions";

const MAX_VISIBLE_BUBBLES = 6;

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
              multiple ? value.includes(option) : value === option
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
            placeholder="Add your own"
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
  const [bubbleOptions, setBubbleOptions] = useState(getDefaultBubbleOptions);
  const [form, setForm] = useState({
    gender_identity: "",
    seeking: [],
    interest_tags: [],
    note: "",
    contact_discord: "",
    contact_reddit: "",
    contact_instagram: "",
    city: "",
    country: "",
  });
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
          "id, lat, lng, city, state_province, country, gender_identity, seeking, interest_tags, note"
        )
        .eq("status", "approved");

      if (error) {
        console.error(error);
        setPinsError(error.message);
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

      setForm((prev) => ({
        ...prev,
        city: cityCandidate || prev.city,
        country: countryCandidate || prev.country,
      }));
    } catch (err) {
      console.error("Error reverse geocoding", err);
    }
  }, []);

  const handleMapClick = useCallback(
    (lngLat) => {
      setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
      setSubmitMsg(null);
      setSubmitError(null);
      autofillLocation(lngLat.lat, lngLat.lng);
    },
    [autofillLocation]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
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

    const { error } = await supabase.from("pins").insert({
      lat,
      lng,
      city: form.city || null,
      country: form.country || null,
      gender_identity: form.gender_identity || "unspecified",
      seeking: form.seeking,
      interest_tags: form.interest_tags,
      note: form.note || null,
      contact_discord: form.contact_discord || null,
      contact_reddit: form.contact_reddit || null,
      contact_instagram: form.contact_instagram || null,
      status: "pending",
      approved: false,
    });

    if (error) {
      console.error(error);
      setSubmitError(error.message);
    } else {
      setSubmitMsg("Thanks! Your pin has been submitted for review.");
      setForm({
        gender_identity: "",
        seeking: [],
        interest_tags: [],
        note: "",
        contact_discord: "",
        contact_reddit: "",
        contact_instagram: "",
        city: "",
        country: "",
      });
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
        !filters.gender_identity || pin.gender_identity === filters.gender_identity;
      const matchesSeeking =
        filters.seeking.length === 0 ||
        filters.seeking.some((opt) => (pin.seeking || []).includes(opt));
      const matchesInterests =
        filters.interest_tags.length === 0 ||
        filters.interest_tags.some((opt) => (pin.interest_tags || []).includes(opt));

      return matchesGender && matchesSeeking && matchesInterests;
    });
  }, [filters.gender_identity, filters.interest_tags, filters.seeking, pins]);

  const togglePanel = (panel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
    if (panel === "add") {
      const shouldExpand = panelPlacement !== "bottom" && Boolean(selectedLocation);
      setShowFullAddForm(shouldExpand);
    }
  };

  useEffect(() => {
    if (activePanel === "add" && panelPlacement !== "bottom" && selectedLocation) {
      setShowFullAddForm(true);
    }
  }, [activePanel, panelPlacement, selectedLocation]);

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

  const addPanelIntro = (
    <div className="panel-section">
      <div className="status-row">
        <MapPin size={18} />
        <span>Selected location: {locationLabel}</span>
      </div>
      {panelPlacement === "bottom" && (
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
          <BubbleSelector
            label="Gender identity"
            helper="Choose one"
            options={bubbleOptions.gender_identity}
            value={form.gender_identity}
            onChange={(value) => setForm((f) => ({ ...f, gender_identity: value }))}
            onAddOption={(option) => handleCustomOption("gender_identity", option)}
            allowCustom
          />

          <BubbleSelector
            label="Interested in"
            helper="Select all that apply"
            options={bubbleOptions.seeking}
            multiple
            value={form.seeking}
            onChange={(value) => setForm((f) => ({ ...f, seeking: value }))}
            onAddOption={(option) => handleCustomOption("seeking", option)}
            allowCustom
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
            City / region (optional)
            <input
              type="text"
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="e.g. Chicago"
              className="input"
            />
          </label>

          <label className="label">
            Country (optional)
            <input
              type="text"
              name="country"
              value={form.country}
              onChange={handleChange}
              placeholder="e.g. USA"
              className="input"
            />
          </label>

          <label className="label">
            Short note
            <textarea
              name="note"
              value={form.note}
              onChange={handleChange}
              rows={3}
              placeholder="Anything you want others to know."
              className="input"
            />
          </label>

          <p className="helper">Contact handles are optional</p>

          <label className="label">
            Discord handle
            <input
              type="text"
              name="contact_discord"
              value={form.contact_discord}
              onChange={handleChange}
              placeholder="e.g. name#1234"
              className="input"
            />
          </label>

          <label className="label">
            Reddit username
            <input
              type="text"
              name="contact_reddit"
              value={form.contact_reddit}
              onChange={handleChange}
              placeholder="e.g. u/username"
              className="input"
            />
          </label>

          <label className="label">
            Instagram handle
            <input
              type="text"
              name="contact_instagram"
              value={form.contact_instagram}
              onChange={handleChange}
              placeholder="e.g. @username"
              className="input"
            />
          </label>

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

  return (
    <div className="app-shell">
      <MapView
        pins={filteredPins}
        onMapClick={handleMapClick}
        pendingLocation={activePanel === "add" ? selectedLocation : null}
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
    </div>
  );
}

export default App;
