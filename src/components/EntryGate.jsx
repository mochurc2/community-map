import { useEffect, useMemo, useRef, useState } from "react";
import PolicyModal from "./PolicyModal";
import privacyPolicyContent from "../../PrivacyPolicy.md?raw";
import termsContent from "../../ToS.md?raw";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const supabaseBaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") || "";
const SUPABASE_FUNCTION_URL = supabaseBaseUrl ? `${supabaseBaseUrl}/functions/v1/verify-turnstile` : "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const FINGERPRINT_STORAGE_KEY = "turnstile-fingerprint-id";

function EntryGate({ onComplete }) {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.turnstile)
  );
  const [policyModal, setPolicyModal] = useState(null);
  const widgetContainerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [token, setToken] = useState("");
  const fingerprint = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const stored = window.localStorage.getItem(FINGERPRINT_STORAGE_KEY);
      if (stored) return stored;
      const generated =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(FINGERPRINT_STORAGE_KEY, generated);
      return generated;
    } catch {
      return "";
    }
  }, []);

  const missingKey = useMemo(() => !TURNSTILE_SITE_KEY, []);

  useEffect(() => {
    if (turnstileReady) return;

    const existingScript = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]'
    );

    const handleReady = () => setTurnstileReady(true);

    if (existingScript) {
      existingScript.addEventListener("load", handleReady);
      return () => existingScript.removeEventListener("load", handleReady);
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = handleReady;
    script.onerror = () =>
      setError("We couldn't load the verification widget. Please check your connection or disable blockers.");
    document.head.appendChild(script);

    return () => {
      script.removeEventListener("load", handleReady);
    };
  }, [turnstileReady]);

  useEffect(() => {
    if (!turnstileReady || !widgetContainerRef.current || !TURNSTILE_SITE_KEY) return;
    if (!window.turnstile) return;
    if (widgetIdRef.current) return;

    try {
      widgetIdRef.current = window.turnstile.render(widgetContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
        callback: (newToken) => {
          setToken(newToken);
          setError("");
        },
        "expired-callback": () => setToken(""),
        "error-callback": () => setError("Verification failed. Please retry."),
      });
    } catch (err) {
      console.error("Error rendering Turnstile", err);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [turnstileReady]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!ageConfirmed) {
      setError("You must confirm you are 18 or older.");
      return;
    }
    if (!policyConfirmed) {
      setError("You must agree to the Terms of Service and Privacy Policy.");
      return;
    }
    if (!token) {
      setError("Please complete the Cloudflare Turnstile check.");
      return;
    }
    if (!SUPABASE_FUNCTION_URL || !SUPABASE_ANON_KEY) {
      setError("Missing Supabase config. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(SUPABASE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          token,
          fingerprint,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          payload?.error ||
          payload?.message ||
          (response.status === 429
            ? "Too many attempts. Please wait a minute before trying again."
            : "Verification failed. Please refresh and try again.");
        setError(message);
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
        setToken("");
        setSubmitting(false);
        return;
      }

      const result = await onComplete({
        token: payload.token,
        expiresIn: payload.expires_in,
        sessionId: payload.session_id,
      });

      if (result?.ok === false) {
        setError(result?.message || "Unable to start Supabase session. Please retry.");
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
        setToken("");
        setSubmitting(false);
        return;
      }
    } catch (err) {
      console.error("Entry gate completion failed", err);
      setError("Something went wrong. Please try again.");
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
      }
      setToken("");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  };

  const closePolicy = () => setPolicyModal(null);
  const policyTitle = policyModal === "tos" ? "Terms of Service" : "Privacy Policy";
  const policyContent = policyModal === "tos" ? termsContent : privacyPolicyContent;

  return (
    <div className="gate-overlay" role="dialog" aria-modal="true" aria-label="Safety gate">
      <div className="gate-backdrop" />
      <div className="gate-card">
        <div className="gate-card-header">
          <p className="pill muted-pill">Restricted to adults 18+</p>
          <h2>Quick safety check</h2>
          <p className="muted">
            Please confirm you are an adult, agree to the site policies, and complete the verification
            to continue to the map.
          </p>
        </div>

        <form className="gate-form" onSubmit={handleSubmit}>
          <label className="checkbox-label gate-checkbox">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
            />
            <span>I confirm that I am 18 years of age or older.</span>
          </label>

          <label className="checkbox-label gate-checkbox">
            <input
              type="checkbox"
              checked={policyConfirmed}
              onChange={(e) => setPolicyConfirmed(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <button type="button" className="inline-link" onClick={() => setPolicyModal("tos")}>
                Terms of Service
              </button>{" "}
              and{" "}
              <button type="button" className="inline-link" onClick={() => setPolicyModal("privacy")}>
                Privacy Policy
              </button>
              .
            </span>
          </label>

          <div className="gate-turnstile">
            {missingKey ? (
              <p className="status error">
                Missing Cloudflare Turnstile site key. Set VITE_TURNSTILE_SITE_KEY in your .env file.
              </p>
            ) : (
              <div className="turnstile-container" ref={widgetContainerRef}>
                {!turnstileReady && <p className="muted">Loading verification...</p>}
              </div>
            )}
          </div>

          {error && <p className="status error">{error}</p>}

          <button type="submit" className="primary" disabled={submitting || missingKey}>
            {submitting ? "Checking..." : "Enter the site"}
          </button>
          <p className="gate-footnote">
            You need to complete this check before you can view or edit the map.
          </p>
        </form>
      </div>

      {policyModal && (
        <PolicyModal title={policyTitle} content={policyContent} onClose={closePolicy} />
      )}
    </div>
  );
}

export default EntryGate;
