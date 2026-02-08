import { useState, useCallback } from 'react';
import { updateInsuranceStatus as updateInsuranceStatusApi } from '../services/expenseApi';

/**
 * useInsuranceStatus - Custom hook for insurance claim status updates
 * and quick status UI state management.
 *
 * Extracted from ExpenseList.jsx and TaxDeductible.jsx.
 *
 * @param {Object} [options]
 * @param {Function} [options.onStatusChanged] - Callback after successful status update
 * @returns {Object}
 */
function useInsuranceStatus({ onStatusChanged } = {}) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [quickStatusExpense, setQuickStatusExpense] = useState(null);

  /**
   * Update the insurance claim status for an expense.
   * Calls the API, dispatches 'expensesUpdated' event, and invokes onStatusChanged callback.
   *
   * @param {number} expenseId - The expense ID to update
   * @param {string} newStatus - The new claim status
   * @returns {Promise<Object>} The updated expense
   */
  const updateStatus = useCallback(async (expenseId, newStatus) => {
    setUpdating(true);
    setError(null);
    try {
      const result = await updateInsuranceStatusApi(expenseId, newStatus);

      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('expensesUpdated'));

      if (onStatusChanged) {
        onStatusChanged(result);
      }

      return result;
    } catch (err) {
      setError(err.message || 'Failed to update insurance status');
      throw err;
    } finally {
      setUpdating(false);
    }
  }, [onStatusChanged]);

  /**
   * Open the quick status update popup for an expense.
   *
   * @param {Object} expense - The expense object (or any data needed by the popup)
   * @param {Event} [event] - Optional DOM event (for stopPropagation)
   */
  const openQuickStatus = useCallback((expense, event) => {
    if (event) {
      event.stopPropagation();
    }
    setQuickStatusExpense(expense);
  }, []);

  /**
   * Close the quick status update popup.
   */
  const closeQuickStatus = useCallback(() => {
    setQuickStatusExpense(null);
  }, []);

  return {
    updateStatus,
    updating,
    error,
    quickStatusExpense,
    openQuickStatus,
    closeQuickStatus,
  };
}

export default useInsuranceStatus;
