import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const ModalContext = createContext(null);

/**
 * ModalProvider - Manages all modal visibility state
 * 
 * Independent of FilterContext and ExpenseContext.
 * Nested inside ExpenseProvider for component tree access.
 */
export function ModalProvider({ children }) {
  // Modal visibility state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBackupSettings, setShowBackupSettings] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSystemModal, setShowSystemModal] = useState(false);
  const [showAnnualSummary, setShowAnnualSummary] = useState(false);
  const [showTaxDeductible, setShowTaxDeductible] = useState(false);
  const [showBudgets, setShowBudgets] = useState(false);
  const [budgetManagementFocusCategory, setBudgetManagementFocusCategory] = useState(null);
  const [showPeopleManagement, setShowPeopleManagement] = useState(false);
  const [showAnalyticsHub, setShowAnalyticsHub] = useState(false);
  const [showFinancialOverview, setShowFinancialOverview] = useState(false);
  const [financialOverviewInitialTab, setFinancialOverviewInitialTab] = useState(null);

  // --- Open Handlers ---
  const openExpenseForm = useCallback(() => setShowExpenseForm(true), []);
  const closeExpenseForm = useCallback(() => setShowExpenseForm(false), []);

  const openBackupSettings = useCallback(() => setShowBackupSettings(true), []);
  const closeBackupSettings = useCallback(() => setShowBackupSettings(false), []);

  const openSettingsModal = useCallback(() => setShowSettingsModal(true), []);
  const closeSettingsModal = useCallback(() => setShowSettingsModal(false), []);

  const openSystemModal = useCallback(() => setShowSystemModal(true), []);
  const closeSystemModal = useCallback(() => setShowSystemModal(false), []);

  const openAnnualSummary = useCallback(() => setShowAnnualSummary(true), []);
  const closeAnnualSummary = useCallback(() => setShowAnnualSummary(false), []);

  const openTaxDeductible = useCallback(() => setShowTaxDeductible(true), []);
  const closeTaxDeductible = useCallback(() => setShowTaxDeductible(false), []);

  const openBudgets = useCallback((category = null) => {
    setBudgetManagementFocusCategory(category);
    setShowBudgets(true);
  }, []);
  const closeBudgets = useCallback(() => {
    setShowBudgets(false);
    setBudgetManagementFocusCategory(null);
  }, []);

  const openPeopleManagement = useCallback(() => setShowPeopleManagement(true), []);
  const closePeopleManagement = useCallback(() => setShowPeopleManagement(false), []);

  const openAnalyticsHub = useCallback(() => setShowAnalyticsHub(true), []);
  const closeAnalyticsHub = useCallback(() => setShowAnalyticsHub(false), []);

  const openFinancialOverview = useCallback((tab = null) => {
    setFinancialOverviewInitialTab(tab);
    setShowFinancialOverview(true);
  }, []);
  const closeFinancialOverview = useCallback(() => {
    setShowFinancialOverview(false);
    setFinancialOverviewInitialTab(null);
  }, []);

  // --- Bulk Close ---
  // Closes only overlay modals (taxDeductible, annualSummary, backupSettings, settingsModal, systemModal, budgetHistory)
  // Does NOT affect action modals (expenseForm, budgetManagement, peopleManagement, analyticsHub)
  const closeAllOverlays = useCallback(() => {
    setShowTaxDeductible(false);
    setShowAnnualSummary(false);
    setShowBackupSettings(false);
    setShowSettingsModal(false);
    setShowSystemModal(false);
  }, []);

  // --- Window Event Listeners ---
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
    return () => window.removeEventListener('navigateToTaxDeductible', handleNavigateToTaxDeductible);
  }, []);

  // --- Context Value ---
  const value = useMemo(() => ({
    // Visibility state
    showExpenseForm,
    showBackupSettings,
    showSettingsModal,
    showSystemModal,
    showAnnualSummary,
    showTaxDeductible,
    showBudgets,
    budgetManagementFocusCategory,
    showPeopleManagement,
    showAnalyticsHub,
    showFinancialOverview,
    financialOverviewInitialTab,

    // Open/close handlers
    openExpenseForm, closeExpenseForm,
    openBackupSettings, closeBackupSettings,
    openSettingsModal, closeSettingsModal,
    openSystemModal, closeSystemModal,
    openAnnualSummary, closeAnnualSummary,
    openTaxDeductible, closeTaxDeductible,
    openBudgets, closeBudgets,
    openPeopleManagement, closePeopleManagement,
    openAnalyticsHub, closeAnalyticsHub,
    openFinancialOverview, closeFinancialOverview,

    // Bulk operations
    closeAllOverlays,
  }), [
    showExpenseForm, showBackupSettings, showSettingsModal, showSystemModal,
    showAnnualSummary, showTaxDeductible, showBudgets,
    budgetManagementFocusCategory, showPeopleManagement,
    showAnalyticsHub,
    showFinancialOverview,
    financialOverviewInitialTab,
    openExpenseForm, closeExpenseForm,
    openBackupSettings, closeBackupSettings,
    openSettingsModal, closeSettingsModal,
    openSystemModal, closeSystemModal,
    openAnnualSummary, closeAnnualSummary,
    openTaxDeductible, closeTaxDeductible,
    openBudgets, closeBudgets,
    openPeopleManagement, closePeopleManagement,
    openAnalyticsHub, closeAnalyticsHub,
    openFinancialOverview, closeFinancialOverview,
    closeAllOverlays,
  ]);

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
}

/**
 * useModalContext - Custom hook for consuming modal context
 * 
 * @returns {Object} Modal context value
 * @throws {Error} If used outside of ModalProvider
 */
export function useModalContext() {
  const context = useContext(ModalContext);
  if (context === null) {
    throw new Error('useModalContext must be used within a ModalProvider');
  }
  return context;
}

export default ModalContext;
