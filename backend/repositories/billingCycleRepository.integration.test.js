/**
 * Unit Tests for billingCycleRepository.findPreviousCycle
 * Feature: billing-cycle-payment-deduction
 * 
 * Tests the findPreviousCycle(paymentMethodId, beforeDate) method which
 * returns the most recent billing cycle record before a given date.
 * 
 * _Requirements: 1.1, 2.1, 3.2_
 */

const billingCycleRepository = require('./billingCycleRepository');
const { getDatabase } = require('../database/db');

describe('billingCycleRepository.findPreviousCycle', () => {
  let db;
  let paymentMethodId1;
  let paymentMethodId2;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up billing cycles and payment methods from previous tests
    await run(db, 'DELETE FROM credit_card_billing_cycles');
    await run(db, "DELETE FROM payment_methods WHERE display_name LIKE 'FindPrevTest%'");

    // Create two credit card payment methods for isolation testing
    paymentMethodId1 = await insert(db,
      `INSERT INTO payment_methods (type, display_name, full_name, billing_cycle_day, is_active)
       VALUES ('credit_card', 'FindPrevTest Card A', 'FindPrevTest Card A', 15, 1)`
    );
    paymentMethodId2 = await insert(db,
      `INSERT INTO payment_methods (type, display_name, full_name, billing_cycle_day, is_active)
       VALUES ('credit_card', 'FindPrevTest Card B', 'FindPrevTest Card B', 20, 1)`
    );
  });

  afterEach(async () => {
    await run(db, 'DELETE FROM credit_card_billing_cycles');
    await run(db, "DELETE FROM payment_methods WHERE display_name LIKE 'FindPrevTest%'");
  });

  test('returns correct previous cycle when multiple exist', async () => {
    // Insert three cycles for the same card with different end dates
    await insertCycle(db, {
      payment_method_id: paymentMethodId1,
      cycle_start_date: '2024-01-16',
      cycle_end_date: '2024-02-15',
      actual_statement_balance: 100,
      calculated_statement_balance: 100
    });
    await insertCycle(db, {
      payment_method_id: paymentMethodId1,
      cycle_start_date: '2024-02-16',
      cycle_end_date: '2024-03-15',
      actual_statement_balance: 200,
      calculated_statement_balance: 200
    });
    await insertCycle(db, {
      payment_method_id: paymentMethodId1,
      cycle_start_date: '2024-03-16',
      cycle_end_date: '2024-04-15',
      actual_statement_balance: 300,
      calculated_statement_balance: 300
    });

    // Ask for the previous cycle before 2024-04-16 (the start of a hypothetical next cycle)
    const result = await billingCycleRepository.findPreviousCycle(paymentMethodId1, '2024-04-16');

    expect(result).not.toBeNull();
    expect(result.cycle_end_date).toBe('2024-04-15');
    expect(result.actual_statement_balance).toBe(300);
  });

  test('returns the most recent cycle strictly before the given date', async () => {
    await insertCycle(db, {
      payment_method_id: paymentMethodId1,
      cycle_start_date: '2024-01-16',
      cycle_end_date: '2024-02-15',
      actual_statement_balance: 100,
      calculated_statement_balance: 100
    });
    await insertCycle(db, {
      payment_method_id: paymentMethodId1,
      cycle_start_date: '2024-02-16',
      cycle_end_date: '2024-03-15',
      actual_statement_balance: 200,
      calculated_statement_balance: 200
    });

    // beforeDate is exactly the end date of the second cycle — should return the first
    const result = await billingCycleRepository.findPreviousCycle(paymentMethodId1, '2024-03-15');

    expect(result).not.toBeNull();
    expect(result.cycle_end_date).toBe('2024-02-15');
    expect(result.actual_statement_balance).toBe(100);
  });

  test('returns null when no previous cycle exists', async () => {
    // No cycles inserted at all
    const result = await billingCycleRepository.findPreviousCycle(paymentMethodId1, '2024-05-01');

    expect(result).toBeNull();
  });

  test('returns null when all cycles are on or after the given date', async () => {
    await insertCycle(db, {
      payment_method_id: paymentMethodId1,
      cycle_start_date: '2024-04-16',
      cycle_end_date: '2024-05-15',
      actual_statement_balance: 500,
      calculated_statement_balance: 500
    });

    // beforeDate is before the only existing cycle's end date
    const result = await billingCycleRepository.findPreviousCycle(paymentMethodId1, '2024-05-15');

    expect(result).toBeNull();
  });

  test('does not return cycles from other payment methods', async () => {
    // Insert a cycle for card B only
    await insertCycle(db, {
      payment_method_id: paymentMethodId2,
      cycle_start_date: '2024-01-21',
      cycle_end_date: '2024-02-20',
      actual_statement_balance: 999,
      calculated_statement_balance: 999
    });

    // Query for card A — should find nothing even though card B has a cycle
    const result = await billingCycleRepository.findPreviousCycle(paymentMethodId1, '2024-06-01');

    expect(result).toBeNull();
  });

  test('returns full row with all fields populated', async () => {
    await insertCycle(db, {
      payment_method_id: paymentMethodId1,
      cycle_start_date: '2024-01-16',
      cycle_end_date: '2024-02-15',
      actual_statement_balance: 150.75,
      calculated_statement_balance: 142.30,
      minimum_payment: 25,
      notes: 'Test cycle'
    });

    const result = await billingCycleRepository.findPreviousCycle(paymentMethodId1, '2024-03-01');

    expect(result).not.toBeNull();
    expect(result.payment_method_id).toBe(paymentMethodId1);
    expect(result.cycle_start_date).toBe('2024-01-16');
    expect(result.cycle_end_date).toBe('2024-02-15');
    expect(result.actual_statement_balance).toBe(150.75);
    expect(result.calculated_statement_balance).toBe(142.30);
    expect(result.minimum_payment).toBe(25);
    expect(result.notes).toBe('Test cycle');
    expect(result.id).toBeDefined();
  });
});

// --- Helpers ---

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function insert(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function insertCycle(db, data) {
  return insert(db,
    `INSERT INTO credit_card_billing_cycles
     (payment_method_id, cycle_start_date, cycle_end_date, actual_statement_balance,
      calculated_statement_balance, minimum_payment, notes, is_user_entered)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.payment_method_id,
      data.cycle_start_date,
      data.cycle_end_date,
      data.actual_statement_balance,
      data.calculated_statement_balance,
      data.minimum_payment ?? null,
      data.notes ?? null,
      data.is_user_entered ?? 0
    ]
  );
}
