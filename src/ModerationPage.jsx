import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "./supabaseClient";

function ModerationPage() {
  const [pendingPins, setPendingPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchPending() {
      setLoading(true);
      const { data, error } = await supabase
        .from("pins")
        .select("*")
        .eq("status", "pending")
        .order("submitted_at", { ascending: false });

      if (error) {
        console.error(error);
        setError(error.message);
      } else {
        setPendingPins(data || []);
      }
      setLoading(false);
    }

    fetchPending();
  }, []);

  const updateStatus = async (id, status) => {
    const approved = status === "approved";

    const { error } = await supabase
      .from("pins")
      .update({
        status,
        approved,
        approved_at: approved ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Error updating pin: " + error.message);
      return;
    }

    setPendingPins((current) => current.filter((p) => p.id !== id));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        padding: "1.5rem 2rem",
        boxSizing: "border-box",
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Moderator view</h1>
        <p style={{ marginTop: "0.25rem", fontSize: "0.9rem" }}>
          <Link to="/">← Back to map</Link>
        </p>
      </header>

      {loading && <p>Loading pending pins…</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!loading && pendingPins.length === 0 && !error && (
        <p>No pending pins 🎉</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {pendingPins.map((pin) => (
          <div
            key={pin.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>
              {pin.city || "Unknown location"}{" "}
              <span style={{ fontWeight: 400, color: "#666" }}>
                ({pin.lat?.toFixed(4)}, {pin.lng?.toFixed(4)})
              </span>
            </p>
            <p style={{ margin: "0.25rem 0", fontSize: "0.85rem" }}>
              Gender: {pin.gender_identity || "unspecified"}
              {pin.seeking && pin.seeking.length > 0 && (
                <> — Seeking: {pin.seeking.join(", ")}</>
              )}
            </p>
            {pin.interest_tags && pin.interest_tags.length > 0 && (
              <p style={{ margin: "0.25rem 0", fontSize: "0.85rem" }}>
                Interests: {pin.interest_tags.join(", ")}
              </p>
            )}
            {pin.note && (
              <p style={{ margin: "0.25rem 0", fontSize: "0.85rem" }}>
                Note: {pin.note}
              </p>
            )}

            <div
              style={{
                marginTop: "0.5rem",
                display: "flex",
                gap: "0.5rem",
                fontSize: "0.85rem",
              }}
            >
              <button
                onClick={() => updateStatus(pin.id, "approved")}
                style={{ padding: "0.25rem 0.75rem" }}
              >
                Approve
              </button>
              <button
                onClick={() => updateStatus(pin.id, "rejected")}
                style={{ padding: "0.25rem 0.75rem" }}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ModerationPage;
