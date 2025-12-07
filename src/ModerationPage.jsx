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
              Delete
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
  const [authError, setAuthError] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [serverBubbleRows, setServerBubbleRows] = useState([]);
  const [draftBubbleOptions, setDraftBubbleOptions] = useState({
    gender_identity: [],
    seeking: [],
    interest_tags: [],
    contact_methods: [],
  });
  const [bubbleError, setBubbleError] = useState(null);
  const [newBubbleInputs, setNewBubbleInputs] = useState({
    gender_identity: "",
    seeking: "",
    interest_tags: "",
    contact_methods: "",
  });
  const [savingChanges, setSavingChanges] = useState(false);
  const defaultBubbleSet = useMemo(() => getDefaultBubbleOptions(), []);
  const [hasAccess, setHasAccess] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const buildDefaultModerationOptions = useCallback(
    () =>
      Object.fromEntries(
        Object.entries(defaultBubbleSet).map(([field, labels]) => [
          field,
          labels.map((label, idx) => ({
            id: `default-${field}-${idx}`,
            label,
            source: "default",
          })),
        ])
      ),
    [defaultBubbleSet]
  );

  const mapRowsToBubbles = useCallback(
    (rows) => {
      const grouped = {
        gender_identity: [],
        seeking: [],
        interest_tags: [],
        contact_methods: [],
      };

      const defaults = buildDefaultModerationOptions();

      rows?.forEach((row) => {
        if (grouped[row.field]) {
          grouped[row.field].push({ id: row.id, label: row.label, source: "remote" });
        }
      });

      Object.keys(grouped).forEach((field) => {
        const existingLabels = new Set(grouped[field].map((opt) => opt.label.toLowerCase()));
        defaults[field].forEach((opt) => {
          if (!existingLabels.has(opt.label.toLowerCase())) {
            grouped[field].push(opt);
          }
        });
      });

      return grouped;
    },
    [buildDefaultModerationOptions]
  );

  const refreshBubbleOptions = useCallback(async () => {
    setBubbleError(null);
    try {
      const rows = await fetchBubbleOptionsWithIds();
      setServerBubbleRows(rows || []);
      const mapped = mapRowsToBubbles(rows);
      setDraftBubbleOptions(mapped);
      setNewBubbleInputs({
        gender_identity: "",
        seeking: "",
        interest_tags: "",
        contact_methods: "",
      });
    } catch (err) {
      console.error(err);
      setBubbleError(err.message);
      const fallback = buildDefaultModerationOptions();
      setDraftBubbleOptions(fallback);
    }
  }, [buildDefaultModerationOptions, mapRowsToBubbles]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setHasAccess(Boolean(data?.session?.user));
      })
      .catch((err) => {
        console.error(err);
        setAuthError(err.message);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasAccess(Boolean(session?.user));
      if (!session?.user) {
        setPins([]);
      }
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

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

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
  };

  const handleAddOption = (field) => {
    setBubbleError(null);
    const label = newBubbleInputs[field].trim();
    if (!label) return;
    const exists = draftBubbleOptions[field]?.some(
      (opt) => opt.label.toLowerCase() === label.toLowerCase()
    );
    if (exists) {
      setBubbleError("That bubble already exists in this section.");
      return;
    }

    const newOption = {
      id: `draft-${field}-${Date.now()}`,
      label,
      source: "draft",
    };

    setDraftBubbleOptions((current) => ({
      ...current,
      [field]: [...(current[field] || []), newOption],
    }));

    setNewBubbleInputs((current) => ({ ...current, [field]: "" }));
  };

  const handleSaveBubble = (field, option, label) => {
    setBubbleError(null);
    setDraftBubbleOptions((current) => ({
      ...current,
      [field]: current[field].map((opt) => (opt.id === option.id ? { ...opt, label } : opt)),
    }));
  };

  const handleDeleteBubble = (field, option) => {
    setBubbleError(null);
    setDraftBubbleOptions((current) => ({
      ...current,
      [field]: current[field].filter((opt) => opt.id !== option.id),
    }));
  };

  const serverBubblesByField = useMemo(
    () => ({
      gender_identity: serverBubbleRows.filter((row) => row.field === "gender_identity"),
      seeking: serverBubbleRows.filter((row) => row.field === "seeking"),
      interest_tags: serverBubbleRows.filter((row) => row.field === "interest_tags"),
      contact_methods: serverBubbleRows.filter((row) => row.field === "contact_methods"),
    }),
    [serverBubbleRows]
  );

  const pendingChanges = useMemo(() => {
    const changes = [];

    Object.keys(draftBubbleOptions).forEach((field) => {
      const draftOptions = draftBubbleOptions[field] || [];
      const serverOptions = serverBubblesByField[field] || [];
      const serverMap = new Map(serverOptions.map((opt) => [opt.id, opt]));
      const serverLabels = new Set(serverOptions.map((opt) => opt.label.toLowerCase()));
      const draftIds = new Set(draftOptions.map((opt) => opt.id));

      draftOptions.forEach((opt) => {
        if (serverMap.has(opt.id)) {
          const serverOpt = serverMap.get(opt.id);
          if (serverOpt.label !== opt.label) {
            changes.push({
              type: "update",
              field,
              id: opt.id,
              from: serverOpt.label,
              to: opt.label,
            });
          }
        } else if (!serverLabels.has(opt.label.toLowerCase())) {
          changes.push({ type: "add", field, label: opt.label });
        }
      });

      serverOptions.forEach((opt) => {
        if (!draftIds.has(opt.id)) {
          changes.push({ type: "delete", field, id: opt.id, label: opt.label });
        }
      });
    });

    return changes;
  }, [draftBubbleOptions, serverBubblesByField]);

  const applyPendingChanges = useCallback(
    async (changes) => {
      if (!changes || changes.length === 0) return;
      const summary = changes
        .map((change) => {
          if (change.type === "update") {
            return `${change.field}: ${change.from} → ${change.to}`;
          }
          return `${change.type} ${change.field}: ${change.label}`;
        })
        .join("\n");

      const confirmed = window.confirm(`Apply ${changes.length} changes?\n\n${summary}`);
      if (!confirmed) return;

      setSavingChanges(true);
      setBubbleError(null);
      try {
        for (const change of changes) {
          if (change.type === "add") {
            await addBubbleOption(change.field, change.label);
          }
          if (change.type === "update") {
            await updateBubbleOption(change.id, change.to);
          }
          if (change.type === "delete") {
            await deleteBubbleOption(change.id);
          }
        }

        await refreshBubbleOptions();
      } catch (err) {
        console.error(err);
        setBubbleError(err.message);
      } finally {
        setSavingChanges(false);
      }
    },
    [refreshBubbleOptions]
  );

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
          <h1 style={{ marginTop: "0.35rem" }}>Moderator login</h1>
          <p style={{ marginTop: "0.4rem", color: "#374151" }}>
            Sign in with the Supabase moderator account to manage submissions and bubble options.
          </p>

          <form onSubmit={handleLogin} style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontWeight: 600 }}>
              Email
              <input
                type="email"
                className="input"
                placeholder="moderator@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontWeight: 600 }}>
              Password
              <input
                type="password"
                className="input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {authError && <p style={{ color: "#b91c1c", margin: 0 }}>{authError}</p>}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button type="submit" disabled={authLoading}>
                {authLoading ? "Signing in…" : "Sign in"}
              </button>
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

  const bubbleSections = [
    { id: "gender_identity", title: "Gender" },
    { id: "seeking", title: "Interested in" },
    { id: "interest_tags", title: "Interests" },
    { id: "contact_methods", title: "Contact options" },
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button type="button" className="ghost-button" onClick={handleLogout}>
              Sign out
            </button>
            <Link to="/" className="link" style={{ color: "#0f172a", fontWeight: 700 }}>
              ← Back to map
            </Link>
          </div>
        </header>

        <div className="tab-row">
          {tabs.map((tab) => (
            <TabButton key={tab.id} {...tab} active={activeTab === tab.id} onClick={setActiveTab} />
          ))}
        </div>

        {error && <p style={{ color: "#b91c1c", margin: 0 }}>Error: {error}</p>}

        {activeTab !== "bubbles" && activeTab !== "stats" && renderPins(pinGroups[activeTab])}

        {activeTab === "bubbles" && (
          <section className="bubble-moderation-shell">
            <div className="bubble-moderation-heading">
              <div>
                <p className="eyebrow">Bubble library</p>
                <h2 style={{ marginTop: "0.35rem" }}>Manage selectable options</h2>
                <p className="muted">
                  Stage changes to the gender, interested-in, interests, and contact chips, then save once you are
                  happy with the edits.
                </p>
              </div>
              <div className="bubble-action-cluster">
                <div className="pending-count">
                  <span className="small-chip">{pendingChanges.length} pending</span>
                  {pendingChanges.length > 0 && <span className="muted">Review below before syncing</span>}
                </div>
                <button
                  type="button"
                  className="primary"
                  onClick={() => applyPendingChanges(pendingChanges)}
                  disabled={pendingChanges.length === 0 || savingChanges}
                >
                  {savingChanges ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>

            {bubbleError && <p style={{ margin: 0, color: "#b91c1c" }}>Bubble error: {bubbleError}</p>}

            <div className="bubble-moderation-sections">
              {bubbleSections.map(({ id, title }) => (
                <div key={id} className="bubble-moderation-section">
                  <div className="bubble-section-header">
                    <div>
                      <p className="eyebrow">{title}</p>
                      <h3 style={{ marginTop: "0.25rem" }}>{draftBubbleOptions[id]?.length || 0} total bubbles</h3>
                    </div>
                    <div className="inline-add-form">
                      <input
                        className="input"
                        placeholder={`Add a ${title.toLowerCase()} bubble`}
                        value={newBubbleInputs[id]}
                        onChange={(e) => setNewBubbleInputs((current) => ({ ...current, [id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddOption(id);
                          }
                        }}
                      />
                      <button type="button" onClick={() => handleAddOption(id)}>
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="bubble-editor-list">
                    {draftBubbleOptions[id]?.map((option) => (
                      <ModerationBubbleEditor
                        key={`${option.id}-${option.label}`}
                        option={option}
                        field={id}
                        onSave={handleSaveBubble}
                        onDelete={handleDeleteBubble}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pending-changes-panel">
              <div>
                <p className="eyebrow">Pending changes</p>
                <p className="muted" style={{ marginTop: "0.2rem" }}>
                  Confirm below to sync to Supabase. Default bubbles that are not yet stored will be added automatically.
                </p>
              </div>
              {pendingChanges.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No edits waiting to sync.</p>
              ) : (
                <ul className="pending-list">
                  {pendingChanges.map((change, idx) => (
                    <li key={`${change.type}-${change.field}-${idx}`}>
                      <span className={`pending-chip pending-${change.type}`}>{change.type}</span>
                      <span>
                        {change.field.replace("_", " ")} ·
                        {change.type === "update"
                          ? ` ${change.from} → ${change.to}`
                          : ` ${change.label}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="pending-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => applyPendingChanges(pendingChanges)}
                  disabled={pendingChanges.length === 0 || savingChanges}
                >
                  {savingChanges ? "Saving…" : "Save changes"}
                </button>
                <p className="muted" style={{ margin: 0 }}>
                  You can keep editing bubbles above; changes stay local until you save.
                </p>
              </div>
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
