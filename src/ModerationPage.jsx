import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "./supabaseClient";

const PASSCODE = import.meta.env.VITE_MODERATION_PASSCODE;

function ModerationPage() {
  const [pendingPins, setPendingPins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [authError, setAuthError] = useState(null);

  const hasPasscode = useMemo(() => Boolean(PASSCODE), []);
  const [hasAccess, setHasAccess] = useState(!hasPasscode);

  useEffect(() => {
    if (!hasPasscode) return;
    const saved = localStorage.getItem("moderation_passcode");
    if (saved && saved === PASSCODE) {
      setHasAccess(true);
    }
  }, [hasPasscode]);

  useEffect(() => {
    if (!hasAccess) return;

    async function fetchPending() {
      setLoading(true);
      const { data, error: supaError } = await supabase
        .from("pins")
        .select("*")
        .eq("status", "pending")
        .order("submitted_at", { ascending: false });

      if (supaError) {
        console.error(supaError);
        setError(supaError.message);
      } else {
        setPendingPins(data || []);
        setError(null);
      }
      setLoading(false);
    }

    fetchPending();
  }, [hasAccess]);

  const updateStatus = async (id, status) => {
    const approved = status === "approved";

    const { error: supaError } = await supabase
      .from("pins")
      .update({
        status,
        approved,
        approved_at: approved ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (supaError) {
      console.error(supaError);
      alert("Error updating pin: " + supaError.message);
      return;
    }

    setPendingPins((current) => current.filter((p) => p.id !== id));
  };

  const handleUnlock = (e) => {
    e.preventDefault();
    if (!hasPasscode) {
      setHasAccess(true);
      return;
    }

    if (passcodeInput.trim() === PASSCODE) {
      localStorage.setItem("moderation_passcode", passcodeInput.trim());
      setHasAccess(true);
      setAuthError(null);
    } else {
      setAuthError("Incorrect passcode. Please try again.");
    }
  };

  if (!hasAccess) {
    return (
      <div className="map-placeholder" style={{ alignItems: "flex-start", paddingTop: "4rem" }}>
        <div style={{ maxWidth: 520 }}>
          <p className="badge" style={{ background: "#0f172a", color: "#fff" }}>
            Moderators only
          </p>
          <h1 style={{ marginTop: "0.35rem" }}>Enter the moderation passcode</h1>
          <p style={{ marginTop: "0.4rem", color: "#374151" }}>
            This page manages pending submissions. Only trusted reviewers should have
            access.
          </p>
          {!hasPasscode && (
            <p style={{ marginTop: "0.6rem", color: "#111827", fontWeight: 600 }}>
              No passcode is configured yet. Set <code>VITE_MODERATION_PASSCODE</code>
              in <code>.env</code> to protect this page.
            </p>
          )}

          <form onSubmit={handleUnlock} style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontWeight: 600 }}>
              Passcode
              <input
                type="password"
                className="input"
                placeholder="Enter the secret phrase"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
              />
            </label>
            {authError && (
              <p style={{ color: "#b91c1c", margin: 0 }}>{authError}</p>
            )}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button type="submit">Unlock</button>
              <Link to="/" className="link" style={{ color: "#4f46e5", fontWeight: 700 }}>
                ← Back to map
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", padding: "2rem 0" }}>
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 1.5rem",
          display: "grid",
          gap: "1.25rem",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: "#4f46e5" }}>Moderation</p>
            <h1 style={{ margin: "0.2rem 0 0" }}>Pending submissions</h1>
            <p style={{ margin: "0.4rem 0 0", color: "#4b5563" }}>
              Approve to publish on the public map, or reject to hide.
            </p>
          </div>
          <Link to="/" className="link" style={{ color: "#0f172a", fontWeight: 700 }}>
            ← Back to map
          </Link>
        </header>

        {loading && <p style={{ margin: 0 }}>Loading pending pins…</p>}
        {error && <p style={{ color: "#b91c1c", margin: 0 }}>Error: {error}</p>}

        {!loading && pendingPins.length === 0 && !error && (
          <p style={{ margin: 0, color: "#16a34a", fontWeight: 700 }}>
            No pending pins 🎉
          </p>
        )}

        <div style={{ display: "grid", gap: "0.75rem" }}>
          {pendingPins.map((pin) => (
            <div
              key={pin.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                padding: "1rem 1.1rem",
                background: "#fff",
                boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {pin.city || "Unknown location"}{" "}
                    <span style={{ fontWeight: 500, color: "#6b7280" }}>
                      ({pin.lat?.toFixed(4)}, {pin.lng?.toFixed(4)})
                    </span>
                  </p>
                  <p style={{ margin: "0.25rem 0", fontSize: "0.95rem", color: "#374151" }}>
                    Gender: {pin.gender_identity || "unspecified"}
                    {pin.seeking && pin.seeking.length > 0 && (
                      <> — Seeking: {pin.seeking.join(", ")}</>
                    )}
                  </p>
                  {pin.interest_tags && pin.interest_tags.length > 0 && (
                    <p style={{ margin: "0.25rem 0", fontSize: "0.95rem", color: "#374151" }}>
                      Interests: {pin.interest_tags.join(", ")}
                    </p>
                  )}
                  {pin.note && (
                    <p style={{ margin: "0.25rem 0", fontSize: "0.95rem", color: "#374151" }}>
                      Note: {pin.note}
                    </p>
                  )}
                </div>
              </div>

              <div
                style={{
                  marginTop: "0.75rem",
                  display: "flex",
                  gap: "0.5rem",
                  fontSize: "0.95rem",
                }}
              >
                <button
                  onClick={() => updateStatus(pin.id, "approved")}
                  style={{ padding: "0.55rem 0.9rem", background: "#16a34a" }}
                >
                  Approve
                </button>
                <button
                  onClick={() => updateStatus(pin.id, "rejected")}
                  style={{ padding: "0.55rem 0.9rem", background: "#b91c1c" }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ModerationPage;
