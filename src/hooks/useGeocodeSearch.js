import { useState, useCallback } from "react";
import { searchLocations } from "../services/mapTilerGeocoding";

/**
 * Hook to manage geocoding search state and logic
 * @returns {Object} Search state and handlers
 */
export function useGeocodeSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = useCallback(async (query) => {
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchResults = await searchLocations(query.trim(), 10);
      setResults(searchResults);

      if (searchResults.length === 0) {
        setError("No locations found. Try different keywords.");
      }
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);

      if (err.message?.includes("key")) {
        setError("Search is not configured. Please check API key.");
      } else if (err.message?.includes("status")) {
        setError("Search temporarily unavailable. Please try later.");
      } else {
        setError("Search failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setResults([]);
    setError(null);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    results,
    loading,
    error,
    handleSearch,
    clearSearch,
  };
}
