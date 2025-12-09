import { useState, useEffect, useCallback } from 'react';
import {
  ensurePendingBubbleOption,
  fetchBubbleOptions,
  getDefaultBubbleOptions,
  getDefaultStatusMap,
} from '../components/bubbleOptions';

/**
 * Hook to manage bubble options (gender, seeking, interests, contact methods)
 * and their approval status
 */
export function useBubbleOptions() {
  const [bubbleOptions, setBubbleOptions] = useState(getDefaultBubbleOptions);
  const [bubbleStatusMap, setBubbleStatusMap] = useState(getDefaultStatusMap);
  const [customInterestOptions, setCustomInterestOptions] = useState([]);

  useEffect(() => {
    fetchBubbleOptions()
      .then(({ options, statusMap }) => {
        setBubbleOptions(options);
        setBubbleStatusMap(statusMap);
      })
      .catch(() => {
        setBubbleOptions(getDefaultBubbleOptions());
        setBubbleStatusMap(getDefaultStatusMap());
      });
  }, []);

  const isInterestApproved = useCallback(
    (label) => (bubbleStatusMap.interest_tags?.[label?.toLowerCase?.() || ""] || "approved") === "approved",
    [bubbleStatusMap.interest_tags]
  );

  const handleCustomOption = useCallback(async (field, option) => {
    const normalized = option.trim();
    if (!normalized) return;

    if (field === "interest_tags") {
      setCustomInterestOptions((prev) => {
        const exists = prev.some((label) => label.toLowerCase() === normalized.toLowerCase());
        return exists ? prev : [...prev, normalized];
      });

      setBubbleStatusMap((prev) => ({
        ...prev,
        interest_tags: { ...prev.interest_tags, [normalized.toLowerCase()]: "pending" },
      }));

      try {
        await ensurePendingBubbleOption(field, normalized);
      } catch (err) {
        console.error("Error saving pending bubble", err);
      }

      return;
    }

    setBubbleOptions((prev) => {
      const current = prev[field] || [];
      if (current.includes(normalized)) return prev;
      return { ...prev, [field]: [...current, normalized] };
    });
  }, []);

  return {
    bubbleOptions,
    bubbleStatusMap,
    customInterestOptions,
    isInterestApproved,
    handleCustomOption,
  };
}

export default useBubbleOptions;
