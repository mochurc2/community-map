import { Search, Loader, MapPin } from "lucide-react";
import { useGeocodeSearch } from "../hooks/useGeocodeSearch";

/**
 * SearchPanel Component
 *
 * Panel for searching locations using MapTiler Geocoding API.
 * Allows users to search for a location and select it to center the map.
 */
export function SearchPanel({ onLocationSelect }) {
  const {
    searchQuery,
    setSearchQuery,
    results,
    loading,
    error,
    handleSearch,
    clearSearch,
  } = useGeocodeSearch();

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch(searchQuery);
  };

  const handleResultClick = (result) => {
    if (onLocationSelect) {
      onLocationSelect(result);
    }
    clearSearch();
  };

  return (
    <div className="panel-body">
      <div className="panel-section">
        <p className="muted">Search for a location by name to explore the map.</p>
      </div>

      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder="Search for a location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            className="search-button"
            disabled={loading || !searchQuery.trim()}
            aria-label="Search"
          >
            {loading ? <Loader size={18} className="spin" /> : <Search size={18} />}
          </button>
        </div>
      </form>

      {error && (
        <div className="search-error">
          <p>{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results">
          {results.map((result, index) => (
            <button
              key={index}
              type="button"
              className="search-result-item"
              onClick={() => handleResultClick(result)}
            >
              <MapPin size={18} className="result-icon" />
              <div className="result-content">
                <div className="result-name">{result.displayName}</div>
                {result.address && result.address !== result.displayName && (
                  <div className="result-address muted">{result.address}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchPanel;
