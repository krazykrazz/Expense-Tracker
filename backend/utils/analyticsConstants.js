/**
 * Analytics Configuration Constants
 * 
 * Centralized configuration for the Spending Patterns & Predictions feature.
 * All thresholds and limits are configurable here for easy tuning.
 */

const ANALYTICS_CONFIG = {
  // Minimum data requirements
  MIN_MONTHS_FOR_PATTERNS: 3,      // Minimum months needed for pattern analysis
  MIN_MONTHS_FOR_PREDICTIONS: 1,   // Minimum months needed for predictions
  MIN_MONTHS_FOR_SEASONAL: 6,      // Minimum months needed for seasonal analysis
  
  // Pattern detection
  PATTERN_TOLERANCE_DAYS: 3,       // ±3 days tolerance for matching recurring expenses
  MIN_OCCURRENCES_FOR_PATTERN: 3,  // Minimum occurrences to identify a pattern
  
  // Anomaly detection
  ANOMALY_STD_DEVIATIONS: 3,       // Standard deviations for amount anomaly detection
  DAILY_ANOMALY_MULTIPLIER: 2,     // Multiplier for daily total anomaly detection
  
  // Thresholds
  HIGH_SPENDING_DAY_THRESHOLD: 0.30,   // 30% above average marks high-spending day
  SEASONAL_VARIANCE_THRESHOLD: 0.25,   // 25% variance for seasonal category detection
  YOY_WARNING_THRESHOLD: 0.20,         // 20% year-over-year increase triggers warning
  
  // Confidence levels (based on months of data)
  CONFIDENCE_HIGH_MONTHS: 12,      // 12+ months = high confidence
  CONFIDENCE_MEDIUM_MONTHS: 6,     // 6-11 months = medium confidence
  EARLY_MONTH_DAYS: 7              // Days before weighting historical data more heavily
};

// Pattern frequency types
const PATTERN_FREQUENCIES = {
  WEEKLY: 'weekly',
  BI_WEEKLY: 'bi-weekly',
  MONTHLY: 'monthly'
};

// Anomaly types
const ANOMALY_TYPES = {
  AMOUNT: 'amount',
  DAILY_TOTAL: 'daily_total',
  NEW_MERCHANT: 'new_merchant'
};

// Confidence levels
const CONFIDENCE_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// Severity levels for anomalies
const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

module.exports = {
  ANALYTICS_CONFIG,
  PATTERN_FREQUENCIES,
  ANOMALY_TYPES,
  CONFIDENCE_LEVELS,
  SEVERITY_LEVELS
};
