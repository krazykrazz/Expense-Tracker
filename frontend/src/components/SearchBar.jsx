import { useState, useEffect, useRef, memo } from 'react';
import './SearchBar.css';

/**
 * SearchBar Component
 * 
 * Provides global filtering controls for expenses including:
 * - Text search (searches place and notes fields)
 * - Category filter dropdown
 * - Payment method filter dropdown
 * - Clear all filters button
 * 
 * Features:
 * - Debounced text search (300ms delay) for performance
 * - Visual indicators for active filters
 * - Accessibility support (ARIA labels, keyboard navigation, screen reader announcements)
 * - Memoized to prevent unnecessary re-renders
 * 
 * @component
 * @param {Object} props
 * @param {Function} props.onSearchChange - Callback when search text changes (debounced)
 * @param {Function} props.onFilterTypeChange - Callback when category filter changes
 * @param {Function} props.onFilterMethodChange - Callback when payment method filter changes
 * @param {Function} props.onClearFilters - Callback to clear all filters
 * @param {string} props.filterType - Currently selected category filter
 * @param {string} props.filterMethod - Currently selected payment method filter
 * @param {Array<string>} props.categories - Available expense categories
 * @param {Array<string>} props.paymentMethods - Available payment methods
 * @param {boolean} props.loading - Whether expenses are currently loading
 */
const SearchBar = memo(({ 
  onSearchChange, 
  onFilterTypeChange, 
  onFilterMethodChange,
  onClearFilters,
  searchText: externalSearchText = '',
  filterType = '', 
  filterMethod = '',
  categories = [], 
  paymentMethods = [],
  loading = false,
  showOnlySearch = false,
  showOnlyFilters = false
}) => {
  const [searchText, setSearchText] = useState(externalSearchText);
  const [announcement, setAnnouncement] = useState('');
  const searchInputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync local state with external prop
  useEffect(() => {
    setSearchText(externalSearchText);
  }, [externalSearchText]);

  /**
   * Handles text search input changes with debouncing
   * 
   * Updates local state immediately for responsive UI, but debounces
   * the callback to parent component by 300ms to avoid excessive
   * API calls or re-renders during typing.
   * 
   * @param {Event} e - Input change event
   */
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);
    
    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Debounce the search change callback (300ms delay)
    debounceTimerRef.current = setTimeout(() => {
      // Emit search text to parent component after debounce
      if (onSearchChange) {
        onSearchChange(value);
      }

      // Announce search change for screen readers
      if (value.trim().length > 0) {
        setAnnouncement(`Searching for: ${value}`);
      } else {
        setAnnouncement('Search cleared');
      }
    }, 300);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleFilterTypeChange = (e) => {
    const value = e.target.value;
    if (onFilterTypeChange) {
      onFilterTypeChange(value);
    }

    // Announce filter change
    if (value) {
      setAnnouncement(`Category filter applied: ${value}`);
    } else {
      setAnnouncement('Category filter cleared');
    }
  };

  const handleFilterMethodChange = (e) => {
    const value = e.target.value;
    if (onFilterMethodChange) {
      onFilterMethodChange(value);
    }

    // Announce filter change
    if (value) {
      setAnnouncement(`Payment method filter applied: ${value}`);
    } else {
      setAnnouncement('Payment method filter cleared');
    }
  };

  /**
   * Clears all filters and returns to monthly view
   * 
   * Resets:
   * - Local search text state
   * - Any pending debounce timers
   * - All parent filter states (via callback)
   * 
   * Also announces the action to screen readers and returns
   * keyboard focus to the search input for better UX.
   */
  const handleClearAll = () => {
    setSearchText('');
    
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    if (onClearFilters) {
      onClearFilters();
    }

    // Announce clear action for screen readers
    setAnnouncement('All filters cleared. Returned to monthly view.');
    
    // Return focus to search input for keyboard users
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Clear announcement after it's been read
  useEffect(() => {
    if (announcement) {
      const timer = setTimeout(() => {
        setAnnouncement('');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [announcement]);

  // Check if any filter is active
  const hasActiveFilters = searchText.trim().length > 0 || filterType || filterMethod;

  return (
    <div className={`search-bar-container ${loading ? 'loading' : ''}`} role="search">
      {/* Screen reader announcements for filter changes */}
      <div 
        className="sr-only" 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
      >
        {announcement}
      </div>

      <div className="search-filters-wrapper">
        {!showOnlyFilters && (
          <>
            <div className="search-input-wrapper">
              <label htmlFor="expense-search-input" className="sr-only">
                Search expenses by place or notes
              </label>
              <input
                id="expense-search-input"
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder="Search by place or notes..."
                value={searchText}
                onChange={handleSearchChange}
                aria-label="Search expenses by place or notes"
                aria-describedby="search-help"
              />
              <span id="search-help" className="sr-only">
                Enter text to search expenses globally across all time periods
              </span>
            </div>
            {searchText.trim().length > 0 && showOnlySearch && (
              <button 
                className="clear-filters-button" 
                onClick={handleClearAll}
                aria-label="Clear search and return to monthly view"
                title="Clear search and return to monthly view"
                type="button"
              >
                Clear Search
              </button>
            )}
          </>
        )}

        {!showOnlySearch && (
          <>
            <div className="filter-dropdown-wrapper">
              <label htmlFor="category-filter" className="sr-only">
                Filter by expense category
              </label>
              <select
                id="category-filter"
                className={`filter-dropdown ${filterType ? 'active-filter' : ''}`}
                value={filterType}
                onChange={handleFilterTypeChange}
                aria-label="Filter by category"
                aria-describedby="category-help"
                title="Filter by expense category"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <span id="category-help" className="sr-only">
                Select a category to filter expenses globally
              </span>
            </div>

            <div className="filter-dropdown-wrapper">
              <label htmlFor="payment-method-filter" className="sr-only">
                Filter by payment method
              </label>
              <select
                id="payment-method-filter"
                className={`filter-dropdown ${filterMethod ? 'active-filter' : ''}`}
                value={filterMethod}
                onChange={handleFilterMethodChange}
                aria-label="Filter by payment method"
                aria-describedby="method-help"
                title="Filter by payment method"
              >
                <option value="">All Payment Methods</option>
                {paymentMethods.map(method => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <span id="method-help" className="sr-only">
                Select a payment method to filter expenses globally
              </span>
            </div>

            {hasActiveFilters && (
              <button 
                className="clear-filters-button" 
                onClick={handleClearAll}
                aria-label="Clear all filters and return to monthly view"
                title="Clear all filters and return to monthly view"
                type="button"
              >
                Clear Filters
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});

SearchBar.displayName = 'SearchBar';

export default SearchBar;
