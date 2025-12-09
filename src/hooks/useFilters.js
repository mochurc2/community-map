import { useState, useMemo } from 'react';
import { normalizeLabel } from '../utils/genderUtils';

export const MIN_AGE = 18;
export const MAX_AGE = 100;

/**
 * Hook to manage filter state and handlers
 */
export function useFilters() {
  const [filters, setFilters] = useState({
    genders: [],
    seeking: [],
    interest_tags: [],
    ageRange: [MIN_AGE, MAX_AGE],
  });

  const filtersActive =
    filters.genders.length > 0 ||
    filters.seeking.length > 0 ||
    filters.interest_tags.length > 0 ||
    filters.ageRange[0] !== MIN_AGE ||
    filters.ageRange[1] !== MAX_AGE;

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleAgeRangeChange = (index, value) => {
    setFilters((prev) => {
      const numericValue = Number(value);
      const nextRange = [...prev.ageRange];
      if (index === 0) {
        nextRange[0] = Math.min(numericValue, nextRange[1]);
      } else {
        nextRange[1] = Math.max(numericValue, nextRange[0]);
      }
      return { ...prev, ageRange: nextRange };
    });
  };

  const clearFilters = () =>
    setFilters({ genders: [], seeking: [], interest_tags: [], ageRange: [MIN_AGE, MAX_AGE] });

  const ageRangeStyle = useMemo(() => {
    const [minAge, maxAge] = filters.ageRange;
    const startPercent = ((minAge - MIN_AGE) / (MAX_AGE - MIN_AGE)) * 100;
    const endPercent = ((maxAge - MIN_AGE) / (MAX_AGE - MIN_AGE)) * 100;
    return {
      background: `linear-gradient(to right, #e5e7eb ${startPercent}%, #2563eb ${startPercent}%, #2563eb ${endPercent}%, #e5e7eb ${endPercent}%)`,
    };
  }, [filters.ageRange]);

  return {
    filters,
    filtersActive,
    ageRangeStyle,
    handleFilterChange,
    handleAgeRangeChange,
    clearFilters,
  };
}

/**
 * Hook to compute ordered options based on popularity
 */
export function useOrderedOptions(bubbleOptions, interestPopularity, contactPopularity) {
  // Order interest options by popularity
  const orderedInterestOptions = useMemo(() => {
    const uniqueOptions = Array.from(new Set(bubbleOptions.interest_tags || []));
    return uniqueOptions.sort((a, b) => {
      const countA = interestPopularity.get(normalizeLabel(a)) || 0;
      const countB = interestPopularity.get(normalizeLabel(b)) || 0;
      if (countA !== countB) return countB - countA;
      return a.localeCompare(b);
    });
  }, [bubbleOptions.interest_tags, interestPopularity]);

  // Order contact options by popularity
  const orderedContactOptions = useMemo(() => {
    const uniqueOptions = Array.from(new Set(bubbleOptions.contact_methods || []));
    return uniqueOptions.sort((a, b) => {
      const countA = contactPopularity.get(normalizeLabel(a)) || 0;
      const countB = contactPopularity.get(normalizeLabel(b)) || 0;
      if (countA !== countB) return countB - countA;
      return a.localeCompare(b);
    });
  }, [bubbleOptions.contact_methods, contactPopularity]);

  return {
    orderedInterestOptions,
    orderedContactOptions,
  };
}

export default useFilters;
