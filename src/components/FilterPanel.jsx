import BubbleSelector from './BubbleSelector';

const MIN_AGE = 18;
const MAX_AGE = 100;

/**
 * FilterPanel Component
 *
 * Panel for filtering pins by gender, seeking, age range, and interests.
 *
 * @param {Object} props
 * @param {Object} props.filters - Current filter values
 * @param {Object} props.bubbleOptions - Available options (gender_identity, seeking)
 * @param {Array<string>} props.orderedInterestOptions - Ordered interest tag options
 * @param {Function} props.onFilterChange - Callback when filter changes (field, value)
 * @param {Function} props.onAgeRangeChange - Callback when age range changes (index, value)
 * @param {Function} props.onClearFilters - Callback to reset all filters
 * @param {Object} props.ageRangeStyle - Inline style for age range track
 */
export function FilterPanel({
  filters,
  bubbleOptions,
  orderedInterestOptions,
  onFilterChange,
  onAgeRangeChange,
  onClearFilters,
  ageRangeStyle,
}) {
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
          onChange={(value) => onFilterChange("genders", value)}
        />
        <BubbleSelector
          label="Interested in"
          options={bubbleOptions.seeking}
          multiple
          value={filters.seeking}
          onChange={(value) => onFilterChange("seeking", value)}
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
              onChange={(e) => onAgeRangeChange(0, e.target.value)}
            />
            <input
              type="range"
              min={MIN_AGE}
              max={MAX_AGE}
              value={filters.ageRange[1]}
              className="upper-thumb"
              onChange={(e) => onAgeRangeChange(1, e.target.value)}
            />
          </div>
        </div>
        <BubbleSelector
          label="Interests"
          options={orderedInterestOptions}
          multiple
          value={filters.interest_tags}
          onChange={(value) => onFilterChange("interest_tags", value)}
        />
        <div className="filter-actions">
          <button type="button" className="ghost" onClick={onClearFilters}>
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );
}

export default FilterPanel;
