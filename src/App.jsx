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

  // Load approved pins for the map
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

  // Called when user clicks the map
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
      // reset form but keep location so they can tweak message
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
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: "320px",
          borderRight: "1px solid #ddd",
          padding: "1rem",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <header>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Community Map</h1>
          <p
            style={{
              marginTop: "0.25rem",
              fontSize: "0.9rem",
              color: "#555",
            }}
          >
            {loadingPins
              ? "Loading pins..."
              : `Currently ${pins.length} approved pins.`}
          </p>
          {pinsError && (
            <p style={{ color: "red", fontSize: "0.8rem" }}>
              Error loading pins: {pinsError}
            </p>
          )}
          <p style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
            <Link to="/moderate">Moderator view</Link>
          </p>
        </header>

        <section style={{ fontSize: "0.85rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Add a pin</h2>
          <p style={{ marginTop: 0 }}>
            1) Click on the map to choose a location.  
            2) Fill out the details below.  
            3) Your pin will be reviewed before appearing.
          </p>
          <p style={{ fontSize: "0.8rem", color: "#555" }}>
            Selected location:{" "}
            {selectedLocation
              ? `${selectedLocation.lat.toFixed(
                  4
                )}, ${selectedLocation.lng.toFixed(4)}`
              : "None yet"}
          </p>

          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <label>
              Gender identity
              <input
                type="text"
                name="gender_identity"
                value={form.gender_identity}
                onChange={handleChange}
                placeholder="e.g. man, woman, nonbinary"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              Interested in (comma-separated)
              <input
                type="text"
                name="seeking"
                value={form.seeking}
                onChange={handleChange}
                placeholder="e.g. men, women, nonbinary people"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              Interest tags (comma-separated)
              <input
                type="text"
                name="interest_tags"
                value={form.interest_tags}
                onChange={handleChange}
                placeholder="e.g. rope, impact, DS"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              City / region (optional)
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="e.g. Chicago"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              Country (optional)
              <input
                type="text"
                name="country"
                value={form.country}
                onChange={handleChange}
                placeholder="e.g. USA"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              Short note
              <textarea
                name="note"
                value={form.note}
                onChange={handleChange}
                rows={3}
                placeholder="Anything you want others to know."
                style={{ width: "100%", resize: "vertical" }}
              />
            </label>

            <label>
              Discord handle (optional)
              <input
                type="text"
                name="contact_discord"
                value={form.contact_discord}
                onChange={handleChange}
                placeholder="e.g. name#1234"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              Reddit username (optional)
              <input
                type="text"
                name="contact_reddit"
                value={form.contact_reddit}
                onChange={handleChange}
                placeholder="e.g. u/username"
                style={{ width: "100%" }}
              />
            </label>

            <label>
              Instagram handle (optional)
              <input
                type="text"
                name="contact_instagram"
                value={form.contact_instagram}
                onChange={handleChange}
                placeholder="e.g. @username"
                style={{ width: "100%" }}
              />
            </label>

            {submitError && (
              <p style={{ color: "red", fontSize: "0.8rem" }}>{submitError}</p>
            )}
            {submitMsg && (
              <p style={{ color: "green", fontSize: "0.8rem" }}>{submitMsg}</p>
            )}

            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit pin for review"}
            </button>
          </form>
        </section>
      </aside>

      {/* Map area */}
      <main style={{ flex: 1 }}>
        <MapView pins={pins} onMapClick={handleMapClick} />
      </main>
    </div>
  );
}

export default App;
