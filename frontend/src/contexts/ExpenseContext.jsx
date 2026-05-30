import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../config';
import { useFilterContext } from './FilterContext';
import { authAwareFetch } from '../utils/fetchProvider';

const ExpenseContext = createContext(null);

/**
 * ExpenseProvider - Manages expense data, fetching, CRUD, and filtering
 * 
 * Must be nested inside FilterProvider (consumes FilterContext internally).
 */
export function ExpenseProvider({ children }) {
  const {
    searchText, filterType, filterMethod, filterYear,
    selectedYear, selectedMonth, isGlobalView,
  } = useFilterContext();

  // Core expense state
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentMonthExpenseCount, setCurrentMonthExpenseCount] = useState(0);

  // Budget alert refresh trigger (exposed for AppContent to use)
  const [budgetAlertRefreshTrigger, setBudgetAlertRefreshTrigger] = useState(0);

  // Track previous view parameters so the fetch effect can detect
  // view-parameter changes vs background refreshes (triggerRefresh).
  // View-parameter changes show a loading spinner; background refreshes don't.
  const prevViewParamsRef = useRef(null);

  // Build the expenses endpoint URL for the current view parameters.
  const buildExpensesUrl = useCallback(() => {
    if (isGlobalView) {
      return filterYear
        ? `${API_ENDPOINTS.EXPENSES}?year=${filterYear}`
        : API_ENDPOINTS.EXPENSES;
    }
    return `${API_ENDPOINTS.EXPENSES}?year=${selectedYear}&month=${selectedMonth}`;
  }, [isGlobalView, filterYear, selectedYear, selectedMonth]);

  // --- Expense Fetching ---
  useEffect(() => {
    const currentViewParams = `${selectedYear}-${selectedMonth}-${isGlobalView}-${filterYear}`;
    const isViewChange = prevViewParamsRef.current !== currentViewParams;
    prevViewParamsRef.current = currentViewParams;

    // Cancel any in-flight request when params change or the component unmounts,
    // preventing out-of-order responses from clobbering newer state.
    const controller = new AbortController();

    const fetchExpenses = async () => {
      // Only show loading spinner on initial load or view-parameter changes,
      // not on background refreshes (triggerRefresh). This prevents the
      // content layout from unmounting/remounting and causing a visual flash.
      if (isViewChange) {
        setLoading(true);
      }
      setError(null);
      try {
        const response = await authAwareFetch(buildExpensesUrl(), { signal: controller.signal });
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Unable to load expenses. Please try again.';
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch { /* use default */ }
          throw new Error(errorMessage);
        }
        const data = await response.json();
        setExpenses(data);
      } catch (err) {
        if (err.name === 'AbortError') return; // superseded request — ignore
        let userMessage = err.message;
        if (err.message.includes('fetch') || err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
          userMessage = 'Unable to connect to the server. Please check your connection and try again.';
        }
        setError(userMessage);
        console.error('Error fetching expenses:', err);
        // Keep existing expenses if we have them
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    fetchExpenses();
    return () => controller.abort();
  }, [buildExpensesUrl, selectedYear, selectedMonth, isGlobalView, filterYear, refreshTrigger]);

  // --- expensesUpdated Event Listener ---
  // Bump the refresh triggers; the fetch effect above re-runs off refreshTrigger
  // and performs the (spinner-less) background refresh. Keeping the fetch in one
  // place avoids the duplicated request the previous inline refetch caused.
  useEffect(() => {
    const handleExpensesUpdated = () => {
      setRefreshTrigger(prev => prev + 1);
      setBudgetAlertRefreshTrigger(prev => prev + 1);
    };
    window.addEventListener('expensesUpdated', handleExpensesUpdated);
    return () => window.removeEventListener('expensesUpdated', handleExpensesUpdated);
  }, []);

  // --- Current Month Expense Count ---
  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      try {
        const now = new Date();
        const url = `${API_ENDPOINTS.EXPENSES}?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
        const response = await authAwareFetch(url);
        if (response.ok && isMounted) {
          const data = await response.json();
          setCurrentMonthExpenseCount(data.length);
        }
      } catch (err) {
        if (isMounted) console.error('Error fetching current month expense count:', err);
      }
    };
    fetchCount();
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  // --- CRUD Handlers ---
  const handleExpenseAdded = useCallback((newExpense) => {
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
  }, [isGlobalView, selectedYear, selectedMonth]);

  const handleExpenseDeleted = useCallback((deletedId) => {
    setExpenses(prev => prev.filter(e => e.id !== deletedId));
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  }, []);

  const handleExpenseUpdated = useCallback((updatedExpense) => {
    setExpenses(prev => prev.map(e => e.id === updatedExpense.id ? updatedExpense : e));
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  /** Called by useDataSync on remote SSE expense events — re-fetches from server */
  const refreshExpenses = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
    setBudgetAlertRefreshTrigger(prev => prev + 1);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // --- Client-Side Filtering ---
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const placeMatch = expense.place && expense.place.toLowerCase().includes(searchLower);
        const notesMatch = expense.notes && expense.notes.toLowerCase().includes(searchLower);
        if (!placeMatch && !notesMatch) return false;
      }
      if (filterType && expense.type !== filterType) return false;
      if (filterMethod && expense.method !== filterMethod) return false;
      return true;
    });
  }, [expenses, searchText, filterType, filterMethod]);

  // --- Context Value ---
  const value = useMemo(() => ({
    expenses,
    filteredExpenses,
    loading,
    error,
    refreshTrigger,
    budgetAlertRefreshTrigger,
    currentMonthExpenseCount,
    handleExpenseAdded,
    handleExpenseDeleted,
    handleExpenseUpdated,
    triggerRefresh,
    refreshExpenses,
    clearError,
  }), [
    expenses, filteredExpenses, loading, error,
    refreshTrigger, budgetAlertRefreshTrigger, currentMonthExpenseCount,
    handleExpenseAdded, handleExpenseDeleted, handleExpenseUpdated,
    triggerRefresh, refreshExpenses, clearError,
  ]);

  return (
    <ExpenseContext.Provider value={value}>
      {children}
    </ExpenseContext.Provider>
  );
}

/**
 * useExpenseContext - Custom hook for consuming expense context
 */
export function useExpenseContext() {
  const context = useContext(ExpenseContext);
  if (context === null) {
    throw new Error('useExpenseContext must be used within an ExpenseProvider');
  }
  return context;
}

export default ExpenseContext;
