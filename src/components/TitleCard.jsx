import { Info, Plus, Filter, Search, Scissors } from 'lucide-react';
import { forwardRef } from 'react';

/**
 * TitleCard Component
 *
 * The header card with app title and panel toggle buttons.
 *
 * @param {Object} props
 * @param {string} props.activePanel - Currently active panel ('info', 'search', 'add', 'filter', or null)
 * @param {Function} props.onTogglePanel - Callback to toggle panel (receives panel name)
 * @param {React.Ref} ref - Forwarded ref to the title card element
 */
export const TitleCard = forwardRef(function TitleCard(
  { activePanel, onTogglePanel },
  ref
) {
  return (
    <div className="title-card" ref={ref}>
      <div className="title-row">
        <Scissors className="title-icon" aria-hidden />
        <div className="title-text">
          <h1>The Hair Fetish Map</h1>
        </div>
      </div>

      <div className="title-actions">
        <button
          type="button"
          className={`icon-pill ${activePanel === "info" ? "active" : ""}`}
          onClick={() => onTogglePanel("info")}
        >
          <Info size={18} />
          <span>Info</span>
        </button>
        <button
          type="button"
          className={`icon-pill ${activePanel === "search" ? "active" : ""}`}
          onClick={() => onTogglePanel("search")}
        >
          <Search size={18} />
          <span>Search</span>
        </button>
        <button
          type="button"
          className={`icon-pill ${activePanel === "add" ? "active" : ""}`}
          onClick={() => onTogglePanel("add")}
        >
          <Plus size={18} />
          <span>Add pin</span>
        </button>
        <button
          type="button"
          className={`icon-pill ${activePanel === "filter" ? "active" : ""}`}
          onClick={() => onTogglePanel("filter")}
        >
          <Filter size={18} />
          <span>Filter</span>
        </button>
      </div>
    </div>
  );
});

export default TitleCard;
