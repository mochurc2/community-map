import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "./supabaseClient";
import {
  addBubbleOption,
  deleteBubbleOption,
  fetchBubbleOptionsWithIds,
  getDefaultBubbleOptions,
  updateBubbleOption,
} from "./bubbleOptions";

const PASSCODE = import.meta.env.VITE_MODERATION_PASSCODE;

function ModerationBubbleEditor({ option, field, onSave, onDelete }) {
  const [label, setLabel] = useState(option.label);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!label.trim()) return;
    setBusy(true);
    await onSave(field, option, label.trim());
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    await onDelete(field, option);
    setBusy(false);
  };

  return (
    <div className="mod-bubble">
      <input
        className="input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        aria-label={`${field} bubble`}
      />
      <div className="mod-bubble-actions">
        <button type="button" onClick={save} disabled={busy}>
          Save
        </button>
        <button type="button" className="ghost-button" onClick={remove} disabled={busy}>
          Delete
        </button>
      </div>
    </div>
  );
}

function ModerationPage() {
  const [pendingPins, setPendingPins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [authError, setAuthError] = useState(null);
  const [bubbleOptions, setBubbleOptions] = useState({
    gender_identity: [],
    seeking: [],
    interest_tags: [],
  });
  const [bubbleError, setBubbleError] = useState(null);
  const [optionForm, setOptionForm] = useState({ field: "gender_identity", label: "" });
  const [savingOption, setSavingOption] = useState(false);
  const defaultBubbleSet = useMemo(() => getDefaultBubbleOptions(), []);

  const buildDefaultModerationOptions = useCallback(
    () =>
      Object.fromEntries(
        Object.entries(defaultBubbleSet).map(([field, labels]) => [
          field,
          labels.map((label, idx) => ({
            id: `default-${field}-${idx}`,
            label,
          })),
        ])
      ),
    [defaultBubbleSet]
  );

  const mapRowsToBubbles = useCallback(
    (rows) => {
      if (!rows || rows.length === 0) return buildDefaultModerationOptions();
      const grouped = {
        gender_identity: [],
        seeking: [],
        interest_tags: [],
      };

      rows.forEach((row) => {
        if (grouped[row.field]) {
          grouped[row.field].push({ id: row.id, label: row.label });
        }
      });

      Object.keys(grouped).forEach((field) => {
        if (grouped[field].length === 0) {
          grouped[field] = buildDefaultModerationOptions()[field];
        }
      });

      return grouped;
    },
    [buildDefaultModerationOptions]
  );

  const refreshBubbleOptions = useCallback(async () => {
    setBubbleError(null);
    try {
      const rows = await fetchBubbleOptionsWithIds();
      setBubbleOptions(mapRowsToBubbles(rows));
    } catch (err) {
      console.error(err);
      setBubbleError(err.message);
      setBubbleOptions(buildDefaultModerationOptions());
    }
  }, [mapRowsToBubbles]);

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
    refreshBubbleOptions();
  }, [hasAccess, refreshBubbleOptions]);

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

  const handleAddOption = async (e) => {
    e.preventDefault();
    if (!optionForm.label.trim()) return;
    setSavingOption(true);
    setBubbleError(null);
    try {
      await addBubbleOption(optionForm.field, optionForm.label.trim());
      await refreshBubbleOptions();
      setOptionForm({ field: "gender_identity", label: "" });
    } catch (err) {
      console.error(err);
      setBubbleError(err.message);
    } finally {
      setSavingOption(false);
    }
  };

  const handleSaveBubble = async (field, option, label) => {
    setBubbleError(null);
    try {
      if (String(option.id).startsWith("default-")) {
        await addBubbleOption(field, label);
      } else {
        await updateBubbleOption(option.id, label);
      }
      await refreshBubbleOptions();
    } catch (err) {
      console.error(err);
      setBubbleError(err.message);
    }
  };

  const handleDeleteBubble = async (field, option) => {
    setBubbleError(null);
    if (String(option.id).startsWith("default-")) {
      setBubbleOptions((current) => ({
        ...current,
        [field]: current[field].filter((opt) => opt.id !== option.id),
      }));
      return;
    }

    try {
      await deleteBubbleOption(option.id);
      await refreshBubbleOptions();
    } catch (err) {
      console.error(err);
      setBubbleError(err.message);
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

        <section
          style={{
            marginTop: "1.5rem",
            padding: "1.25rem 1.1rem",
            borderRadius: 16,
            background: "#fff",
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
            display: "grid",
            gap: "0.85rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, color: "#6366f1", fontWeight: 700 }}>Bubble library</p>
              <h2 style={{ margin: "0.25rem 0 0" }}>Manage selectable options</h2>
              <p style={{ margin: "0.35rem 0 0", color: "#4b5563" }}>
                These chips power the gender, interested-in, and interests fields on the
                public form.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleAddOption}
            style={{ display: "grid", gridTemplateColumns: "220px 1fr 140px", gap: "0.75rem", alignItems: "center" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontWeight: 600 }}>
              Field
              <select
                className="input"
                value={optionForm.field}
                onChange={(e) => setOptionForm((f) => ({ ...f, field: e.target.value }))}
              >
                <option value="gender_identity">Gender</option>
                <option value="seeking">Interested in</option>
                <option value="interest_tags">Interests</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontWeight: 600 }}>
              New bubble
              <input
                className="input"
                placeholder="Add a new option"
                value={optionForm.label}
                onChange={(e) => setOptionForm((f) => ({ ...f, label: e.target.value }))}
              />
            </label>

            <button type="submit" disabled={savingOption}>
              {savingOption ? "Saving…" : "Add bubble"}
            </button>
          </form>

          {bubbleError && (
            <p style={{ margin: 0, color: "#b91c1c" }}>Bubble error: {bubbleError}</p>
          )}

          <div className="bubble-moderation-grid">
            {[
              ["gender_identity", "Gender identities"],
              ["seeking", "Interested in"],
              ["interest_tags", "Interests"],
            ].map(([field, title]) => (
              <div key={field} className="bubble-moderation-column">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <h3 style={{ margin: 0 }}>{title}</h3>
                  <span className="small-chip">{bubbleOptions[field]?.length || 0} bubbles</span>
                </div>
                <div className="bubble-editor-list">
                  {bubbleOptions[field]?.map((option) => (
                    <ModerationBubbleEditor
                      key={option.id}
                      option={option}
                      field={field}
                      onSave={handleSaveBubble}
                      onDelete={handleDeleteBubble}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default ModerationPage;
