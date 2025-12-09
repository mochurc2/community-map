import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx"; // main map page
import ModerationPage from "./ModerationPage.jsx"; // we'll create this next
import EntryGate from "./EntryGate.jsx";
import "./index.css";

const GATE_STORAGE_KEY = "map-entry-gate-passed";

function Root() {
  const [gatePassed, setGatePassed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(GATE_STORAGE_KEY) === "true";
    } catch (err) {
      console.error("Unable to read gate status", err);
      return false;
    }
  });

  const handleGateComplete = () => {
    try {
      localStorage.setItem(GATE_STORAGE_KEY, "true");
    } catch (err) {
      console.error("Unable to persist gate status", err);
    }
    setGatePassed(true);
  };

  const isDev = import.meta.env.MODE === "development";
  const shouldShowGate = !isDev && !gatePassed;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/moderate" element={<ModerationPage />} />
      </Routes>
      {shouldShowGate && <EntryGate onComplete={handleGateComplete} />}
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);

export default Root;
