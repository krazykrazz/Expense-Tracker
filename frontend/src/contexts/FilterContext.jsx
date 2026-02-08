import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { CATEGORIES } from '../utils/constants';

const FilterContext = createContext(null);

/**
 * FilterProvider - Manages all filter and view mode state
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @param {string[]} props.paymentMethods - Available payment methods for validation
 */
export function FilterProvider({ children, paymentMethods = [] }) {
  // Filter state
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterInsurance, setFilterInsurance] = useState('');

  // View state
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);

  // Derived state: isGlobalView
  const isGlobalView = useMemo(() => {
    return searchText.trim().length > 0 ||
           filterType !== '' ||
           filterMethod !== '' ||
           filterYear !== '' ||
           filterInsurance !== '';
  }, [searchText, filterType, filterMethod, filterYear, filterInsurance]);

  // Derived state: globalViewTriggers
  const globalViewTriggers = useMemo(() => {
    const triggers = [];
    if (searchText.trim().length > 0) triggers.push('Search');
    if (filterType) triggers.push('Category');
    if (filterMethod) triggers.push('Payment Method');
    if (filterYear) triggers.push('Year');
    if (filterInsurance) triggers.push('Insurance Status');
    return triggers;
  }, [searchText, filterType, filterMethod, filterYear, filterInsurance]);

  // Handler: searchText change
  const handleSearchChange = useCallback((text) => {
    setSearchText(text);
  }, []);

  // Handler: filterType change with validation
  const handleFilterTypeChange = useCallback((type) => {
    if (type && !CATEGORIES.includes(type)) {
      console.warn(`Invalid category selected: ${type}. Resetting to empty.`);
      setFilterType('');
      return;
    }
    setFilterType(type);
  }, []);

  // Handler: filterMethod change with validation
  const handleFilterMethodChange = useCallback((method) => {
    if (method && paymentMethods.length > 0 && !paymentMethods.includes(method)) {
      console.warn(`Invalid payment method selected: ${method}. Resetting to empty.`);
      setFilterMethod('');
      return;
    }
    setFilterMethod(method);
  }, [paymentMethods]);

  // Handler: filterYear change
  const handleFilterYearChange = useCallback((year) => {
    setFilterYear(year);
  }, []);

  // Handler: month change
  const handleMonthChange = useCallback((year, month) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  }, []);

  // Handler: clear all filters
  const handleClearFilters = useCallback(() => {
    setSearchText('');
    setFilterType('');
    setFilterMethod('');
    setFilterYear('');
    setFilterInsurance('');
  }, []);

  // Handler: return to monthly view (clear only global-triggering filters)
  const handleReturnToMonthlyView = useCallback(() => {
    setSearchText('');
    setFilterType('');
    setFilterMethod('');
    setFilterYear('');
  }, []);

  const value = useMemo(() => ({
    // Filter state
    searchText,
    filterType,
    filterMethod,
    filterYear,
    filterInsurance,

    // View state
    selectedYear,
    selectedMonth,

    // Derived state
    isGlobalView,
    globalViewTriggers,

    // Setters (for direct access when needed)
    setFilterInsurance,

    // Handlers
    handleSearchChange,
    handleFilterTypeChange,
    handleFilterMethodChange,
    handleFilterYearChange,
    handleMonthChange,
    handleClearFilters,
    handleReturnToMonthlyView,
  }), [
    searchText, filterType, filterMethod, filterYear, filterInsurance,
    selectedYear, selectedMonth,
    isGlobalView, globalViewTriggers,
    handleSearchChange, handleFilterTypeChange, handleFilterMethodChange,
    handleFilterYearChange, handleMonthChange, handleClearFilters,
    handleReturnToMonthlyView,
  ]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

/**
 * useFilterContext - Custom hook for consuming filter context
 * 
 * @returns {Object} Filter context value
 * @throws {Error} If used outside of FilterProvider
 */
export function useFilterContext() {
  const context = useContext(FilterContext);
  if (context === null) {
    throw new Error('useFilterContext must be used within a FilterProvider');
  }
  return context;
}

export default FilterContext;
