import { createContext, useContext, useEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "community-map-theme";

const lightTheme = {
  mode: "light",
  colors: {
    primary: "#2563eb",
    primaryStrong: "#1d4ed8",
    primaryMuted: "#e5f0ff",
    background: {
      page: "#ffffff",
      surface: "#ffffff",
      raised: "#f8fafc",
      muted: "#f3f4f6",
    },
    text: {
      primary: "#0f172a",
      body: "#111827",
      secondary: "#374151",
      muted: "#6b7280",
      inverse: "#ffffff",
    },
    border: {
      subtle: "#e5e7eb",
      strong: "#d0d7e2",
    },
    button: {
      background: "#ffffff",
      border: "#d0d7e2",
      ghostBackground: "#f3f4f6",
      ghostBorder: "#e5e7eb",
      text: "#0f172a",
    },
    status: {
      success: { text: "#16a34a", bg: "#ecfdf3", border: "#86efac" },
      error: { text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
      warning: { text: "#d97706", bg: "#fef3c7", border: "#fcd34d" },
      info: { text: "#4f46e5", bg: "#eef2ff", border: "#c7d2fe" },
    },
    overlay: {
      scrim: "rgba(15, 23, 42, 0.45)",
      scrimStrong: "rgba(15, 23, 42, 0.55)",
    },
  },
  shadow: {
    panel: "0 12px 40px rgba(15, 23, 42, 0.14)",
    card: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
};

const darkTheme = {
  mode: "dark",
  colors: {
    primary: "#9bb6ff",
    primaryStrong: "#7aa0ff",
    primaryMuted: "rgba(124, 157, 255, 0.14)",
    background: {
      page: "#0b1220",
      surface: "#0f172a",
      raised: "#111a2e",
      muted: "#172036",
    },
    text: {
      primary: "#e6edf7",
      body: "#dce4f3",
      secondary: "#c2d0e4",
      muted: "#9fb1c8",
      inverse: "#0b1220",
    },
    border: {
      subtle: "#1f2b3f",
      strong: "#2f3f5c",
    },
    button: {
      background: "#111b2f",
      border: "#24324b",
      ghostBackground: "#172236",
      ghostBorder: "#24324b",
      text: "#e6edf7",
    },
    status: {
      success: { text: "#7ee0a3", bg: "rgba(34, 197, 94, 0.14)", border: "#1f5d3c" },
      error: { text: "#fca5a5", bg: "rgba(248, 113, 113, 0.12)", border: "#7f1d1d" },
      warning: { text: "#fbbf24", bg: "rgba(251, 191, 36, 0.14)", border: "#92400e" },
      info: { text: "#c7d2fe", bg: "rgba(99, 102, 241, 0.15)", border: "#3730a3" },
    },
    overlay: {
      scrim: "rgba(6, 10, 18, 0.6)",
      scrimStrong: "rgba(6, 10, 18, 0.75)",
    },
  },
  shadow: {
    panel: "0 18px 48px rgba(0, 0, 0, 0.55)",
    card: "0 12px 36px rgba(0, 0, 0, 0.45)",
  },
};

const ThemeContext = createContext({
  mode: "light",
  theme: lightTheme,
  isDark: false,
  setMode: () => {},
  toggleTheme: () => {},
});

const getInitialMode = () => {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  } catch (error) {
    console.error("theme read failed", error);
    return "light";
  }
};

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    const initial = getInitialMode();
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", initial);
      document.documentElement.style.colorScheme = initial === "dark" ? "dark" : "light";
    }
    return initial;
  });

  const theme = mode === "dark" ? darkTheme : lightTheme;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", mode);
    document.documentElement.style.colorScheme = mode === "dark" ? "dark" : "light";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.error("theme persist failed", error);
    }
  }, [mode]);

  const value = useMemo(
    () => ({
      mode,
      theme,
      isDark: mode === "dark",
      setMode,
      toggleTheme: () => setMode((current) => (current === "dark" ? "light" : "dark")),
    }),
    [mode, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export { lightTheme, darkTheme };

export default ThemeContext;
