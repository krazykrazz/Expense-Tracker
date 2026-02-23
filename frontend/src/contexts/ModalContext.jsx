import { createContext, useContext, useReducer, useState, useCallback, useMemo, useEffect } from 'react';

const ModalContext = createContext(null);

// --- Initial State ---
const initialState = {
  showExpenseForm: false,
  showBackupSettings: false,
  showSettingsModal: false,
  showSystemModal: false,
  showAnnualSummary: false,
  showTaxDeductible: false,
  showBudgets: false,
  budgetManagementFocusCategory: null,
  showPeopleManagement: false,
  showAnalyticsHub: false,
  showFinancialOverview: false,
  financialOverviewInitialTab: null,
};

// Overlay modals closed by closeAllOverlays
const overlayDefaults = {
  showTaxDeductible: false,
  showAnnualSummary: false,
  showBackupSettings: false,
  showSettingsModal: false,
  showSystemModal: false,
};

// --- Reducer ---
function modalReducer(state, action) {
  switch (action.type) {
    case 'OPEN':
      return { ...state, [action.modal]: true, ...(action.payload || {}) };
    case 'CLOSE':
      return { ...state, [action.modal]: false, ...(action.payload || {}) };
    case 'CLOSE_ALL_OVERLAYS':
      return { ...state, ...overlayDefaults };
    default:
      return state;
  }
}

/**
 * ModalProvider - Manages all modal visibility state
 *
 * Independent of FilterContext and ExpenseContext.
 * Nested inside ExpenseProvider for component tree access.
 */
export function ModalProvider({ children }) {
  const [state, dispatch] = useReducer(modalReducer, initialState);

  // --- Open/Close Handlers ---
  const openExpenseForm = useCallback(() => dispatch({ type: 'OPEN', modal: 'showExpenseForm' }), []);
  const closeExpenseForm = useCallback(() => dispatch({ type: 'CLOSE', modal: 'showExpenseForm' }), []);

  const openBackupSettings = useCallback(() => dispatch({ type: 'OPEN', modal: 'showBackupSettings' }), []);
  const closeBackupSettings = useCallback(() => dispatch({ type: 'CLOSE', modal: 'showBackupSettings' }), []);

  const openSettingsModal = useCallback(() => dispatch({ type: 'OPEN', modal: 'showSettingsModal' }), []);
  const closeSettingsModal = useCallback(() => dispatch({ type: 'CLOSE', modal: 'showSettingsModal' }), []);

  const openSystemModal = useCallback(() => dispatch({ type: 'OPEN', modal: 'showSystemModal' }), []);
  const closeSystemModal = useCallback(() => dispatch({ type: 'CLOSE', modal: 'showSystemModal' }), []);

  const openAnnualSummary = useCallback(() => dispatch({ type: 'OPEN', modal: 'showAnnualSummary' }), []);
  const closeAnnualSummary = useCallback(() => dispatch({ type: 'CLOSE', modal: 'showAnnualSummary' }), []);

  const openTaxDeductible = useCallback(() => dispatch({ type: 'OPEN', modal: 'showTaxDeductible' }), []);
  const closeTaxDeductible = useCallback(() => dispatch({ type: 'CLOSE', modal: 'showTaxDeductible' }), []);

  const openBudgets = useCallback((category = null) => {
    dispatch({ type: 'OPEN', modal: 'showBudgets', payload: { budgetManagementFocusCategory: category } });
  }, []);
  const closeBudgets = useCallback(() => {
    dispatch({ type: 'CLOSE', modal: 'showBudgets', payload: { budgetManagementFocusCategory: null } });
  }, []);

  const openPeopleManagement = useCallback(() => dispatch({ type: 'OPEN', modal: 'showPeopleManagement' }), []);
  const closePeopleManagement = useCallback(() => dispatch({ type: 'CLOSE', modal: 'showPeopleManagement' }), []);

  const openAnalyticsHub = useCallback(() => dispatch({ type: 'OPEN', modal: 'showAnalyticsHub' }), []);
  const closeAnalyticsHub = useCallback(() => dispatch({ type: 'CLOSE', modal: 'showAnalyticsHub' }), []);

  const openFinancialOverview = useCallback((tab = null) => {
    dispatch({ type: 'OPEN', modal: 'showFinancialOverview', payload: { financialOverviewInitialTab: tab } });
  }, []);
  const closeFinancialOverview = useCallback(() => {
    dispatch({ type: 'CLOSE', modal: 'showFinancialOverview', payload: { financialOverviewInitialTab: null } });
  }, []);

  // --- Standalone CreditCardDetailView State ---
  const [creditCardDetailState, setCreditCardDetailState] = useState({
    show: false,
    paymentMethodId: null,
    initialTab: null,
    initialAction: null,
    reminderData: null
  });

  const openCreditCardDetail = useCallback((paymentMethodId, options = {}) => {
    setCreditCardDetailState({
      show: true,
      paymentMethodId,
      initialTab: options.initialTab || null,
      initialAction: options.initialAction || null,
      reminderData: options.reminderData || null
    });
  }, []);

  const closeCreditCardDetail = useCallback(() => {
    setCreditCardDetailState({
      show: false,
      paymentMethodId: null,
      initialTab: null,
      initialAction: null,
      reminderData: null
    });
  }, []);

  const closeAllOverlays = useCallback(() => dispatch({ type: 'CLOSE_ALL_OVERLAYS' }), []);

  // --- Window Event Listeners ---
  useEffect(() => {
    const handleNavigateToTaxDeductible = (event) => {
      dispatch({ type: 'OPEN', modal: 'showTaxDeductible' });
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
    ...state,

    // Standalone CreditCardDetailView state
    creditCardDetailState,

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
    openCreditCardDetail, closeCreditCardDetail,

    // Bulk operations
    closeAllOverlays,
  }), [
    state,
    creditCardDetailState,
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
    openCreditCardDetail, closeCreditCardDetail,
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
