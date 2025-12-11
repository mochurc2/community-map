import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx"; // main map page
import ModerationPage from "./components/ModerationPage.jsx"; // we'll create this next
import EntryGate from "./components/EntryGate.jsx";
import { ThemeProvider } from "./context";
import { supabase, supabaseConfigError } from "./supabaseClient";
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
  const [turnstileSession, setTurnstileSession] = useState(() => loadStoredSession());

  const clearSession = useCallback(() => {
    setTurnstileSession(null);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (err) {
      console.error("Unable to clear Turnstile session", err);
    }
    if (supabase) {
      supabase.auth.signOut().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!turnstileSession?.token || !supabase) return;
    const applySession = async () => {
      try {
        const { error } = await supabase.auth.setSession({
          access_token: turnstileSession.token,
          refresh_token: turnstileSession.token,
        });
        if (error) {
          console.error("Failed to set Supabase session", error);
          clearSession();
        }
      } catch (err) {
        console.error("Supabase session error", err);
        clearSession();
      }
    };
    applySession();
  }, [turnstileSession, clearSession]);

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
      if (supabase) {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: token,
            refresh_token: token,
          });
          if (error) {
            console.error("Supabase session setup failed", error);
            return { ok: false, message: "Unable to connect to Supabase. Please retry." };
          }
        } catch (err) {
          console.error("Supabase session setup failed", err);
          return { ok: false, message: "Unable to connect to Supabase. Please retry." };
        }
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

  const hasVerifiedSession = Boolean(turnstileSession?.token);
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
