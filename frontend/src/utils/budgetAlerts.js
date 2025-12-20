/**
 * Budget Alert Calculation Utilities
 * Handles alert generation, message formatting, and severity determination
 */

/**
 * Alert severity levels with their thresholds
 */
export const ALERT_THRESHOLDS = {
  WARNING: 80,   // 80-89%
  DANGER: 90,    // 90-99%
  CRITICAL: 100  // 100%+
};

/**
 * Alert severity types
 */
export const ALERT_SEVERITY = {
  WARNING: 'warning',
  DANGER: 'danger',
  CRITICAL: 'critical'
};

/**
 * Icons for each alert severity level
 */
export const ALERT_ICONS = {
  [ALERT_SEVERITY.WARNING]: '⚡',
  [ALERT_SEVERITY.DANGER]: '!',
  [ALERT_SEVERITY.CRITICAL]: '⚠'
};

/**
 * Calculate alert severity based on progress percentage
 * @param {number} progress - Budget progress percentage
 * @returns {string|null} Alert severity or null if no alert needed
 */
export const calculateAlertSeverity = (progress) => {
  if (progress >= ALERT_THRESHOLDS.CRITICAL) {
    return ALERT_SEVERITY.CRITICAL;
  }
  if (progress >= ALERT_THRESHOLDS.DANGER) {
    return ALERT_SEVERITY.DANGER;
  }
  if (progress >= ALERT_THRESHOLDS.WARNING) {
    return ALERT_SEVERITY.WARNING;
  }
  return null; // No alert needed
};

/**
 * Get icon for alert severity
 * @param {string} severity - Alert severity
 * @returns {string} Icon character
 */
export const getAlertIcon = (severity) => {
  return ALERT_ICONS[severity] || '?';
};

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(amount));
};

/**
 * Generate alert message based on budget data and severity
 * @param {Object} budgetProgress - Budget progress object
 * @param {string} severity - Alert severity
 * @returns {string} Human-readable alert message
 */
export const generateAlertMessage = (budgetProgress, severity) => {
  const { budget, progress, spent, remaining } = budgetProgress;
  const { category, limit } = budget;
  
  switch (severity) {
    case ALERT_SEVERITY.WARNING:
      return `${category} budget is ${progress.toFixed(1)}% used. ${formatCurrency(remaining)} remaining.`;
    
    case ALERT_SEVERITY.DANGER:
      return `${category} budget is ${progress.toFixed(1)}% used. Only ${formatCurrency(remaining)} left!`;
    
    case ALERT_SEVERITY.CRITICAL:
      return `${category} budget exceeded! ${formatCurrency(Math.abs(remaining))} over budget.`;
    
    default:
      return `${category} budget needs attention.`;
  }
};

/**
 * Create alert data object from budget progress
 * @param {Object} budgetProgress - Budget progress object from API
 * @returns {Object|null} Alert data object or null if no alert needed
 */
export const createAlertFromBudget = (budgetProgress) => {
  // Handle null, undefined, or invalid budget progress objects
  if (!budgetProgress || typeof budgetProgress !== 'object') {
    return null;
  }
  
  const { budget, progress, spent } = budgetProgress;
  
  // Ensure required fields exist
  if (!budget || typeof progress !== 'number' || typeof spent !== 'number') {
    return null;
  }
  
  // Determine if alert is needed
  const severity = calculateAlertSeverity(progress);
  if (!severity) {
    return null; // No alert needed
  }
  
  // Create alert data object
  return {
    id: `budget-alert-${budget.id}`,
    severity,
    category: budget.category,
    progress,
    spent,
    limit: budget.limit,
    message: generateAlertMessage(budgetProgress, severity),
    icon: getAlertIcon(severity)
  };
};

/**
 * Calculate alerts from budget data array
 * @param {Array} budgets - Array of budget progress objects from getBudgets API
 * @returns {Array} Array of alert data objects
 */
export const calculateAlerts = (budgets) => {
  if (!Array.isArray(budgets)) {
    return [];
  }
  
  const alerts = [];
  
  for (const budgetProgress of budgets) {
    // Skip null, undefined, or invalid budget progress objects
    if (!budgetProgress || typeof budgetProgress !== 'object') {
      continue;
    }
    
    const alert = createAlertFromBudget(budgetProgress);
    if (alert) {
      alerts.push(alert);
    }
  }
  
  return sortAlertsBySeverity(alerts);
};

/**
 * Sort alerts by severity (critical first, then danger, then warning)
 * @param {Array} alerts - Array of alert objects
 * @returns {Array} Sorted array of alerts
 */
export const sortAlertsBySeverity = (alerts) => {
  const severityOrder = {
    [ALERT_SEVERITY.CRITICAL]: 3,
    [ALERT_SEVERITY.DANGER]: 2,
    [ALERT_SEVERITY.WARNING]: 1
  };
  
  return [...alerts].sort((a, b) => {
    const orderA = severityOrder[a.severity] || 0;
    const orderB = severityOrder[b.severity] || 0;
    return orderB - orderA; // Descending order (highest severity first)
  });
};

/**
 * Check if a budget progress object should trigger an alert
 * @param {Object} budgetProgress - Budget progress object
 * @returns {boolean} True if alert should be shown
 */
export const shouldShowAlert = (budgetProgress) => {
  if (!budgetProgress || typeof budgetProgress.progress !== 'number') {
    return false;
  }
  
  return budgetProgress.progress >= ALERT_THRESHOLDS.WARNING;
};

/**
 * Get the most severe alert from an array of alerts
 * @param {Array} alerts - Array of alert objects
 * @returns {Object|null} Most severe alert or null if no alerts
 */
export const getMostSevereAlert = (alerts) => {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return null;
  }
  
  const sorted = sortAlertsBySeverity(alerts);
  return sorted[0];
};

/**
 * Count alerts by severity
 * @param {Array} alerts - Array of alert objects
 * @returns {Object} Count object { warning: number, danger: number, critical: number, total: number }
 */
export const countAlertsBySeverity = (alerts) => {
  const counts = {
    warning: 0,
    danger: 0,
    critical: 0,
    total: 0
  };
  
  if (!Array.isArray(alerts)) {
    return counts;
  }
  
  for (const alert of alerts) {
    counts[alert.severity] = (counts[alert.severity] || 0) + 1;
    counts.total++;
  }
  
  return counts;
};

/**
 * Generate summary message for multiple alerts
 * @param {Array} alerts - Array of alert objects
 * @returns {string} Summary message
 */
export const generateMultiAlertSummary = (alerts) => {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return '';
  }
  
  if (alerts.length === 1) {
    return alerts[0].message;
  }
  
  const counts = countAlertsBySeverity(alerts);
  const mostSevere = getMostSevereAlert(alerts);
  
  if (counts.critical > 0) {
    return `${counts.critical} budget${counts.critical > 1 ? 's' : ''} exceeded! ${mostSevere.category} and ${counts.total - 1} other${counts.total - 1 > 1 ? 's' : ''} need attention.`;
  }
  
  if (counts.danger > 0) {
    return `${counts.danger} budget${counts.danger > 1 ? 's' : ''} nearly exceeded! ${mostSevere.category} and ${counts.total - 1} other${counts.total - 1 > 1 ? 's' : ''} need attention.`;
  }
  
  return `${counts.warning} budget${counts.warning > 1 ? 's' : ''} approaching limit. ${mostSevere.category} and ${counts.total - 1} other${counts.total - 1 > 1 ? 's' : ''} need attention.`;
};