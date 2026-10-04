import { useState, useEffect, useRef, memo } from 'react';
import { dateToLocalString } from '../../utils/formatters';
import './SearchBar.css';

const MIN_DATE_YEAR = 2000;

// Each preset returns a start date; the end is left open (= today)
export const DATE_PRESETS = [
  { id: '7d', label: '7 days', start: (t) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - 6) },
  { id: '30d', label: '30 days', start: (t) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - 29) },
  { id: 'month', label: 'This month', start: (t) => new Date(t.getFullYear(), t.getMonth(), 1) },
  { id: 'ytd', label: 'YTD', start: (t) => new Date(t.getFullYear(), 0, 1) },
];

const isCompleteDate = (value) => value === '' || Number(value.slice(0, 4)) >= MIN_DATE_YEAR;

/** Only send a range the API accepts: complete dates, start not after end. */
export const isCommittableRange = (start, end) =>
  isCompleteDate(start) && isCompleteDate(end) && !(start && end && start > end);

/**
 * SearchBar Component
 * 
 * Provides global filtering controls for expenses including:
 * - Text search (searches place and notes fields)
 * - Category filter dropdown
 * - Payment method filter dropdown
 * - Year filter dropdown (for scoping global search)
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
 * @param {Function} props.onFilterYearChange - Callback when year filter changes
 * @param {Function} props.onClearFilters - Callback to clear all filters
 * @param {string} props.filterType - Currently selected category filter
 * @param {string} props.filterMethod - Currently selected payment method filter
 * @param {string} props.filterYear - Currently selected year filter
 * @param {Array<string>} props.categories - Available expense categories
 * @param {Array<string>} props.paymentMethods - Available payment methods
 * @param {boolean} props.loading - Whether expenses are currently loading
 */
const SearchBar = memo(({ 
  onSearchChange, 
  onFilterTypeChange, 
  onFilterMethodChange,
  onFilterYearChange,
  onDateRangeChange,
  onClearFilters,
  searchText: externalSearchText = '',
  filterType = '', 
  filterMethod = '',
  filterYear = '',
  filterStartDate = '',
  filterEndDate = '',
  categories = [], 
  paymentMethods = [],
  loading = false,
  showOnlySearch = false,
  showOnlyFilters = false,
  isGlobalView = false
}) => {
  const [searchText, setSearchText] = useState(externalSearchText);
  const [announcement, setAnnouncement] = useState('');
  // Drafts let the user type a date (year digits arrive one at a time) without each
  // partial value refetching the list and remounting this component
  const [draftStartDate, setDraftStartDate] = useState(filterStartDate);
  const [draftEndDate, setDraftEndDate] = useState(filterEndDate);
  const [syncedRange, setSyncedRange] = useState(`${filterStartDate}|${filterEndDate}`);
  if (syncedRange !== `${filterStartDate}|${filterEndDate}`) {
    setSyncedRange(`${filterStartDate}|${filterEndDate}`);
    setDraftStartDate(filterStartDate);
    setDraftEndDate(filterEndDate);
  }
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

  const handleFilterYearChange = (e) => {
    const value = e.target.value;
    if (onFilterYearChange) {
      onFilterYearChange(value);
    }

    // Announce filter change
    if (value) {
      setAnnouncement(`Year filter applied: ${value}`);
    } else {
      setAnnouncement('Year filter cleared');
    }
  };

  const handleStartDateChange = (e) => {
    const value = e.target.value;
    setDraftStartDate(value);
    if (isCommittableRange(value, draftEndDate)) {
      onDateRangeChange?.(value, draftEndDate);
      setAnnouncement(value ? `Showing expenses from ${value}` : 'Start date cleared');
    }
  };

  const handleEndDateChange = (e) => {
    const value = e.target.value;
    setDraftEndDate(value);
    if (isCommittableRange(draftStartDate, value)) {
      onDateRangeChange?.(draftStartDate, value);
      setAnnouncement(value ? `Showing expenses through ${value}` : 'End date cleared');
    }
  };

  const handleDatePreset = (preset) => {
    const start = dateToLocalString(preset.start(new Date()));
    onDateRangeChange?.(start, '');
    setAnnouncement(`Date range set: ${preset.label}`);
  };

  const activePresetId = !filterEndDate
    ? DATE_PRESETS.find(p => dateToLocalString(p.start(new Date())) === filterStartDate)?.id
    : undefined;

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
  const hasActiveFilters = searchText.trim().length > 0 || filterType || filterMethod || filterYear || filterStartDate || filterEndDate;

  // Generate a broad year range for legacy imports, newest first.
  const currentYear = new Date().getFullYear();
  const minYear = 2000;
  const maxYear = currentYear + 2;
  const yearOptions = [];
  for (let year = maxYear; year >= minYear; year -= 1) {
    yearOptions.push(year);
  }

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

            <div className="filter-dropdown-wrapper">
              <label htmlFor="year-filter" className="sr-only">
                Filter by year
              </label>
              <select
                id="year-filter"
                className={`filter-dropdown ${filterYear ? 'active-filter' : ''}`}
                value={filterYear}
                onChange={handleFilterYearChange}
                aria-label="Filter by year"
                aria-describedby="year-help"
                title="Filter by year"
              >
                <option value="">All Years</option>
                {yearOptions.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <span id="year-help" className="sr-only">
                Select a year to scope global search
              </span>
            </div>

            {onDateRangeChange && (
              <div className="date-range-filter" role="group" aria-label="Date range">
                <label htmlFor="date-range-start" className="date-range-label">From</label>
                <input
                  id="date-range-start"
                  type="date"
                  className={`filter-dropdown date-range-input ${filterStartDate ? 'active-filter' : ''}`}
                  value={draftStartDate}
                  max={draftEndDate || undefined}
                  onChange={handleStartDateChange}
                />
                <label htmlFor="date-range-end" className="date-range-label">To</label>
                <input
                  id="date-range-end"
                  type="date"
                  className={`filter-dropdown date-range-input ${filterEndDate ? 'active-filter' : ''}`}
                  value={draftEndDate}
                  min={draftStartDate || undefined}
                  onChange={handleEndDateChange}
                  title="Leave empty for today"
                />
                <div className="date-range-presets" role="group" aria-label="Quick date ranges">
                  {DATE_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`date-range-preset ${activePresetId === preset.id ? 'active' : ''}`}
                      aria-pressed={activePresetId === preset.id}
                      onClick={() => handleDatePreset(preset)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasActiveFilters && (
              <button 
                className={`clear-filters-button ${isGlobalView ? 'global-view-enhanced' : ''}`}
                onClick={handleClearAll}
                aria-label="Clear all filters and return to monthly view"
                title="Clear all filters and return to monthly view"
                type="button"
              >
                {isGlobalView ? '🗑️ Clear All' : 'Clear Filters'}
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
