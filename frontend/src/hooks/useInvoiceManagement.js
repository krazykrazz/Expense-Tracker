import { useState, useCallback, useEffect, useRef } from 'react';
import { getInvoicesForExpense, updateInvoicePersonLink } from '../services/invoiceApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('useInvoiceManagement');

/**
 * useInvoiceManagement - Custom hook for invoice fetching/caching,
 * modal state, and person link updates.
 *
 * Extracted from ExpenseList.jsx, TaxDeductible.jsx, and ExpenseForm.jsx.
 *
 * @param {Object} [options]
 * @param {Array} [options.expenses] - Array of expenses to auto-load invoices for (tax-deductible ones)
 * @returns {Object}
 */
function useInvoiceManagement({ expenses = [] } = {}) {
  const [invoiceCache, setInvoiceCache] = useState(new Map());
  const [loadingInvoices, setLoadingInvoices] = useState(new Set());

  // Modal state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceModalExpense, setInvoiceModalExpense] = useState(null);
  const [invoiceModalInvoices, setInvoiceModalInvoices] = useState([]);

  // Ref to track mounted state
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  /**
   * Fetch invoices for a given expense ID. Returns cached result if available.
   * @param {number} expenseId
   * @returns {Promise<Array>} Array of invoices
   */
  const fetchInvoices = useCallback(async (expenseId) => {
    // Return cached result if available
    if (invoiceCache.has(expenseId)) {
      return invoiceCache.get(expenseId);
    }

    try {
      const invoices = await getInvoicesForExpense(expenseId);
      const result = invoices || [];
      if (isMountedRef.current) {
        setInvoiceCache(prev => {
          const newMap = new Map(prev);
          newMap.set(expenseId, result);
          return newMap;
        });
      }
      return result;
    } catch (error) {
      logger.error(`Failed to fetch invoices for expense ${expenseId}:`, error);
      if (isMountedRef.current) {
        setInvoiceCache(prev => {
          const newMap = new Map(prev);
          newMap.set(expenseId, []);
          return newMap;
        });
      }
      return [];
    }
  }, [invoiceCache]);

  /**
   * Handle a new invoice being uploaded/added for an expense.
   * @param {number} expenseId
   * @param {Object} newInvoice
   */
  const handleInvoiceUpdated = useCallback((expenseId, newInvoice) => {
    setInvoiceCache(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(expenseId) || [];
      newMap.set(expenseId, [...existing, newInvoice]);
      return newMap;
    });
  }, []);

  /**
   * Handle an invoice being deleted.
   * @param {number} expenseId
   * @param {number} [invoiceId] - If provided, removes specific invoice; otherwise clears all
   */
  const handleInvoiceDeleted = useCallback((expenseId, invoiceId) => {
    setInvoiceCache(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(expenseId) || [];
      if (invoiceId) {
        newMap.set(expenseId, existing.filter(inv => inv.id !== invoiceId));
      } else {
        newMap.set(expenseId, []);
      }
      return newMap;
    });
  }, []);

  /**
   * Handle person link update for an invoice.
   * Calls the API and updates the cache.
   * @param {number} expenseId
   * @param {number} invoiceId
   * @param {number|null} personId
   */
  const handlePersonLinkUpdated = useCallback(async (expenseId, invoiceId, personId) => {
    try {
      const result = await updateInvoicePersonLink(invoiceId, personId);
      if (result.success) {
        setInvoiceCache(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(expenseId) || [];
          newMap.set(expenseId, existing.map(inv =>
            inv.id === invoiceId
              ? { ...inv, personId, personName: result.invoice?.personName || null }
              : inv
          ));
          return newMap;
        });
      }
    } catch (error) {
      logger.error('Failed to update invoice person link:', error);
    }
  }, []);

  /**
   * Open the invoice modal for an expense.
   * Uses provided invoices or fetches them.
   * @param {Object} expense
   * @param {Array} [invoices] - Pre-loaded invoices (optional)
   */
  const openInvoiceModal = useCallback(async (expense, invoices) => {
    setInvoiceModalExpense(expense);
    if (invoices !== undefined && invoices !== null) {
      setInvoiceModalInvoices(invoices);
    } else if (expense.invoices && expense.invoices.length > 0) {
      setInvoiceModalInvoices(expense.invoices);
    } else {
      try {
        const fetched = await getInvoicesForExpense(expense.id);
        setInvoiceModalInvoices(fetched || []);
      } catch (error) {
        logger.error('Failed to fetch invoices for modal:', error);
        setInvoiceModalInvoices([]);
      }
    }
    setShowInvoiceModal(true);
  }, []);

  /**
   * Close the invoice modal.
   */
  const closeInvoiceModal = useCallback(() => {
    setShowInvoiceModal(false);
    setInvoiceModalExpense(null);
    setInvoiceModalInvoices([]);
  }, []);

  // Auto-load invoices for tax-deductible expenses when expenses array changes
  useEffect(() => {
    const loadInvoiceData = async () => {
      const taxDeductibleExpenses = expenses.filter(expense =>
        expense.type === 'Tax - Medical' || expense.type === 'Tax - Donation'
      );
      const expensesToLoad = taxDeductibleExpenses.filter(expense =>
        !invoiceCache.has(expense.id) && !loadingInvoices.has(expense.id)
      );

      if (expensesToLoad.length === 0) return;

      // Mark expenses as loading
      setLoadingInvoices(prev => {
        const newSet = new Set(prev);
        expensesToLoad.forEach(expense => newSet.add(expense.id));
        return newSet;
      });

      // Load all invoices for each expense
      const invoicePromises = expensesToLoad.map(async (expense) => {
        try {
          const invoices = await getInvoicesForExpense(expense.id);
          return { expenseId: expense.id, invoices: invoices || [] };
        } catch (error) {
          logger.error(`Failed to load invoices for expense ${expense.id}:`, error);
          return { expenseId: expense.id, invoices: [] };
        }
      });

      try {
        const results = await Promise.all(invoicePromises);

        if (isMountedRef.current) {
          setInvoiceCache(prev => {
            const newMap = new Map(prev);
            results.forEach(({ expenseId, invoices }) => {
              newMap.set(expenseId, invoices);
            });
            return newMap;
          });
        }
      } finally {
        if (isMountedRef.current) {
          // Remove from loading set
          setLoadingInvoices(prev => {
            const newSet = new Set(prev);
            expensesToLoad.forEach(expense => newSet.delete(expense.id));
            return newSet;
          });
        }
      }
    };

    loadInvoiceData();
  }, [expenses, invoiceCache, loadingInvoices]);

  return {
    invoiceCache,
    loadingInvoices,
    fetchInvoices,
    handleInvoiceUpdated,
    handleInvoiceDeleted,
    handlePersonLinkUpdated,
    // Modal state
    showInvoiceModal,
    invoiceModalExpense,
    invoiceModalInvoices,
    openInvoiceModal,
    closeInvoiceModal,
  };
}

export default useInvoiceManagement;
