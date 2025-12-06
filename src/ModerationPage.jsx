import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addBubbleOption,
  deleteBubbleOption,
  fetchBubbleOptionsWithIds,
  getDefaultBubbleOptions,
  updateBubbleOption,
} from "./bubbleOptions";
import { supabase, supabaseAdmin } from "./supabaseClient";

const PASSCODE = import.meta.env.VITE_MODERATION_PASSCODE;
const moderationClient = supabaseAdmin || supabase;

function ModerationBubbleEditor({ option, field, onSave, onDelete }) {
  const [label, setLabel] = useState(option.label);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!label.trim()) return;
    setBusy(true);
    await onSave(field, option, label.trim());
    setBusy(false);
    setEditing(false);
  };

  const remove = async (e) => {
    e?.stopPropagation?.();
    setBusy(true);
    await onDelete(field, option);
    setBusy(false);
  };

  return (
    <div className="mod-bubble">
      {editing ? (
        <div className="mod-bubble-edit">
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
            <button type="button" className="ghost-button" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="ghost-button" onClick={remove} disabled={busy}>
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="bubble mod-chip"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${option.label}`}
        >
          <span>{option.label}</span>
          <span className="chip-delete" onClick={remove}>
            ✕
          </span>
        </button>
      )}
    </div>
  );
}

function TabButton({ id, label, active, count, onClick }) {
  return (
    <button
      type="button"
      className={`tab-button ${active ? "active" : ""}`}
      onClick={() => onClick(id)}
    >
      <span>{label}</span>
      {typeof count === "number" && <span className="small-chip">{count}</span>}
    </button>
  );
}

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function ModerationPage() {
  const [pins, setPins] = useState([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [error, setError] = useState(null);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [authError, setAuthError] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [bubbleOptions, setBubbleOptions] = useState({
    gender_identity: [],
    seeking: [],
    interest_tags: [],
    contact_methods: [],
  });
  const [bubbleError, setBubbleError] = useState(null);
  const [optionForm, setOptionForm] = useState({ field: "gender_identity", label: "" });
  const [savingOption, setSavingOption] = useState(false);
  const defaultBubbleSet = useMemo(() => getDefaultBubbleOptions(), []);
  const hasPasscode = useMemo(() => Boolean(PASSCODE), []);
  const [hasAccess, setHasAccess] = useState(!hasPasscode);

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
        contact_methods: [],
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

  useEffect(() => {
    if (!hasPasscode) return;
    const saved = localStorage.getItem("moderation_passcode");
    if (saved && saved === PASSCODE) {
      setHasAccess(true);
    }
  }, [hasPasscode]);

  const fetchPins = useCallback(async () => {
    setLoadingPins(true);
    const { data, error: supaError } = await moderationClient
      .from("pins")
      .select("*")
      .order("submitted_at", { ascending: false });

    if (supaError) {
      console.error(supaError);
      setError(supaError.message);
    } else {
      setPins(data || []);
      setError(null);
    }
    setLoadingPins(false);
  }, []);

  useEffect(() => {
    if (!hasAccess) return;
    fetchPins();
    refreshBubbleOptions();
  }, [fetchPins, hasAccess, refreshBubbleOptions]);

  const updateStatus = async (id, status) => {
    const approved = status === "approved";

    const { error: supaError } = await moderationClient
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

    fetchPins();
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

  const pinGroups = useMemo(
    () => ({
      all: pins,
      pending: pins.filter((p) => p.status === "pending"),
      approved: pins.filter((p) => p.status === "approved"),
      rejected: pins.filter((p) => p.status === "rejected"),
    }),
    [pins]
  );

  const stats = useMemo(
    () => ({
      total: pins.length,
      pending: pinGroups.pending.length,
      approved: pinGroups.approved.length,
      rejected: pinGroups.rejected.length,
    }),
    [pins, pinGroups.approved.length, pinGroups.pending.length, pinGroups.rejected.length]
  );

  if (!hasAccess) {
    return (
      <div className="map-placeholder" style={{ alignItems: "flex-start", paddingTop: "4rem" }}>
        <div style={{ maxWidth: 520 }}>
          <p className="badge" style={{ background: "#0f172a", color: "#fff" }}>
            Moderators only
          </p>
          <h1 style={{ marginTop: "0.35rem" }}>Enter the moderation passcode</h1>
          <p style={{ marginTop: "0.4rem", color: "#374151" }}>
            This page manages pending submissions. Only trusted reviewers should have access.
          </p>
          {!hasPasscode && (
            <p style={{ marginTop: "0.6rem", color: "#111827", fontWeight: 600 }}>
              No passcode is configured yet. Set <code>VITE_MODERATION_PASSCODE</code> in <code>.env</code> to protect this page.
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
            {authError && <p style={{ color: "#b91c1c", margin: 0 }}>{authError}</p>}
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

  const renderPins = (list) => {
    if (loadingPins) {
      return <p style={{ margin: 0 }}>Loading pins…</p>;
    }

    if (!loadingPins && list.length === 0) {
      return (
        <p style={{ margin: 0, color: "#16a34a", fontWeight: 700 }}>
          Nothing to show here 🎉
        </p>
      );
    }

    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {list.map((pin) => (
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
                <p style={{ margin: 0, fontWeight: 700, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <span>{pin.icon || "📍"}</span>
                  <span>{pin.nickname || "No nickname"}</span>
                </p>
                <p style={{ margin: "0.25rem 0", fontSize: "0.95rem", color: "#374151" }}>
                  {pin.city || "Unknown location"} {pin.state_province && `(${pin.state_province})`} {pin.country || pin.country_code}
                  {" "}
                  <span style={{ fontWeight: 500, color: "#6b7280" }}>
                    ({pin.lat?.toFixed(4)}, {pin.lng?.toFixed(4)})
                  </span>
                </p>
                <p style={{ margin: "0.25rem 0", fontSize: "0.95rem", color: "#374151" }}>
                  Gender: {pin.genders?.length ? pin.genders.join(", ") : pin.gender_identity || "unspecified"}
                  {pin.seeking && pin.seeking.length > 0 && <> — Interested in: {pin.seeking.join(", ")}</>}
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
                {pin.contact_methods && Object.keys(pin.contact_methods).length > 0 && (
                  <p style={{ margin: "0.25rem 0", fontSize: "0.95rem", color: "#374151" }}>
                    Contact: {Object.entries(pin.contact_methods)
                      .map(([key, val]) => `${key}: ${val}`)
                      .join(" · ")}
                  </p>
                )}
                <p style={{ margin: "0.25rem 0", fontSize: "0.9rem", color: "#6b7280" }}>
                  Delete after: {formatDate(pin.expires_at)}
                </p>
              </div>
              <div style={{ textAlign: "right", color: "#4b5563", fontSize: "0.9rem" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{pin.status}</p>
                <p style={{ margin: "0.1rem 0 0" }}>Submitted {new Date(pin.submitted_at).toLocaleString()}</p>
              </div>
            </div>

            {pin.status === "pending" && (
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
            )}
          </div>
        ))}
      </div>
    );
  };

  const tabs = [
    { id: "all", label: "All pins", count: stats.total },
    { id: "pending", label: "Pending pins", count: stats.pending },
    { id: "approved", label: "Approved pins", count: stats.approved },
    { id: "rejected", label: "Rejected pins", count: stats.rejected },
    { id: "bubbles", label: "Bubble Library" },
    { id: "stats", label: "Page stats" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", padding: "2rem 0" }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 1.5rem",
          display: "grid",
          gap: "1.25rem",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: "#4f46e5" }}>Moderation</p>
            <h1 style={{ margin: "0.2rem 0 0" }}>Pin submissions</h1>
            <p style={{ margin: "0.4rem 0 0", color: "#4b5563" }}>
              Review, approve, and keep the bubble library up to date.
            </p>
          </div>
          <Link to="/" className="link" style={{ color: "#0f172a", fontWeight: 700 }}>
            ← Back to map
          </Link>
        </header>

        <div className="tab-row">
          {tabs.map((tab) => (
            <TabButton key={tab.id} {...tab} active={activeTab === tab.id} onClick={setActiveTab} />
          ))}
        </div>

        {error && <p style={{ color: "#b91c1c", margin: 0 }}>Error: {error}</p>}

        {activeTab !== "bubbles" && activeTab !== "stats" && renderPins(pinGroups[activeTab])}

        {activeTab === "bubbles" && (
          <section
            style={{
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
                  These chips power the gender, interested-in, interests, and contact fields on the public form.
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
                  <option value="contact_methods">Contact options</option>
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

            {bubbleError && <p style={{ margin: 0, color: "#b91c1c" }}>Bubble error: {bubbleError}</p>}

            <div className="bubble-moderation-grid">
              {[
                ["gender_identity", "Gender"],
                ["seeking", "Interested in"],
                ["interest_tags", "Interests"],
                ["contact_methods", "Contact options"],
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
        )}

        {activeTab === "stats" && (
          <section
            style={{
              padding: "1.25rem 1.1rem",
              borderRadius: 16,
              background: "#fff",
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ margin: 0 }}>Page stats</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <p className="eyebrow">Total pins</p>
                <h3>{stats.total}</h3>
              </div>
              <div className="stat-card">
                <p className="eyebrow">Pending</p>
                <h3>{stats.pending}</h3>
              </div>
              <div className="stat-card">
                <p className="eyebrow">Approved</p>
                <h3>{stats.approved}</h3>
              </div>
              <div className="stat-card">
                <p className="eyebrow">Rejected</p>
                <h3>{stats.rejected}</h3>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default ModerationPage;
