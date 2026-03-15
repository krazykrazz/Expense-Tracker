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
  PATTERN_MATCH_THRESHOLD: 0.6,    // 60% of intervals must match for pattern detection
  
  // Frequency intervals (in days)
  WEEKLY_INTERVAL: 7,
  BI_WEEKLY_INTERVAL: 14,
  MONTHLY_INTERVAL_MIN: 28,
  MONTHLY_INTERVAL_MAX: 31,
  MONTHLY_INTERVAL_AVG: 30,
  
  // Anomaly detection
  ANOMALY_STD_DEVIATIONS: 3,       // Standard deviations for amount anomaly detection
  DAILY_ANOMALY_MULTIPLIER: 2,     // Multiplier for daily total anomaly detection
  
  // Thresholds
  HIGH_SPENDING_DAY_THRESHOLD: 0.30,   // 30% above average marks high-spending day
  SEASONAL_VARIANCE_THRESHOLD: 0.25,   // 25% variance for seasonal category detection
  YOY_WARNING_THRESHOLD: 0.20,         // 20% year-over-year increase triggers warning
  
  // Quality score weights
  COVERAGE_WEIGHT: 0.7,            // Weight for coverage in quality score
  CONSISTENCY_WEIGHT: 0.3,         // Weight for consistency in quality score
  CV_MULTIPLIER: 50,               // Coefficient of variation multiplier
  
  // Confidence score weights
  OCCURRENCE_WEIGHT: 0.4,          // Weight for occurrence count in confidence
  AMOUNT_CONSISTENCY_WEIGHT: 0.6,  // Weight for amount consistency in confidence
  OCCURRENCE_DIVISOR: 10,          // Divisor for occurrence score calculation
  
  // Display limits
  TOP_CATEGORIES_LIMIT: 3,         // Number of top categories to show per day
  
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

/**
 * @deprecated Legacy anomaly types — retained as aliases for backward compatibility.
 * Use ANOMALY_CLASSIFICATIONS for the expanded 7-type classification system.
 * See LEGACY_TYPE_MAP for the mapping from these values to ANOMALY_CLASSIFICATIONS.
 */
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

// Expanded anomaly classification types (Req 3, 14)
const ANOMALY_CLASSIFICATIONS = {
  LARGE_TRANSACTION: 'Large_Transaction',
  CATEGORY_SPENDING_SPIKE: 'Category_Spending_Spike',
  NEW_MERCHANT: 'New_Merchant',
  FREQUENCY_SPIKE: 'Frequency_Spike',
  RECURRING_EXPENSE_INCREASE: 'Recurring_Expense_Increase',
  SEASONAL_DEVIATION: 'Seasonal_Deviation',
  EMERGING_BEHAVIOR_TREND: 'Emerging_Behavior_Trend'
};

// Backward-compatible mapping: legacy type → new classification
const LEGACY_TYPE_MAP = {
  [ANOMALY_TYPES.AMOUNT]: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
  [ANOMALY_TYPES.NEW_MERCHANT]: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT,
  [ANOMALY_TYPES.DAILY_TOTAL]: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION
};

// Behavior patterns (Req 5)
const BEHAVIOR_PATTERNS = {
  ONE_TIME_EVENT: 'One_Time_Event',
  RECURRING_CHANGE: 'Recurring_Change',
  EMERGING_TREND: 'Emerging_Trend'
};

// Detection thresholds (Req 3, 8, 14)
const DETECTION_THRESHOLDS = {
  CATEGORY_SPIKE_THRESHOLD: 0.50,
  FREQUENCY_SPIKE_THRESHOLD: 1.0,
  RECURRING_INCREASE_THRESHOLD: 0.20,
  DRIFT_THRESHOLD: 0.25,
  SEASONAL_VARIANCE_THRESHOLD: 0.25,
  MIN_MONTHS_FOR_DRIFT: 6,
  DRIFT_PERIOD_MONTHS: 3,
  MIN_MONTHS_FOR_SEASONAL: 12
};

// Suppression configuration (Req 6, 14)
const SUPPRESSION_CONFIG = {
  RARE_PURCHASE_CATEGORIES: ['Electronics', 'Furniture', 'Appliances'],
  SEASONAL_SPIKE_MONTHS: { 'Gifts': 12, 'Entertainment': 12 },
  MIN_TRANSACTIONS_FOR_RARE: 4
};

// Throttle configuration (Req 10, 14)
const THROTTLE_CONFIG = {
  MAX_ALERTS_PER_CATEGORY_PER_MONTH: 3,
  REPEAT_ALERT_SUPPRESSION_DAYS: 30,
  RELATED_ALERT_MERGE_WINDOW_DAYS: 7,
  CLUSTER_WINDOW_DAYS: 7,
  MIN_CLUSTER_SIZE: 3
};

// Cluster labels (Req 7)
const CLUSTER_LABELS = {
  TRAVEL_EVENT: 'Travel_Event',
  MOVING_EVENT: 'Moving_Event',
  HOME_RENOVATION: 'Home_Renovation',
  HOLIDAY_SPENDING: 'Holiday_Spending'
};

module.exports = {
  ANALYTICS_CONFIG,
  PATTERN_FREQUENCIES,
  ANOMALY_TYPES,
  CONFIDENCE_LEVELS,
  SEVERITY_LEVELS,
  ANOMALY_CLASSIFICATIONS,
  LEGACY_TYPE_MAP,
  BEHAVIOR_PATTERNS,
  DETECTION_THRESHOLDS,
  SUPPRESSION_CONFIG,
  THROTTLE_CONFIG,
  CLUSTER_LABELS
};
