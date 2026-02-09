import { useState, useEffect, useCallback, useRef } from 'react';
import { getActivePaymentMethods, getPaymentMethod } from '../services/paymentMethodApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('usePaymentMethods');

// localStorage key for payment method persistence
// Stores payment_method_id (number as string)
const LAST_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method-id';

// Legacy localStorage key for migration (string-based method name)
const LEGACY_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method';

// Default payment method ID when no saved value exists
// ID 1 corresponds to "Cash" in the migrated payment_methods table
const DEFAULT_PAYMENT_METHOD_ID = 1;

/**
 * Get the last used payment method ID from localStorage.
 * Includes migration logic for legacy string-based localStorage values.
 *
 * @param {Array} paymentMethods - Available payment methods for validation/migration
 * @returns {number|null} The last used payment method ID or null
 */
const getLastPaymentMethodId = (paymentMethods = []) => {
  try {
    // First try the new ID-based key
    const savedId = localStorage.getItem(LAST_PAYMENT_METHOD_KEY);
    if (savedId) {
      const id = parseInt(savedId, 10);
      // Validate that the ID exists in available payment methods
      if (paymentMethods.some(pm => pm.id === id)) {
        return id;
      }
    }

    // Migration: Check for legacy string-based value
    const legacyMethod = localStorage.getItem(LEGACY_PAYMENT_METHOD_KEY);
    if (legacyMethod && paymentMethods.length > 0) {
      // Find the payment method by display_name
      const matchingMethod = paymentMethods.find(pm => pm.display_name === legacyMethod);
      if (matchingMethod) {
        // Migrate to new format
        localStorage.setItem(LAST_PAYMENT_METHOD_KEY, matchingMethod.id.toString());
        localStorage.removeItem(LEGACY_PAYMENT_METHOD_KEY);
        return matchingMethod.id;
      }
    }
  } catch (error) {
    logger.error('Failed to read payment method from localStorage:', error);
  }
  return null;
};

/**
 * Save the payment method ID to localStorage.
 *
 * @param {number} paymentMethodId - The payment method ID to save
 */
const saveLastPaymentMethodId = (paymentMethodId) => {
  try {
    localStorage.setItem(LAST_PAYMENT_METHOD_KEY, paymentMethodId.toString());
  } catch (error) {
    logger.error('Failed to save payment method to localStorage:', error);
  }
};

/**
 * usePaymentMethods - Custom hook for payment method fetching, inactive method
 * handling, and last-used method memory via localStorage.
 *
 * Extracted from ExpenseForm.jsx and TaxDeductible.jsx.
 *
 * @param {Object} [options]
 * @param {number|null} [options.expensePaymentMethodId=null] - Payment method ID of expense being edited (for inactive method handling)
 * @returns {Object}
 */
function usePaymentMethods({ expensePaymentMethodId = null } = {}) {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inactivePaymentMethod, setInactivePaymentMethod] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const fetchPaymentMethods = async () => {
      try {
        setLoading(true);
        setError(null);

        const methods = await getActivePaymentMethods();

        if (!isMountedRef.current) return;

        setPaymentMethods(methods || []);

        // If an expensePaymentMethodId is provided and it's not in the active list,
        // fetch it separately so it can be shown in the dropdown (disabled)
        if (expensePaymentMethodId) {
          const isActive = (methods || []).some(m => m.id === expensePaymentMethodId);
          if (!isActive) {
            try {
              const inactiveMethod = await getPaymentMethod(expensePaymentMethodId);
              if (isMountedRef.current && inactiveMethod) {
                setInactivePaymentMethod(inactiveMethod);
              }
            } catch (err) {
              logger.error('Failed to fetch inactive payment method:', err);
            }
          }
        }
      } catch (err) {
        if (isMountedRef.current) {
          logger.error('Failed to fetch payment methods:', err);
          setError('Failed to load payment methods');
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    fetchPaymentMethods();

    return () => {
      isMountedRef.current = false;
    };
  }, [expensePaymentMethodId]);

  /**
   * Get the last used payment method ID from localStorage.
   * Wraps the module-level getLastPaymentMethodId with optional methods override.
   *
   * @param {Array} [methods] - Payment methods to validate against (defaults to hook's paymentMethods)
   * @returns {number|null}
   */
  const getLastUsedId = useCallback((methods) => {
    return getLastPaymentMethodId(methods || paymentMethods);
  }, [paymentMethods]);

  /**
   * Save a payment method ID to localStorage.
   *
   * @param {number} id - Payment method ID to save
   */
  const saveLastUsed = useCallback((id) => {
    saveLastPaymentMethodId(id);
  }, []);

  return {
    paymentMethods,
    loading,
    error,
    inactivePaymentMethod,
    getLastUsedId,
    saveLastUsed,
    defaultPaymentMethodId: DEFAULT_PAYMENT_METHOD_ID,
  };
}

export default usePaymentMethods;
