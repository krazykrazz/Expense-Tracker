/**
 * @invariant Suppression Rule Matching and Creation Properties
 *
 * Property 13: Dismissed anomalies excluded from detection
 * Property 14: Suppression rule creation by anomaly type
 * Property 15: Suppression rule matching (case-insensitive merchant, amount range inclusive)
 *
 * Feature: analytics-hub-revamp
 * Validates: Requirements 8.6, 8.8, 8.10, 8.11, 8.12, 8.14, 8.15
 */

const fc = require('fast-check');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { dbPbtOptions } = require('../test/pbtArbitraries');

jest.mock('../database/db');
const { getDatabase } = require('../database/db');

const anomalyDetectionService = require('./anomalyDetectionService');

let isolatedDb;

beforeAll(async () => {
  isolatedDb = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(isolatedDb);
});

afterAll(() => {
  cleanupIsolatedTestDb(isolatedDb);
});

// ─── DB Helpers ───

function insertExpense(db, { date, place, amount, type, week = 1, method = 'Cash' }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, place, notes, amount, type, week, method)
       VALUES (?, ?, '', ?, ?, ?, ?)`,
      [date, place, amount, type, week, method],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function clearTable(db, table) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM ${table}`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function cleanup(db) {
  await clearTable(db, 'expenses');
  await clearTable(db, 'dismissed_anomalies');
  await clearTable(db, 'anomaly_suppression_rules');
  // Reset the in-memory cache
  anomalyDetectionService._dismissedExpenseIdsCache = null;
}

// ─── Generators ───

const categories = ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing',
  'Gifts', 'Housing', 'Insurance', 'Personal Care', 'Subscriptions', 'Utilities', 'Other'];

const merchants = ['Costco', 'Walmart', 'Amazon', 'Loblaws', 'Shoppers',
  'Tim Hortons', 'Canadian Tire', 'Home Depot', 'Sobeys', 'Metro'];

const arbMerchant = fc.constantFrom(...merchants);
const arbCategory = fc.constantFrom(...categories);
const arbAmount = fc.integer({ min: 100, max: 500000 }).map(n => n / 100);
const arbDay = fc.integer({ min: 1, max: 28 });

const arbAnomalyType = fc.constantFrom('amount', 'new_merchant', 'daily_total');

const arbExpenseDetails = fc.record({
  merchant: arbMerchant,
  amount: arbAmount,
  category: arbCategory,
  day: arbDay,
}).map(d => ({
  merchant: d.merchant,
  amount: d.amount,
  category: d.category,
  date: `2091-06-${String(d.day).padStart(2, '0')}`,
}));

// ─── Tests ───

describe('AnomalyDetectionService — Suppression PBT', () => {
  afterEach(async () => {
    await cleanup(isolatedDb);
  });

  /**
   * Property 13: Dismissed anomalies excluded from detection
   * For any expense that has been dismissed (via either "Dismiss" or "Mark as Expected"),
   * getDismissedAnomalies should include that expense ID.
   *
   * **Validates: Requirements 8.6, 8.8**
   */
  describe('Property 13: Dismissed anomalies excluded from detection', () => {
    it('dismissAnomaly records the expense ID in dismissed set', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 99999 }),
          arbAnomalyType,
          async (expenseId, anomalyType) => {
            await cleanup(isolatedDb);

            // Insert a real expense so FK constraint is satisfied
            const realId = await insertExpense(isolatedDb, {
              date: '2091-06-15',
              place: 'TestMerchant',
              amount: 50.00,
              type: 'Groceries',
            });

            await anomalyDetectionService.dismissAnomaly(realId, anomalyType);

            const dismissed = await anomalyDetectionService.getDismissedAnomalies();
            expect(dismissed).toContain(realId);
          }
        ),
        dbPbtOptions()
      );
    });

    it('markAsExpected records the expense ID in dismissed set', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAnomalyType,
          arbExpenseDetails,
          async (anomalyType, details) => {
            await cleanup(isolatedDb);

            const realId = await insertExpense(isolatedDb, {
              date: details.date,
              place: details.merchant,
              amount: details.amount,
              type: details.category,
            });

            await anomalyDetectionService.markAsExpected(realId, anomalyType, details);

            const dismissed = await anomalyDetectionService.getDismissedAnomalies();
            expect(dismissed).toContain(realId);
          }
        ),
        dbPbtOptions()
      );
    });

    it('both dismiss and markAsExpected IDs are excluded from dismissed set', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbExpenseDetails,
          arbExpenseDetails,
          async (details1, details2) => {
            await cleanup(isolatedDb);

            const id1 = await insertExpense(isolatedDb, {
              date: details1.date,
              place: details1.merchant,
              amount: details1.amount,
              type: details1.category,
            });
            const id2 = await insertExpense(isolatedDb, {
              date: details2.date,
              place: details2.merchant,
              amount: details2.amount,
              type: details2.category,
            });

            await anomalyDetectionService.dismissAnomaly(id1, 'amount');
            await anomalyDetectionService.markAsExpected(id2, 'new_merchant', details2);

            const dismissed = await anomalyDetectionService.getDismissedAnomalies();
            expect(dismissed).toContain(id1);
            expect(dismissed).toContain(id2);
          }
        ),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 14: Suppression rule creation by anomaly type
   * For any anomaly marked as expected:
   *   amount → merchant_amount rule with ±20%
   *   new_merchant → merchant_category rule
   *   daily_total → specific_date rule
   *
   * **Validates: Requirements 8.10, 8.11, 8.12**
   */
  describe('Property 14: Suppression rule creation by anomaly type', () => {
    it('amount anomaly creates merchant_amount rule with ±20% range', async () => {
      await fc.assert(
        fc.asyncProperty(arbExpenseDetails, async (details) => {
          await cleanup(isolatedDb);

          const realId = await insertExpense(isolatedDb, {
            date: details.date,
            place: details.merchant,
            amount: details.amount,
            type: details.category,
          });

          const result = await anomalyDetectionService.markAsExpected(realId, 'amount', details);
          expect(result.suppressionRuleId).toBeDefined();

          const rules = await anomalyDetectionService.getSuppressionRules();
          const rule = rules.find(r => r.id === result.suppressionRuleId);
          expect(rule).toBeDefined();
          expect(rule.rule_type).toBe('merchant_amount');
          expect(rule.merchant_name).toBe(details.merchant);

          const expectedMin = details.amount * 0.8;
          const expectedMax = details.amount * 1.2;
          expect(rule.amount_min).toBeCloseTo(expectedMin, 2);
          expect(rule.amount_max).toBeCloseTo(expectedMax, 2);
        }),
        dbPbtOptions()
      );
    });

    it('new_merchant anomaly creates merchant_category rule', async () => {
      await fc.assert(
        fc.asyncProperty(arbExpenseDetails, async (details) => {
          await cleanup(isolatedDb);

          const realId = await insertExpense(isolatedDb, {
            date: details.date,
            place: details.merchant,
            amount: details.amount,
            type: details.category,
          });

          const result = await anomalyDetectionService.markAsExpected(realId, 'new_merchant', details);
          expect(result.suppressionRuleId).toBeDefined();

          const rules = await anomalyDetectionService.getSuppressionRules();
          const rule = rules.find(r => r.id === result.suppressionRuleId);
          expect(rule).toBeDefined();
          expect(rule.rule_type).toBe('merchant_category');
          expect(rule.merchant_name).toBe(details.merchant);
          expect(rule.category).toBe(details.category);
        }),
        dbPbtOptions()
      );
    });

    it('daily_total anomaly creates specific_date rule', async () => {
      await fc.assert(
        fc.asyncProperty(arbExpenseDetails, async (details) => {
          await cleanup(isolatedDb);

          const realId = await insertExpense(isolatedDb, {
            date: details.date,
            place: details.merchant,
            amount: details.amount,
            type: details.category,
          });

          const result = await anomalyDetectionService.markAsExpected(realId, 'daily_total', details);
          expect(result.suppressionRuleId).toBeDefined();

          const rules = await anomalyDetectionService.getSuppressionRules();
          const rule = rules.find(r => r.id === result.suppressionRuleId);
          expect(rule).toBeDefined();
          expect(rule.rule_type).toBe('specific_date');
          expect(rule.specific_date).toBe(details.date);
        }),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 15: Suppression rule matching (case-insensitive merchant, amount range inclusive)
   * For merchant_amount rules: case-insensitive merchant match AND amount in [min, max] inclusive.
   * For merchant_category: case-insensitive merchant AND category match.
   * For specific_date: exact date match.
   *
   * **Validates: Requirements 8.14, 8.15**
   */
  describe('Property 15: Suppression rule matching', () => {
    it('merchant_amount rule matches case-insensitively and within amount range inclusive', async () => {
      // Generate a merchant and an amount, then test that anomalies within ±20% are suppressed
      const arbCase = fc.record({
        merchant: arbMerchant,
        baseAmount: arbAmount,
        // Factor within [0.8, 1.2] to stay in range
        factor: fc.integer({ min: 80, max: 120 }).map(n => n / 100),
      });

      await fc.assert(
        fc.asyncProperty(arbCase, async ({ merchant, baseAmount, factor }) => {
          const amountMin = baseAmount * 0.8;
          const amountMax = baseAmount * 1.2;
          const testAmount = baseAmount * factor;

          const rules = [{
            rule_type: 'merchant_amount',
            merchant_name: merchant,
            amount_min: amountMin,
            amount_max: amountMax,
          }];

          // Anomaly with same merchant (different case) and amount in range → suppressed
          const matchingAnomaly = {
            expenseId: 1,
            place: merchant.toUpperCase(),
            amount: testAmount,
            category: 'Groceries',
            date: '2091-06-15',
            anomalyType: 'amount',
          };

          const result = anomalyDetectionService._applySuppressionRules([matchingAnomaly], rules);
          expect(result.length).toBe(0);
        }),
        dbPbtOptions()
      );
    });

    it('merchant_amount rule does NOT match when amount is outside range', async () => {
      const arbCase = fc.record({
        merchant: arbMerchant,
        baseAmount: fc.integer({ min: 1000, max: 50000 }).map(n => n / 100),
        // Factor outside [0.8, 1.2] — either below 0.79 or above 1.21
        outsideFactor: fc.constantFrom(0.5, 0.7, 1.3, 1.5, 2.0),
      });

      await fc.assert(
        fc.asyncProperty(arbCase, async ({ merchant, baseAmount, outsideFactor }) => {
          const amountMin = baseAmount * 0.8;
          const amountMax = baseAmount * 1.2;
          const testAmount = baseAmount * outsideFactor;

          const rules = [{
            rule_type: 'merchant_amount',
            merchant_name: merchant,
            amount_min: amountMin,
            amount_max: amountMax,
          }];

          const anomaly = {
            expenseId: 1,
            place: merchant,
            amount: testAmount,
            category: 'Groceries',
            date: '2091-06-15',
            anomalyType: 'amount',
          };

          const result = anomalyDetectionService._applySuppressionRules([anomaly], rules);
          expect(result.length).toBe(1);
        }),
        dbPbtOptions()
      );
    });

    it('merchant_category rule matches case-insensitively on merchant and exact on category', async () => {
      const arbCase = fc.record({
        merchant: arbMerchant,
        category: arbCategory,
      });

      await fc.assert(
        fc.asyncProperty(arbCase, async ({ merchant, category }) => {
          const rules = [{
            rule_type: 'merchant_category',
            merchant_name: merchant,
            category: category,
          }];

          // Same merchant (different case) + same category → suppressed
          const matchingAnomaly = {
            expenseId: 1,
            place: merchant.toLowerCase(),
            amount: 100,
            category: category,
            date: '2091-06-15',
            anomalyType: 'new_merchant',
          };

          const result = anomalyDetectionService._applySuppressionRules([matchingAnomaly], rules);
          expect(result.length).toBe(0);
        }),
        dbPbtOptions()
      );
    });

    it('merchant_category rule does NOT match when category differs', async () => {
      // Pick two distinct categories
      const arbDistinctCats = fc.tuple(arbCategory, arbCategory)
        .filter(([a, b]) => a !== b);

      await fc.assert(
        fc.asyncProperty(arbMerchant, arbDistinctCats, async (merchant, [ruleCat, anomalyCat]) => {
          const rules = [{
            rule_type: 'merchant_category',
            merchant_name: merchant,
            category: ruleCat,
          }];

          const anomaly = {
            expenseId: 1,
            place: merchant,
            amount: 100,
            category: anomalyCat,
            date: '2091-06-15',
            anomalyType: 'new_merchant',
          };

          const result = anomalyDetectionService._applySuppressionRules([anomaly], rules);
          expect(result.length).toBe(1);
        }),
        dbPbtOptions()
      );
    });

    it('specific_date rule matches exact date only', async () => {
      await fc.assert(
        fc.asyncProperty(arbDay, async (day) => {
          const dateStr = `2091-06-${String(day).padStart(2, '0')}`;

          const rules = [{
            rule_type: 'specific_date',
            specific_date: dateStr,
          }];

          // Matching date → suppressed
          const matchingAnomaly = {
            expenseId: 1,
            place: 'SomePlace',
            amount: 100,
            category: 'Groceries',
            date: dateStr,
            anomalyType: 'daily_total',
          };

          const result = anomalyDetectionService._applySuppressionRules([matchingAnomaly], rules);
          expect(result.length).toBe(0);
        }),
        dbPbtOptions()
      );
    });

    it('specific_date rule does NOT match different dates', async () => {
      const arbDistinctDays = fc.tuple(
        fc.integer({ min: 1, max: 14 }),
        fc.integer({ min: 15, max: 28 })
      );

      await fc.assert(
        fc.asyncProperty(arbDistinctDays, async ([ruleDay, anomalyDay]) => {
          const ruleDate = `2091-06-${String(ruleDay).padStart(2, '0')}`;
          const anomalyDate = `2091-06-${String(anomalyDay).padStart(2, '0')}`;

          const rules = [{
            rule_type: 'specific_date',
            specific_date: ruleDate,
          }];

          const anomaly = {
            expenseId: 1,
            place: 'SomePlace',
            amount: 100,
            category: 'Groceries',
            date: anomalyDate,
            anomalyType: 'daily_total',
          };

          const result = anomalyDetectionService._applySuppressionRules([anomaly], rules);
          expect(result.length).toBe(1);
        }),
        dbPbtOptions()
      );
    });

    it('non-matching anomalies pass through when rules exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbMerchant,
          arbAmount,
          arbCategory,
          async (merchant, amount, category) => {
            // Create a merchant_amount rule for one merchant
            const rules = [{
              rule_type: 'merchant_amount',
              merchant_name: merchant,
              amount_min: amount * 0.8,
              amount_max: amount * 1.2,
            }];

            // Anomaly with a completely different merchant → not suppressed
            const differentMerchant = merchant === 'Costco' ? 'Walmart' : 'Costco';
            const anomaly = {
              expenseId: 1,
              place: differentMerchant,
              amount: amount,
              category: category,
              date: '2091-06-15',
              anomalyType: 'amount',
            };

            const result = anomalyDetectionService._applySuppressionRules([anomaly], rules);
            expect(result.length).toBe(1);
          }
        ),
        dbPbtOptions()
      );
    });
  });
});


// ─── Property 10: Data-driven suppression rules ───
// Feature: anomaly-refinements, Property 10: Data-driven suppression rules
// **Validates: Requirements 5.1, 5.2**

/**
 * @invariant Data-Driven Suppression Rules: For any anomaly at a vendor with fewer than
 * MIN_VENDOR_TRANSACTIONS_FOR_DETECTION (10) historical transactions, vendor-level anomalies
 * shall be suppressed. For any anomaly in a category whose annual frequency (total transactions /
 * years spanned, minimum 1 year denominator) is below MIN_CATEGORY_ANNUAL_FREQUENCY (2),
 * category-baseline anomalies shall be suppressed.
 */

const {
  SUPPRESSION_CONFIG: SUPP_CFG,
  DETECTION_THRESHOLDS: DET_THRESH,
  SEVERITY_LEVELS: SEV,
  ANOMALY_CLASSIFICATIONS: CLASSIF
} = require('../utils/analyticsConstants');
const { pbtOptions } = require('../test/pbtArbitraries');

// ─── Helpers for Property 10 ───

const MIN_VENDOR_TXN = SUPP_CFG.MIN_VENDOR_TRANSACTIONS_FOR_DETECTION; // 10
const MIN_CAT_ANNUAL_FREQ = SUPP_CFG.MIN_CATEGORY_ANNUAL_FREQUENCY;    // 2

/**
 * Build expense objects for a vendor/category.
 */
function buildVendorExpenses(place, category, count, opts = {}) {
  const startYear = opts.startYear || 2023;
  const startMonth = opts.startMonth || 1;
  const amount = opts.amount || 50;
  const expenses = [];
  for (let i = 0; i < count; i++) {
    const month = ((startMonth - 1 + i) % 12) + 1;
    const year = startYear + Math.floor((startMonth - 1 + i) / 12);
    expenses.push({
      id: (opts.idStart || 0) + i + 1,
      date: `${year}-${String(month).padStart(2, '0')}-15`,
      place,
      amount,
      type: category,
      week: 1,
      method: 'Cash'
    });
  }
  return expenses;
}

/**
 * Create a vendor-level anomaly (new_spending_tier or vendor p95).
 */
function makeVendorAnomaly(place, category, overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId || 999,
    date: overrides.date || '2025-01-15',
    place,
    amount: overrides.amount || 200,
    category,
    anomalyType: overrides.anomalyType || 'new_spending_tier',
    classification: overrides.classification || CLASSIF.NEW_SPENDING_TIER,
    severity: overrides.severity || SEV.LOW,
    dismissed: false,
    categoryAverage: 50,
    standardDeviations: 0,
    cluster: null,
    reason: overrides.reason || 'Amount 200 is 4x the historical max'
  };
}

/**
 * Create a category-baseline anomaly (amount type with stdDev reason).
 */
function makeCategoryAnomaly(place, category, overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId || 999,
    date: overrides.date || '2025-01-15',
    place,
    amount: overrides.amount || 200,
    category,
    anomalyType: overrides.anomalyType || 'amount',
    classification: overrides.classification || CLASSIF.LARGE_TRANSACTION,
    severity: overrides.severity || SEV.LOW,
    dismissed: false,
    categoryAverage: 50,
    standardDeviations: 4,
    cluster: null,
    reason: overrides.reason || 'Amount 200 is 4.0 standard deviations above the category average of 50'
  };
}

// ─── Arbitraries for Property 10 ───

const arbVendorTxnCountBelow = fc.integer({ min: 1, max: MIN_VENDOR_TXN - 1 });
const arbVendorTxnCountAtOrAbove = fc.integer({ min: MIN_VENDOR_TXN, max: 40 });

const arbCategoryName = fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing', 'Subscriptions');
const arbVendorName = fc.constantFrom('AlphaStore', 'BetaShop', 'GammaMart', 'DeltaCafe', 'EpsilonGas');

/**
 * Arbitrary: category expense count and year span that produce annual frequency < 2.
 * annualFreq = count / max(yearsSpanned, 1) < 2
 * We generate count in [1, 5] and yearsSpanned in [max(ceil(count/2)+1, 2), 10]
 * to ensure the ratio is < 2.
 */
const arbLowCategoryFrequency = fc.record({
  count: fc.integer({ min: 1, max: 5 }),
  yearsSpan: fc.integer({ min: 2, max: 8 })
}).filter(({ count, yearsSpan }) => {
  const annualFreq = count / Math.max(yearsSpan, 1);
  return annualFreq < MIN_CAT_ANNUAL_FREQ;
});

/**
 * Arbitrary: category expense count and year span that produce annual frequency ≥ 2.
 */
const arbHighCategoryFrequency = fc.record({
  count: fc.integer({ min: 4, max: 40 }),
  yearsSpan: fc.integer({ min: 1, max: 5 })
}).filter(({ count, yearsSpan }) => {
  // Compute actual year span the same way the production code does:
  // dates span from 2020-01-15 to (2020+yearsSpan)-01-15, divided by 365.25
  const earliest = new Date('2020-01-15');
  const latest = new Date(`${2020 + yearsSpan}-01-15`);
  const msSpan = latest - earliest;
  const actualYearsSpanned = Math.max(msSpan / (365.25 * 24 * 60 * 60 * 1000), 1);
  const annualFreq = count / actualYearsSpanned;
  return annualFreq >= MIN_CAT_ANNUAL_FREQ;
});

// ─── Tests ───

describe('Feature: anomaly-refinements, Property 10: Data-driven suppression rules', () => {
  afterEach(() => {
    anomalyDetectionService._vendorBaselineCache = null;
  });

  // ── Rule 4: Insufficient vendor history suppression ──

  describe('Rule 4: vendor-level anomalies suppressed when vendor has < 10 transactions', () => {
    it('new_spending_tier anomalies are suppressed for vendors with < MIN_VENDOR_TRANSACTIONS_FOR_DETECTION txns', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbVendorTxnCountBelow, (vendor, category, txnCount) => {
          const expenses = buildVendorExpenses(vendor, category, txnCount);
          anomalyDetectionService._vendorBaselineCache = anomalyDetectionService._buildVendorBaselines(expenses);

          const anomaly = makeVendorAnomaly(vendor, category, {
            anomalyType: 'new_spending_tier',
            reason: 'Amount 500 is 10x the historical max'
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          expect(result).toHaveLength(0);
        }),
        pbtOptions()
      );
    });

    it('vendor p95 anomalies are suppressed for vendors with < MIN_VENDOR_TRANSACTIONS_FOR_DETECTION txns', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbVendorTxnCountBelow, (vendor, category, txnCount) => {
          const expenses = buildVendorExpenses(vendor, category, txnCount);
          anomalyDetectionService._vendorBaselineCache = anomalyDetectionService._buildVendorBaselines(expenses);

          const anomaly = makeVendorAnomaly(vendor, category, {
            anomalyType: 'amount',
            classification: CLASSIF.LARGE_TRANSACTION,
            reason: `Amount 200 exceeds vendor p95 of 100`
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          expect(result).toHaveLength(0);
        }),
        pbtOptions()
      );
    });

    it('vendor frequency spike anomalies are suppressed for vendors with < MIN_VENDOR_TRANSACTIONS_FOR_DETECTION txns', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbVendorTxnCountBelow, (vendor, category, txnCount) => {
          const expenses = buildVendorExpenses(vendor, category, txnCount);
          anomalyDetectionService._vendorBaselineCache = anomalyDetectionService._buildVendorBaselines(expenses);

          const anomaly = makeVendorAnomaly(vendor, category, {
            anomalyType: 'frequency_spike',
            classification: CLASSIF.FREQUENCY_SPIKE,
            reason: `Visit to "${vendor}" after 2.0 days since last visit`
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          expect(result).toHaveLength(0);
        }),
        pbtOptions()
      );
    });
  });

  describe('Rule 4: vendor-level anomalies NOT suppressed when vendor has ≥ 10 transactions', () => {
    it('new_spending_tier anomalies pass through for vendors with ≥ MIN_VENDOR_TRANSACTIONS_FOR_DETECTION txns', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbVendorTxnCountAtOrAbove, (vendor, category, txnCount) => {
          const expenses = buildVendorExpenses(vendor, category, txnCount);
          anomalyDetectionService._vendorBaselineCache = anomalyDetectionService._buildVendorBaselines(expenses);

          const anomaly = makeVendorAnomaly(vendor, category, {
            anomalyType: 'new_spending_tier',
            reason: 'Amount 500 is 10x the historical max'
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          expect(result).toHaveLength(1);
        }),
        pbtOptions()
      );
    });
  });

  describe('Rule 4: category-level anomalies NOT suppressed by vendor history rule', () => {
    it('category stdDev anomalies pass through even when vendor has < 10 transactions', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbVendorTxnCountBelow, (vendor, category, txnCount) => {
          // Ensure enough category expenses so Rule 5 doesn't suppress
          const vendorExpenses = buildVendorExpenses(vendor, category, txnCount);
          const otherExpenses = buildVendorExpenses('OtherStore', category, 20, { idStart: 100 });
          const allExpenses = [...vendorExpenses, ...otherExpenses];
          anomalyDetectionService._vendorBaselineCache = anomalyDetectionService._buildVendorBaselines(allExpenses);

          const anomaly = makeCategoryAnomaly(vendor, category, {
            reason: 'Amount 200 is 4.0 standard deviations above the category average of 50'
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], allExpenses);
          // Should NOT be suppressed by Rule 4 (it's a category-level anomaly)
          expect(result).toHaveLength(1);
        }),
        pbtOptions()
      );
    });
  });

  // ── Rule 5: Low category frequency suppression ──

  describe('Rule 5: category-baseline anomalies suppressed when annual frequency < 2', () => {
    it('amount anomalies are suppressed for categories with annual frequency < MIN_CATEGORY_ANNUAL_FREQUENCY', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbLowCategoryFrequency, (vendor, category, { count, yearsSpan }) => {
          // Build expenses spread across yearsSpan years
          const expenses = [];
          for (let i = 0; i < count; i++) {
            const year = 2020 + Math.floor((i / count) * yearsSpan);
            const month = (i % 12) + 1;
            expenses.push({
              id: i + 1,
              date: `${year}-${String(month).padStart(2, '0')}-15`,
              place: vendor,
              amount: 50,
              type: category,
              week: 1,
              method: 'Cash'
            });
          }
          // Ensure the date span covers yearsSpan years
          if (expenses.length >= 2) {
            expenses[0].date = '2020-01-15';
            expenses[expenses.length - 1].date = `${2020 + yearsSpan}-01-15`;
          }

          anomalyDetectionService._vendorBaselineCache = new Map();

          const anomaly = makeCategoryAnomaly(vendor, category, {
            anomalyType: 'amount'
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          expect(result).toHaveLength(0);
        }),
        pbtOptions()
      );
    });

    it('category_spending_spike anomalies are suppressed for categories with annual frequency < 2', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbLowCategoryFrequency, (vendor, category, { count, yearsSpan }) => {
          const expenses = [];
          for (let i = 0; i < count; i++) {
            const year = 2020 + Math.floor((i / count) * yearsSpan);
            const month = (i % 12) + 1;
            expenses.push({
              id: i + 1,
              date: `${year}-${String(month).padStart(2, '0')}-15`,
              place: vendor,
              amount: 50,
              type: category,
              week: 1,
              method: 'Cash'
            });
          }
          if (expenses.length >= 2) {
            expenses[0].date = '2020-01-15';
            expenses[expenses.length - 1].date = `${2020 + yearsSpan}-01-15`;
          }

          anomalyDetectionService._vendorBaselineCache = new Map();

          const anomaly = makeCategoryAnomaly(vendor, category, {
            anomalyType: 'category_spending_spike',
            classification: CLASSIF.CATEGORY_SPENDING_SPIKE
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          expect(result).toHaveLength(0);
        }),
        pbtOptions()
      );
    });
  });

  describe('Rule 5: category-baseline anomalies NOT suppressed when annual frequency ≥ 2', () => {
    it('amount anomalies pass through for categories with annual frequency ≥ MIN_CATEGORY_ANNUAL_FREQUENCY', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbHighCategoryFrequency, (vendor, category, { count, yearsSpan }) => {
          const expenses = [];
          for (let i = 0; i < count; i++) {
            const month = ((i) % 12) + 1;
            const year = 2020 + Math.floor(i / 12);
            expenses.push({
              id: i + 1,
              date: `${year}-${String(month).padStart(2, '0')}-15`,
              place: vendor,
              amount: 50,
              type: category,
              week: 1,
              method: 'Cash'
            });
          }
          // Ensure the date span covers yearsSpan years
          if (expenses.length >= 2) {
            expenses[0].date = '2020-01-15';
            expenses[expenses.length - 1].date = `${2020 + yearsSpan}-01-15`;
          }

          anomalyDetectionService._vendorBaselineCache = new Map();

          const anomaly = makeCategoryAnomaly(vendor, category, {
            anomalyType: 'amount'
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          expect(result).toHaveLength(1);
        }),
        pbtOptions()
      );
    });
  });

  describe('Rule 5: non-category-baseline anomaly types NOT affected', () => {
    it('new_merchant anomalies pass through even for low-frequency categories', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, arbLowCategoryFrequency, (vendor, category, { count, yearsSpan }) => {
          const expenses = [];
          for (let i = 0; i < count; i++) {
            const year = 2020 + Math.floor((i / count) * yearsSpan);
            const month = (i % 12) + 1;
            expenses.push({
              id: i + 1,
              date: `${year}-${String(month).padStart(2, '0')}-15`,
              place: vendor,
              amount: 50,
              type: category,
              week: 1,
              method: 'Cash'
            });
          }
          if (expenses.length >= 2) {
            expenses[0].date = '2020-01-15';
            expenses[expenses.length - 1].date = `${2020 + yearsSpan}-01-15`;
          }

          anomalyDetectionService._vendorBaselineCache = new Map();

          const anomaly = makeCategoryAnomaly(vendor, category, {
            anomalyType: 'new_merchant',
            classification: CLASSIF.NEW_MERCHANT
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          // new_merchant is not in categoryBaselineTypes → not suppressed by Rule 5
          expect(result).toHaveLength(1);
        }),
        pbtOptions()
      );
    });
  });

  // ── Annual frequency calculation ──

  describe('annual frequency calculation uses minimum 1 year denominator', () => {
    it('categories with all transactions within < 1 year use 1 year denominator', () => {
      fc.assert(
        fc.property(
          arbVendorName,
          arbCategoryName,
          fc.integer({ min: 2, max: 10 }),
          (vendor, category, count) => {
            // All transactions within 6 months → yearsSpanned = max(~0.5, 1) = 1
            // annualFreq = count / 1 = count
            // If count ≥ 2, annualFreq ≥ 2 → NOT suppressed
            const expenses = [];
            for (let i = 0; i < count; i++) {
              const day = Math.min(i + 1, 28);
              expenses.push({
                id: i + 1,
                date: `2024-01-${String(day).padStart(2, '0')}`,
                place: vendor,
                amount: 50,
                type: category,
                week: 1,
                method: 'Cash'
              });
            }

            anomalyDetectionService._vendorBaselineCache = new Map();

            const anomaly = makeCategoryAnomaly(vendor, category, {
              anomalyType: 'amount'
            });

            const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
            // count ≥ 2, denominator = 1 → annualFreq = count ≥ 2 → NOT suppressed
            expect(result).toHaveLength(1);
          }
        ),
        pbtOptions()
      );
    });

    it('single transaction in a category uses 1 year denominator → annualFreq = 1 < 2 → suppressed', () => {
      fc.assert(
        fc.property(arbVendorName, arbCategoryName, (vendor, category) => {
          const expenses = [{
            id: 1,
            date: '2024-06-15',
            place: vendor,
            amount: 50,
            type: category,
            week: 1,
            method: 'Cash'
          }];

          anomalyDetectionService._vendorBaselineCache = new Map();

          const anomaly = makeCategoryAnomaly(vendor, category, {
            anomalyType: 'amount'
          });

          const result = anomalyDetectionService._suppressBenignPatterns([anomaly], expenses);
          // 1 txn / 1 year = 1 < 2 → suppressed
          expect(result).toHaveLength(0);
        }),
        pbtOptions()
      );
    });
  });
});
