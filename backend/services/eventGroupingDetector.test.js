/**
 * Unit tests for Event_Grouping_Detector (detectEventGroups).
 * Tests event theme grouping (travel, moving, holiday, home purchase),
 * 48-hour window boundaries, single transaction, empty input, mixed scenarios,
 * and event alert field correctness.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 13.3, 19.3
 */

const { detectEventGroups } = require('./eventGroupingDetector');
const { EVENT_GROUPING_CONFIG } = require('../utils/analyticsConstants');

// ─── Helpers ──────────────────────────────────────────────────────────

let idCounter = 1;

/** Build a minimal anomaly object for event grouping tests. */
function makeAnomaly(overrides = {}) {
  const id = idCounter++;
  return {
    id: overrides.id || id,
    expenseId: overrides.expenseId != null ? overrides.expenseId : id,
    date: overrides.date || '2024-12-10T12:00:00.000Z',
    place: overrides.place || 'TestPlace',
    amount: overrides.amount || 50,
    category: overrides.category || 'Dining',
    severity: overrides.severity || 'low',
    classification: overrides.classification || 'Large_Transaction',
    ...overrides
  };
}

beforeEach(() => {
  idCounter = 1;
});

// ─── Travel Theme ────────────────────────────────────────────────────

describe('Travel theme grouping', () => {
  test('transportation + dining + accommodation within 48h → grouped', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', amount: 45 }),
      makeAnomaly({ category: 'Accommodation', date: '2024-07-16T09:00:00.000Z', amount: 200 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].theme).toBe('Travel_Event');
    expect(eventGroups[0].anomalies).toHaveLength(3);
    expect(ungrouped).toHaveLength(0);
  });

  test('gas + parking within 48h → grouped as travel', () => {
    const anomalies = [
      makeAnomaly({ category: 'Gas', date: '2024-06-10T08:00:00.000Z', amount: 60 }),
      makeAnomaly({ category: 'Parking', date: '2024-06-10T12:00:00.000Z', amount: 15 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].theme).toBe('Travel_Event');
  });
});

// ─── Moving Theme ────────────────────────────────────────────────────

describe('Moving theme grouping', () => {
  test('furniture + home + utilities within 48h → grouped', () => {
    const anomalies = [
      makeAnomaly({ category: 'Furniture', date: '2024-03-01T10:00:00.000Z', amount: 500 }),
      makeAnomaly({ category: 'Home', date: '2024-03-01T14:00:00.000Z', amount: 200 }),
      makeAnomaly({ category: 'Utilities', date: '2024-03-02T09:00:00.000Z', amount: 150 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].theme).toBe('Moving_Event');
    expect(eventGroups[0].anomalies).toHaveLength(3);
    expect(ungrouped).toHaveLength(0);
  });
});

// ─── Holiday Theme ───────────────────────────────────────────────────

describe('Holiday theme grouping', () => {
  test('gifts + dining in December within 48h → grouped', () => {
    const anomalies = [
      makeAnomaly({ category: 'Gifts', date: '2024-12-20T10:00:00.000Z', amount: 100 }),
      makeAnomaly({ category: 'Dining', date: '2024-12-20T19:00:00.000Z', amount: 75 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].theme).toBe('Holiday_Spending');
  });

  test('gifts + dining in June within 48h → NOT grouped as holiday', () => {
    const anomalies = [
      makeAnomaly({ category: 'Gifts', date: '2024-06-20T10:00:00.000Z', amount: 100 }),
      makeAnomaly({ category: 'Dining', date: '2024-06-20T19:00:00.000Z', amount: 75 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    // Dining matches Travel theme, but Gifts does not match any travel category.
    // Neither Gifts nor Dining alone form ≥2 in travel. So no group should form
    // unless another theme matches. Gifts is not in moving or home_purchase.
    // Holiday requires December. So these should remain ungrouped.
    const holidayGroups = eventGroups.filter(g => g.theme === 'Holiday_Spending');
    expect(holidayGroups).toHaveLength(0);
  });
});

// ─── Home Purchase Theme ─────────────────────────────────────────────

describe('Home purchase theme grouping', () => {
  test('home improvement + furniture + appliances within 48h → grouped', () => {
    const anomalies = [
      makeAnomaly({ category: 'Home Improvement', date: '2024-05-10T10:00:00.000Z', amount: 300 }),
      makeAnomaly({ category: 'Furniture', date: '2024-05-10T15:00:00.000Z', amount: 800 }),
      makeAnomaly({ category: 'Appliances', date: '2024-05-11T09:00:00.000Z', amount: 600 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].theme).toBe('Home_Purchase');
    expect(eventGroups[0].anomalies).toHaveLength(3);
    expect(ungrouped).toHaveLength(0);
  });
});


// ─── Window Boundary ─────────────────────────────────────────────────

describe('48-hour window boundary', () => {
  test('transactions at exactly 48h apart → grouped', () => {
    // Anchor at T=0, second at T=48h exactly
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-08-01T00:00:00.000Z', amount: 50 }),
      makeAnomaly({ category: 'Dining', date: '2024-08-03T00:00:00.000Z', amount: 40 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].theme).toBe('Travel_Event');
  });

  test('transactions at 49h apart → not grouped', () => {
    // Anchor at T=0, second at T=49h (1h beyond window)
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-08-01T00:00:00.000Z', amount: 50 }),
      makeAnomaly({ category: 'Dining', date: '2024-08-03T01:00:00.000Z', amount: 40 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(0);
    expect(ungrouped).toHaveLength(2);
  });

  test('window is measured from anchor (earliest), not between consecutive', () => {
    // Three anomalies: A at T=0, B at T=24h, C at T=47h — all within 48h of A
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-08-01T00:00:00.000Z', amount: 50 }),
      makeAnomaly({ category: 'Dining', date: '2024-08-02T00:00:00.000Z', amount: 40 }),
      makeAnomaly({ category: 'Accommodation', date: '2024-08-02T23:00:00.000Z', amount: 200 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].anomalies).toHaveLength(3);
  });
});

// ─── Single Transaction ──────────────────────────────────────────────

describe('Single transaction', () => {
  test('single anomaly → no group formed', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-08-01T10:00:00.000Z', amount: 100 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(0);
    expect(ungrouped).toHaveLength(1);
  });
});

// ─── Empty Input ─────────────────────────────────────────────────────

describe('Empty input', () => {
  test('empty array returns empty eventGroups and ungrouped', () => {
    const { eventGroups, ungrouped } = detectEventGroups([]);
    expect(eventGroups).toEqual([]);
    expect(ungrouped).toEqual([]);
  });

  test('null input returns empty arrays', () => {
    const { eventGroups, ungrouped } = detectEventGroups(null);
    expect(eventGroups).toEqual([]);
    expect(ungrouped).toEqual([]);
  });

  test('undefined input returns empty arrays', () => {
    const { eventGroups, ungrouped } = detectEventGroups(undefined);
    expect(eventGroups).toEqual([]);
    expect(ungrouped).toEqual([]);
  });

  test('non-array input returns empty arrays', () => {
    const { eventGroups, ungrouped } = detectEventGroups('not an array');
    expect(eventGroups).toEqual([]);
    expect(ungrouped).toEqual([]);
  });
});

// ─── Mixed: Some Group, Others Remain Individual ─────────────────────

describe('Mixed grouping', () => {
  test('some anomalies group, others remain individual', () => {
    const anomalies = [
      // Travel group (within 48h)
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', amount: 45 }),
      // Unrelated anomaly far away in time
      makeAnomaly({ category: 'Electronics', date: '2024-07-25T10:00:00.000Z', amount: 500 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].theme).toBe('Travel_Event');
    expect(eventGroups[0].anomalies).toHaveLength(2);
    expect(ungrouped).toHaveLength(1);
    expect(ungrouped[0].category).toBe('Electronics');
  });

  test('anomaly belongs to at most one group (first-match-wins)', () => {
    // Furniture matches both Moving and Home_Purchase themes.
    // Two Furniture anomalies within 48h — should match the first theme tried.
    // Theme iteration order: TRAVEL, MOVING, HOME_PURCHASE, HOLIDAY
    // Furniture is in MOVING categories, so it should match Moving first.
    const anomalies = [
      makeAnomaly({ category: 'Furniture', date: '2024-04-01T10:00:00.000Z', amount: 400 }),
      makeAnomaly({ category: 'Home', date: '2024-04-01T14:00:00.000Z', amount: 200 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    // Moving is checked before Home_Purchase
    expect(eventGroups[0].theme).toBe('Moving_Event');
  });

  test('two separate groups can form from different time windows', () => {
    const anomalies = [
      // Travel group in July
      makeAnomaly({ category: 'Transportation', date: '2024-07-01T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-01T18:00:00.000Z', amount: 45 }),
      // Moving group in August (well outside 48h of July group)
      makeAnomaly({ category: 'Furniture', date: '2024-08-10T10:00:00.000Z', amount: 500 }),
      makeAnomaly({ category: 'Utilities', date: '2024-08-10T14:00:00.000Z', amount: 150 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(2);
    const themes = eventGroups.map(g => g.theme).sort();
    expect(themes).toEqual(['Moving_Event', 'Travel_Event']);
    expect(ungrouped).toHaveLength(0);
  });
});

// ─── Event Alert Fields ──────────────────────────────────────────────

describe('Event alert fields', () => {
  test('correct totalAmount equals sum of constituent amounts', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80.50 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', amount: 45.25 }),
      makeAnomaly({ category: 'Accommodation', date: '2024-07-16T09:00:00.000Z', amount: 200.00 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);

    const group = eventGroups[0];
    expect(group.totalAmount).toBeCloseTo(80.50 + 45.25 + 200.00, 2);
    expect(group.alert.amount).toBeCloseTo(80.50 + 45.25 + 200.00, 2);
    expect(group.alert.eventGroup.totalAmount).toBeCloseTo(80.50 + 45.25 + 200.00, 2);
  });

  test('correct transactionCount equals number of anomalies', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', amount: 45 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups[0].transactionCount).toBe(2);
    expect(eventGroups[0].alert.eventGroup.transactionCount).toBe(2);
  });

  test('correct dateRange with start and end', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', amount: 45 }),
      makeAnomaly({ category: 'Accommodation', date: '2024-07-16T09:00:00.000Z', amount: 200 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    const group = eventGroups[0];
    expect(group.dateRange.start).toBe('2024-07-15T10:00:00.000Z');
    expect(group.dateRange.end).toBe('2024-07-16T09:00:00.000Z');
  });

  test('alert has correct anomalyType and classification', () => {
    const anomalies = [
      makeAnomaly({ category: 'Gifts', date: '2024-12-20T10:00:00.000Z', amount: 100 }),
      makeAnomaly({ category: 'Dining', date: '2024-12-20T19:00:00.000Z', amount: 75 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    const alert = eventGroups[0].alert;
    expect(alert.anomalyType).toBe('event_group');
    expect(alert.classification).toBe('Holiday_Spending');
    expect(alert.simplifiedClassification).toBe('one_time_event');
    expect(alert.confidence).toBe('medium');
    expect(alert.dismissed).toBe(false);
  });

  test('alert severity is highest among constituent anomalies', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', severity: 'low', amount: 50 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', severity: 'high', amount: 45 }),
      makeAnomaly({ category: 'Accommodation', date: '2024-07-16T09:00:00.000Z', severity: 'medium', amount: 200 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups[0].alert.severity).toBe('high');
  });

  test('alert.eventGroup.transactions contains correct details', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80, place: 'Uber' }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', amount: 45, place: 'Restaurant' })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    const transactions = eventGroups[0].alert.eventGroup.transactions;
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toHaveProperty('expenseId');
    expect(transactions[0]).toHaveProperty('place');
    expect(transactions[0]).toHaveProperty('amount');
    expect(transactions[0]).toHaveProperty('date');
    expect(transactions[0]).toHaveProperty('category');
  });

  test('alert id starts with event_ prefix', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', amount: 45 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups[0].alert.id).toMatch(/^event_/);
  });

  test('alert typicalRange is null for event groups', () => {
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'Dining', date: '2024-07-15T18:00:00.000Z', amount: 45 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups[0].alert.typicalRange).toBeNull();
  });
});

// ─── Category Case Insensitivity ─────────────────────────────────────

describe('Category matching', () => {
  test('category matching is case-insensitive', () => {
    const anomalies = [
      makeAnomaly({ category: 'TRANSPORTATION', date: '2024-07-15T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'dining', date: '2024-07-15T18:00:00.000Z', amount: 45 })
    ];

    const { eventGroups } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].theme).toBe('Travel_Event');
  });
});

// ─── MIN_GROUP_SIZE Enforcement ──────────────────────────────────────

describe('Minimum group size', () => {
  test('requires at least MIN_GROUP_SIZE (2) matching anomalies', () => {
    // Only 1 travel-category anomaly, plus 1 non-matching
    const anomalies = [
      makeAnomaly({ category: 'Transportation', date: '2024-07-15T10:00:00.000Z', amount: 80 }),
      makeAnomaly({ category: 'Electronics', date: '2024-07-15T18:00:00.000Z', amount: 500 })
    ];

    const { eventGroups, ungrouped } = detectEventGroups(anomalies);
    expect(eventGroups).toHaveLength(0);
    expect(ungrouped).toHaveLength(2);
  });

  test('MIN_GROUP_SIZE is configured as 2', () => {
    expect(EVENT_GROUPING_CONFIG.MIN_GROUP_SIZE).toBe(2);
  });

  test('WINDOW_HOURS is configured as 48', () => {
    expect(EVENT_GROUPING_CONFIG.WINDOW_HOURS).toBe(48);
  });
});
