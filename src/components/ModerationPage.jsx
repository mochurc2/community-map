import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addBubbleOption,
  deleteBubbleOption,
  fetchBubbleOptionsWithIds,
  getDefaultBubbleOptions,
  updateBubbleOption,
} from "./bubbleOptions";
import { tokens, helpers } from "../styles/tokens";
import { supabase, supabaseAdmin, supabaseConfigError } from "../supabaseClient";
const moderationClient = supabaseAdmin || supabase;

const normalizeStatus = (value) => {
  if (value === "pending" || value === "rejected") return value;
  return "approved";
};

function ModerationBubbleEditor({ option, field, onSave, onDelete }) {
  const [label, setLabel] = useState(option.label);
  const [status, setStatus] = useState(normalizeStatus(option.status));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLabel(option.label);
    setStatus(normalizeStatus(option.status));
  }, [option.label, option.status]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = async () => {
    if (!label.trim()) return;
    setBusy(true);
    await onSave(field, option, label.trim(), status);
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
          <div className="flex-center">
            <label className="helper-text font-bold">
              Status
            </label>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(normalizeStatus(e.target.value))}
              style={{ maxWidth: 180 }}
            >
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="mod-bubble-actions">
            <button type="button" className="primary" onClick={save} disabled={busy}>
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
          <span className={`status-pill status-${status}`}>{status}</span>
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
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState(null);
  const [activeMessageFilter, setActiveMessageFilter] = useState("open");
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
            status: "approved",
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
          grouped[row.field].push({
            id: row.id,
            label: row.label,
            source: "remote",
            status: normalizeStatus(row.status),
          });
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

  const purgeExpiredPins = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const { error: purgeError } = await moderationClient
      .from("pins")
      .delete()
      .lte("expires_at", nowIso)
      .eq("never_delete", false);

    if (purgeError) {
      console.error(purgeError);
      setError((current) => current || purgeError.message);
    }
  }, []);

  const fetchPins = useCallback(async () => {
    setLoadingPins(true);
    await purgeExpiredPins();
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
  }, [purgeExpiredPins]);

  const fetchMessages = useCallback(async () => {
    setLoadingMessages(true);
    const { data, error: supaError } = await moderationClient
      .from("messages")
      .select("*, pin:pins(*)")
      .order("created_at", { ascending: false });

    if (supaError) {
      console.error(supaError);
      setMessageError(supaError.message);
    } else {
      setMessages(data || []);
      setMessageError(null);
    }
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    if (!hasAccess) return;
    fetchPins();
    fetchMessages();
    refreshBubbleOptions();
  }, [fetchMessages, fetchPins, hasAccess, refreshBubbleOptions]);

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

  const deletePin = async (id) => {
    const confirmed = window.confirm("Delete this rejected pin permanently?");
    if (!confirmed) return;

    const { error: supaError } = await moderationClient.from("pins").delete().eq("id", id);

    if (supaError) {
      console.error(supaError);
      alert("Error deleting pin: " + supaError.message);
      return;
    }

    fetchPins();
  };

  const deleteAllRejectedPins = async () => {
    const confirmed = window.confirm("Delete all rejected pins permanently? This cannot be undone.");
    if (!confirmed) return;

    const { error: supaError } = await moderationClient.from("pins").delete().eq("status", "rejected");

    if (supaError) {
      console.error(supaError);
      alert("Error deleting rejected pins: " + supaError.message);
      return;
    }

    fetchPins();
  };

  const handleReportPinStatus = async (pinId, status) => {
    await updateStatus(pinId, status);
    fetchMessages();
  };

  const updateMessageStatus = async (id, status) => {
    setMessageError(null);
    const { error: supaError } = await moderationClient.from("messages").update({ status }).eq("id", id);

    if (supaError) {
      console.error(supaError);
      setMessageError(supaError.message);
      return;
    }

    fetchMessages();
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
      status: "approved",
    };

    setDraftBubbleOptions((current) => ({
      ...current,
      [field]: [...(current[field] || []), newOption],
    }));

    setNewBubbleInputs((current) => ({ ...current, [field]: "" }));
  };

  const handleSaveBubble = (field, option, label, status) => {
    setBubbleError(null);
    setDraftBubbleOptions((current) => ({
      ...current,
      [field]: current[field].map((opt) =>
        opt.id === option.id ? { ...opt, label, status: normalizeStatus(status) } : opt
      ),
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
          if (serverOpt.label !== opt.label || normalizeStatus(serverOpt.status) !== normalizeStatus(opt.status)) {
            changes.push({
              type: "update",
              field,
              id: opt.id,
              from: { label: serverOpt.label, status: normalizeStatus(serverOpt.status) },
              to: { label: opt.label, status: normalizeStatus(opt.status) },
            });
          }
        } else if (!serverLabels.has(opt.label.toLowerCase()) && opt.source !== "default") {
          changes.push({
            type: "add",
            field,
            label: opt.label,
            status: normalizeStatus(opt.status),
          });
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

  const syncInterestTagsForLabel = useCallback(
    async (label, replacement = null) => {
      if (!label) return;
      const lowerLabel = label.toLowerCase();
      const { data: pinsToUpdate, error: fetchPinsError } = await moderationClient
        .from("pins")
        .select("id, interest_tags")
        .contains("interest_tags", [label]);

      if (fetchPinsError) {
        console.error(fetchPinsError);
        return;
      }

      for (const pin of pinsToUpdate || []) {
        const currentTags = Array.isArray(pin.interest_tags) ? pin.interest_tags : [];
        const filtered = currentTags.filter((tag) => tag && tag.toLowerCase() !== lowerLabel);
        if (replacement) {
          const hasReplacement = filtered.some((tag) => tag.toLowerCase() === replacement.toLowerCase());
          if (!hasReplacement) {
            filtered.push(replacement);
          }
        }

        await moderationClient.from("pins").update({ interest_tags: filtered }).eq("id", pin.id);
      }
    },
    []
  );

  const applyPendingChanges = useCallback(
    async (changes) => {
      if (!changes || changes.length === 0) return;
      const summary = changes
        .map((change) => {
          if (change.type === "update") {
            return `${change.field}: ${change.from.label} (${change.from.status}) → ${change.to.label} (${change.to.status})`;
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
            await addBubbleOption(change.field, change.label, change.status || "approved");
          }
          if (change.type === "update") {
            await updateBubbleOption(change.id, change.to.label, change.to.status);

            if (change.field === "interest_tags") {
              if (normalizeStatus(change.to.status) === "rejected") {
                await syncInterestTagsForLabel(change.from.label);
              } else if (change.from.label !== change.to.label) {
                await syncInterestTagsForLabel(change.from.label, change.to.label);
              }
            }
          }
          if (change.type === "delete") {
            await deleteBubbleOption(change.id);

            if (change.field === "interest_tags") {
              await syncInterestTagsForLabel(change.label);
            }
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
    [refreshBubbleOptions, syncInterestTagsForLabel]
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

  const messageGroups = useMemo(
    () => ({
      all: messages,
      open: messages.filter((msg) => msg.status === "open"),
      resolved: messages.filter((msg) => msg.status === "resolved"),
    }),
    [messages]
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

  const messageStats = useMemo(
    () => ({
      total: messages.length,
      open: messageGroups.open.length,
      resolved: messageGroups.resolved.length,
    }),
    [messageGroups.open.length, messageGroups.resolved.length, messages.length]
  );

  if (!hasAccess && !supabaseConfigError) {
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

          <form onSubmit={handleLogin} className="flex-col gap-lg" style={{ marginTop: "1rem" }}>
            <label className="flex-col gap-sm font-semibold">
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
            <label className="flex-col gap-sm font-semibold">
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
            {authError && <p className="m-0" style={{ color: tokens.colors.status.error.text }}>{authError}</p>}
            <div className="flex-row">
              <button type="submit" disabled={authLoading}>
                {authLoading ? "Signing in…" : "Sign in"}
              </button>
              <Link to="/" className="link font-bold" style={{ color: tokens.colors.status.info.text }}>
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
      <div style={{ display: "grid", gap: tokens.spacing.lg }}>
        {list.map((pin) => (
          <div
            key={pin.id}
            style={helpers.card}
          >
            <div className="flex-between gap-md">
              <div>
                <p className="m-0 font-bold flex-center">
                  <span>{pin.icon || "📍"}</span>
                  <span>{pin.nickname || "No nickname"}</span>
                </p>
                <p className="detail-text">
                  {pin.city || "Unknown location"} {pin.state_province && `(${pin.state_province})`} {pin.country || pin.country_code}
                  {" "}
                  <span className="font-medium text-muted">
                    ({pin.lat?.toFixed(4)}, {pin.lng?.toFixed(4)})
                  </span>
                </p>
                <p className="detail-text">
                  Gender: {pin.genders?.length ? pin.genders.join(", ") : pin.gender_identity || "unspecified"}
                  {pin.seeking && pin.seeking.length > 0 && <> — Interested in: {pin.seeking.join(", ")}</>}
                </p>
                {pin.interest_tags && pin.interest_tags.length > 0 && (
                  <p className="detail-text">
                    Interests: {pin.interest_tags.join(", ")}
                  </p>
                )}
                {pin.note && (
                  <p className="detail-text">
                    Note: {pin.note}
                  </p>
                )}
                {pin.contact_methods && Object.keys(pin.contact_methods).length > 0 && (
                  <p className="detail-text">
                    Contact: {Object.entries(pin.contact_methods)
                      .map(([key, val]) => `${key}: ${val}`)
                      .join(" · ")}
                  </p>
                )}
                <p style={{ margin: "0.25rem 0", fontSize: "0.9rem", color: "#6b7280" }}>
                  Delete after: {pin.never_delete ? "Never" : formatDate(pin.expires_at)}
                </p>
              </div>
              <div style={{ textAlign: "right", color: "#4b5563", fontSize: "0.9rem" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{pin.status}</p>
                <p style={{ margin: "0.1rem 0 0" }}>Submitted {new Date(pin.submitted_at).toLocaleString()}</p>
              </div>
            </div>

            <div className="pin-status-row">
              {["approved", "pending", "rejected"].map((status) => (
                <button
                  key={status}
                  onClick={() => updateStatus(pin.id, status)}
                  className={`status-button status-${status} ${pin.status === status ? "active" : ""}`}
                >
                  {status === "approved" && "Approve"}
                  {status === "pending" && "Mark pending"}
                  {status === "rejected" && "Reject"}
                </button>
              ))}
            </div>
            {pin.status === "rejected" && (
              <div className="pin-status-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ color: "#b91c1c" }}
                  onClick={() => deletePin(pin.id)}
                >
                  Delete pin
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderMessages = (list) => {
    if (loadingMessages) {
      return <p style={{ margin: 0 }}>Loading messages…</p>;
    }

    if (!loadingMessages && list.length === 0) {
      return (
        <p style={{ margin: 0, color: "#16a34a", fontWeight: 700 }}>
          Nothing to review 🎉
        </p>
      );
    }

    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {list.map((msg) => {
          const pin = msg.pin;
          return (
            <div
              key={msg.id}
              style={helpers.card}
            >
              <div className="flex-between gap-lg">
                <div>
                  <p className="m-0 font-bold">
                    {msg.kind === "pin_report" ? "Pin report" : "Site feedback"}
                  </p>
                  <p className="text-muted" style={{ marginTop: tokens.spacing.xxs }}>
                    Received {new Date(msg.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`status-pill status-${msg.status === "resolved" ? "approved" : "pending"}`}
                  style={{ alignSelf: "flex-start" }}
                >
                  {msg.status}
                </span>
              </div>

              <p className="text-base" style={{ margin: "0.75rem 0 0.35rem" }}>{msg.message}</p>
              <p className="m-0 text-base text-muted">
                Contact: {msg.contact_info || "Not provided"}
              </p>

              {pin && (
                <div
                  style={{
                    marginTop: "0.65rem",
                    padding: "0.75rem",
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                  }}
                >
                  <div className="flex-between gap-md">
                    <div>
                      <p className="m-0 font-bold flex-center">
                        <span>{pin.icon || "📍"}</span>
                        <span>{pin.nickname || "No nickname"}</span>
                      </p>
                      <p className="detail-text">
                        {pin.city || "Unknown location"} {pin.state_province && `(${pin.state_province})`} {pin.country || pin.country_code}
                      </p>
                      <p className="detail-text">
                        Gender: {pin.genders?.length ? pin.genders.join(", ") : pin.gender_identity || "unspecified"}
                        {pin.seeking && pin.seeking.length > 0 && <> — Interested in: {pin.seeking.join(", ")}</>}
                      </p>
                      {pin.interest_tags && pin.interest_tags.length > 0 && (
                        <p className="detail-text">
                          Interests: {pin.interest_tags.join(", ")}
                        </p>
                      )}
                      {pin.note && (
                        <p className="detail-text">
                          Note: {pin.note}
                        </p>
                      )}
                      {pin.contact_methods && Object.keys(pin.contact_methods).length > 0 && (
                        <p className="detail-text">
                          Contact: {Object.entries(pin.contact_methods)
                            .map(([key, val]) => `${key}: ${val}`)
                            .join(" · ")}
                        </p>
                      )}
                      <p style={{ margin: "0.25rem 0", fontSize: "0.9rem", color: "#6b7280" }}>
                        Delete after: {pin.never_delete ? "Never" : formatDate(pin.expires_at)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right", color: "#4b5563", fontSize: "0.9rem" }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{pin.status}</p>
                      <p style={{ margin: "0.1rem 0 0" }}>Submitted {new Date(pin.submitted_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="pin-status-row" style={{ marginTop: "0.45rem" }}>
                    {["approved", "pending", "rejected"].map((status) => (
                      <button
                        key={status}
                        onClick={() => handleReportPinStatus(pin.id, status)}
                        className={`status-button status-${status} ${pin.status === status ? "active" : ""}`}
                      >
                        {status === "approved" && "Approve"}
                        {status === "pending" && "Mark pending"}
                        {status === "rejected" && "Reject"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pin-status-row" style={{ justifyContent: "flex-end", marginTop: "0.4rem" }}>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={msg.status === "open"}
                  onClick={() => updateMessageStatus(msg.id, "open")}
                >
                  Mark open
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ background: "#ecfdf3", borderColor: "#bbf7d0", color: "#166534" }}
                  disabled={msg.status === "resolved"}
                  onClick={() => updateMessageStatus(msg.id, "resolved")}
                >
                  Resolve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const tabs = [
    { id: "all", label: "All pins", count: stats.total },
    { id: "pending", label: "Pending pins", count: stats.pending },
    { id: "approved", label: "Approved pins", count: stats.approved },
    { id: "rejected", label: "Rejected pins", count: stats.rejected },
    { id: "messages", label: "Messages", count: messageStats.open },
    { id: "bubbles", label: "Bubble Library" },
    { id: "stats", label: "Page stats" },
  ];

  const bubbleSections = [
    { id: "gender_identity", title: "Gender" },
    { id: "seeking", title: "Interested in" },
    { id: "interest_tags", title: "Interests" },
    { id: "contact_methods", title: "Contact options" },
  ];

  const messageFilters = [
    { id: "open", label: "Open", count: messageStats.open },
    { id: "resolved", label: "Resolved", count: messageStats.resolved },
    { id: "all", label: "All", count: messageStats.total },
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
        <header className="flex-between">
          <div>
            <p className="m-0 font-bold" style={{ color: "#4f46e5" }}>Moderation</p>
            <h1 style={{ margin: "0.2rem 0 0" }}>Pins & messages</h1>
            <p className="text-muted" style={{ margin: "0.4rem 0 0" }}>
              Review submissions, visitor reports, and keep the bubble library up to date.
            </p>
          </div>
          <div className="flex-row gap-lg">
            <button type="button" className="ghost-button" onClick={handleLogout}>
              Sign out
            </button>
            <Link to="/" className="link font-bold">
              ← Back to map
            </Link>
          </div>
        </header>

        <div className="tab-row">
          {tabs.map((tab) => (
            <TabButton key={tab.id} {...tab} active={activeTab === tab.id} onClick={setActiveTab} />
          ))}
        </div>

        {error && <p className="m-0" style={{ color: tokens.colors.status.error.text }}>Error: {error}</p>}

        {activeTab === "messages" && (
          <section style={{ display: "grid", gap: "0.75rem" }}>
            <div className="pending-actions">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Visitor messages</p>
                <p className="muted" style={{ marginTop: 4 }}>
                  Feedback, site issues, and pin reports submitted from the map.
                </p>
              </div>
              <div className="flex-wrap">
                {messageFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className="ghost-button"
                    style={
                      activeMessageFilter === filter.id
                        ? { background: "#eef2ff", borderColor: "#c7d2fe", color: "#3730a3" }
                        : undefined
                    }
                    onClick={() => setActiveMessageFilter(filter.id)}
                  >
                    {filter.label}
                    {typeof filter.count === "number" && filter.count > 0 && (
                      <span className="small-chip">{filter.count}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {messageError && <p style={{ color: "#b91c1c", margin: 0 }}>Error: {messageError}</p>}
            {renderMessages(messageGroups[activeMessageFilter] || [])}
          </section>
        )}

        {activeTab === "rejected" && pinGroups.rejected.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.9rem 1rem",
              borderRadius: "12px",
              border: "1px solid #fecaca",
              background: "#fef2f2",
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "#991b1b" }}>Rejected pin cleanup</p>
              <p style={{ margin: "0.25rem 0 0", color: "#b91c1c" }}>
                Delete all rejected pins from the database once you have reviewed them.
              </p>
            </div>
            <button
              type="button"
              className="ghost-button"
              style={{ color: "#b91c1c", fontWeight: 700 }}
              onClick={deleteAllRejectedPins}
            >
              Delete all rejected pins
            </button>
          </div>
        )}

        {[
          "all",
          "pending",
          "approved",
          "rejected",
        ].includes(activeTab) && renderPins(pinGroups[activeTab])}

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
                  Confirm below to sync to Supabase. Built-in defaults stay local and are not auto-saved.
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
              borderRadius: "16px",
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
