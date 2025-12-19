import { forwardRef } from "react";
import { X, Info, Plus, Filter, Pencil } from "lucide-react";

const PANEL_ICONS = {
  info: { icon: <Info />, label: "About this map" },
  add: { icon: <Plus />, label: "Add your pin" },
  filter: { icon: <Filter />, label: "Filter pins" },
  edit: { icon: <Pencil />, label: "Edit your pin" },
};

/**
 * Panel Component
 *
 * Reusable panel wrapper with header, title, and close button.
 * Handles panel placement and expansion state.
 *
 * @param {Object} props
 * @param {string} props.activePanel - Active panel type: 'info', 'add', or 'filter'
 * @param {string} props.placement - Panel placement: 'side' or 'bottom'
 * @param {boolean} props.showFullAddForm - Whether add form is expanded
 * @param {number} props.titleCardHeight - Height of title card for bottom placement
 * @param {Function} props.onClose - Close handler
 * @param {React.ReactNode} props.children - Panel content
 */
function PanelBase({
  activePanel,
  placement,
  showFullAddForm,
  titleCardHeight,
  offsetTop = 0,
  onClose,
  children,
}, ref) {
  const panelTitle = PANEL_ICONS[activePanel];

  const style =
    placement === "bottom" && activePanel === "add" && showFullAddForm
      ? { top: `${Math.max(titleCardHeight + 42, 150)}px` }
      : offsetTop > 0
        ? { marginTop: `${offsetTop}px` }
        : undefined;

  return (
    <div
      className={`floating-panel ${placement} ${
        activePanel === "add" && showFullAddForm ? "expanded" : ""
      }`}
      style={style}
      ref={ref}
    >
      <div className="panel-top">
        <div className="panel-title">
          <div className="panel-icon">{panelTitle.icon}</div>
          <h3>{panelTitle.label}</h3>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          <X size={24} />
        </button>
      </div>
      {children}
    </div>
  );
}

const Panel = forwardRef(PanelBase);

export { Panel };
export default Panel;
