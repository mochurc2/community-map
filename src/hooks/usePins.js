import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { filterPins } from '../utils/filterUtils';
import { normalizeLabel } from '../utils/genderUtils';

/**
 * Hook to manage pin data fetching and filtering
 */
export function usePins(filters, isInterestApproved) {
  const [pins, setPins] = useState([]);
  const [pinsError, setPinsError] = useState(null);
  const [loadingPins, setLoadingPins] = useState(true);
  const [pendingPinsCount, setPendingPinsCount] = useState(null);
  const [pendingPinsLoading, setPendingPinsLoading] = useState(true);
  const [pendingPinsError, setPendingPinsError] = useState(null);
  const [pendingPins, setPendingPins] = useState([]);

  const refreshPendingPins = useCallback(async () => {
    if (!supabase) return;
    setPendingPinsLoading(true);
    setPendingPinsError(null);
    try {
      const { data, error } = await supabase
        .from("pending_pin_locations")
        .select("pin_id, lat, lng");
      if (error) {
        throw error;
      }
      const sanitized = (data || [])
        .filter((pin) => typeof pin.lat === "number" && typeof pin.lng === "number")
        .map((pin) => ({
          id: pin.pin_id,
          lat: pin.lat,
          lng: pin.lng,
        }));
      setPendingPins(sanitized);
      setPendingPinsCount(sanitized.length);
    } catch (err) {
      console.error(err);
      setPendingPins([]);
      setPendingPinsError(err.message);
    } finally {
      setPendingPinsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    async function fetchPins() {
      if (!supabase) return;
      setLoadingPins(true);
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("pins")
        .select(
          [
            "id",
            "lat",
            "lng",
            "city",
            "state_province",
            "country",
            "country_code",
            "icon",
            "nickname",
            "age",
            "genders",
            "gender_identity",
            "seeking",
            "interest_tags",
            "note",
            "contact_methods",
            "expires_at",
            "never_delete",
            "approved_at",
          ].join(", ")
        )
        .eq("status", "approved")
        .or(`never_delete.eq.true,expires_at.is.null,expires_at.gt.${nowIso}`);

      if (error) {
        console.error(error);
        if (error.message?.includes("age")) {
          setPinsError(
            "The Supabase schema is missing the 'age' column. Please run the SQL in supabase/schema.sql to refresh your database."
          );
        } else {
          setPinsError(error.message);
        }
      } else {
        setPins(data || []);
      }
      setLoadingPins(false);
    }

    fetchPins();
    refreshPendingPins();
  }, [refreshPendingPins, supabase]);

  const filteredPins = useMemo(() => {
    return filterPins(pins, filters, isInterestApproved);
  }, [filters, isInterestApproved, pins]);

  const approvedPinsCount = pins.length;

  const pendingPinsLabel = pendingPinsLoading
    ? "Loading pending pins..."
    : pendingPinsError
      ? "Pending count unavailable"
      : `${typeof pendingPinsCount === "number" ? pendingPinsCount : 0} Pins pending!`;

  // Calculate interest popularity for sorting
  const interestPopularity = useMemo(() => {
    const counts = new Map();
    pins.forEach((pin) => {
      (pin.interest_tags || []).forEach((tag) => {
        const normalized = normalizeLabel(tag);
        if (!normalized) return;
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
    });
    return counts;
  }, [pins]);

  // Calculate contact method popularity for sorting
  const contactPopularity = useMemo(() => {
    const counts = new Map();
    pins.forEach((pin) => {
      Object.entries(pin.contact_methods || {}).forEach(([channel, value]) => {
        if (!value) return;
        const normalized = normalizeLabel(channel);
        if (!normalized) return;
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
    });
    return counts;
  }, [pins]);

  return {
    pins,
    filteredPins,
    pendingPins,
    loadingPins,
    pinsError,
    pendingPinsLoading,
    pendingPinsError,
    pendingPinsCount,
    approvedPinsCount,
    pendingPinsLabel,
    interestPopularity,
    contactPopularity,
    refreshPendingPins,
  };
}

export default usePins;
