/**
 * Filter utility functions for matching pins against filter criteria
 */

import {
  normalizeLabel,
  getCanonicalBaseGender,
  isTransLabel,
} from './genderUtils';

/**
 * Check if a pin matches the gender filter selection
 */
export const matchesGenderSelection = (pin, filterGenders) => {
  if (filterGenders.length === 0) return true;

  const pinGenders = Array.isArray(pin.genders)
    ? pin.genders
    : pin.gender_identity
      ? [pin.gender_identity]
      : [];

  const selectedNormalized = filterGenders.map(normalizeLabel).filter(Boolean);
  const baseSelections = Array.from(
    new Set(
      selectedNormalized
        .map(getCanonicalBaseGender)
        .filter(Boolean)
        .map(normalizeLabel)
    )
  );
  const hasTransSelected = selectedNormalized.some(isTransLabel);

  const pinNormalized = pinGenders.map(normalizeLabel).filter(Boolean);
  const pinHasTrans = pinNormalized.some(isTransLabel);
  const pinBaseLabels = Array.from(
    new Set(
      pinNormalized
        .map(getCanonicalBaseGender)
        .filter(Boolean)
        .map(normalizeLabel)
    )
  );

  if (hasTransSelected && baseSelections.length === 0) {
    return pinHasTrans;
  }

  if (hasTransSelected) {
    return baseSelections.some(
      (selection) => pinHasTrans && pinBaseLabels.includes(selection)
    );
  }

  return baseSelections.some((selection) => pinBaseLabels.includes(selection));
};

/**
 * Check if a pin matches the seeking filter selection
 */
export const matchesSeekingSelection = (pin, filterSeeking) => {
  if (filterSeeking.length === 0) return true;

  const pinSeeking = Array.isArray(pin.seeking) ? pin.seeking : [];
  const selectedNormalized = filterSeeking.map(normalizeLabel).filter(Boolean);
  const baseSelections = Array.from(
    new Set(
      selectedNormalized
        .map(getCanonicalBaseGender)
        .filter(Boolean)
        .map(normalizeLabel)
    )
  );
  const hasTransSelected = selectedNormalized.some(isTransLabel);

  const pinNormalized = pinSeeking.map(normalizeLabel).filter(Boolean);
  const pinHasTrans = pinNormalized.some(isTransLabel);
  const pinBaseLabels = Array.from(
    new Set(
      pinNormalized
        .map(getCanonicalBaseGender)
        .filter(Boolean)
        .map(normalizeLabel)
    )
  );

  if (hasTransSelected && baseSelections.length === 0) {
    return pinHasTrans;
  }

  if (hasTransSelected) {
    return baseSelections.some(
      (selection) => pinHasTrans && pinBaseLabels.includes(selection)
    );
  }

  return baseSelections.some((selection) => pinBaseLabels.includes(selection));
};

/**
 * Check if a pin matches the age range filter
 */
export const matchesAgeRange = (pin, ageRange) => {
  if (!pin.age) return true;
  const [minAge, maxAge] = ageRange;
  const ageNumber = Number(pin.age);
  if (Number.isNaN(ageNumber)) return true;
  return ageNumber >= minAge && ageNumber <= maxAge;
};

/**
 * Check if a pin matches the interest tag filter
 */
export const matchesInterestSelection = (pin, filterInterestTags, isInterestApproved) => {
  const approvedInterests = (pin.interest_tags || []).filter(isInterestApproved);
  return (
    filterInterestTags.length === 0 ||
    filterInterestTags.some((opt) => approvedInterests.includes(opt))
  );
};

/**
 * Filter pins based on all filter criteria
 */
export const filterPins = (pins, filters, isInterestApproved) => {
  return pins.filter(
    (pin) =>
      matchesGenderSelection(pin, filters.genders) &&
      matchesSeekingSelection(pin, filters.seeking) &&
      matchesInterestSelection(pin, filters.interest_tags, isInterestApproved) &&
      matchesAgeRange(pin, filters.ageRange)
  );
};
