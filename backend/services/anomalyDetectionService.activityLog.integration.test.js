/**
 * Integration Tests for Anomaly Detection Activity Logging
 *
 * Tests that anomaly actions (dismiss, mark-as-expected, delete suppression rule)
 * correctly log activity events with the right event_type, entity_type, and metadata.
 *
 * Uses isolated SQLite database, real anomalyDetectionService, real activityLogService.
 * No mocks.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 13.4, 17.3, 20.7
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

let db;
let anomalyDetectionService;
let activityLogRepository;

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

async function insertExpense({ date, place, type, amount, method = 'Cash', week = 1 }) {
  const result = await runSql(
    'INSERT INTO expenses (date, place, type, amount, method, week) VALUES (?, ?, ?, ?, ?, ?)',
    [date, place, type, amount, method, week]
  );
  return result.lastID;
}

async function clearTestData() {
  await runSql('DELETE FROM dismissed_anomalies');
  await runSql('DELETE FROM anomaly_suppression_rules');
  await clearActivityLogs(db, 'entity_type', ['anomaly', 'suppression_rule']);
  // Reset the service's in-memory cache
  anomalyDetectionService._dismissedExpenseIdsCache = null;
}

// ─── Tests ───

describe('Anomaly Detection Activity Logging - Integration Tests', () => {
  beforeEach(async () => {
    await clearTestData();
  });

  // ── dismissAnomaly ──

  describe('dismissAnomaly Event Logging (Requirement 10.1)', () => {
    test('should log anomaly_dismissed event with correct metadata', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 500
      });

      await anomalyDetectionService.dismissAnomaly(expenseId, 'amount', {
        merchant: 'Costco', amount: 500
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_dismissed', expenseId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('anomaly');
      expect(event.entity_id).toBe(expenseId);
      expect(event.user_action).toContain('Dismissed');
      expect(event.user_action).toContain('Large Transaction');
      expect(event.user_action).toContain('Costco');

      expect(metadata.anomaly_type).toBe('amount');
      expect(metadata.expense_id).toBe(expenseId);
      expect(metadata.merchant).toBe('Costco');
      expect(metadata.amount).toBe(500);
    });

    test('should log anomaly_dismissed with entity_type "anomaly"', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-11', place: 'NewShop', type: 'Electronics', amount: 250
      });

      await anomalyDetectionService.dismissAnomaly(expenseId, 'new_merchant', {
        merchant: 'NewShop', amount: 250
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_dismissed', expenseId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('anomaly');
      expect(metadata.anomaly_type).toBe('new_merchant');
      expect(metadata.merchant).toBe('NewShop');
    });
  });

  // ── markAsExpected ──

  describe('markAsExpected Event Logging (Requirement 10.2)', () => {
    test('should log anomaly_marked_expected event with suppression_rule_id in metadata', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 100
      });

      const result = await anomalyDetectionService.markAsExpected(expenseId, 'amount', {
        merchant: 'Costco', amount: 100, category: 'Groceries', date: '2025-06-10'
      });
      await waitForLogging();

      expect(result.suppressionRuleId).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_marked_expected', expenseId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('anomaly');
      expect(event.entity_id).toBe(expenseId);
      expect(event.user_action).toContain('Marked');
      expect(event.user_action).toContain('expected');
      expect(event.user_action).toContain('Costco');

      expect(metadata.anomaly_type).toBe('amount');
      expect(metadata.expense_id).toBe(expenseId);
      expect(metadata.merchant).toBe('Costco');
      expect(metadata.amount).toBe(100);
      expect(metadata.suppression_rule_id).toBe(result.suppressionRuleId);
    });

    test('should log anomaly_marked_expected for new_merchant anomaly type', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-11', place: 'NewShop', type: 'Electronics', amount: 250
      });

      const result = await anomalyDetectionService.markAsExpected(expenseId, 'new_merchant', {
        merchant: 'NewShop', amount: 250, category: 'Electronics', date: '2025-06-11'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_marked_expected', expenseId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('anomaly');
      expect(metadata.anomaly_type).toBe('new_merchant');
      expect(metadata.suppression_rule_id).toBe(result.suppressionRuleId);
    });

    test('should log anomaly_marked_expected for daily_total anomaly type', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-12', place: 'Various', type: 'Groceries', amount: 500
      });

      const result = await anomalyDetectionService.markAsExpected(expenseId, 'daily_total', {
        merchant: 'Various', amount: 500, category: 'Groceries', date: '2025-06-12'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_marked_expected', expenseId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('anomaly');
      expect(metadata.anomaly_type).toBe('daily_total');
      expect(metadata.suppression_rule_id).toBe(result.suppressionRuleId);
    });
  });

  // ── deleteSuppressionRule ──

  describe('deleteSuppressionRule Event Logging (Requirement 10.3)', () => {
    test('should log suppression_rule_deleted event with rule details in metadata', async () => {
      // Create a rule via markAsExpected first
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 100
      });
      const { suppressionRuleId } = await anomalyDetectionService.markAsExpected(expenseId, 'amount', {
        merchant: 'Costco', amount: 100, category: 'Groceries', date: '2025-06-10'
      });
      await waitForLogging();

      // Clear logs to isolate the delete event
      await clearActivityLogs(db, 'entity_type', ['anomaly', 'suppression_rule']);

      // Delete the rule
      const deleteResult = await anomalyDetectionService.deleteSuppressionRule(suppressionRuleId);
      await waitForLogging();

      expect(deleteResult.deleted).toBe(true);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'suppression_rule_deleted', suppressionRuleId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('suppression_rule');
      expect(event.entity_id).toBe(suppressionRuleId);
      expect(event.user_action).toContain('Deleted');
      expect(event.user_action).toContain('merchant_amount');
      expect(event.user_action).toContain('Costco');

      expect(metadata.rule_type).toBe('merchant_amount');
      expect(metadata.merchant_name).toBe('Costco');
      expect(metadata.amount_min).toBeCloseTo(80, 0);
      expect(metadata.amount_max).toBeCloseTo(120, 0);
    });

    test('should log suppression_rule_deleted with merchant_category rule details', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-11', place: 'NewShop', type: 'Electronics', amount: 250
      });
      const { suppressionRuleId } = await anomalyDetectionService.markAsExpected(expenseId, 'new_merchant', {
        merchant: 'NewShop', amount: 250, category: 'Electronics', date: '2025-06-11'
      });
      await waitForLogging();
      await clearActivityLogs(db, 'entity_type', ['anomaly', 'suppression_rule']);

      await anomalyDetectionService.deleteSuppressionRule(suppressionRuleId);
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'suppression_rule_deleted', suppressionRuleId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('suppression_rule');
      expect(metadata.rule_type).toBe('merchant_category');
      expect(metadata.merchant_name).toBe('NewShop');
      expect(metadata.category).toBe('Electronics');
    });

    test('should log suppression_rule_deleted with specific_date rule details', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-12', place: 'Various', type: 'Groceries', amount: 500
      });
      const { suppressionRuleId } = await anomalyDetectionService.markAsExpected(expenseId, 'daily_total', {
        merchant: 'Various', amount: 500, category: 'Groceries', date: '2025-06-12'
      });
      await waitForLogging();
      await clearActivityLogs(db, 'entity_type', ['anomaly', 'suppression_rule']);

      await anomalyDetectionService.deleteSuppressionRule(suppressionRuleId);
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'suppression_rule_deleted', suppressionRuleId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('suppression_rule');
      expect(metadata.rule_type).toBe('specific_date');
      expect(metadata.specific_date).toBe('2025-06-12');
    });

    test('should not log event when deleting non-existent rule', async () => {
      const deleteResult = await anomalyDetectionService.deleteSuppressionRule(99999);
      await waitForLogging();

      expect(deleteResult.deleted).toBe(false);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event } = findEventWithMetadata(events, 'suppression_rule_deleted', 99999);

      expect(event).toBeNull();
    });
  });

  // ── Expanded classification types in dismiss (Requirement 17.3, 20.7) ──

  describe('dismissAnomaly with expanded classification types (Requirement 17.3)', () => {
    test('should include classification field in metadata when expenseDetails has classification', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-15', place: 'Dining Out', type: 'Dining', amount: 800
      });

      await anomalyDetectionService.dismissAnomaly(expenseId, 'amount', {
        merchant: 'Dining Out', amount: 800, classification: 'Category_Spending_Spike'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_dismissed', expenseId);

      expect(event).toBeDefined();
      // classification field from expenseDetails
      expect(metadata.classification).toBe('Category_Spending_Spike');
      // Legacy anomaly_type preserved for backward compatibility
      expect(metadata.anomaly_type).toBe('amount');
      // Human-readable label in user_action
      expect(event.user_action).toContain('Category Spending Spike');
      expect(event.user_action).toContain('Dining Out');
    });

    test('should use LEGACY_TYPE_MAP fallback when classification is not in expenseDetails', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-16', place: 'Walmart', type: 'Groceries', amount: 300
      });

      // No classification in expenseDetails — should fall back to LEGACY_TYPE_MAP
      await anomalyDetectionService.dismissAnomaly(expenseId, 'amount', {
        merchant: 'Walmart', amount: 300
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_dismissed', expenseId);

      expect(event).toBeDefined();
      // LEGACY_TYPE_MAP maps 'amount' → 'Large_Transaction'
      expect(metadata.classification).toBe('Large_Transaction');
      expect(metadata.anomaly_type).toBe('amount');
      expect(event.user_action).toContain('Large Transaction');
    });

    test('should use human-readable label for Frequency_Spike classification', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-17', place: 'Coffee Shop', type: 'Dining', amount: 150
      });

      await anomalyDetectionService.dismissAnomaly(expenseId, 'amount', {
        merchant: 'Coffee Shop', amount: 150, classification: 'Frequency_Spike'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_dismissed', expenseId);

      expect(event).toBeDefined();
      expect(metadata.classification).toBe('Frequency_Spike');
      expect(event.user_action).toContain('Frequency Spike');
      expect(event.user_action).toContain('Dismissed');
    });

    test('should use human-readable label for Recurring_Expense_Increase classification', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-18', place: 'Netflix', type: 'Entertainment', amount: 25
      });

      await anomalyDetectionService.dismissAnomaly(expenseId, 'amount', {
        merchant: 'Netflix', amount: 25, classification: 'Recurring_Expense_Increase'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_dismissed', expenseId);

      expect(event).toBeDefined();
      expect(metadata.classification).toBe('Recurring_Expense_Increase');
      expect(event.user_action).toContain('Recurring Expense Increase');
    });

    test('should use LEGACY_TYPE_MAP for daily_total without explicit classification', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-19', place: 'Various', type: 'Groceries', amount: 600
      });

      await anomalyDetectionService.dismissAnomaly(expenseId, 'daily_total', {
        merchant: 'Various', amount: 600
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_dismissed', expenseId);

      expect(event).toBeDefined();
      // LEGACY_TYPE_MAP maps 'daily_total' → 'Large_Transaction'
      expect(metadata.classification).toBe('Large_Transaction');
      expect(metadata.anomaly_type).toBe('daily_total');
      expect(event.user_action).toContain('Large Transaction');
    });
  });

  // ── Expanded classification types in markAsExpected (Requirement 17.3, 20.7) ──

  describe('markAsExpected with expanded classification types (Requirement 17.3)', () => {
    test('should include classification field in metadata when expenseDetails has classification', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-15', place: 'BestBuy', type: 'Electronics', amount: 1200
      });

      const result = await anomalyDetectionService.markAsExpected(expenseId, 'amount', {
        merchant: 'BestBuy', amount: 1200, category: 'Electronics', date: '2025-06-15',
        classification: 'Large_Transaction'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_marked_expected', expenseId);

      expect(event).toBeDefined();
      expect(metadata.classification).toBe('Large_Transaction');
      expect(metadata.anomaly_type).toBe('amount');
      expect(metadata.suppression_rule_id).toBe(result.suppressionRuleId);
      expect(event.user_action).toContain('Large Transaction');
      expect(event.user_action).toContain('expected');
    });

    test('should include Seasonal_Deviation classification in metadata', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-16', place: 'GiftShop', type: 'Gifts', amount: 400
      });

      const result = await anomalyDetectionService.markAsExpected(expenseId, 'amount', {
        merchant: 'GiftShop', amount: 400, category: 'Gifts', date: '2025-06-16',
        classification: 'Seasonal_Deviation'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_marked_expected', expenseId);

      expect(event).toBeDefined();
      expect(metadata.classification).toBe('Seasonal_Deviation');
      expect(metadata.anomaly_type).toBe('amount');
      expect(event.user_action).toContain('Seasonal Deviation');
    });

    test('should include Emerging_Behavior_Trend classification in metadata', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-17', place: 'Uber Eats', type: 'Dining', amount: 200
      });

      const result = await anomalyDetectionService.markAsExpected(expenseId, 'amount', {
        merchant: 'Uber Eats', amount: 200, category: 'Dining', date: '2025-06-17',
        classification: 'Emerging_Behavior_Trend'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_marked_expected', expenseId);

      expect(event).toBeDefined();
      expect(metadata.classification).toBe('Emerging_Behavior_Trend');
      expect(metadata.anomaly_type).toBe('amount');
      expect(event.user_action).toContain('Emerging Behavior Trend');
      expect(event.user_action).toContain('Marked');
    });

    test('should use LEGACY_TYPE_MAP fallback for new_merchant without explicit classification', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-18', place: 'NewPlace', type: 'Shopping', amount: 350
      });

      const result = await anomalyDetectionService.markAsExpected(expenseId, 'new_merchant', {
        merchant: 'NewPlace', amount: 350, category: 'Shopping', date: '2025-06-18'
      });
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'anomaly_marked_expected', expenseId);

      expect(event).toBeDefined();
      // LEGACY_TYPE_MAP maps 'new_merchant' → 'New_Merchant'
      expect(metadata.classification).toBe('New_Merchant');
      expect(metadata.anomaly_type).toBe('new_merchant');
      expect(event.user_action).toContain('New Merchant');
    });
  });

  // ── Fire-and-forget pattern (Requirement 10.4) ──

  describe('Fire-and-forget logging pattern (Requirement 10.4)', () => {
    test('dismissAnomaly should succeed even if activity logging were to fail', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'TestStore', type: 'Groceries', amount: 50
      });

      // The primary operation should complete without throwing
      await expect(
        anomalyDetectionService.dismissAnomaly(expenseId, 'amount', {
          merchant: 'TestStore', amount: 50
        })
      ).resolves.not.toThrow();
    });

    test('markAsExpected should succeed and return suppressionRuleId', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'TestStore', type: 'Groceries', amount: 50
      });

      const result = await anomalyDetectionService.markAsExpected(expenseId, 'amount', {
        merchant: 'TestStore', amount: 50, category: 'Groceries', date: '2025-06-10'
      });

      expect(result).toBeDefined();
      expect(result.suppressionRuleId).toBeDefined();
      expect(typeof result.suppressionRuleId).toBe('number');
    });
  });
});
