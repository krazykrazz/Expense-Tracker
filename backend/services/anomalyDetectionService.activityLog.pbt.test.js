/**
 * Property-Based Tests for AnomalyDetectionService — Activity Log Metadata
 *
 * Property 22: Activity log metadata includes classification
 *
 * Feature: actionable-anomaly-alerts
 * Validates: Requirements 17.1, 17.2, 17.5
 *
 * @invariant Activity Log Metadata Correctness: For any anomaly dismiss or
 * mark-as-expected action using any legacy anomalyType and optional classification,
 * the activity log event metadata shall contain both the legacy anomaly_type field
 * and the new classification field. The classification value shall be one of the 7
 * ANOMALY_CLASSIFICATIONS values. The user_action string shall include the
 * human-readable classification label (underscores replaced with spaces).
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const fc = require('fast-check');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const {
  ANOMALY_CLASSIFICATIONS,
  LEGACY_TYPE_MAP
} = require('../utils/analyticsConstants');

const ANOMALY_CLASSIFICATION_VALUES = Object.values(ANOMALY_CLASSIFICATIONS);
const LEGACY_TYPES = ['amount', 'new_merchant', 'daily_total'];

let db;
let anomalyDetectionService;
let activityLogRepository;

// ─── Setup ───

beforeAll(async () => {
  db = await createIsolatedTestDb();

  // Override the database module to use our isolated db
  const dbModule = require('../database/db');
  dbModule.getDatabase = () => Promise.resolve(db);

  activityLogRepository = require('../repositories/activityLogRepository');
  anomalyDetectionService = require('./anomalyDetectionService');
});

afterAll(() => {
  cleanupIsolatedTestDb(db);
});

// ─── Helpers ───

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

let expenseCounter = 0;

async function insertExpense({ date, place, type, amount }) {
  expenseCounter++;
  const result = await runSql(
    'INSERT INTO expenses (date, place, type, amount, method, week) VALUES (?, ?, ?, ?, ?, ?)',
    [date, place, type, amount, 'Cash', 1]
  );
  return result.lastID;
}

async function clearTestData() {
  await runSql('DELETE FROM dismissed_anomalies');
  await runSql('DELETE FROM anomaly_suppression_rules');
  await clearActivityLogs(db, 'entity_type', ['anomaly', 'suppression_rule']);
  anomalyDetectionService._dismissedExpenseIdsCache = null;
}

/**
 * Resolve expected classification the same way the service does:
 * prefer expenseDetails.classification, fall back to LEGACY_TYPE_MAP.
 */
function expectedClassification(anomalyType, classification) {
  if (classification !== undefined) return classification;
  return LEGACY_TYPE_MAP[anomalyType] || null;
}

/**
 * Convert classification to human-readable label (underscores → spaces).
 */
function classificationLabel(classification) {
  if (!classification || typeof classification !== 'string') return 'unknown';
  return classification.replace(/_/g, ' ');
}

// ─── Property 22 Tests ───

describe('Property 22: Activity log metadata includes classification', () => {
  beforeEach(async () => {
    await clearTestData();
  });

  /**
   * **Validates: Requirements 17.1, 17.2, 17.5**
   *
   * For any legacy anomalyType and optional classification, dismissAnomaly
   * logs an event whose metadata contains both anomaly_type and classification,
   * and whose user_action includes the human-readable classification label.
   */
  test('Property 22a: dismissAnomaly metadata includes both anomaly_type and classification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...LEGACY_TYPES),
        fc.option(fc.constantFrom(...ANOMALY_CLASSIFICATION_VALUES), { nil: undefined }),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 1, max: 10000 }),
        async (anomalyType, classification, merchant, amount) => {
          await clearTestData();

          const expenseId = await insertExpense({
            date: '2025-06-10',
            place: merchant.trim(),
            type: 'Groceries',
            amount
          });

          const expenseDetails = { merchant: merchant.trim(), amount };
          if (classification !== undefined) {
            expenseDetails.classification = classification;
          }

          await anomalyDetectionService.dismissAnomaly(expenseId, anomalyType, expenseDetails);
          await waitForLogging();

          const events = await activityLogRepository.findRecent(10, 0);
          const { event, metadata } = findEventWithMetadata(events, 'anomaly_dismissed', expenseId);

          // Event must exist
          expect(event).toBeDefined();

          // Legacy anomaly_type preserved
          expect(metadata.anomaly_type).toBe(anomalyType);

          // Classification field present and valid
          const resolved = expectedClassification(anomalyType, classification);
          expect(metadata.classification).toBe(resolved);
          expect(ANOMALY_CLASSIFICATION_VALUES).toContain(metadata.classification);

          // user_action includes human-readable label
          const label = classificationLabel(resolved);
          expect(event.user_action).toContain(label);
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * **Validates: Requirements 17.1, 17.2, 17.5**
   *
   * For any legacy anomalyType and optional classification, markAsExpected
   * logs an event whose metadata contains both anomaly_type and classification,
   * and whose user_action includes the human-readable classification label.
   */
  test('Property 22b: markAsExpected metadata includes both anomaly_type and classification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...LEGACY_TYPES),
        fc.option(fc.constantFrom(...ANOMALY_CLASSIFICATION_VALUES), { nil: undefined }),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 1, max: 10000 }),
        async (anomalyType, classification, merchant, amount) => {
          await clearTestData();

          const expenseId = await insertExpense({
            date: '2025-06-10',
            place: merchant.trim(),
            type: 'Groceries',
            amount
          });

          const expenseDetails = {
            merchant: merchant.trim(),
            amount,
            category: 'Groceries',
            date: '2025-06-10'
          };
          if (classification !== undefined) {
            expenseDetails.classification = classification;
          }

          await anomalyDetectionService.markAsExpected(expenseId, anomalyType, expenseDetails);
          await waitForLogging();

          const events = await activityLogRepository.findRecent(10, 0);
          const { event, metadata } = findEventWithMetadata(events, 'anomaly_marked_expected', expenseId);

          // Event must exist
          expect(event).toBeDefined();

          // Legacy anomaly_type preserved
          expect(metadata.anomaly_type).toBe(anomalyType);

          // Classification field present and valid
          const resolved = expectedClassification(anomalyType, classification);
          expect(metadata.classification).toBe(resolved);
          expect(ANOMALY_CLASSIFICATION_VALUES).toContain(metadata.classification);

          // user_action includes human-readable label
          const label = classificationLabel(resolved);
          expect(event.user_action).toContain(label);
        }
      ),
      dbPbtOptions()
    );
  });
});
