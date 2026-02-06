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
import AnalyticsHubModal from './components/AnalyticsHubModal';
import PaymentMethodsModal from './components/PaymentMethodsModal';
import FloatingAddButton from './components/FloatingAddButton';
import EnvironmentBanner from './components/EnvironmentBanner';
import { API_ENDPOINTS } from './config';
import { CATEGORIES } from './utils/constants';
import { getPeople } from './services/peopleApi';
import { getPaymentMethods } from './services/paymentMethodApi';
import { getMonthlyIncomeSources } from './services/incomeApi';
import { getBudgets } from './services/budgetApi';
import { calculateAlerts } from './utils/budgetAlerts';
import { FilterProvider, useFilterContext } from './contexts/FilterContext';
import logo from './assets/tracker.png.png';

function App() {
  // Payment methods state - needed as prop for FilterProvider
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodsRefreshTrigger, setPaymentMethodsRefreshTrigger] = useState(0);

  // Fetch payment methods for global filtering (includes inactive for historical data)
  useEffect(() => {
    let isMounted = true;

    const fetchPaymentMethodsData = async () => {
      try {
        const methods = await getPaymentMethods();
        if (isMounted) {
          setPaymentMethods(methods.map(m => m.display_name) || []);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching payment methods:', err);
        }
      }
    };

    fetchPaymentMethodsData();

    return () => {
      isMounted = false;
    };
  }, [paymentMethodsRefreshTrigger]);

  // Listen for openPaymentMethods event - needs to be at App level
  // since PaymentMethodsModal refresh trigger is here
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);

  useEffect(() => {
    const handleOpenPaymentMethods = () => {
      setShowPaymentMethods(true);
    };

    window.addEventListener('openPaymentMethods', handleOpenPaymentMethods);
    
    return () => {
      window.removeEventListener('openPaymentMethods', handleOpenPaymentMethods);
    };
  }, []);

  return (
    <FilterProvider paymentMethods={paymentMethods}>
      <AppContent
        paymentMethods={paymentMethods}
        showPaymentMethods={showPaymentMethods}
        setShowPaymentMethods={setShowPaymentMethods}
        onPaymentMethodsUpdate={() => {
          setPaymentMethodsRefreshTrigger(prev => prev + 1);
        }}
      />
    </FilterProvider>
  );
}

function AppContent({ paymentMethods, showPaymentMethods, setShowPaymentMethods, onPaymentMethodsUpdate }) {
  // Consume filter state from context (Requirements 4.2, 4.3, 4.4)
  const {
    searchText,
    filterType,
    filterMethod,
    filterYear,
    filterInsurance,
    selectedYear,
    selectedMonth,
    isGlobalView,
    globalViewTriggers,
    setFilterInsurance,
    handleSearchChange,
    handleFilterTypeChange,
    handleFilterMethodChange,
    handleFilterYearChange,
    handleMonthChange,
    handleClearFilters,
    handleReturnToMonthlyView,
  } = useFilterContext();

  const [expenses, setExpenses] = useState([]);
  const [currentMonthExpenseCount, setCurrentMonthExpenseCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBackupSettings, setShowBackupSettings] = useState(false);
  const [showAnnualSummary, setShowAnnualSummary] = useState(false);
  const [showTaxDeductible, setShowTaxDeductible] = useState(false);
  const [showBudgetManagement, setShowBudgetManagement] = useState(false);
  const [budgetManagementFocusCategory, setBudgetManagementFocusCategory] = useState(null);
  const [showBudgetHistory, setShowBudgetHistory] = useState(false);
  const [showPeopleManagement, setShowPeopleManagement] = useState(false);
  const [showAnalyticsHub, setShowAnalyticsHub] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);
  
  // Budget alert refresh trigger for real-time updates
  const [budgetAlertRefreshTrigger, setBudgetAlertRefreshTrigger] = useState(0);
  
  // Budget alerts state for Analytics Hub integration (Requirement 7.4)
  const [budgetAlerts, setBudgetAlerts] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(null);
  
  // People state management for medical expense tracking
  const [people, setPeople] = useState([]);
  const [peopleRefreshTrigger, setPeopleRefreshTrigger] = useState(0);

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

  // Fetch monthly income and budget alerts for Analytics Hub integration (Requirement 7.4)
  useEffect(() => {
    let isMounted = true;

    const fetchAnalyticsData = async () => {
      try {
        // Fetch monthly income
        const incomeData = await getMonthlyIncomeSources(selectedYear, selectedMonth);
        if (isMounted) {
          setMonthlyIncome(incomeData.total || 0);
        }

        // Fetch budget alerts
        const budgetResponse = await getBudgets(selectedYear, selectedMonth);
        const budgets = budgetResponse?.budgets || [];
        if (isMounted && budgets.length > 0) {
          const alerts = calculateAlerts(budgets);
          const formattedAlerts = alerts.map(alert => ({
            category: alert.category,
            percentUsed: Math.round(alert.progress),
            status: alert.severity
          }));
          setBudgetAlerts(formattedAlerts);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching analytics data:', err);
        }
      }
    };

    fetchAnalyticsData();

    return () => {
      isMounted = false;
    };
  }, [selectedYear, selectedMonth, budgetAlertRefreshTrigger]);

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
  }, [refreshTrigger]);

  // Listen for peopleUpdated event
  useEffect(() => {
    const handlePeopleUpdated = () => {
      setPeopleRefreshTrigger(prev => prev + 1);
      setRefreshTrigger(prev => prev + 1);
    };

    window.addEventListener('peopleUpdated', handlePeopleUpdated);
    
    return () => {
      window.removeEventListener('peopleUpdated', handlePeopleUpdated);
    };
  }, []);

  // Listen for navigateToTaxDeductible event
  useEffect(() => {
    const handleNavigateToTaxDeductible = (event) => {
      setShowTaxDeductible(true);
      
      if (event.detail?.insuranceFilter) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('setTaxDeductibleInsuranceFilter', {
            detail: { insuranceFilter: event.detail.insuranceFilter }
          }));
        }, 100);
      }
    };

    window.addEventListener('navigateToTaxDeductible', handleNavigateToTaxDeductible);
    
    return () => {
      window.removeEventListener('navigateToTaxDeductible', handleNavigateToTaxDeductible);
    };
  }, []);

  // Listen for navigateToExpenseList event (e.g., from BudgetReminderBanner)
  useEffect(() => {
    const handleNavigateToExpenseList = (event) => {
      setShowTaxDeductible(false);
      setShowAnnualSummary(false);
      setShowBackupSettings(false);
      setShowBudgetHistory(false);
      
      // Use context handler for filter state update
      if (event.detail?.categoryFilter) {
        handleFilterTypeChange(event.detail.categoryFilter);
      }
    };

    window.addEventListener('navigateToExpenseList', handleNavigateToExpenseList);
    
    return () => {
      window.removeEventListener('navigateToExpenseList', handleNavigateToExpenseList);
    };
  }, [handleFilterTypeChange]);

  // Listen for filterByInsuranceStatus event
  useEffect(() => {
    const handleFilterByInsuranceStatus = (event) => {
      setShowTaxDeductible(false);
      setShowAnnualSummary(false);
      setShowBackupSettings(false);
      setShowBudgetHistory(false);
      
      // Use context setter for filter state update
      if (event.detail?.insuranceFilter) {
        setFilterInsurance(event.detail.insuranceFilter);
      }
    };

    window.addEventListener('filterByInsuranceStatus', handleFilterByInsuranceStatus);
    
    return () => {
      window.removeEventListener('filterByInsuranceStatus', handleFilterByInsuranceStatus);
    };
  }, [setFilterInsurance]);

  /**
   * Expense Fetching Effect
   * 
   * Fetches expenses from the API based on the current view mode:
   * - Global View: Fetches ALL expenses (or year-filtered) when any filter is active
   * - Monthly View: Fetches only expenses for the selected year/month
   */
  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      setError(null);
      
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
        let userMessage = err.message;
        
        if (err.message.includes('fetch')) {
          userMessage = 'Unable to connect to the server. Please check your connection and try again.';
        } else if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
          userMessage = 'Network error. Please check your connection and try again.';
        }
        
        setError(userMessage);
        console.error('Error fetching expenses:', err);
        
        if (expenses.length === 0) {
          setExpenses([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchExpenses();
  }, [selectedYear, selectedMonth, isGlobalView, filterYear]);

  // Listen for expensesUpdated event
  useEffect(() => {
    const handleExpensesUpdated = () => {
      setRefreshTrigger(prev => prev + 1);
      setBudgetAlertRefreshTrigger(prev => prev + 1);
      
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
    const dateParts = newExpense.date.split('-');
    const expenseYear = parseInt(dateParts[0], 10);
    const expenseMonth = parseInt(dateParts[1], 10);
    
    if (isGlobalView || (expenseYear === selectedYear && expenseMonth === selectedMonth)) {
      setExpenses(prev => {
        const newList = [...prev, newExpense];
        newList.sort((a, b) => new Date(a.date) - new Date(b.date));
        return newList;
      });
    }
    
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
    setShowExpenseForm(false);
  };

  const handleExpenseDeleted = (deletedId) => {
    setExpenses(prev => prev.filter(expense => expense.id !== deletedId));
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  };

  const handleExpenseUpdated = (updatedExpense) => {
    setExpenses(prev => prev.map(expense => 
      expense.id === updatedExpense.id ? updatedExpense : expense
    ));
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  };

  const handleManageBudgets = (category = null) => {
    setBudgetManagementFocusCategory(category);
    setShowBudgetManagement(true);
  };

  const handleCloseBudgetManagement = () => {
    setShowBudgetManagement(false);
    setBudgetManagementFocusCategory(null);
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  };

  const handleBudgetUpdated = () => {
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
    setPeopleRefreshTrigger(prev => prev + 1);
    setRefreshTrigger(prev => prev + 1);
    window.dispatchEvent(new CustomEvent('peopleUpdated'));
  }, []);

  const handleClosePeopleManagement = () => {
    setShowPeopleManagement(false);
  };

  const handleViewExpensesFromAnalytics = (merchantName) => {
    handleSearchChange(merchantName);
    setShowAnalyticsHub(false);
  };

  /**
   * Client-Side Expense Filtering (Memoized)
   * 
   * Applies all active filters to the fetched expenses using AND logic.
   */
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const placeMatch = expense.place && expense.place.toLowerCase().includes(searchLower);
        const notesMatch = expense.notes && expense.notes.toLowerCase().includes(searchLower);
        
        if (!placeMatch && !notesMatch) {
          return false;
        }
      }
      
      if (filterType && expense.type !== filterType) {
        return false;
      }
      
      if (filterMethod && expense.method !== filterMethod) {
        return false;
      }
      
      return true;
    });
  }, [expenses, searchText, filterType, filterMethod]);

  return (
    <div className="App">
      <EnvironmentBanner />
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
            <div className="view-mode-banner global">
              <div className="view-mode-content">
                <div className="view-mode-badge global">
                  <span className="view-mode-icon">🔍</span>
                  <span>Global View</span>
                </div>
                <div className="view-mode-triggers">
                  <span className="trigger-label">Triggered by:</span>
                  <span className="trigger-list">{globalViewTriggers.join(', ')}</span>
                </div>
              </div>
              <button 
                className="return-to-monthly-button"
                onClick={handleReturnToMonthlyView}
                aria-label="Return to monthly view"
              >
                📅 Return to Monthly View
              </button>
            </div>
          ) : (
            <div className="view-mode-badge monthly">
              <span className="view-mode-icon">📅</span>
              <span>Monthly View - {new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </div>
          )}
        </div>

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
            onOpenAnalyticsHub={() => setShowAnalyticsHub(true)}
            onOpenPaymentMethods={() => setShowPaymentMethods(true)}
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
                paymentMethods={paymentMethods}
                loading={loading}
                showOnlySearch={true}
                isGlobalView={isGlobalView}
              />
              <ExpenseList 
                expenses={filteredExpenses}
                onExpenseDeleted={handleExpenseDeleted}
                onExpenseUpdated={handleExpenseUpdated}
                onAddExpense={() => setShowExpenseForm(true)}
                currentMonthExpenseCount={currentMonthExpenseCount}
                initialInsuranceFilter={filterInsurance}
                onInsuranceFilterChange={setFilterInsurance}
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
                paymentMethods={paymentMethods}
                loading={loading}
                showOnlyFilters={true}
                isGlobalView={isGlobalView}
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

      {showAnalyticsHub && (
        <AnalyticsHubModal
          isOpen={showAnalyticsHub}
          onClose={() => setShowAnalyticsHub(false)}
          currentYear={selectedYear}
          currentMonth={selectedMonth}
          monthlyIncome={monthlyIncome}
          budgetAlerts={budgetAlerts}
          onViewExpenses={handleViewExpensesFromAnalytics}
        />
      )}

      {showPaymentMethods && (
        <PaymentMethodsModal
          isOpen={showPaymentMethods}
          onClose={() => setShowPaymentMethods(false)}
          onUpdate={() => {
            setRefreshTrigger(prev => prev + 1);
            onPaymentMethodsUpdate();
          }}
        />
      )}

      {/* Floating Add Button */}
      <FloatingAddButton
        onAddExpense={() => setShowExpenseForm(true)}
        expenseCount={currentMonthExpenseCount}
      />

      <footer className="App-footer">
        <span className="version">
          v{versionInfo?.version || '5.6.0'}
          {versionInfo?.docker && (
            <span className="docker-tag"> (Docker: {versionInfo.docker.tag})</span>
          )}
        </span>
      </footer>
    </div>
  );
}

export default App;
