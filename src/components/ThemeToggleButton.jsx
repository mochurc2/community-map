import { Moon, Sun } from "lucide-react";
import { useMemo } from "react";
import { useTheme } from "../context";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function ThemeToggleButton({ className }) {
  const { mode, toggleTheme, isDark } = useTheme();
  const iconProps = { size: 18, strokeWidth: 1.8 };
  const Icon = useMemo(() => (mode === "dark" ? Sun : Moon), [mode]);

  return (
    <button
      type="button"
      className={classNames("icon-pill", "icon-only", "theme-toggle", className)}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-pressed={isDark}
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Icon {...iconProps} />
    </button>
  );
}

export default ThemeToggleButton;
