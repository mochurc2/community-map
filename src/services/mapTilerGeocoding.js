// MapTiler Geocoding API service
// Provides location search functionality using MapTiler's geocoding endpoint

// Extract API key from environment variable
const MAPTILER_API_KEY = "ie87eY5O43h6j7kfvZYN";

if (!MAPTILER_API_KEY) {
  console.warn("MapTiler API key not found. Search functionality may not work.");
}

/**
 * Search for locations using MapTiler Geocoding API
 * @param {string} query - Search query (city name, address, etc.)
 * @param {number} limit - Maximum number of results to return (default: 10)
 * @returns {Promise<Array>} Array of location results
 */
export async function searchLocations(query, limit = 10) {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return [];
  }

  if (!MAPTILER_API_KEY) {
    throw new Error("MapTiler API key is not configured");
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `https://api.maptiler.com/geocoding/${encodedQuery}.json?key=${MAPTILER_API_KEY}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding request failed with status ${response.status}`);
    }

    const data = await response.json();

    // Parse and normalize results
    if (!data.features || !Array.isArray(data.features)) {
      return [];
    }

    return data.features.map(parseGeocodeResult).filter(Boolean);
  } catch (err) {
    console.error("Geocoding error:", err);
    throw err;
  }
}

/**
 * Parse a single geocode result from MapTiler API response
 * @param {Object} feature - GeoJSON feature from MapTiler response
 * @returns {Object|null} Normalized location object
 */
function parseGeocodeResult(feature) {
  try {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) {
      return null;
    }

    const [lng, lat] = feature.geometry.coordinates;
    const properties = feature.properties || {};

    // Build display name from place_name or text
    const displayName = properties.place_name || properties.text || "Unknown location";

    // Extract address components
    const address = {
      city: properties.place_type?.includes("place") ? properties.text : null,
      region: properties.context?.find(c => c.id?.startsWith("region"))?.text,
      country: properties.context?.find(c => c.id?.startsWith("country"))?.text,
    };

    return {
      displayName,
      lat,
      lng,
      address: formatAddress(properties),
      placeType: properties.place_type?.[0] || "unknown",
      bbox: feature.bbox,
    };
  } catch (err) {
    console.error("Error parsing geocode result:", err);
    return null;
  }
}

/**
 * Format address string from properties
 * @param {Object} properties - Properties from MapTiler result
 * @returns {string} Formatted address string
 */
function formatAddress(properties) {
  const parts = [];

  // Extract place name components
  if (properties.place_name) {
    return properties.place_name;
  }

  if (properties.text) {
    parts.push(properties.text);
  }

  // Add context information
  if (properties.context && Array.isArray(properties.context)) {
    properties.context.forEach(ctx => {
      if (ctx.text && !parts.includes(ctx.text)) {
        parts.push(ctx.text);
      }
    });
  }

  return parts.join(", ") || "Unknown location";
}
