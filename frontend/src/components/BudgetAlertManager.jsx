import { useState, useEffect, useCallback, useRef } from 'react';
import { getBudgets } from '../services/budgetApi';
import { calculateAlerts } from '../utils/budgetAlerts';
import BudgetReminderBanner from './BudgetReminderBanner';
import { createLogger } from '../utils/logger';

const logger = createLogger('BudgetAlertManager');

// Performance constants
const DEBOUNCE_DELAY = 300; // 300ms debounce for rapid updates (Requirement 7.2)

/**
 * BudgetAlertManager Component
 * Manages all budget alerts, dismissal state, and real-time updates
 * Uses BudgetReminderBanner for consistent reminder banner pattern
 * 
 * Requirements: 6.1, 6.2, 6.4
 * Performance: Debouncing and caching (Requirements 7.1, 7.2)
 */
const BudgetAlertManager = ({ 
  year, 
  month, 
  refreshTrigger, 
  onClick,  // Single onClick handler for category navigation - Requirements: 6.4
  onVisibilityChange  // Callback to notify parent of actual visibility state
}) => {
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Track previous year/month to detect actual changes vs initial mount
  const prevYearMonthRef = useRef({ year: null, month: null });
  
  // Performance optimizations
  const debounceTimerRef = useRef(null);
  const budgetCacheRef = useRef({ key: null, data: null }); // Cache for budget data

  /**
   * Transform flat budget data from API to the nested structure expected by calculateAlerts
   * API returns: { id, year, month, category, limit, spent }
   * calculateAlerts expects: { budget: { id, category, limit }, progress, spent }
   */
  const transformBudgetData = useCallback((budgets) => {
    if (!Array.isArray(budgets)) {
      logger.warn('Budget data is not an array, returning empty array');
      return [];
    }

    return budgets
      .filter(budget => {
        // Check if budget has required properties (flat structure from API)
        if (!budget || typeof budget !== 'object') {
          logger.warn('Invalid budget object:', budget);
          return false;
        }

        // Check required fields for flat structure
        const requiredFields = ['id', 'category', 'limit'];
        const missingFields = requiredFields.filter(field => 
          budget[field] === undefined || budget[field] === null
        );

        if (missingFields.length > 0) {
          logger.warn(`Budget missing required fields [${missingFields.join(', ')}]:`, budget);
          return false;
        }

        // Check if limit is a valid number
        if (typeof budget.limit !== 'number' || isNaN(budget.limit) || budget.limit < 0) {
          logger.warn('Budget has invalid limit:', budget);
          return false;
        }

        // Check if spent is a valid number (if present)
        if (budget.spent !== undefined && (typeof budget.spent !== 'number' || isNaN(budget.spent))) {
          logger.warn('Budget has invalid spent amount:', budget);
          return false;
        }

        return true;
      })
      .map(budget => {
        // Transform flat structure to nested structure expected by calculateAlerts
        const spent = budget.spent || 0;
        const limit = budget.limit;
        const progress = limit > 0 ? (spent / limit) * 100 : 0;

        return {
          budget: {
            id: budget.id,
            category: budget.category,
            limit: budget.limit
          },
          spent,
          progress
        };
      });
  }, []);

  /**
   * Load dismissal state from sessionStorage with graceful degradation
   * Requirements: 6.2 - Session-based dismissal storage with fallback
   */
  const loadDismissalState = useCallback(() => {
    try {
      const storageKey = `budget-alerts-dismissed-${year}-${month}`;
      const stored = sessionStorage.getItem(storageKey);
      if (stored === 'true') {
        return true;
      }
    } catch (error) {
      logger.warn('Failed to load dismissal state from sessionStorage:', error);
    }
    return false;
  }, [year, month]);

  /**
   * Save dismissal state to sessionStorage with graceful degradation
   * Requirements: 6.2 - Session-based dismissal storage with fallback
   */
  const saveDismissalState = useCallback((isDismissed) => {
    try {
      const storageKey = `budget-alerts-dismissed-${year}-${month}`;
      if (isDismissed) {
        sessionStorage.setItem(storageKey, 'true');
      } else {
        sessionStorage.removeItem(storageKey);
      }
    } catch (error) {
      logger.warn('Failed to save dismissal state to sessionStorage:', error);
    }
  }, [year, month]);

  /**
   * Clear dismissal state when navigating to a different month
   */
  const clearDismissalState = useCallback(() => {
    try {
      const storageKey = `budget-alerts-dismissed-${year}-${month}`;
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      logger.warn('Failed to clear dismissal state from sessionStorage:', error);
    }
    setDismissed(false);
  }, [year, month]);

  /**
   * Cache key for budget data to avoid unnecessary recalculations
   * Requirements: 7.1 - Cache alert calculations until budget data changes
   */
  const getCacheKey = useCallback((year, month, refreshTrigger) => {
    return `${year}-${month}-${refreshTrigger}`;
  }, []);

  /**
   * Debounced alert calculation to prevent rapid updates
   * Requirements: 7.2 - Batch alert updates to minimize re-renders
   */
  const debouncedCalculateAlerts = useCallback((year, month, refreshTrigger) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      calculateAlertsFromBudgets(year, month, refreshTrigger);
    }, DEBOUNCE_DELAY);
  }, []);

  const calculateAlertsFromBudgets = useCallback(async (year, month, refreshTrigger) => {
    const cacheKey = getCacheKey(year, month, refreshTrigger);
    
    // Check cache first (Requirements: 7.1 - Cache alert calculations)
    if (budgetCacheRef.current.key === cacheKey && budgetCacheRef.current.data) {
      try {
        const transformedBudgets = transformBudgetData(budgetCacheRef.current.data);
        const cachedAlerts = calculateAlerts(transformedBudgets);
        setAlerts(cachedAlerts);
        return;
      } catch (err) {
        logger.warn('Error processing cached budget data, fetching fresh data:', err);
        budgetCacheRef.current = { key: null, data: null };
      }
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await getBudgets(year, month);
      const budgets = response?.budgets || [];
      
      // Transform flat budget data to nested structure expected by calculateAlerts
      const transformedBudgets = transformBudgetData(budgets);
      
      if (transformedBudgets.length === 0 && budgets.length > 0) {
        logger.warn('All budget data was invalid, no alerts will be displayed');
        setError('Budget data format is invalid');
        setAlerts([]);
        return;
      }
      
      if (transformedBudgets.length < budgets.length) {
        const invalidCount = budgets.length - transformedBudgets.length;
        logger.warn(`${invalidCount} invalid budget entries were skipped`);
      }
      
      // Update cache with original data (not transformed)
      budgetCacheRef.current = {
        key: cacheKey,
        data: budgets
      };
      
      const newAlerts = calculateAlerts(transformedBudgets);
      setAlerts(newAlerts);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load budget alerts';
      setError(errorMessage);
      logger.error('Budget alert calculation error:', err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [getCacheKey, transformBudgetData]);

  /**
   * Load dismissal state from sessionStorage on mount
   * Requirements: 6.2 - Session persistence
   */
  useEffect(() => {
    const loadedDismissed = loadDismissalState();
    setDismissed(loadedDismissed);
  }, [loadDismissalState]);

  /**
   * Refresh alerts when dependencies change (with debouncing)
   * Requirements: 7.2 - Real-time updates with performance optimization
   */
  useEffect(() => {
    debouncedCalculateAlerts(year, month, refreshTrigger);
    
    // Cleanup debounce timer on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [debouncedCalculateAlerts, year, month, refreshTrigger]);

  /**
   * Clear dismissal state when year or month changes (not on initial mount)
   */
  useEffect(() => {
    const prevYear = prevYearMonthRef.current.year;
    const prevMonth = prevYearMonthRef.current.month;
    
    // Only clear if year/month actually changed (not on initial mount)
    if (prevYear !== null && prevMonth !== null) {
      if (prevYear !== year || prevMonth !== month) {
        clearDismissalState();
      }
    }
    
    // Update the ref with current values
    prevYearMonthRef.current = { year, month };
  }, [year, month, clearDismissalState]);

  /**
   * Dismiss all alerts (session-based storage)
   * Requirements: 6.2
   */
  const handleDismiss = useCallback(() => {
    setDismissed(true);
    saveDismissalState(true);
  }, [saveDismissalState]);

  /**
   * Handle click on banner - navigate to category
   * Requirements: 6.4 - Single click navigation
   */
  const handleClick = useCallback((category) => {
    if (onClick) {
      onClick(category);
    }
  }, [onClick]);

  // Determine actual visibility
  const isVisible = !loading && !dismissed && !error && alerts.length > 0;

  // Notify parent of visibility changes
  useEffect(() => {
    if (onVisibilityChange) {
      onVisibilityChange(isVisible);
    }
  }, [isVisible, onVisibilityChange]);

  // Don't render anything if not visible
  if (!isVisible) {
    return null;
  }

  return (
    <BudgetReminderBanner
      alerts={alerts}
      onDismiss={handleDismiss}
      onClick={handleClick}
    />
  );
};

export default BudgetAlertManager;
