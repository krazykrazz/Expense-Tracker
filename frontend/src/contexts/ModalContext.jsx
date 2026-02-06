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
  const [showAnnualSummary, setShowAnnualSummary] = useState(false);
  const [showTaxDeductible, setShowTaxDeductible] = useState(false);
  const [showBudgetManagement, setShowBudgetManagement] = useState(false);
  const [budgetManagementFocusCategory, setBudgetManagementFocusCategory] = useState(null);
  const [showBudgetHistory, setShowBudgetHistory] = useState(false);
  const [showPeopleManagement, setShowPeopleManagement] = useState(false);
  const [showAnalyticsHub, setShowAnalyticsHub] = useState(false);

  // --- Open Handlers ---
  const openExpenseForm = useCallback(() => setShowExpenseForm(true), []);
  const closeExpenseForm = useCallback(() => setShowExpenseForm(false), []);

  const openBackupSettings = useCallback(() => setShowBackupSettings(true), []);
  const closeBackupSettings = useCallback(() => setShowBackupSettings(false), []);

  const openAnnualSummary = useCallback(() => setShowAnnualSummary(true), []);
  const closeAnnualSummary = useCallback(() => setShowAnnualSummary(false), []);

  const openTaxDeductible = useCallback(() => setShowTaxDeductible(true), []);
  const closeTaxDeductible = useCallback(() => setShowTaxDeductible(false), []);

  const openBudgetManagement = useCallback((category = null) => {
    setBudgetManagementFocusCategory(category);
    setShowBudgetManagement(true);
  }, []);
  const closeBudgetManagement = useCallback(() => {
    setShowBudgetManagement(false);
    setBudgetManagementFocusCategory(null);
  }, []);

  const openBudgetHistory = useCallback(() => setShowBudgetHistory(true), []);
  const closeBudgetHistory = useCallback(() => setShowBudgetHistory(false), []);

  const openPeopleManagement = useCallback(() => setShowPeopleManagement(true), []);
  const closePeopleManagement = useCallback(() => setShowPeopleManagement(false), []);

  const openAnalyticsHub = useCallback(() => setShowAnalyticsHub(true), []);
  const closeAnalyticsHub = useCallback(() => setShowAnalyticsHub(false), []);

  // --- Bulk Close ---
  // Closes only overlay modals (taxDeductible, annualSummary, backupSettings, budgetHistory)
  // Does NOT affect action modals (expenseForm, budgetManagement, peopleManagement, analyticsHub)
  const closeAllOverlays = useCallback(() => {
    setShowTaxDeductible(false);
    setShowAnnualSummary(false);
    setShowBackupSettings(false);
    setShowBudgetHistory(false);
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
    showAnnualSummary,
    showTaxDeductible,
    showBudgetManagement,
    budgetManagementFocusCategory,
    showBudgetHistory,
    showPeopleManagement,
    showAnalyticsHub,

    // Open/close handlers
    openExpenseForm, closeExpenseForm,
    openBackupSettings, closeBackupSettings,
    openAnnualSummary, closeAnnualSummary,
    openTaxDeductible, closeTaxDeductible,
    openBudgetManagement, closeBudgetManagement,
    openBudgetHistory, closeBudgetHistory,
    openPeopleManagement, closePeopleManagement,
    openAnalyticsHub, closeAnalyticsHub,

    // Bulk operations
    closeAllOverlays,
  }), [
    showExpenseForm, showBackupSettings, showAnnualSummary,
    showTaxDeductible, showBudgetManagement, budgetManagementFocusCategory,
    showBudgetHistory, showPeopleManagement, showAnalyticsHub,
    openExpenseForm, closeExpenseForm,
    openBackupSettings, closeBackupSettings,
    openAnnualSummary, closeAnnualSummary,
    openTaxDeductible, closeTaxDeductible,
    openBudgetManagement, closeBudgetManagement,
    openBudgetHistory, closeBudgetHistory,
    openPeopleManagement, closePeopleManagement,
    openAnalyticsHub, closeAnalyticsHub,
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
