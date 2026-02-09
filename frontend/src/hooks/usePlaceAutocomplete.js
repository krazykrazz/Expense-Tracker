import { useState, useEffect } from 'react';
import { getPlaces } from '../services/expenseApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('usePlaceAutocomplete');

/**
 * Custom hook for place autocomplete functionality
 * Manages place list fetching, filtering, and suggestion display
 * 
 * @returns {Object} Place autocomplete state and handlers
 * @returns {Array<string>} places - Full list of place names
 * @returns {Array<string>} filteredPlaces - Filtered places based on search
 * @returns {boolean} showSuggestions - Whether to show suggestion dropdown
 * @returns {Function} setShowSuggestions - Update suggestion visibility
 * @returns {Function} filterPlaces - Filter places by search value
 * @returns {Function} fetchPlaces - Manually trigger places fetch
 */
function usePlaceAutocomplete() {
  const [places, setPlaces] = useState([]);
  const [filteredPlaces, setFilteredPlaces] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch places on mount
  useEffect(() => {
    let isMounted = true;

    const fetchPlacesData = async () => {
      try {
        const data = await getPlaces();
        if (isMounted && data) {
          setPlaces(data);
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Failed to fetch places:', error);
        }
      }
    };

    fetchPlacesData();

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Filter places based on search value (case-insensitive substring match)
   * @param {string} value - Search value
   */
  const filterPlaces = (value) => {
    if (value.trim() === '') {
      setFilteredPlaces([]);
      setShowSuggestions(false);
    } else {
      const filtered = places.filter(place =>
        place.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredPlaces(filtered);
      setShowSuggestions(filtered.length > 0);
    }
  };

  /**
   * Manually trigger places fetch (useful for refresh scenarios)
   */
  const fetchPlaces = async () => {
    try {
      const data = await getPlaces();
      if (data) {
        setPlaces(data);
      }
    } catch (error) {
      logger.error('Failed to fetch places:', error);
    }
  };

  return {
    places,
    filteredPlaces,
    showSuggestions,
    setShowSuggestions,
    filterPlaces,
    fetchPlaces
  };
}

export default usePlaceAutocomplete;
