import { useCallback, useEffect, useMemo, useState } from "react";
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="panel" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="meta" style={{ justifyContent: "space-between" }}>
            <div>
              <p className="badge">Community Map</p>
              <h1 style={{ color: "#fff", marginTop: "0.25rem" }}>
                Find friends near you
              </h1>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                Drop a pin to share who you are and what you enjoy. Approved pins
                appear on the public map.
              </p>
            </div>
          </div>
          <div className="meta" style={{ marginTop: "0.75rem" }}>
            <span className="badge">
              {loadingPins
                ? "Loading pins…"
                : `${pins.length} approved pins live`}
            </span>
            {pinsError && (
              <span className="badge" style={{ background: "rgba(248,113,113,0.2)", color: "#fecdd3" }}>
                Error loading pins
              </span>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-title">
            <span role="img" aria-label="pin">
              📍
            </span>
            <h2>Add your pin</h2>
          </div>
          <p className="muted" style={{ margin: "0.35rem 0 0.75rem" }}>
            Tap anywhere on the map, then share a short intro. Contact details are
            optional and stay hidden until a moderator approves.
          </p>

          <div className="status" style={{ color: "#e5e7eb" }}>
            Selected location: {" "}
            {selectedLocation
              ? `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`
              : "none yet"}
          </div>

          <form onSubmit={handleSubmit} className="form-grid" style={{ marginTop: "0.75rem" }}>
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

            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit pin for review"}
            </button>
          </form>
        </div>
      </aside>

      <main className="map-region">
        <MapView pins={pins} onMapClick={handleMapClick} />
      </main>
    </div>
  );
}

export default App;
