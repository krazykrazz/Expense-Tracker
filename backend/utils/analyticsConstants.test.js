/**
 * Unit tests for analyticsConstants.js
 *
 * Validates all new constants are defined with correct values and types,
 * backward compatibility of existing exports, and correct mappings.
 */

const {
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
} = require('./analyticsConstants');

describe('analyticsConstants', () => {
  // --- Backward compatibility of existing exports ---

  describe('backward compatibility', () => {
    test('ANOMALY_TYPES preserves legacy values', () => {
      expect(ANOMALY_TYPES.AMOUNT).toBe('amount');
      expect(ANOMALY_TYPES.DAILY_TOTAL).toBe('daily_total');
      expect(ANOMALY_TYPES.NEW_MERCHANT).toBe('new_merchant');
      expect(Object.keys(ANOMALY_TYPES)).toHaveLength(3);
    });

    test('CONFIDENCE_LEVELS preserves existing values', () => {
      expect(CONFIDENCE_LEVELS.LOW).toBe('low');
      expect(CONFIDENCE_LEVELS.MEDIUM).toBe('medium');
      expect(CONFIDENCE_LEVELS.HIGH).toBe('high');
      expect(Object.keys(CONFIDENCE_LEVELS)).toHaveLength(3);
    });

    test('SEVERITY_LEVELS preserves existing values', () => {
      expect(SEVERITY_LEVELS.LOW).toBe('low');
      expect(SEVERITY_LEVELS.MEDIUM).toBe('medium');
      expect(SEVERITY_LEVELS.HIGH).toBe('high');
      expect(Object.keys(SEVERITY_LEVELS)).toHaveLength(3);
    });

    test('ANALYTICS_CONFIG is exported', () => {
      expect(ANALYTICS_CONFIG).toBeDefined();
      expect(typeof ANALYTICS_CONFIG).toBe('object');
    });

    test('PATTERN_FREQUENCIES is exported', () => {
      expect(PATTERN_FREQUENCIES).toBeDefined();
      expect(typeof PATTERN_FREQUENCIES).toBe('object');
    });
  });

  // --- ANOMALY_CLASSIFICATIONS ---

  describe('ANOMALY_CLASSIFICATIONS', () => {
    test('has all 8 classification types', () => {
      expect(Object.keys(ANOMALY_CLASSIFICATIONS)).toHaveLength(8);
    });

    test('defines correct values for each type', () => {
      expect(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION).toBe('Large_Transaction');
      expect(ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE).toBe('Category_Spending_Spike');
      expect(ANOMALY_CLASSIFICATIONS.NEW_MERCHANT).toBe('New_Merchant');
      expect(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE).toBe('Frequency_Spike');
      expect(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE).toBe('Recurring_Expense_Increase');
      expect(ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION).toBe('Seasonal_Deviation');
      expect(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND).toBe('Emerging_Behavior_Trend');
    });

    test('all values are strings', () => {
      Object.values(ANOMALY_CLASSIFICATIONS).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });

  // --- LEGACY_TYPE_MAP ---

  describe('LEGACY_TYPE_MAP', () => {
    test('maps all 3 legacy types', () => {
      expect(Object.keys(LEGACY_TYPE_MAP)).toHaveLength(3);
    });

    test('maps amount to Large_Transaction', () => {
      expect(LEGACY_TYPE_MAP[ANOMALY_TYPES.AMOUNT]).toBe(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION);
    });

    test('maps new_merchant to New_Merchant', () => {
      expect(LEGACY_TYPE_MAP[ANOMALY_TYPES.NEW_MERCHANT]).toBe(ANOMALY_CLASSIFICATIONS.NEW_MERCHANT);
    });

    test('maps daily_total to Large_Transaction', () => {
      expect(LEGACY_TYPE_MAP[ANOMALY_TYPES.DAILY_TOTAL]).toBe(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION);
    });

    test('all mapped values are valid ANOMALY_CLASSIFICATIONS', () => {
      const validClassifications = Object.values(ANOMALY_CLASSIFICATIONS);
      Object.values(LEGACY_TYPE_MAP).forEach(value => {
        expect(validClassifications).toContain(value);
      });
    });
  });

  // --- BEHAVIOR_PATTERNS ---

  describe('BEHAVIOR_PATTERNS', () => {
    test('has all 3 patterns', () => {
      expect(Object.keys(BEHAVIOR_PATTERNS)).toHaveLength(3);
    });

    test('defines correct values', () => {
      expect(BEHAVIOR_PATTERNS.ONE_TIME_EVENT).toBe('One_Time_Event');
      expect(BEHAVIOR_PATTERNS.RECURRING_CHANGE).toBe('Recurring_Change');
      expect(BEHAVIOR_PATTERNS.EMERGING_TREND).toBe('Emerging_Trend');
    });

    test('all values are strings', () => {
      Object.values(BEHAVIOR_PATTERNS).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });

  // --- DETECTION_THRESHOLDS ---

  describe('DETECTION_THRESHOLDS', () => {
    test('has all threshold values', () => {
      const expectedKeys = [
        'CATEGORY_SPIKE_THRESHOLD',
        'FREQUENCY_SPIKE_THRESHOLD',
        'RECURRING_INCREASE_THRESHOLD',
        'DRIFT_THRESHOLD',
        'SEASONAL_VARIANCE_THRESHOLD',
        'MIN_MONTHS_FOR_DRIFT',
        'DRIFT_PERIOD_MONTHS',
        'MIN_MONTHS_FOR_SEASONAL',
        'VENDOR_PERCENTILE_THRESHOLD',
        'NEW_SPENDING_TIER_MULTIPLIER',
        'VENDOR_FREQUENCY_SPIKE_RATIO',
        'MIN_VENDOR_TRANSACTIONS',
        'MIN_VENDOR_TRANSACTIONS_FOR_FREQUENCY'
      ];
      expectedKeys.forEach(key => {
        expect(DETECTION_THRESHOLDS).toHaveProperty(key);
      });
      expect(Object.keys(DETECTION_THRESHOLDS)).toHaveLength(expectedKeys.length);
    });

    test('threshold values match design spec', () => {
      expect(DETECTION_THRESHOLDS.CATEGORY_SPIKE_THRESHOLD).toBe(0.50);
      expect(DETECTION_THRESHOLDS.FREQUENCY_SPIKE_THRESHOLD).toBe(1.0);
      expect(DETECTION_THRESHOLDS.RECURRING_INCREASE_THRESHOLD).toBe(0.20);
      expect(DETECTION_THRESHOLDS.DRIFT_THRESHOLD).toBe(0.25);
      expect(DETECTION_THRESHOLDS.SEASONAL_VARIANCE_THRESHOLD).toBe(0.25);
      expect(DETECTION_THRESHOLDS.MIN_MONTHS_FOR_DRIFT).toBe(6);
      expect(DETECTION_THRESHOLDS.DRIFT_PERIOD_MONTHS).toBe(3);
      expect(DETECTION_THRESHOLDS.MIN_MONTHS_FOR_SEASONAL).toBe(12);
    });

    test('all values are numbers', () => {
      Object.values(DETECTION_THRESHOLDS).forEach(value => {
        expect(typeof value).toBe('number');
      });
    });
  });

  // --- SUPPRESSION_CONFIG ---

  describe('SUPPRESSION_CONFIG', () => {
    test('RARE_PURCHASE_CATEGORIES contains correct categories', () => {
      expect(SUPPRESSION_CONFIG.RARE_PURCHASE_CATEGORIES).toEqual(
        expect.arrayContaining(['Electronics', 'Furniture', 'Appliances'])
      );
      expect(SUPPRESSION_CONFIG.RARE_PURCHASE_CATEGORIES).toHaveLength(3);
    });

    test('SEASONAL_SPIKE_MONTHS maps Gifts and Entertainment to December', () => {
      expect(SUPPRESSION_CONFIG.SEASONAL_SPIKE_MONTHS).toEqual({
        'Gifts': 12,
        'Entertainment': 12
      });
    });

    test('MIN_TRANSACTIONS_FOR_RARE is 4', () => {
      expect(SUPPRESSION_CONFIG.MIN_TRANSACTIONS_FOR_RARE).toBe(4);
    });
  });

  // --- THROTTLE_CONFIG ---

  describe('THROTTLE_CONFIG', () => {
    test('has correct limit values', () => {
      expect(THROTTLE_CONFIG.MAX_ALERTS_PER_CATEGORY_PER_MONTH).toBe(3);
      expect(THROTTLE_CONFIG.REPEAT_ALERT_SUPPRESSION_DAYS).toBe(30);
      expect(THROTTLE_CONFIG.RELATED_ALERT_MERGE_WINDOW_DAYS).toBe(7);
      expect(THROTTLE_CONFIG.CLUSTER_WINDOW_DAYS).toBe(7);
      expect(THROTTLE_CONFIG.MIN_CLUSTER_SIZE).toBe(3);
    });

    test('has all 6 config keys', () => {
      expect(Object.keys(THROTTLE_CONFIG)).toHaveLength(6);
    });

    test('all values are numbers', () => {
      Object.values(THROTTLE_CONFIG).forEach(value => {
        expect(typeof value).toBe('number');
      });
    });
  });

  // --- CLUSTER_LABELS ---

  describe('CLUSTER_LABELS', () => {
    test('has all 4 labels', () => {
      expect(Object.keys(CLUSTER_LABELS)).toHaveLength(4);
    });

    test('defines correct values', () => {
      expect(CLUSTER_LABELS.TRAVEL_EVENT).toBe('Travel_Event');
      expect(CLUSTER_LABELS.MOVING_EVENT).toBe('Moving_Event');
      expect(CLUSTER_LABELS.HOME_RENOVATION).toBe('Home_Renovation');
      expect(CLUSTER_LABELS.HOLIDAY_SPENDING).toBe('Holiday_Spending');
    });

    test('all values are strings', () => {
      Object.values(CLUSTER_LABELS).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });
});
