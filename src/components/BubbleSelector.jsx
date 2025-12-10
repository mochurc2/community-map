import { useState, useMemo } from 'react';
import { Chip, ChipGroup } from './Chip';

const MAX_VISIBLE_BUBBLES = 6;

/**
 * BubbleSelector Component
 *
 * A multi-select or single-select component using chips/bubbles.
 * Supports custom input, show more/less toggle, and prioritizing selected items.
 *
 * @param {Object} props
 * @param {string} props.label - Label text for the selector
 * @param {string} props.helper - Optional helper text
 * @param {Array<string>} props.options - Available options to select from
 * @param {boolean} props.multiple - Allow multiple selections
 * @param {string|Array<string>} props.value - Current selected value(s)
 * @param {Function} props.onChange - Callback when selection changes
 * @param {boolean} props.allowCustom - Show custom input field
 * @param {Function} props.onAddOption - Callback when custom option is added
 * @param {boolean} props.prioritizeSelected - Sort selected items first
 * @param {boolean} props.alwaysShowAll - Always show all options (no "show more")
 * @param {string} props.footnote - Optional footnote text
 */
export function BubbleSelector({
  label,
  helper,
  options,
  multiple = false,
  value,
  onChange,
  allowCustom = false,
  onAddOption = () => {},
  prioritizeSelected = false,
  alwaysShowAll = false,
  footnote,
  showHiddenCount = false,
}) {
  const [userShowAll, setUserShowAll] = useState(alwaysShowAll);
  const [customInput, setCustomInput] = useState("");

  const showAll = alwaysShowAll || userShowAll;

  const selectedValues = useMemo(() => {
    if (multiple) {
      return new Set(Array.isArray(value) ? value : []);
    }
    return value ? new Set([value]) : new Set();
  }, [multiple, value]);

  const orderedOptions = useMemo(() => {
    const base = Array.isArray(options) ? [...options] : [];
    if (!prioritizeSelected) return base;

    return base.sort((a, b) => {
      const aSelected = selectedValues.has(a);
      const bSelected = selectedValues.has(b);
      if (aSelected === bSelected) return a.localeCompare(b);
      return aSelected ? -1 : 1;
    });
  }, [options, prioritizeSelected, selectedValues]);

  const displayOptions = useMemo(
    () => (showAll ? orderedOptions : orderedOptions.slice(0, MAX_VISIBLE_BUBBLES)),
    [orderedOptions, showAll]
  );

  const collapsedHiddenCount = useMemo(() => {
    if (showAll) return 0;
    return Math.max(orderedOptions.length - MAX_VISIBLE_BUBBLES, 0);
  }, [orderedOptions, showAll]);

  const toggleOption = (option) => {
    if (multiple) {
      if (value.includes(option)) {
        onChange(value.filter((v) => v !== option));
      } else {
        onChange([...value, option]);
      }
    } else {
      onChange(value === option ? "" : option);
    }
  };

  const handleAddCustom = (e) => {
    e?.preventDefault?.();
    const normalized = customInput.trim();
    if (!normalized) return;
    if (multiple) {
      onChange(value.includes(normalized) ? value : [...value, normalized]);
    } else {
      onChange(normalized);
    }
    if (!options.includes(normalized)) {
      onAddOption(normalized);
    }
    setCustomInput("");
  };

  return (
    <div className="label">
      <div className="label-heading">
        <span>{label}</span>
      </div>
      {helper && <p className="helper-text label-helper">{helper}</p>}
      <ChipGroup layout="grid">
        {displayOptions.map((option) => {
          const isSelected = multiple
            ? value.includes(option)
            : value === option;
          return (
            <Chip
              key={option}
              selected={isSelected}
              onClick={() => toggleOption(option)}
            >
              {option}
            </Chip>
          );
        })}
        {orderedOptions.length > MAX_VISIBLE_BUBBLES && !alwaysShowAll && (
          <Chip
            variant="ghost"
            onClick={() => setUserShowAll((v) => !v)}
          >
            {showAll
              ? "Show less"
              : showHiddenCount && collapsedHiddenCount > 0
                ? `+ ${collapsedHiddenCount} more`
                : "+ more"}
          </Chip>
        )}
      </ChipGroup>
      {allowCustom && (
        <div className="custom-row">
          <input
            type="text"
            className="input"
            placeholder="Add interest"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
          />
          <Chip className="add" onClick={handleAddCustom}>
            +
          </Chip>
        </div>
      )}
      {footnote && <p className="subtle-footnote">{footnote}</p>}
    </div>
  );
}

export default BubbleSelector;
