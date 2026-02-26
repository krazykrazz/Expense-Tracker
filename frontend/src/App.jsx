import { useState, useEffect, useCallback } from 'react';
import './App.css';
import ExpenseForm from './components/ExpenseForm';
import MonthSelector from './components/MonthSelector';
import ExpenseList from './components/ExpenseList';
import SearchBar from './components/SearchBar';
import SummaryPanel from './components/SummaryPanel';
import SettingsModal from './components/SettingsModal';
import SystemModal from './components/SystemModal';
import AnnualSummary from './components/AnnualSummary';
import TaxDeductible from './components/TaxDeductible';
import BudgetsModal from './components/BudgetsModal';
import PeopleManagementModal from './components/PeopleManagementModal';
import AnalyticsHubModal from './components/AnalyticsHubModal';
import FinancialOverviewModal from './components/FinancialOverviewModal';
import CreditCardDetailView from './components/CreditCardDetailView';
import FloatingAddButton from './components/FloatingAddButton';
import EnvironmentBanner from './components/EnvironmentBanner';
import UpdateBanner from './components/UpdateBanner';
import SyncToast from './components/SyncToast';
import VersionUpgradeModal from './components/VersionUpgradeModal';
import { useDataSync } from './hooks/useDataSync';
import { useContainerUpdateCheck } from './hooks/useContainerUpdateCheck';
import useVersionUpgradeCheck from './hooks/useVersionUpgradeCheck';
import { API_ENDPOINTS } from './config';
import { authAwareFetch } from './utils/fetchProvider';
import { changelogEntries } from './utils/changelog';
import { CATEGORIES } from './utils/constants';
import { getPaymentMethods } from './services/paymentMethodApi';
import { getMonthlyIncomeSources } from './services/incomeApi';
import { getBudgets } from './services/budgetApi';
import { calculateAlerts } from './utils/budgetAlerts';
import { FilterProvider, useFilterContext } from './contexts/FilterContext';
import { ExpenseProvider, useExpenseContext } from './contexts/ExpenseContext';
import { ModalProvider, useModalContext } from './contexts/ModalContext';
import { SharedDataProvider, useSharedDataContext } from './contexts/SharedDataContext';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import UserMenu from './components/UserMenu';
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

  return (
    <AuthProvider>
      <AuthGate>
        <FilterProvider paymentMethods={paymentMethods}>
          <ExpenseProvider>
            <ModalProvider>
              <SharedDataBridge
                onPaymentMethodsUpdate={() => {
                  setPaymentMethodsRefreshTrigger(prev => prev + 1);
                }}
              />
            </ModalProvider>
          </ExpenseProvider>
        </FilterProvider>
      </AuthGate>
    </AuthProvider>
  );
}

/**
 * AuthGate - Conditionally renders LoginScreen or children based on auth state.
 * Shows a loading state while checking auth status, then either the login screen
 * (when Password_Gate is active and no token) or the main app.
 * 
 * Requirements: 8.1, 8.2
 */
function AuthGate({ children }) {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return <div className="auth-loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return children;
}

/**
 * SharedDataBridge - Bridge component that reads selectedYear/selectedMonth
 * from FilterContext and passes them as props to SharedDataProvider.
 * 
 * This is needed because SharedDataProvider needs year/month for budget fetching,
 * but those values come from FilterContext which is above SharedDataProvider
 * in the component tree.
 */
function SharedDataBridge({ onPaymentMethodsUpdate }) {
  const { selectedYear, selectedMonth } = useFilterContext();

  return (
    <SharedDataProvider selectedYear={selectedYear} selectedMonth={selectedMonth}>
      <AppContent
        onPaymentMethodsUpdate={onPaymentMethodsUpdate}
      />
    </SharedDataProvider>
  );
}

function AppContent({ onPaymentMethodsUpdate }) {
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
    refreshExpenses,
    clearError,
  } = useExpenseContext();

  // Consume modal state from context (Phase 3 - ModalContext)
  const {
    showExpenseForm,
    showAnnualSummary,
    showTaxDeductible,
    showBudgets,
    budgetManagementFocusCategory,
    showPeopleManagement,
    showAnalyticsHub,
    showSettingsModal,
    showSystemModal,
    showFinancialOverview,
    financialOverviewInitialTab,
    openExpenseForm,
    closeExpenseForm,
    openSettingsModal,
    closeSettingsModal,
    openSystemModal,
    closeSystemModal,
    openAnnualSummary,
    closeAnnualSummary,
    openTaxDeductible,
    closeTaxDeductible,
    openBudgets,
    closeBudgets,
    openPeopleManagement,
    closePeopleManagement,
    openAnalyticsHub,
    closeAnalyticsHub,
    openFinancialOverview,
    closeFinancialOverview,
    creditCardDetailState,
    closeCreditCardDetail,
    closeAllOverlays,
  } = useModalContext();

  // Consume shared data from context (Phase 4 - SharedDataContext)
  const {
    paymentMethods,
    people,
    refreshBudgets,
    refreshPeople,
    refreshPaymentMethods,
  } = useSharedDataContext();

  // Container update detection — captures baseline version on init, checks on SSE reconnect
  const { showBanner, newVersion, dismissBanner, onSseReconnect } = useContainerUpdateCheck();

  // Auth context — needed for SSE token auth (Requirement 7.1, 7.2)
  const { getAccessToken, isPasswordRequired } = useAuthContext();

  // Real-time sync — subscribes to SSE and refreshes data on remote changes
  const { subscribeToasts, getToastSnapshot } = useDataSync({
    refreshExpenses,
    refreshBudgets,
    refreshPeople,
    refreshPaymentMethods,
    onReconnect: onSseReconnect,
    getAccessToken,
    isPasswordRequired,
  });

  // Version upgrade modal
  const { showModal: showUpgradeModal, newVersion: upgradeVersion, changelogEntries: upgradeChangelog, handleClose: handleUpgradeClose } = useVersionUpgradeCheck({ changelogEntries });

  const [versionInfo, setVersionInfo] = useState(null);
  const [mobileTab, setMobileTab] = useState('expenses'); // 'expenses' | 'summary'
  
  // Budget alerts state for Analytics Hub integration (Requirement 7.4)
  const [budgetAlerts, setBudgetAlerts] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(null);

  // Fetch version info on mount
  useEffect(() => {
    let isMounted = true;

    const fetchVersionInfo = async () => {
      try {
        const response = await authAwareFetch(API_ENDPOINTS.VERSION);
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

  // Listen for navigateToExpenseList event (e.g., from BudgetReminderBanner)
  // Only closes overlays — the category filter is applied as a local (monthly) filter
  // by ExpenseList directly, so the user stays in monthly view for budget context.
  useEffect(() => {
    const handleNavigateToExpenseList = () => {
      closeAllOverlays();
    };

    window.addEventListener('navigateToExpenseList', handleNavigateToExpenseList);
    
    return () => {
      window.removeEventListener('navigateToExpenseList', handleNavigateToExpenseList);
    };
  }, [closeAllOverlays]);

  // Listen for filterByInsuranceStatus event
  useEffect(() => {
    const handleFilterByInsuranceStatus = (event) => {
      closeAllOverlays();
      
      // Trigger global view with ONLY insurance filter to show ALL pending claims across all time
      if (event.detail?.insuranceFilter) {
        setFilterInsurance(event.detail.insuranceFilter);
      }
    };

    window.addEventListener('filterByInsuranceStatus', handleFilterByInsuranceStatus);
    
    return () => {
      window.removeEventListener('filterByInsuranceStatus', handleFilterByInsuranceStatus);
    };
  }, [setFilterInsurance, closeAllOverlays]);

  // Wrap context handleExpenseAdded to also close expense form modal (UI concern)
  const handleExpenseAdded = useCallback((newExpense) => {
    contextHandleExpenseAdded(newExpense);
    closeExpenseForm();
  }, [contextHandleExpenseAdded, closeExpenseForm]);

  const handleBudgetUpdated = () => {
    triggerRefresh();
  };

  // Wrapper for closeBudgets that also triggers refresh
  const handleCloseBudgets = useCallback(() => {
    closeBudgets();
    triggerRefresh();
  }, [closeBudgets, triggerRefresh]);

  const handlePeopleUpdated = useCallback(() => {
    triggerRefresh();
    window.dispatchEvent(new CustomEvent('peopleUpdated'));
  }, [triggerRefresh]);

  const handleViewExpensesFromAnalytics = useCallback((merchantName) => {
    handleSearchChange(merchantName);
    closeAnalyticsHub();
  }, [handleSearchChange, closeAnalyticsHub]);

  return (
    <div className="App">
      <UpdateBanner
        show={showBanner}
        version={newVersion}
        onRefresh={() => window.location.reload()}
        onDismiss={dismissBanner}
      />
      <EnvironmentBanner />
      <header className="App-header">
        <div className="header-title">
          <img src={logo} alt="Expense Tracker Logo" className="app-logo" />
          <h1>Expense Tracker</h1>
        </div>
        <div className="header-buttons">
          <button 
            className="settings-button" 
            onClick={openSystemModal}
            aria-label="System"
            title="System information, activity log, and tools"
          >
            🖥️ <span className="btn-text">System</span>
          </button>
          <button 
            className="settings-button" 
            onClick={openSettingsModal}
            aria-label="Settings"
            title="Backup configuration and people management"
          >
            ⚙️ <span className="btn-text">Settings</span>
          </button>
          <UserMenu />
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
            onViewAnnualSummary={openAnnualSummary}
            onViewTaxDeductible={openTaxDeductible}
            onOpenBudgets={openBudgets}
            onOpenAnalyticsHub={openAnalyticsHub}
            onOpenFinancialOverview={openFinancialOverview}
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
          <div className="content-layout" data-mobile-tab={mobileTab}>
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
                onAddExpense={openExpenseForm}
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
        <div className="modal-overlay" onClick={closeExpenseForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={closeExpenseForm}
              aria-label="Close"
            >
              ×
            </button>
            <ExpenseForm onExpenseAdded={handleExpenseAdded} people={people} />
          </div>
        </div>
      )}

      {showSettingsModal && <SettingsModal />}

      {showSystemModal && <SystemModal />}

      {showAnnualSummary && (
        <div className="modal-overlay" onClick={closeAnnualSummary}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={closeAnnualSummary}
              aria-label="Close"
            >
              ×
            </button>
            <AnnualSummary year={selectedYear} />
          </div>
        </div>
      )}

      {showTaxDeductible && (
        <div className="modal-overlay" onClick={closeTaxDeductible}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={closeTaxDeductible}
              aria-label="Close"
            >
              ×
            </button>
            <TaxDeductible year={selectedYear} refreshTrigger={refreshTrigger} />
          </div>
        </div>
      )}

      {showBudgets && (
        <BudgetsModal
          isOpen={showBudgets}
          year={selectedYear}
          month={selectedMonth}
          onClose={handleCloseBudgets}
          onBudgetUpdated={handleBudgetUpdated}
          focusedCategory={budgetManagementFocusCategory}
        />
      )}

      {showPeopleManagement && (
        <PeopleManagementModal
          isOpen={showPeopleManagement}
          onClose={closePeopleManagement}
          onPeopleUpdated={handlePeopleUpdated}
        />
      )}

      {showAnalyticsHub && (
        <AnalyticsHubModal
          isOpen={showAnalyticsHub}
          onClose={closeAnalyticsHub}
          currentYear={selectedYear}
          currentMonth={selectedMonth}
          monthlyIncome={monthlyIncome}
          budgetAlerts={budgetAlerts}
          onViewExpenses={handleViewExpensesFromAnalytics}
        />
      )}

      {showFinancialOverview && (
        <FinancialOverviewModal
          isOpen={showFinancialOverview}
          onClose={() => {
            closeFinancialOverview();
            triggerRefresh();
          }}
          year={selectedYear}
          month={selectedMonth}
          onUpdate={triggerRefresh}
          onPaymentMethodsUpdate={onPaymentMethodsUpdate}
          initialTab={financialOverviewInitialTab}
        />
      )}

      {/* Standalone CreditCardDetailView - opened from notification banners */}
      {creditCardDetailState.show && (
        <CreditCardDetailView
          paymentMethodId={creditCardDetailState.paymentMethodId}
          isOpen={creditCardDetailState.show}
          onClose={closeCreditCardDetail}
          initialTab={creditCardDetailState.initialTab}
          initialAction={creditCardDetailState.initialAction}
          reminderData={creditCardDetailState.reminderData}
        />
      )}

      {/* Floating Add Button */}
      <FloatingAddButton
        onAddExpense={openExpenseForm}
        expenseCount={currentMonthExpenseCount}
      />

      {/* Sync toast notifications for remote data changes */}
      <SyncToast subscribe={subscribeToasts} getSnapshot={getToastSnapshot} />

      {/* Version upgrade notification modal */}
      <VersionUpgradeModal
        isOpen={showUpgradeModal}
        onClose={handleUpgradeClose}
        newVersion={upgradeVersion}
        changelogEntries={upgradeChangelog}
      />

      {/* Mobile bottom tab bar — hidden on desktop via CSS */}
      <nav className="mobile-tab-bar" aria-label="Mobile navigation">
        <button
          className={mobileTab === 'expenses' ? 'active' : ''}
          onClick={() => setMobileTab('expenses')}
          aria-pressed={mobileTab === 'expenses'}
        >
          <span className="tab-icon">📋</span>
          <span>Expenses</span>
        </button>
        <button
          className={mobileTab === 'summary' ? 'active' : ''}
          onClick={() => setMobileTab('summary')}
          aria-pressed={mobileTab === 'summary'}
        >
          <span className="tab-icon">📊</span>
          <span>Summary</span>
        </button>
      </nav>

      <footer className="App-footer">
        <span className="version">
          v{versionInfo?.version || '1.0.0'}
          {versionInfo?.docker && (
            <span className="docker-tag"> (Docker: {versionInfo.docker.tag})</span>
          )}
        </span>
      </footer>
    </div>
  );
}

export default App;
