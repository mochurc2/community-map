import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx"; // main map page
import ModerationPage from "./components/ModerationPage.jsx"; // we'll create this next
import EntryGate from "./components/EntryGate.jsx";
import { ThemeProvider } from "./context";
import { supabase, supabaseConfigError, setSupabaseAccessToken } from "./supabaseClient";
import "./index.css";

const SESSION_STORAGE_KEY = "turnstile-session";

const loadStoredSession = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.expiresAt) return null;
    if (parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("Unable to read stored Turnstile session", err);
    return null;
  }
};

function Root() {
  const isDev = import.meta.env.DEV;
  const [turnstileSession, setTurnstileSession] = useState(() => {
    if (isDev) {
      return { token: "dev-token", expiresAt: Number.MAX_SAFE_INTEGER };
    }
    const stored = loadStoredSession();
    if (stored?.token) {
      setSupabaseAccessToken(stored.token);
    }
    return stored;
  });

  const clearSession = useCallback(() => {
    setTurnstileSession(null);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (err) {
      console.error("Unable to clear Turnstile session", err);
    }
    setSupabaseAccessToken(null);
  }, []);

  useEffect(() => {
    if (!turnstileSession?.expiresAt) return;
    const remaining = Math.max(0, turnstileSession.expiresAt - Date.now());
    if (remaining === 0) {
      clearSession();
      return undefined;
    }
    const timeout = setTimeout(() => {
      clearSession();
    }, remaining);
    return () => clearTimeout(timeout);
  }, [turnstileSession, clearSession]);

  const handleGateComplete = useCallback(
    async ({ token, expiresIn, sessionId }) => {
      if (!token || !expiresIn) {
        return { ok: false, message: "Missing Turnstile session token." };
      }
      const expiresAt = Date.now() + expiresIn * 1000;
      const nextSession = { token, expiresAt, sessionId };
      const client = setSupabaseAccessToken(token);
      if (!client) {
        return { ok: false, message: "Supabase configuration is missing. Check environment variables." };
      }
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
        }
      } catch (err) {
        console.error("Unable to persist Turnstile session", err);
      }
      setTurnstileSession(nextSession);
      return { ok: true };
    },
    [],
  );

  useEffect(() => {
    if (!turnstileSession?.token || isDev) return;
    setSupabaseAccessToken(turnstileSession.token);
  }, [turnstileSession, isDev]);

  const hasVerifiedSession = isDev || Boolean(turnstileSession?.token);
  const shouldRenderApp = hasVerifiedSession || Boolean(supabaseConfigError);

  return (
    <BrowserRouter>
      {shouldRenderApp && (
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/moderate" element={<ModerationPage />} />
        </Routes>
      )}
      {!supabaseConfigError && !hasVerifiedSession && (
        <EntryGate onComplete={handleGateComplete} />
      )}
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <Root />
  </ThemeProvider>
);

export default Root;
