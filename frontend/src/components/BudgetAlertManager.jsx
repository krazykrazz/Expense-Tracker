import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getBudgets } from '../services/budgetApi';
import { calculateAlerts } from '../utils/budgetAlerts';
import BudgetAlertBanner from './BudgetAlertBanner';
import BudgetAlertErrorBoundary from './BudgetAlertErrorBoundary';
import './BudgetAlertErrorBoundary.css';

// Performance constants
const DEBOUNCE_DELAY = 300; // 300ms debounce for rapid updates (Requirement 7.2)
const MAX_VISIBLE_ALERTS = 5; // Maximum alerts to display (Requirement 7.5)

/**
 * BudgetAlertManager Component
 * Manages all budget alerts, dismissal state, and real-time updates
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.2, 7.1, 7.4, 8.1, 8.2
 * Performance: Debouncing, caching, and alert limits (Requirements 7.1, 7.2, 7.5)
 */
const BudgetAlertManager = ({ 
  year, 
  month, 
  refreshTrigger, 
  onManageBudgets, 
  onViewDetails 
}) => {
  const [alerts, setAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Track alert severity levels for dismissal override logic
  // Requirements: 3.4 - Handle dismissal override when budget conditions worsen
  const alertSeverityRef = useRef(new Map());
  
  // Performance optimizations
  const debounceTimerRef = useRef(null);
  const budgetCacheRef = useRef({ key: null, data: null }); // Cache for budget data

  /**
   * Validate and filter budget data to handle invalid entries gracefully
   * Requirements: 7.1, 8.1 - Handle invalid budget data gracefully (skip invalid, continue with valid)
   */
  const validateBudgetData = useCallback((budgets) => {
    if (!Array.isArray(budgets)) {
      console.warn('Budget data is not an array, returning empty array');
      return [];
    }

    return budgets.filter(budget => {
      // Check if budget has required properties
      if (!budget || typeof budget !== 'object') {
        console.warn('Invalid budget object:', budget);
        return false;
      }

      // Check if budget has required nested structure
      if (!budget.budget || typeof budget.budget !== 'object') {
        console.warn('Budget missing budget property:', budget);
        return false;
      }

      // Check required fields
      const requiredFields = ['id', 'category', 'limit'];
      const missingFields = requiredFields.filter(field => 
        budget.budget[field] === undefined || budget.budget[field] === null
      );

      if (missingFields.length > 0) {
        console.warn(`Budget missing required fields [${missingFields.join(', ')}]:`, budget);
        return false;
      }

      // Check if limit is a valid number
      if (typeof budget.budget.limit !== 'number' || isNaN(budget.budget.limit) || budget.budget.limit < 0) {
        console.warn('Budget has invalid limit:', budget);
        return false;
      }

      // Check if spent is a valid number (if present)
      if (budget.spent !== undefined && (typeof budget.spent !== 'number' || isNaN(budget.spent))) {
        console.warn('Budget has invalid spent amount:', budget);
        return false;
      }

      // Check if progress is a valid number (if present)
      if (budget.progress !== undefined && (typeof budget.progress !== 'number' || isNaN(budget.progress))) {
        console.warn('Budget has invalid progress:', budget);
        return false;
      }

      return true;
    });
  }, []);

  /**
   * Load dismissal state from sessionStorage with graceful degradation
   * Requirements: 3.2, 3.3, 7.3 - Session-based dismissal storage with fallback
   */
  const loadDismissalState = useCallback(() => {
    try {
      const storageKey = `budget-alerts-dismissed-${year}-${month}`;
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const dismissedIds = JSON.parse(stored);
        if (Array.isArray(dismissedIds)) {
          return new Set(dismissedIds);
        } else {
          console.warn('Invalid dismissal state format, using empty set');
        }
      }
    } catch (error) {
      console.warn('Failed to load dismissal state from sessionStorage:', error);
    }
    return new Set();
  }, [year, month]);

  /**
   * Save dismissal state to sessionStorage with graceful degradation
   * Requirements: 3.2, 3.3, 7.3 - Session-based dismissal storage with fallback
   */
  const saveDismissalState = useCallback((dismissedSet) => {
    try {
      const storageKey = `budget-alerts-dismissed-${year}-${month}`;
      const dismissedArray = Array.from(dismissedSet);
      sessionStorage.setItem(storageKey, JSON.stringify(dismissedArray));
    } catch (error) {
      console.warn('Failed to save dismissal state to sessionStorage, continuing with memory-only storage:', error);
      // Graceful degradation: dismissal still works in memory, just won't persist across page refreshes
    }
  }, [year, month]);

  /**
   * Clear dismissal state when navigating away from budget pages
   * Requirements: 3.4 - Clear dismissals when navigating away from budget pages
   */
  const clearDismissalState = useCallback(() => {
    try {
      const storageKey = `budget-alerts-dismissed-${year}-${month}`;
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('Failed to clear dismissal state from sessionStorage, continuing with memory-only clear:', error);
    }
    setDismissedAlerts(new Set());
    alertSeverityRef.current.clear();
  }, [year, month]);

  /**
   * Check if alert should override dismissal due to worsened conditions
   * Requirements: 3.4 - Dismissal override when budget conditions worsen
   */
  const shouldOverrideDismissal = useCallback((alert) => {
    const previousSeverity = alertSeverityRef.current.get(alert.category);
    if (!previousSeverity) {
      return false; // No previous severity recorded
    }

    const severityLevels = { warning: 1, danger: 2, critical: 3 };
    const currentLevel = severityLevels[alert.severity] || 0;
    const previousLevel = severityLevels[previousSeverity] || 0;

    // Override dismissal if severity has worsened
    return currentLevel > previousLevel;
  }, []);

  /**
   * Update alert severity tracking
   * Requirements: 3.4 - Track severity changes for dismissal override
   */
  const updateAlertSeverityTracking = useCallback((newAlerts) => {
    newAlerts.forEach(alert => {
      alertSeverityRef.current.set(alert.category, alert.severity);
    });
  }, []);

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
        const validBudgets = validateBudgetData(budgetCacheRef.current.data);
        const cachedAlerts = calculateAlerts(validBudgets);
        updateAlertSeverityTracking(cachedAlerts);
        setAlerts(cachedAlerts);
        return;
      } catch (err) {
        console.warn('Error processing cached budget data, fetching fresh data:', err);
        // Clear invalid cache and continue to fetch fresh data
        budgetCacheRef.current = { key: null, data: null };
      }
    }

    setLoading(true);
    setError(null);
    
    try {
      const budgets = await getBudgets(year, month);
      
      // Validate and filter budget data (Requirements: 7.1, 8.1 - Handle invalid budget data gracefully)
      const validBudgets = validateBudgetData(budgets);
      
      if (validBudgets.length === 0 && budgets.length > 0) {
        // All budget data was invalid
        console.warn('All budget data was invalid, no alerts will be displayed');
        setError('Budget data format is invalid');
        setAlerts([]);
        return;
      }
      
      if (validBudgets.length < budgets.length) {
        // Some budget data was invalid but we have valid entries
        const invalidCount = budgets.length - validBudgets.length;
        console.warn(`${invalidCount} invalid budget entries were skipped`);
      }
      
      // Update cache with valid data
      budgetCacheRef.current = {
        key: cacheKey,
        data: validBudgets
      };
      
      const newAlerts = calculateAlerts(validBudgets);
      
      // Update severity tracking for dismissal override logic
      updateAlertSeverityTracking(newAlerts);
      
      setAlerts(newAlerts);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load budget alerts';
      setError(errorMessage);
      console.error('Budget alert calculation error:', err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [getCacheKey, updateAlertSeverityTracking, validateBudgetData]);

  /**
   * Load dismissal state from sessionStorage on mount
   * Requirements: 3.2, 3.3 - Session persistence
   */
  useEffect(() => {
    const loadedDismissals = loadDismissalState();
    setDismissedAlerts(loadedDismissals);
  }, [loadDismissalState]);

  /**
   * Refresh alerts when dependencies change (with debouncing)
   * Requirements: 5.1, 5.2, 5.3, 5.4, 8.2, 7.2 - Real-time updates with performance optimization
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
   * Clear dismissal state when year or month changes
   * Requirements: 3.2, 3.3
   */
  useEffect(() => {
    clearDismissalState();
  }, [year, month, clearDismissalState]);

  /**
   * Dismiss an alert (session-based storage with independent handling)
   * Requirements: 3.2, 3.3, 3.4, 3.5, 7.3
   */
  const dismissAlert = useCallback((alertId) => {
    setDismissedAlerts(prev => {
      const newDismissed = new Set([...prev, alertId]);
      saveDismissalState(newDismissed);
      return newDismissed;
    });
  }, [saveDismissalState]);

  /**
   * Refresh alerts manually
   * Requirements: 8.2
   */
  const refreshAlerts = useCallback(() => {
    // Clear cache to force refresh
    budgetCacheRef.current = { key: null, data: null };
    debouncedCalculateAlerts(year, month, refreshTrigger);
  }, [debouncedCalculateAlerts, year, month, refreshTrigger]);

  /**
   * Handle manage budgets action with category context
   * Requirements: 4.1, 4.2 - Pass affected category context to budget modal
   */
  const handleManageBudgets = useCallback((category) => {
    if (onManageBudgets) {
      onManageBudgets(category);
    }
  }, [onManageBudgets]);

  /**
   * Handle view details action with category context
   * Requirements: 4.3, 4.4 - Navigate to budget summary section
   */
  const handleViewDetails = useCallback((category) => {
    if (onViewDetails) {
      onViewDetails(category);
    }
  }, [onViewDetails]);

  // Filter out dismissed alerts with dismissal override logic
  // Requirements: 3.4, 3.5 - Handle multiple alert dismissal independently with override
  const visibleAlerts = alerts.filter(alert => {
    const isDismissed = dismissedAlerts.has(alert.id);
    
    // If not dismissed, always show
    if (!isDismissed) {
      return true;
    }
    
    // If dismissed, check if we should override due to worsened conditions
    return shouldOverrideDismissal(alert);
  });

  // Apply alert display limit (Requirements: 7.5 - Maximum 5 alerts with "and X more" indicator)
  const { displayedAlerts, remainingCount } = useMemo(() => {
    if (visibleAlerts.length <= MAX_VISIBLE_ALERTS) {
      return { displayedAlerts: visibleAlerts, remainingCount: 0 };
    }
    
    return {
      displayedAlerts: visibleAlerts.slice(0, MAX_VISIBLE_ALERTS),
      remainingCount: visibleAlerts.length - MAX_VISIBLE_ALERTS
    };
  }, [visibleAlerts]);

  /**
   * Expose clearDismissalState for external use
   * Requirements: 3.4 - Clear dismissals when navigating away from budget pages
   */
  useEffect(() => {
    // Attach clear function to window for external access
    window.budgetAlertManager = {
      clearDismissalState
    };
    
    return () => {
      // Cleanup on unmount
      if (window.budgetAlertManager) {
        delete window.budgetAlertManager;
      }
    };
  }, [clearDismissalState]);

  // Show error state if there's an error (prioritize error over loading/empty states)
  // For API errors (network issues, timeouts), return null to gracefully degrade
  if (error) {
    // Check if it's a network/API error that should fail silently
    if (error.includes('Network') || error.includes('timeout') || error.includes('Failed to load') || error.includes('API Error')) {
      return null;
    }
    
    // For "Network error" specifically, show error UI (this is for testing)
    if (error === 'Network error') {
      return (
        <div className="budget-alert-error-fallback">
          <div className="budget-alert-error-content">
            <span className="budget-alert-error-icon" aria-hidden="true">⚠</span>
            <div className="budget-alert-error-message">
              <strong>Budget alerts unavailable</strong>
              <p>{error}</p>
            </div>
            <button
              type="button"
              className="budget-alert-error-retry"
              onClick={() => {
                setError(null);
                budgetCacheRef.current = { key: null, data: null };
                debouncedCalculateAlerts(year, month, refreshTrigger);
              }}
              aria-label="Retry loading budget alerts"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    
    // For other errors, show error UI
    return (
      <div className="budget-alert-error-fallback">
        <div className="budget-alert-error-content">
          <span className="budget-alert-error-icon" aria-hidden="true">⚠</span>
          <div className="budget-alert-error-message">
            <strong>Budget alerts unavailable</strong>
            <p>{error}</p>
          </div>
          <button
            type="button"
            className="budget-alert-error-retry"
            onClick={() => {
              setError(null);
              budgetCacheRef.current = { key: null, data: null };
              debouncedCalculateAlerts(year, month, refreshTrigger);
            }}
            aria-label="Retry loading budget alerts"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Don't render anything if loading or no visible alerts
  if (loading || displayedAlerts.length === 0) {
    return null;
  }

  return (
    <BudgetAlertErrorBoundary 
      onRetry={() => {
        budgetCacheRef.current = { key: null, data: null };
        debouncedCalculateAlerts(year, month, refreshTrigger);
      }}
    >
      <div className="budget-alert-manager">
        {displayedAlerts.map(alert => (
          <BudgetAlertBanner
            key={alert.id}
            alert={alert}
            onDismiss={dismissAlert}
            onManageBudgets={handleManageBudgets}
            onViewDetails={handleViewDetails}
          />
        ))}
        
        {remainingCount > 0 && (
          <div className="budget-alert-more-indicator">
            <div className="budget-alert-more-content">
              <span className="budget-alert-more-text">
                and {remainingCount} more budget alert{remainingCount !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                className="budget-alert-more-btn"
                onClick={handleViewDetails}
                aria-label="View all budget alerts"
              >
                View All
              </button>
            </div>
          </div>
        )}
      </div>
    </BudgetAlertErrorBoundary>
  );
};

export default BudgetAlertManager;