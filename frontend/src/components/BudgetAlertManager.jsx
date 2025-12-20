import { useState, useEffect, useCallback } from 'react';
import { getBudgets } from '../services/budgetApi';
import { calculateAlerts } from '../utils/budgetAlerts';
import BudgetAlertBanner from './BudgetAlertBanner';

/**
 * BudgetAlertManager Component
 * Manages all budget alerts, dismissal state, and real-time updates
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.2, 7.1, 7.4, 8.1, 8.2
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

  /**
   * Calculate alerts from budget data
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1, 8.2
   */
  const calculateAlertsFromBudgets = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const budgets = await getBudgets(year, month);
      const newAlerts = calculateAlerts(budgets);
      setAlerts(newAlerts);
    } catch (err) {
      setError('Failed to load budget alerts');
      console.error('Budget alert calculation error:', err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  /**
   * Refresh alerts when dependencies change
   * Requirements: 5.1, 5.2, 5.3, 5.4, 8.2
   */
  useEffect(() => {
    calculateAlertsFromBudgets();
  }, [calculateAlertsFromBudgets, refreshTrigger]);

  /**
   * Clear dismissal state when year or month changes
   * Requirements: 3.2, 3.3
   */
  useEffect(() => {
    setDismissedAlerts(new Set());
  }, [year, month]);

  /**
   * Dismiss an alert (session-based storage)
   * Requirements: 3.2, 3.3, 3.4, 3.5, 7.3
   */
  const dismissAlert = useCallback((alertId) => {
    setDismissedAlerts(prev => new Set([...prev, alertId]));
  }, []);

  /**
   * Refresh alerts manually
   * Requirements: 8.2
   */
  const refreshAlerts = useCallback(() => {
    calculateAlertsFromBudgets();
  }, [calculateAlertsFromBudgets]);

  /**
   * Handle manage budgets action
   * Requirements: 4.1, 4.2
   */
  const handleManageBudgets = useCallback((category) => {
    if (onManageBudgets) {
      onManageBudgets(category);
    }
  }, [onManageBudgets]);

  /**
   * Handle view details action
   * Requirements: 4.3, 4.4
   */
  const handleViewDetails = useCallback((category) => {
    if (onViewDetails) {
      onViewDetails(category);
    }
  }, [onViewDetails]);

  // Filter out dismissed alerts
  const visibleAlerts = alerts.filter(alert => !dismissedAlerts.has(alert.id));

  // Don't render anything if loading, error, or no visible alerts
  if (loading || error || visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="budget-alert-manager">
      {visibleAlerts.map(alert => (
        <BudgetAlertBanner
          key={alert.id}
          alert={alert}
          onDismiss={dismissAlert}
          onManageBudgets={handleManageBudgets}
          onViewDetails={handleViewDetails}
        />
      ))}
    </div>
  );
};

export default BudgetAlertManager;