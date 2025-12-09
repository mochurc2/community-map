/**
 * Gender utility functions for normalizing and categorizing gender labels
 */

export const normalizeLabel = (label) => label?.toString().trim().toLowerCase();

export const isBaseGenderLabel = (label) => {
  const normalized = normalizeLabel(label);
  return (
    normalized === "man" ||
    normalized === "men" ||
    normalized === "woman" ||
    normalized === "women" ||
    normalized === "nonbinary" ||
    normalized === "non-binary"
  );
};

export const getCanonicalBaseGender = (label) => {
  const normalized = normalizeLabel(label);
  if (normalized === "man" || normalized === "men" || normalized === "male" || normalized === "m") return "Man";
  if (normalized === "woman" || normalized === "women" || normalized === "female" || normalized === "f") return "Woman";
  if (normalized === "nonbinary" || normalized === "non-binary" || normalized === "nb" || normalized === "enby") {
    return "Non-binary";
  }
  return "";
};

export const isTransLabel = (label) => normalizeLabel(label)?.startsWith("trans");

/**
 * Sanitize gender selection to enforce consistent structure:
 * - One base gender (Man/Woman/Non-binary)
 * - Trans modifier if selected
 * - Any extra custom selections
 */
export const sanitizeGenderSelection = (next) => {
  const incoming = Array.isArray(next) ? next : [];
  const seen = new Set();
  const uniqueNext = incoming.filter((gender) => {
    const normalized = normalizeLabel(gender);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  const baseCandidate = uniqueNext.find(isBaseGenderLabel);
  const baseLabel = baseCandidate ? getCanonicalBaseGender(baseCandidate) : "";
  const hasTrans = uniqueNext.some(isTransLabel);

  const extras = uniqueNext.filter(
    (gender) => !isBaseGenderLabel(gender) && !isTransLabel(gender)
  );

  const sanitized = [];
  if (baseLabel) sanitized.push(baseLabel);
  if (hasTrans) sanitized.push("Trans");
  sanitized.push(...extras);
  return sanitized;
};
