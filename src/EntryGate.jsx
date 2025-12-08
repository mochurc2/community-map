import { useEffect, useMemo, useRef, useState } from "react";
import PolicyModal from "./PolicyModal";
import privacyPolicyContent from "../PrivacyPolicy.md?raw";
import termsContent from "../ToS.md?raw";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

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
      setError("We couldn't start the verification challenge. Please refresh and try again.");
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore cleanup errors
        }
      }
      widgetIdRef.current = null;
    };
  }, [turnstileReady]);

  const handleSubmit = (event) => {
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

    setSubmitting(true);
    setError("");
    try {
      onComplete(token);
    } catch (err) {
      console.error("Entry gate completion failed", err);
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
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
