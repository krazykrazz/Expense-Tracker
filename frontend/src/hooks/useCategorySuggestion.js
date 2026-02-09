import { useState } from 'react';
import { fetchCategorySuggestion } from '../services/categorySuggestionApi';

/**
 * Custom hook for category suggestion functionality
 * Manages category auto-suggestion based on place history
 * 
 * @param {Object} params - Hook parameters
 * @param {Function} params.setFormData - Form data setter function
 * @param {Object} params.amountInputRef - Ref to amount input field for focus management
 * @param {Object} params.isSubmittingRef - Ref tracking form submission state
 * @param {Object} params.justSelectedFromDropdownRef - Ref tracking dropdown selection
 * @param {Function} params.setTrackedTimeout - Timeout setter for cleanup tracking
 * @returns {Object} Category suggestion state and handlers
 * @returns {boolean} isCategorySuggested - Whether category was auto-suggested
 * @returns {Function} setIsCategorySuggested - Update suggestion indicator
 * @returns {Function} fetchAndApply - Fetch and apply category suggestion for a place
 * @returns {Function} handlePlaceSelect - Handle place selection from dropdown
 * @returns {Function} handlePlaceBlur - Handle place field blur event
 */
function useCategorySuggestion({
  setFormData,
  amountInputRef,
  isSubmittingRef,
  justSelectedFromDropdownRef,
  setTrackedTimeout
}) {
  const [isCategorySuggested, setIsCategorySuggested] = useState(false);

  /**
   * Fetch category suggestion for a place and auto-select if available
   * @param {string} place - Place name to fetch suggestion for
   */
  const fetchAndApply = async (place) => {
    if (!place || !place.trim()) {
      return;
    }

    const suggestion = await fetchCategorySuggestion(place);
    
    if (suggestion && suggestion.category) {
      setFormData(prev => ({
        ...prev,
        type: suggestion.category
      }));
      setIsCategorySuggested(true);
    } else {
      // No suggestion found - default to "Other"
      setFormData(prev => ({
        ...prev,
        type: 'Other'
      }));
      setIsCategorySuggested(false);
    }
  };

  /**
   * Handle place selection from autocomplete dropdown
   * Fetches category suggestion and updates both place and category
   * @param {string} place - Selected place name
   * @param {Function} setShowSuggestions - Function to hide suggestions dropdown
   * @param {Function} setFilteredPlaces - Function to clear filtered places
   */
  const handlePlaceSelect = async (place, setShowSuggestions, setFilteredPlaces) => {
    // Mark that we're selecting from dropdown to prevent blur handler from running
    justSelectedFromDropdownRef.current = true;
    
    setShowSuggestions(false);
    setFilteredPlaces([]);

    // Fetch category suggestion first, then update both place and category together
    const suggestion = await fetchCategorySuggestion(place);
    
    if (suggestion && suggestion.category) {
      // Update place and category in a single state update to avoid flashing
      setFormData(prev => ({
        ...prev,
        place: place,
        type: suggestion.category
      }));
      setIsCategorySuggested(true);
    } else {
      // No suggestion found - set place and default to "Other"
      setFormData(prev => ({
        ...prev,
        place: place,
        type: 'Other'
      }));
      setIsCategorySuggested(false);
    }

    // Move focus to Amount field after place selection
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
    
    // Reset the flag after a delay (longer than blur handler delay)
    setTrackedTimeout(() => {
      justSelectedFromDropdownRef.current = false;
    }, 300);
  };

  /**
   * Handle place field blur event
   * Fetches category suggestion if place was typed manually (not selected from dropdown)
   * @param {string} currentPlace - Current place value from form
   * @param {Function} setShowSuggestions - Function to hide suggestions dropdown
   */
  const handlePlaceBlur = async (currentPlace, setShowSuggestions) => {
    // Delay to allow click on suggestion dropdown
    setTrackedTimeout(async () => {
      setShowSuggestions(false);
      
      // Don't fetch suggestion if:
      // - Form is being submitted
      // - Just selected from dropdown (to prevent overwriting the selection)
      // - Place is empty
      // - Category has already been suggested
      if (isSubmittingRef.current || justSelectedFromDropdownRef.current || !currentPlace || !currentPlace.trim() || isCategorySuggested) {
        return;
      }
      
      await fetchAndApply(currentPlace);
    }, 200);
  };

  return {
    isCategorySuggested,
    setIsCategorySuggested,
    fetchAndApply,
    handlePlaceSelect,
    handlePlaceBlur
  };
}

export default useCategorySuggestion;
