import BubbleSelector from './BubbleSelector';
import { useFilterContext } from '../context';
import { useAppContext } from '../context';

const MIN_AGE = 18;
const MAX_AGE = 100;

/**
 * FilterPanel Component
 *
 * Panel for filtering pins by gender, seeking, age range, and interests.
 * Uses FilterContext and AppContext to access filter state and handlers.
 */
export function FilterPanel() {
  const {
    filters,
    ageRangeStyle,
    handleFilterChange,
    handleAgeRangeChange,
    clearFilters,
    orderedInterestOptions,
  } = useFilterContext();

  const { bubbleOptions } = useAppContext();

  return (
    <div className="panel-body">
      <div className="panel-section">
        <p className="muted">Narrow down visible pins by selecting the traits below.</p>
      </div>
      <div className="form-grid compact">
        <BubbleSelector
          label="Gender"
          options={bubbleOptions.gender_identity}
          multiple
          value={filters.genders}
          onChange={(value) => handleFilterChange("genders", value)}
        />
        <BubbleSelector
          label="Interested in"
          options={bubbleOptions.seeking}
          multiple
          value={filters.seeking}
          onChange={(value) => handleFilterChange("seeking", value)}
        />
        <div className="label age-filter">
          <div className="label-heading">
            <span>Age range</span>
            <span className="helper-text label-helper">
              {filters.ageRange[0]}–{filters.ageRange[1]}
            </span>
          </div>
          <div className="age-range-slider">
            <div className="age-range-track" style={ageRangeStyle} aria-hidden="true" />
            <input
              type="range"
              min={MIN_AGE}
              max={MAX_AGE}
              value={filters.ageRange[0]}
              onChange={(e) => handleAgeRangeChange(0, e.target.value)}
            />
            <input
              type="range"
              min={MIN_AGE}
              max={MAX_AGE}
              value={filters.ageRange[1]}
              className="upper-thumb"
              onChange={(e) => handleAgeRangeChange(1, e.target.value)}
            />
          </div>
        </div>
        <BubbleSelector
          label="Interests"
          options={orderedInterestOptions}
          multiple
          value={filters.interest_tags}
          onChange={(value) => handleFilterChange("interest_tags", value)}
        />
        <div className="filter-actions">
          <button type="button" className="ghost" onClick={clearFilters}>
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );
}

export default FilterPanel;
