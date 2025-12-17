import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

const initialForm = {
  nickname: "",
  note: "",
  contact_discord: "",
  contact_reddit: "",
  contact_instagram: "",
  expires_at: "",
  never_delete: false,
  contact_methods_json: "{}",
};

function safeParseJson(value) {
  if (!value || value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return null;
  }
}

export default function EditPinPage() {
  const [params] = useSearchParams();
  const pinId = params.get("id");
  const token = params.get("token");

  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const hasParams = useMemo(() => Boolean(pinId && token), [pinId, token]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setError(null);
    setSuccess(null);
  };

  const buildPatch = () => {
    const patch = {};
    if (form.nickname.trim()) patch.nickname = form.nickname.trim();
    if (form.note.trim()) patch.note = form.note.trim();
    if (form.contact_discord.trim()) patch.contact_discord = form.contact_discord.trim();
    if (form.contact_reddit.trim()) patch.contact_reddit = form.contact_reddit.trim();
    if (form.contact_instagram.trim()) patch.contact_instagram = form.contact_instagram.trim();

    if (form.expires_at) {
      patch.expires_at = `${form.expires_at}T23:59:00Z`;
    }
    patch.never_delete = Boolean(form.never_delete);

    const contactParsed = safeParseJson(form.contact_methods_json);
    if (contactParsed === null) {
      throw new Error("Contact methods JSON is invalid. Use an object like {\"discord\":\"name\"}.");
    }
    if (Object.keys(contactParsed).length > 0) {
      patch.contact_methods = contactParsed;
    }

    return patch;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasParams) {
      setError("Missing pin id or token in the URL.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const patch = buildPatch();
      if (Object.keys(patch).length === 0) {
        setError("Add at least one field to update.");
        setSubmitting(false);
        return;
      }

      const { error: rpcError } = await supabase.rpc("update_pin_via_secret", {
        p_pin_id: pinId,
        p_secret_token: token,
        p_patch: patch,
        p_delete: false,
      });

      if (rpcError) {
        setError(rpcError.message);
        setSubmitting(false);
        return;
      }

      setSuccess("Updated. Your pin is now marked as pending for moderation.");
      setSubmitting(false);
    } catch (err) {
      setError(err.message || "Unable to update pin.");
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!hasParams) {
      setError("Missing pin id or token in the URL.");
      return;
    }
    if (!window.confirm("Delete this pin? This cannot be undone.")) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { error: rpcError } = await supabase.rpc("update_pin_via_secret", {
      p_pin_id: pinId,
      p_secret_token: token,
      p_patch: {},
      p_delete: true,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    setSuccess("Pin deleted.");
    setSubmitting(false);
  };

  if (!hasParams) {
    return (
      <div className="page-shell">
        <div className="card">
          <h1>Edit pin</h1>
          <p>Missing pin id or token. Use the link from your email.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="card">
        <h1>Edit or delete your pin</h1>
        <p className="muted">Only fill fields you want to change. Updates are re-moderated (status = pending).</p>

        <form onSubmit={handleSubmit} className="form-grid compact" style={{ marginTop: "1rem" }}>
          <label className="label">
            <span>Nickname</span>
            <input
              name="nickname"
              value={form.nickname}
              onChange={handleChange}
              className="input"
              placeholder="Leave blank to keep current"
            />
          </label>

          <label className="label">
            <span>Note</span>
            <textarea
              name="note"
              value={form.note}
              onChange={handleChange}
              className="input"
              rows={3}
              placeholder="Leave blank to keep current"
            />
          </label>

          <label className="label">
            <span>Discord</span>
            <input
              name="contact_discord"
              value={form.contact_discord}
              onChange={handleChange}
              className="input"
              placeholder="username#1234"
            />
          </label>

          <label className="label">
            <span>Reddit</span>
            <input
              name="contact_reddit"
              value={form.contact_reddit}
              onChange={handleChange}
              className="input"
              placeholder="u/yourname"
            />
          </label>

          <label className="label">
            <span>Instagram</span>
            <input
              name="contact_instagram"
              value={form.contact_instagram}
              onChange={handleChange}
              className="input"
              placeholder="@yourname"
            />
          </label>

          <label className="label">
            <span>Other contact methods (JSON)</span>
            <textarea
              name="contact_methods_json"
              value={form.contact_methods_json}
              onChange={handleChange}
              className="input"
              rows={3}
              placeholder='{"telegram":"@name","website":"https://..."}'
            />
          </label>

          <label className="label">
            <span>Delete pin after</span>
            <input
              type="date"
              name="expires_at"
              value={form.expires_at}
              onChange={handleChange}
              className="input"
            />
            <label className="checkbox-label" style={{ marginTop: "0.35rem" }}>
              <input
                type="checkbox"
                name="never_delete"
                checked={form.never_delete}
                onChange={handleChange}
              />
              <span>Never delete</span>
            </label>
          </label>

          {error && <p className="status error">{error}</p>}
          {success && <p className="status success">{success}</p>}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              className="danger"
              onClick={handleDelete}
              disabled={submitting}
              style={{ background: "#b00020" }}
            >
              Delete pin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
