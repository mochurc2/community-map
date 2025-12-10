import { Globe2, Map } from "lucide-react";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function ProjectionToggleButton({ projection = "mercator", onToggle = () => {} }) {
  const isGlobe = projection === "globe";
  const Icon = isGlobe ? Map : Globe2;
  const iconProps = { size: 18, strokeWidth: 1.8 };
  const label = isGlobe ? "Switch to flat map" : "Switch to globe view";

  return (
    <button
      type="button"
      className={classNames("icon-pill", "icon-only", "projection-toggle")}
      aria-label={label}
      aria-pressed={isGlobe}
      onClick={onToggle}
      title={label}
    >
      <Icon {...iconProps} />
    </button>
  );
}

export default ProjectionToggleButton;
