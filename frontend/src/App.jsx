import { useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';
import ExpenseForm from './components/ExpenseForm';
import MonthSelector from './components/MonthSelector';
import ExpenseList from './components/ExpenseList';
import SearchBar from './components/SearchBar';
import SummaryPanel from './components/SummaryPanel';
import BackupSettings from './components/BackupSettings';
import AnnualSummary from './components/AnnualSummary';
import TaxDeductible from './components/TaxDeductible';
import BudgetManagementModal from './components/BudgetManagementModal';
import BudgetHistoryView from './components/BudgetHistoryView';
import PeopleManagementModal from './components/PeopleManagementModal';
import MerchantAnalyticsModal from './components/MerchantAnalyticsModal';
import BudgetAlertManager from './components/BudgetAlertManager';
import FloatingAddButton from './components/FloatingAddButton';
import { API_ENDPOINTS } from './config';
import { CATEGORIES, PAYMENT_METHODS } from './utils/constants';
import { getPeople } from './services/peopleApi';
import logo from './assets/tracker.png.png';

function App() {
  const [expenses, setExpenses] = useState([]);
  const [currentMonthExpenseCount, setCurrentMonthExpenseCount] = useState(0);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBackupSettings, setShowBackupSettings] = useState(false);
  const [showAnnualSummary, setShowAnnualSummary] = useState(false);
  const [showTaxDeductible, setShowTaxDeductible] = useState(false);
  const [showBudgetManagement, setShowBudgetManagement] = useState(false);
  const [budgetManagementFocusCategory, setBudgetManagementFocusCategory] = useState(null);
  const [showBudgetHistory, setShowBudgetHistory] = useState(false);
  const [showPeopleManagement, setShowPeopleManagement] = useState(false);
  const [showMerchantAnalytics, setShowMerchantAnalytics] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterYear, setFilterYear] = useState(''); // Year filter for global search
  const [versionInfo, setVersionInfo] = useState(null);
  
  // Budget alert refresh trigger for real-time updates
  const [budgetAlertRefreshTrigger, setBudgetAlertRefreshTrigger] = useState(0);
  
  // People state management for medical expense tracking
  const [people, setPeople] = useState([]);
  const [peopleRefreshTrigger, setPeopleRefreshTrigger] = useState(0);

  /**
   * Global View Mode Determination
   * 
   * The application operates in two modes:
   * - Monthly View: Shows expenses for the selected month only (default)
   * - Global View: Shows expenses from all time periods (when any filter is active)
   * 
   * Global view is triggered when ANY of the following filters are active:
   * - searchText: User has entered text to search place/notes
   * - filterType: User has selected a category filter
   * - filterMethod: User has selected a payment method filter
   * - filterYear: User has selected a year filter
   * 
   * This allows users to filter expenses globally without requiring text search.
   */
  const isGlobalView = searchText.trim().length > 0 || filterType || filterMethod || filterYear;

  // Fetch version info on mount
  useEffect(() => {
    let isMounted = true;

    const fetchVersionInfo = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.VERSION);
        if (response.ok && isMounted) {
          const data = await response.json();
          setVersionInfo(data);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching version info:', err);
        }
      }
    };

    fetchVersionInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch people data on mount and when peopleRefreshTrigger changes
  useEffect(() => {
    let isMounted = true;

    const fetchPeopleData = async () => {
      try {
        const peopleData = await getPeople();
        if (isMounted) {
          setPeople(peopleData || []);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching people:', err);
        }
      }
    };

    fetchPeopleData();

    return () => {
      isMounted = false;
    };
  }, [peopleRefreshTrigger]);

  // Fetch current month expense count for floating button visibility
  useEffect(() => {
    let isMounted = true;

    const fetchCurrentMonthExpenseCount = async () => {
      try {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        
        const url = `${API_ENDPOINTS.EXPENSES}?year=${currentYear}&month=${currentMonth}`;
        const response = await fetch(url);
        
        if (response.ok && isMounted) {
          const data = await response.json();
          setCurrentMonthExpenseCount(data.length);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching current month expense count:', err);
        }
      }
    };

    fetchCurrentMonthExpenseCount();

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]); // Update when expenses are added/deleted

  // Listen for peopleUpdated event (e.g., from PeopleManagementModal or BackupSettings)
  useEffect(() => {
    const handlePeopleUpdated = () => {
      // Trigger a refresh of people data
      setPeopleRefreshTrigger(prev => prev + 1);
      
      // Also trigger expense refresh to update people indicators
      setRefreshTrigger(prev => prev + 1);
    };

    window.addEventListener('peopleUpdated', handlePeopleUpdated);
    
    return () => {
      window.removeEventListener('peopleUpdated', handlePeopleUpdated);
    };
  }, []);

  /**
   * Expense Fetching Effect
   * 
   * Fetches expenses from the API based on the current view mode:
   * - Global View: Fetches ALL expenses (or year-filtered) when any filter is active
   * - Monthly View: Fetches only expenses for the selected year/month
   * 
   * Dependencies:
   * - selectedYear, selectedMonth: Triggers refetch when user changes month
   * - isGlobalView: Triggers refetch when switching between global/monthly modes
   * - filterYear: Triggers refetch when year filter changes
   * 
   * The API endpoint changes based on view mode to optimize data transfer.
   */
  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let url;
        if (isGlobalView) {
          // Global view - fetch all expenses or year-filtered expenses
          if (filterYear) {
            url = `${API_ENDPOINTS.EXPENSES}?year=${filterYear}`;
          } else {
            url = `${API_ENDPOINTS.EXPENSES}`;
          }
        } else {
          // Monthly view - fetch month-specific expenses
          url = `${API_ENDPOINTS.EXPENSES}?year=${selectedYear}&month=${selectedMonth}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Unable to load expenses. Please try again.';
          
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            // If response is not JSON, use default message
          }
          
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        setExpenses(data);
      } catch (err) {
        // Provide user-friendly error messages
        let userMessage = err.message;
        
        if (err.message.includes('fetch')) {
          userMessage = 'Unable to connect to the server. Please check your connection and try again.';
        } else if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
          userMessage = 'Network error. Please check your connection and try again.';
        }
        
        setError(userMessage);
        console.error('Error fetching expenses:', err);
        
        // Keep existing expenses on error to avoid blank screen
        // Only clear if this is the first load
        if (expenses.length === 0) {
          setExpenses([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchExpenses();
  }, [selectedYear, selectedMonth, isGlobalView, filterYear]);

  // Listen for expensesUpdated event (e.g., from place name standardization)
  useEffect(() => {
    const handleExpensesUpdated = () => {
      // Trigger a refresh by updating the refresh trigger
      setRefreshTrigger(prev => prev + 1);
      setBudgetAlertRefreshTrigger(prev => prev + 1);
      
      // Re-fetch expenses to reflect changes
      const fetchExpenses = async () => {
        try {
          let url;
          if (isGlobalView) {
            if (filterYear) {
              url = `${API_ENDPOINTS.EXPENSES}?year=${filterYear}`;
            } else {
              url = `${API_ENDPOINTS.EXPENSES}`;
            }
          } else {
            url = `${API_ENDPOINTS.EXPENSES}?year=${selectedYear}&month=${selectedMonth}`;
          }
          
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            setExpenses(data);
          }
        } catch (err) {
          console.error('Error refreshing expenses:', err);
        }
      };
      
      fetchExpenses();
    };

    window.addEventListener('expensesUpdated', handleExpensesUpdated);
    
    return () => {
      window.removeEventListener('expensesUpdated', handleExpensesUpdated);
    };
  }, [selectedYear, selectedMonth, isGlobalView]);

  const handleExpenseAdded = (newExpense) => {
    // Add new expense to the list
    // Parse date as local date to avoid timezone issues
    const dateParts = newExpense.date.split('-');
    const expenseYear = parseInt(dateParts[0], 10);
    const expenseMonth = parseInt(dateParts[1], 10);
    
    // In global view, always add the expense
    // In monthly view, only add if it belongs to the selected month
    if (isGlobalView || (expenseYear === selectedYear && expenseMonth === selectedMonth)) {
      setExpenses(prev => {
        // Insert in chronological order
        const newList = [...prev, newExpense];
        newList.sort((a, b) => new Date(a.date) - new Date(b.date));
        return newList;
      });
    }
    
    // Trigger summary refresh and budget alert refresh
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
    setShowExpenseForm(false);
  };

  const handleExpenseDeleted = (deletedId) => {
    // Remove deleted expense from the list
    setExpenses(prev => prev.filter(expense => expense.id !== deletedId));
    
    // Trigger summary refresh and budget alert refresh
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  };

  const handleExpenseUpdated = (updatedExpense) => {
    // Update the expense in the list
    setExpenses(prev => prev.map(expense => 
      expense.id === updatedExpense.id ? updatedExpense : expense
    ));
    
    // Trigger summary refresh and budget alert refresh
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  };

  const handleMonthChange = (year, month) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const handleSearchChange = useCallback((text) => {
    setSearchText(text);
  }, []);

  /**
   * Filter Type Change Handler
   * 
   * Updates the category filter state with validation.
   * Validates the selected category against the approved CATEGORIES list
   * to prevent invalid selections (e.g., from URL manipulation or bugs).
   * 
   * @param {string} type - The selected category or empty string for "All"
   */
  const handleFilterTypeChange = useCallback((type) => {
    // Validate category against approved list
    if (type && !CATEGORIES.includes(type)) {
      console.warn(`Invalid category selected: ${type}. Resetting to empty.`);
      setFilterType('');
      return;
    }
    setFilterType(type);
  }, []);

  /**
   * Filter Method Change Handler
   * 
   * Updates the payment method filter state with validation.
   * Validates the selected payment method against the approved PAYMENT_METHODS list
   * to prevent invalid selections.
   * 
   * @param {string} method - The selected payment method or empty string for "All"
   */
  const handleFilterMethodChange = useCallback((method) => {
    // Validate payment method against approved list
    if (method && !PAYMENT_METHODS.includes(method)) {
      console.warn(`Invalid payment method selected: ${method}. Resetting to empty.`);
      setFilterMethod('');
      return;
    }
    setFilterMethod(method);
  }, []);

  /**
   * Filter Year Change Handler
   * 
   * Updates the year filter state for global search scoping.
   * Allows users to filter expenses by a specific year when in global view.
   * 
   * @param {string} year - The selected year or empty string for "All Years"
   */
  const handleFilterYearChange = useCallback((year) => {
    setFilterYear(year);
  }, []);

  /**
   * Clear All Filters Handler
   * 
   * Resets all filter states to their default empty values:
   * - searchText: cleared
   * - filterType: cleared (shows all categories)
   * - filterMethod: cleared (shows all payment methods)
   * - filterYear: cleared (no year filter)
   * 
   * This returns the application to monthly view mode, showing only
   * expenses for the currently selected month.
   */
  const handleClearFilters = useCallback(() => {
    setSearchText('');
    setFilterType('');
    setFilterMethod('');
    setFilterYear('');
  }, []);

  const handleManageBudgets = (category = null) => {
    setBudgetManagementFocusCategory(category);
    setShowBudgetManagement(true);
  };

  const handleCloseBudgetManagement = () => {
    setShowBudgetManagement(false);
    setBudgetManagementFocusCategory(null);
    // Trigger refresh to update budget displays and alerts
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  };

  const handleBudgetUpdated = () => {
    // Trigger refresh to update budget displays and alerts
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  };

  const handleViewBudgetHistory = () => {
    setShowBudgetHistory(true);
  };

  const handleCloseBudgetHistory = () => {
    setShowBudgetHistory(false);
  };

  const handlePeopleUpdated = useCallback(() => {
    // Refresh people data
    setPeopleRefreshTrigger(prev => prev + 1);
    
    // Trigger expense refresh to update people indicators in expense list
    setRefreshTrigger(prev => prev + 1);
    
    // Dispatch global event for other components (TaxDeductible, etc.)
    window.dispatchEvent(new CustomEvent('peopleUpdated'));
  }, []);

  const handleClosePeopleManagement = () => {
    setShowPeopleManagement(false);
  };

  const handleViewExpensesFromMerchant = (merchantName) => {
    // Set search text to the merchant name to filter expenses
    setSearchText(merchantName);
    // Close the merchant analytics modal
    setShowMerchantAnalytics(false);
  };

  /**
   * Client-Side Expense Filtering (Memoized)
   * 
   * Applies all active filters to the fetched expenses using AND logic.
   * All filters must match for an expense to be included in the results.
   * 
   * Filter Logic:
   * 1. Text Search: Matches against place OR notes fields (case-insensitive)
   * 2. Category Filter: Exact match on expense.type
   * 3. Payment Method Filter: Exact match on expense.method
   * 
   * Performance Optimization:
   * - useMemo prevents unnecessary re-filtering when unrelated state changes
   * - Only re-computes when expenses array or filter values change
   * 
   * @returns {Array} Filtered array of expense objects
   */
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      // Text search filter - matches place OR notes (case-insensitive)
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const placeMatch = expense.place && expense.place.toLowerCase().includes(searchLower);
        const notesMatch = expense.notes && expense.notes.toLowerCase().includes(searchLower);
        
        // Expense must match at least one field
        if (!placeMatch && !notesMatch) {
          return false;
        }
      }
      
      // Category filter - exact match required
      if (filterType && expense.type !== filterType) {
        return false;
      }
      
      // Payment method filter - exact match required
      if (filterMethod && expense.method !== filterMethod) {
        return false;
      }
      
      // All active filters passed
      return true;
    });
  }, [expenses, searchText, filterType, filterMethod]);

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-title">
          <img src={logo} alt="Expense Tracker Logo" className="app-logo" />
          <h1>Expense Tracker</h1>
        </div>
        <div className="header-buttons">
          <button 
            className="settings-button" 
            onClick={() => setShowBackupSettings(true)}
            aria-label="Settings"
            title="Backup, import, and restore settings"
          >
            ⚙️ Settings
          </button>
        </div>
      </header>
      <main className="App-main">
        {/* View Mode Indicator */}
        <div className="view-mode-indicator">
          {isGlobalView ? (
            <div className="view-mode-badge global">
              <span className="view-mode-icon">🔍</span>
              <span>Global View - Filtered Results</span>
            </div>
          ) : (
            <div className="view-mode-badge monthly">
              <span className="view-mode-icon">📅</span>
              <span>Monthly View - {new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </div>
          )}
        </div>

        {/* Budget Alert Notifications */}
        <BudgetAlertManager
          year={selectedYear}
          month={selectedMonth}
          refreshTrigger={budgetAlertRefreshTrigger}
          onManageBudgets={handleManageBudgets}
          onViewDetails={(category) => {
            // Navigate to budget summary section by scrolling to SummaryPanel
            const summaryPanel = document.querySelector('.summary-panel');
            if (summaryPanel) {
              summaryPanel.scrollIntoView({ behavior: 'smooth' });
              
              // Highlight the specific category budget card if it exists
              setTimeout(() => {
                const budgetCard = document.querySelector(`[data-budget-category="${category}"]`);
                if (budgetCard) {
                  budgetCard.classList.add('budget-card-highlighted');
                  setTimeout(() => {
                    budgetCard.classList.remove('budget-card-highlighted');
                  }, 3000);
                }
              }, 500);
            }
          }}
        />

        {/* Month Selector - dimmed when in global view */}
        <div className={`month-selector-wrapper ${isGlobalView ? 'dimmed' : ''}`}>
          <MonthSelector 
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onMonthChange={handleMonthChange}
            onViewAnnualSummary={() => setShowAnnualSummary(true)}
            onViewTaxDeductible={() => setShowTaxDeductible(true)}
            onManageBudgets={handleManageBudgets}
            onViewBudgetHistory={handleViewBudgetHistory}
            onOpenMerchantAnalytics={() => setShowMerchantAnalytics(true)}
          />
        </div>
        
        {loading && <div className="loading-message">Loading expenses...</div>}
        {error && (
          <div className="error-message">
            <div className="error-text">Error: {error}</div>
            <button 
              className="retry-button"
              onClick={() => {
                setError(null);
                setRefreshTrigger(prev => prev + 1);
              }}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && (
          <div className="content-layout">
            <div className="content-left">
              <SearchBar 
                onSearchChange={handleSearchChange}
                onFilterTypeChange={handleFilterTypeChange}
                onFilterMethodChange={handleFilterMethodChange}
                onFilterYearChange={handleFilterYearChange}
                onClearFilters={handleClearFilters}
                searchText={searchText}
                filterType={filterType}
                filterMethod={filterMethod}
                filterYear={filterYear}
                categories={CATEGORIES}
                paymentMethods={PAYMENT_METHODS}
                loading={loading}
                showOnlySearch={true}
              />
              <ExpenseList 
                expenses={filteredExpenses}
                onExpenseDeleted={handleExpenseDeleted}
                onExpenseUpdated={handleExpenseUpdated}
                onAddExpense={() => setShowExpenseForm(true)}
                currentMonthExpenseCount={currentMonthExpenseCount}
              />
            </div>
            <div 
              className="content-right"
              tabIndex="0"
              role="region"
              aria-label="Monthly summary panel - scrollable"
            >
              <SearchBar 
                onSearchChange={handleSearchChange}
                onFilterTypeChange={handleFilterTypeChange}
                onFilterMethodChange={handleFilterMethodChange}
                onFilterYearChange={handleFilterYearChange}
                onClearFilters={handleClearFilters}
                searchText={searchText}
                filterType={filterType}
                filterMethod={filterMethod}
                filterYear={filterYear}
                categories={CATEGORIES}
                paymentMethods={PAYMENT_METHODS}
                loading={loading}
                showOnlyFilters={true}
              />
              <SummaryPanel 
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </div>
        )}
      </main>

      {showExpenseForm && (
        <div className="modal-overlay" onClick={() => setShowExpenseForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={() => setShowExpenseForm(false)}
              aria-label="Close"
            >
              ×
            </button>
            <ExpenseForm onExpenseAdded={handleExpenseAdded} people={people} />
          </div>
        </div>
      )}

      {showBackupSettings && (
        <div className="modal-overlay" onClick={() => setShowBackupSettings(false)}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={() => setShowBackupSettings(false)}
              aria-label="Close"
            >
              ×
            </button>
            <BackupSettings />
          </div>
        </div>
      )}

      {showAnnualSummary && (
        <div className="modal-overlay" onClick={() => setShowAnnualSummary(false)}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={() => setShowAnnualSummary(false)}
              aria-label="Close"
            >
              ×
            </button>
            <AnnualSummary year={selectedYear} />
          </div>
        </div>
      )}

      {showTaxDeductible && (
        <div className="modal-overlay" onClick={() => setShowTaxDeductible(false)}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={() => setShowTaxDeductible(false)}
              aria-label="Close"
            >
              ×
            </button>
            <TaxDeductible year={selectedYear} refreshTrigger={refreshTrigger} />
          </div>
        </div>
      )}

      {showBudgetManagement && (
        <BudgetManagementModal
          isOpen={showBudgetManagement}
          year={selectedYear}
          month={selectedMonth}
          onClose={handleCloseBudgetManagement}
          onBudgetUpdated={handleBudgetUpdated}
          focusedCategory={budgetManagementFocusCategory}
        />
      )}

      {showBudgetHistory && (
        <BudgetHistoryView
          year={selectedYear}
          month={selectedMonth}
          onClose={handleCloseBudgetHistory}
        />
      )}

      {showPeopleManagement && (
        <PeopleManagementModal
          isOpen={showPeopleManagement}
          onClose={handleClosePeopleManagement}
          onPeopleUpdated={handlePeopleUpdated}
        />
      )}

      {showMerchantAnalytics && (
        <MerchantAnalyticsModal
          isOpen={showMerchantAnalytics}
          onClose={() => setShowMerchantAnalytics(false)}
          onViewExpenses={handleViewExpensesFromMerchant}
        />
      )}

      {/* Floating Add Button - Rendered outside content-layout to avoid stacking context issues */}
      <FloatingAddButton
        onAddExpense={() => setShowExpenseForm(true)}
        expenseCount={currentMonthExpenseCount}
      />

      <footer className="App-footer">
        <span className="version">
          v{versionInfo?.version || '4.15.0'}
          {versionInfo?.docker && (
            <span className="docker-tag"> (Docker: {versionInfo.docker.tag})</span>
          )}
        </span>
      </footer>
    </div>
  );
}

export default App;
