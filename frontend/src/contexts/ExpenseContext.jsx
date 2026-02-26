import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
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

  // --- Expense Fetching ---
  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      setError(null);
      try {
        let url;
        if (isGlobalView) {
          url = filterYear
            ? `${API_ENDPOINTS.EXPENSES}?year=${filterYear}`
            : API_ENDPOINTS.EXPENSES;
        } else {
          url = `${API_ENDPOINTS.EXPENSES}?year=${selectedYear}&month=${selectedMonth}`;
        }
        const response = await authAwareFetch(url);
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
        let userMessage = err.message;
        if (err.message.includes('fetch') || err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
          userMessage = 'Unable to connect to the server. Please check your connection and try again.';
        }
        setError(userMessage);
        console.error('Error fetching expenses:', err);
        // Keep existing expenses if we have them
      } finally {
        setLoading(false);
      }
    };
    fetchExpenses();
  }, [selectedYear, selectedMonth, isGlobalView, filterYear, refreshTrigger]);

  // --- expensesUpdated Event Listener ---
  useEffect(() => {
    const handleExpensesUpdated = () => {
      setRefreshTrigger(prev => prev + 1);
      setBudgetAlertRefreshTrigger(prev => prev + 1);
      // Re-fetch expenses
      const refetch = async () => {
        try {
          let url;
          if (isGlobalView) {
            url = filterYear
              ? `${API_ENDPOINTS.EXPENSES}?year=${filterYear}`
              : API_ENDPOINTS.EXPENSES;
          } else {
            url = `${API_ENDPOINTS.EXPENSES}?year=${selectedYear}&month=${selectedMonth}`;
          }
          const response = await authAwareFetch(url);
          if (response.ok) {
            const data = await response.json();
            setExpenses(data);
          }
        } catch (err) {
          console.error('Error refreshing expenses:', err);
        }
      };
      refetch();
    };
    window.addEventListener('expensesUpdated', handleExpensesUpdated);
    return () => window.removeEventListener('expensesUpdated', handleExpensesUpdated);
  }, [selectedYear, selectedMonth, isGlobalView, filterYear]);

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
