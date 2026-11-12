/**
 * Integration tests for mortgage balance snapshot rebuilding
 *
 * Covers balanceCalculationService.recomputeMortgageSnapshots as driven by payment
 * create/update/delete, manual balance entries and rate updates, against the real test DB.
 * Dates are relative to the current month so the walk always ends "today".
 */

const { getDatabase } = require('../database/db');
const balanceCalculationService = require('./balanceCalculationService');
const loanPaymentService = require('./loanPaymentService');
const loanBalanceService = require('./loanBalanceService');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const { calculateMonthlyInterest } = require('../utils/interestCalculation');
const { runSql } = require('../test/activityLogTestHelpers');

const LOAN_NAME = 'Recompute Test Mortgage';
const RATE = 12; // variable: 1% nominal per month
const INITIAL = 100000;
const PAYMENT = 2000;

const round = (v) => Math.round(v * 100) / 100;

/** { year, month } for `offset` months from the current month */
function ym(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function dateAt(offset, day = 15) {
  const { year, month } = ym(offset);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Reference walk: opening balance at month -6, then each month to the current one adds
 * interest and subtracts that month's payments, rounded to cents.
 * @param {Object} paymentsByOffset - { offset: totalPaid }
 * @param {Object} [anchors] - { offset: balance } manual snapshots that replace the walk
 * @returns {Object} { offset: closingBalance } for offsets -5..0
 */
function expectedWalk(paymentsByOffset, anchors = {}, rateByOffset = {}) {
  const result = {};
  let balance = INITIAL;
  let rate = RATE;
  for (let offset = -5; offset <= 0; offset++) {
    if (rateByOffset[offset] != null) rate = rateByOffset[offset];
    if (anchors[offset] != null) {
      balance = anchors[offset];
    } else {
      balance = round(Math.max(0, balance + calculateMonthlyInterest(balance, rate, 'variable') - (paymentsByOffset[offset] || 0)));
    }
    result[offset] = balance;
  }
  return result;
}

describe('Mortgage snapshot rebuild - Integration', () => {
  let db;
  let loanId;

  async function cleanup() {
    await runSql(db, `DELETE FROM loan_payments WHERE loan_id IN (SELECT id FROM loans WHERE name = ?)`, [LOAN_NAME]);
    await runSql(db, `DELETE FROM loan_balances WHERE loan_id IN (SELECT id FROM loans WHERE name = ?)`, [LOAN_NAME]);
    await runSql(db, `DELETE FROM loans WHERE name = ?`, [LOAN_NAME]);
  }

  async function snapshotAt(offset) {
    const { year, month } = ym(offset);
    return loanBalanceRepository.findByLoanAndMonth(loanId, year, month);
  }

  async function addPayments(offsets) {
    const created = {};
    for (const offset of offsets) {
      created[offset] = await loanPaymentService.createPayment(loanId, { amount: PAYMENT, payment_date: dateAt(offset) });
    }
    return created;
  }

  beforeAll(async () => { db = await getDatabase(); });

  beforeEach(async () => {
    await cleanup();
    // Mortgage started 6 months ago; its start-month snapshot (manual) carries the rate
    const start = ym(-6);
    const result = await runSql(db, `
      INSERT INTO loans (name, initial_balance, start_date, loan_type, amortization_period, term_length,
                         renewal_date, rate_type, payment_frequency)
      VALUES (?, ?, ?, 'mortgage', 25, 5, '2099-01-01', 'variable', 'monthly')
    `, [LOAN_NAME, INITIAL, dateAt(-6, 1)]);
    loanId = result.lastID;
    await loanBalanceRepository.create({
      loan_id: loanId, year: start.year, month: start.month, remaining_balance: INITIAL, rate: RATE, source: 'manual'
    });
  });

  afterAll(() => cleanup());

  test('editing an old payment rebuilds later auto snapshots without writing today\'s balance into the edited month', async () => {
    const payments = await addPayments([-5, -4, -3, -2, -1]);
    const before = expectedWalk({ '-5': PAYMENT, '-4': PAYMENT, '-3': PAYMENT, '-2': PAYMENT, '-1': PAYMENT });
    expect((await snapshotAt(-4)).remaining_balance).toBe(before[-4]);

    await loanPaymentService.updatePayment(payments[-4].id, { amount: 5000, payment_date: dateAt(-4) });

    const after = expectedWalk({ '-5': PAYMENT, '-4': 5000, '-3': PAYMENT, '-2': PAYMENT, '-1': PAYMENT });
    for (let offset = -5; offset <= 0; offset++) {
      const snap = await snapshotAt(offset);
      expect(snap.source).toBe('auto');
      expect(snap.remaining_balance).toBe(after[offset]);
    }
    // The edited month holds its own closing balance, not the current balance
    const current = await balanceCalculationService.calculateBalance(loanId);
    expect(current.currentBalance).toBe(after[0]);
    expect((await snapshotAt(-4)).remaining_balance).not.toBe(current.currentBalance);
    // Month before the edit is untouched
    expect((await snapshotAt(-5)).remaining_balance).toBe(before[-5]);
  });

  test('deleting a payment raises the current balance', async () => {
    const payments = await addPayments([-5, -4, -3, -2, -1]);
    const withAll = await balanceCalculationService.calculateBalance(loanId);
    expect(withAll.currentBalance).toBe(expectedWalk({ '-5': PAYMENT, '-4': PAYMENT, '-3': PAYMENT, '-2': PAYMENT, '-1': PAYMENT })[0]);

    await loanPaymentService.deletePayment(payments[-2].id);

    const expected = expectedWalk({ '-5': PAYMENT, '-4': PAYMENT, '-3': PAYMENT, '-1': PAYMENT });
    const afterDelete = await balanceCalculationService.calculateBalance(loanId);
    expect(afterDelete.currentBalance).toBe(expected[0]);
    // The removed payment plus the interest it would have saved
    expect(afterDelete.currentBalance).toBeGreaterThan(withAll.currentBalance + PAYMENT);
  });

  test('backfilling a payment in an older month rebuilds every later month', async () => {
    await addPayments([-2, -1]);
    const beforeBackfill = await balanceCalculationService.calculateBalance(loanId);

    await addPayments([-4]);

    const expected = expectedWalk({ '-4': PAYMENT, '-2': PAYMENT, '-1': PAYMENT });
    for (let offset = -4; offset <= 0; offset++) {
      expect((await snapshotAt(offset)).remaining_balance).toBe(expected[offset]);
    }
    const afterBackfill = await balanceCalculationService.calculateBalance(loanId);
    expect(afterBackfill.currentBalance).toBe(expected[0]);
    expect(afterBackfill.currentBalance).toBeLessThan(beforeBackfill.currentBalance);
  });

  test('a manual snapshot is preserved and re-anchors later months', async () => {
    const payments = await addPayments([-5, -4, -3, -2, -1]);
    const anchor = ym(-3);
    await loanBalanceService.createOrUpdateBalance({
      loan_id: loanId, year: anchor.year, month: anchor.month, remaining_balance: 90000, rate: RATE
    });

    const paid = { '-5': PAYMENT, '-4': PAYMENT, '-3': PAYMENT, '-2': PAYMENT, '-1': PAYMENT };
    let expected = expectedWalk(paid, { '-3': 90000 });
    expect(await snapshotAt(-3)).toEqual(expect.objectContaining({ remaining_balance: 90000, source: 'manual' }));
    expect((await snapshotAt(-2)).remaining_balance).toBe(expected[-2]);
    expect((await balanceCalculationService.calculateBalance(loanId)).currentBalance).toBe(expected[0]);

    // Editing an earlier payment rebuilds up to the manual snapshot, which stays put
    await loanPaymentService.updatePayment(payments[-5].id, { amount: 4000, payment_date: dateAt(-5) });

    expected = expectedWalk({ ...paid, '-5': 4000 }, { '-3': 90000 });
    expect((await snapshotAt(-5)).remaining_balance).toBe(expected[-5]);
    expect((await snapshotAt(-4)).remaining_balance).toBe(expected[-4]);
    expect(await snapshotAt(-3)).toEqual(expect.objectContaining({ remaining_balance: 90000, source: 'manual' }));
    expect((await snapshotAt(-1)).remaining_balance).toBe(expected[-1]);
    expect((await balanceCalculationService.calculateBalance(loanId)).currentBalance).toBe(expected[0]);
  });

  test('rate update without a current-month row creates it at the calculated balance; a later payment that month is subtracted', async () => {
    // Manual anchor last month, written directly so no rebuild has created the current month
    const last = ym(-1);
    await loanBalanceRepository.create({
      loan_id: loanId, year: last.year, month: last.month, remaining_balance: 80000, rate: RATE, source: 'manual'
    });
    expect(await snapshotAt(0)).toBeNull();

    const row = await loanBalanceService.updateCurrentRate(loanId, 6);

    // The new rate applies from this month
    const expectedOpening = round(80000 + calculateMonthlyInterest(80000, 6, 'variable'));
    expect(row).toEqual(expect.objectContaining({ remaining_balance: expectedOpening, rate: 6, source: 'auto' }));
    expect((await balanceCalculationService.calculateBalance(loanId)).currentBalance).toBe(expectedOpening);

    await loanPaymentService.createPayment(loanId, { amount: 1000, payment_date: dateAt(0, 1) });

    const updated = await snapshotAt(0);
    expect(updated).toEqual(expect.objectContaining({ remaining_balance: round(expectedOpening - 1000), rate: 6, source: 'auto' }));
    expect((await balanceCalculationService.calculateBalance(loanId)).currentBalance).toBe(round(expectedOpening - 1000));
  });
});
