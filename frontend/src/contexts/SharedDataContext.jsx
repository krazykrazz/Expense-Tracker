import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { getPaymentMethods } from '../services/paymentMethodApi';
import { getPeople } from '../services/peopleApi';
import { getBudgets } from '../services/budgetApi';

const SharedDataContext = createContext(null);

/**
 * SharedDataProvider - Manages shared data fetching state
 * (payment methods, people, budgets)
 *
 * Independent of FilterContext, ExpenseContext, and ModalContext.
 * Nested inside ModalProvider for component tree access.
 */
export function SharedDataProvider({ children, selectedYear, selectedMonth }) {
  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodsRefreshTrigger, setPaymentMethodsRefreshTrigger] = useState(0);

  // People state
  const [people, setPeople] = useState([]);
  const [peopleRefreshTrigger, setPeopleRefreshTrigger] = useState(0);

  // Budgets state
  const [budgets, setBudgets] = useState([]);
  const [budgetRefreshTrigger, setBudgetRefreshTrigger] = useState(0);

  // --- Payment Methods Fetching ---
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

    return () => { isMounted = false; };
  }, [paymentMethodsRefreshTrigger]);

  // --- People Fetching ---
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

    return () => { isMounted = false; };
  }, [peopleRefreshTrigger]);

  // --- Budgets Fetching ---
  useEffect(() => {
    let isMounted = true;

    const fetchBudgetsData = async () => {
      try {
        const budgetResponse = await getBudgets(selectedYear, selectedMonth);
        if (isMounted) {
          setBudgets(budgetResponse?.budgets || []);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching budgets:', err);
        }
      }
    };

    fetchBudgetsData();

    return () => { isMounted = false; };
  }, [selectedYear, selectedMonth, budgetRefreshTrigger]);

  // --- Window Event Listeners ---
  useEffect(() => {
    const handlePeopleUpdated = () => {
      setPeopleRefreshTrigger(prev => prev + 1);
    };

    window.addEventListener('peopleUpdated', handlePeopleUpdated);
    return () => window.removeEventListener('peopleUpdated', handlePeopleUpdated);
  }, []);

  // --- Callbacks ---
  const refreshPaymentMethods = useCallback(() => setPaymentMethodsRefreshTrigger(prev => prev + 1), []);
  const refreshPeople = useCallback(() => setPeopleRefreshTrigger(prev => prev + 1), []);
  const refreshBudgets = useCallback(() => setBudgetRefreshTrigger(prev => prev + 1), []);

  // --- Context Value ---
  const value = useMemo(() => ({
    // Payment Methods
    paymentMethods,
    refreshPaymentMethods,

    // People
    people,
    refreshPeople,

    // Budgets
    budgets,
    refreshBudgets,
  }), [
    paymentMethods,
    refreshPaymentMethods,
    people,
    refreshPeople,
    budgets,
    refreshBudgets,
  ]);

  return (
    <SharedDataContext.Provider value={value}>
      {children}
    </SharedDataContext.Provider>
  );
}

/**
 * useSharedDataContext - Custom hook for consuming shared data context
 *
 * @returns {Object} Shared data context value
 * @throws {Error} If used outside of SharedDataProvider
 */
export function useSharedDataContext() {
  const context = useContext(SharedDataContext);
  if (context === null) {
    throw new Error('useSharedDataContext must be used within a SharedDataProvider');
  }
  return context;
}

export default SharedDataContext;
