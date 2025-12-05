import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "./supabaseClient";
import MapView from "./MapView";

const toArray = (value) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function App() {
  const [pins, setPins] = useState([]);
  const [pinsError, setPinsError] = useState(null);
  const [loadingPins, setLoadingPins] = useState(true);

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [form, setForm] = useState({
    gender_identity: "",
    seeking: "",
    interest_tags: "",
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
  }, []);

  const handleMapClick = (lngLat) => {
    setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
    setSubmitMsg(null);
    setSubmitError(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

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
      seeking: toArray(form.seeking),
      interest_tags: toArray(form.interest_tags),
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
        seeking: "",
        interest_tags: "",
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
            <Link to="/moderate" className="link">
              Moderator view ↗
            </Link>
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
            <label className="label">
              Gender identity
              <input
                type="text"
                name="gender_identity"
                value={form.gender_identity}
                onChange={handleChange}
                placeholder="e.g. woman, man, nonbinary"
                className="input"
              />
            </label>

            <label className="label">
              Interested in (comma-separated)
              <input
                type="text"
                name="seeking"
                value={form.seeking}
                onChange={handleChange}
                placeholder="e.g. men, women, nonbinary people"
                className="input"
              />
            </label>

            <label className="label">
              Interest tags (comma-separated)
              <input
                type="text"
                name="interest_tags"
                value={form.interest_tags}
                onChange={handleChange}
                placeholder="e.g. rope, impact, DS"
                className="input"
              />
            </label>

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
