import { useState, useEffect, useCallback } from 'react';
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
import { ExpenseProvider, useExpenseContext } from './contexts/ExpenseContext';
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
      <ExpenseProvider>
        <AppContent
          paymentMethods={paymentMethods}
          showPaymentMethods={showPaymentMethods}
          setShowPaymentMethods={setShowPaymentMethods}
          onPaymentMethodsUpdate={() => {
            setPaymentMethodsRefreshTrigger(prev => prev + 1);
          }}
        />
      </ExpenseProvider>
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

  // Consume expense state from context (Phase 2 - ExpenseContext)
  const {
    filteredExpenses,
    loading,
    error,
    refreshTrigger,
    budgetAlertRefreshTrigger,
    currentMonthExpenseCount,
    handleExpenseAdded: contextHandleExpenseAdded,
    handleExpenseDeleted,
    handleExpenseUpdated,
    triggerRefresh,
    clearError,
  } = useExpenseContext();

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

  // Listen for peopleUpdated event
  useEffect(() => {
    const handlePeopleUpdated = () => {
      setPeopleRefreshTrigger(prev => prev + 1);
      triggerRefresh();
    };

    window.addEventListener('peopleUpdated', handlePeopleUpdated);
    
    return () => {
      window.removeEventListener('peopleUpdated', handlePeopleUpdated);
    };
  }, [triggerRefresh]);

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

  // Wrap context handleExpenseAdded to also close expense form modal (UI concern)
  const handleExpenseAdded = useCallback((newExpense) => {
    contextHandleExpenseAdded(newExpense);
    setShowExpenseForm(false);
  }, [contextHandleExpenseAdded]);

  const handleManageBudgets = (category = null) => {
    setBudgetManagementFocusCategory(category);
    setShowBudgetManagement(true);
  };

  const handleCloseBudgetManagement = () => {
    setShowBudgetManagement(false);
    setBudgetManagementFocusCategory(null);
    triggerRefresh();
  };

  const handleBudgetUpdated = () => {
    triggerRefresh();
  };

  const handleViewBudgetHistory = () => {
    setShowBudgetHistory(true);
  };

  const handleCloseBudgetHistory = () => {
    setShowBudgetHistory(false);
  };

  const handlePeopleUpdated = useCallback(() => {
    setPeopleRefreshTrigger(prev => prev + 1);
    triggerRefresh();
    window.dispatchEvent(new CustomEvent('peopleUpdated'));
  }, [triggerRefresh]);

  const handleClosePeopleManagement = () => {
    setShowPeopleManagement(false);
  };

  const handleViewExpensesFromAnalytics = (merchantName) => {
    handleSearchChange(merchantName);
    setShowAnalyticsHub(false);
  };

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
                clearError();
                triggerRefresh();
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
            triggerRefresh();
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
          v{versionInfo?.version || '5.6.2'}
          {versionInfo?.docker && (
            <span className="docker-tag"> (Docker: {versionInfo.docker.tag})</span>
          )}
        </span>
      </footer>
    </div>
  );
}

export default App;
