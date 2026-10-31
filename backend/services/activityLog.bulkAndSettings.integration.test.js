/**
 * Integration tests: activity log events for bulk and settings mutations that were
 * previously unlogged (month copies, place-name standardization, balance migration,
 * timezone setting). Real SQLite, mocked activityLogService.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db');
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const budgetService = require('./budgetService');
const allocationService = require('./allocationService');
const fixedExpenseService = require('./fixedExpenseService');
const placeNameService = require('./placeNameService');
const migrationService = require('./migrationService');
const settingsService = require('./settingsService');

let db;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});

const eventsOfType = (type) => activityLogService.logEvent.mock.calls.filter(([eventType]) => eventType === type);

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  for (const table of ['budgets', 'budget_allocations', 'fixed_expenses', 'expenses', 'loan_payments', 'loan_balances', 'loans']) {
    await run(`DELETE FROM ${table}`);
  }
  activityLogService.logEvent.mockClear();
});

describe('month copy events', () => {
  test('budgets_copied reports copied and overwritten counts with the tab id', async () => {
    await run('INSERT INTO budgets (year, month, category, "limit") VALUES (2091, 1, \'Groceries\', 500), (2091, 1, \'Gas\', 200)');
    await run('INSERT INTO budgets (year, month, category, "limit") VALUES (2091, 2, \'Gas\', 150)');

    await budgetService.copyBudgets(2091, 1, 2091, 2, true, 'tab-1');

    expect(eventsOfType('budgets_copied')).toEqual([[
      'budgets_copied',
      'budget',
      null,
      'Copied 2 budget(s) from 2091-01 to 2091-02 (1 overwritten)',
      { sourceMonth: '2091-01', targetMonth: '2091-02', copied: 1, overwritten: 1, skipped: 0, tabId: 'tab-1' }
    ]]);
  });

  test('budget_allocations_copied is logged, but a copy that changes nothing is not', async () => {
    await allocationService.createAllocation(2091, 3, { name: 'TFSA', amount: 100 });
    activityLogService.logEvent.mockClear();

    await allocationService.copyAllocations(2091, 3, 2091, 4, false, 'tab-2');
    await allocationService.copyAllocations(2091, 3, 2091, 4, false, 'tab-2');

    const events = eventsOfType('budget_allocations_copied');
    expect(events).toHaveLength(1);
    expect(events[0][1]).toBe('budget');
    expect(events[0][3]).toBe('Copied 1 allocation(s) from 2091-03 to 2091-04');
    expect(events[0][4]).toMatchObject({ copied: 1, overwritten: 0, skipped: 0, tabId: 'tab-2' });
  });

  test('fixed_expenses_copied is logged when fixed expenses are carried forward', async () => {
    await run("INSERT INTO fixed_expenses (year, month, name, amount, category) VALUES (2091, 5, 'Rent', 1500, 'Housing')");

    await fixedExpenseService.carryForwardFixedExpenses(2091, 6, 'tab-3');
    await fixedExpenseService.carryForwardFixedExpenses(2091, 8, 'tab-3');

    expect(eventsOfType('fixed_expenses_copied')).toEqual([[
      'fixed_expenses_copied',
      'fixed_expense',
      null,
      'Copied 1 fixed expense(s) from 2091-05 to 2091-06',
      { sourceMonth: '2091-05', targetMonth: '2091-06', copied: 1, overwritten: 0, skipped: 0, tabId: 'tab-3' }
    ]]);
  });
});

describe('place_names_standardized', () => {
  test('logs the renames on the expense entity so expense lists sync', async () => {
    await run("INSERT INTO expenses (date, place, amount, type, week, method) VALUES ('2091-01-05', 'COSTCO #123', 10, 'Groceries', 1, 'Cash'), ('2091-01-06', 'Costco Wholesale', 20, 'Groceries', 1, 'Cash')");

    await placeNameService.standardizePlaceNames([{ from: ['COSTCO #123', 'Costco Wholesale'], to: 'Costco' }], 'tab-4');

    const [[, entityType, entityId, userAction, metadata]] = eventsOfType('place_names_standardized');
    expect(entityType).toBe('expense');
    expect(entityId).toBeNull();
    expect(userAction).toBe('Standardized place names: 2 expense(s) updated across 1 name group(s)');
    expect(metadata).toMatchObject({ updatedCount: 2, tabId: 'tab-4' });
  });

  test('is not logged when nothing matched', async () => {
    await placeNameService.standardizePlaceNames([{ from: ['Nowhere'], to: 'Somewhere' }]);

    expect(eventsOfType('place_names_standardized')).toHaveLength(0);
  });
});

describe('loan_balances_migrated', () => {
  test('logs how many balance entries became payments', async () => {
    const loanId = await run("INSERT INTO loans (name, initial_balance, start_date, loan_type) VALUES ('Car Loan', 10000, '2090-01-01', 'loan')");
    await run('INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, 2090, 1, 10000, 5), (?, 2090, 2, 9500, 5), (?, 2090, 3, 9000, 5)', [loanId, loanId, loanId]);

    const result = await migrationService.migrateBalanceEntries(loanId, 'tab-5');

    const [[, entityType, entityId, userAction, metadata]] = eventsOfType('loan_balances_migrated');
    expect(entityType).toBe('loan_payment');
    expect(entityId).toBe(loanId);
    expect(userAction).toBe(`Migrated ${result.summary.totalConverted} balance entries to payments for Car Loan ($1000.00)`);
    expect(metadata).toMatchObject({ converted: result.summary.totalConverted, tabId: 'tab-5' });
  });
});

describe('business timezone setting', () => {
  test('logs settings_updated only when the timezone changes', async () => {
    await settingsService.updateBusinessTimezone('America/Vancouver');
    await settingsService.updateBusinessTimezone('America/Vancouver');

    const events = eventsOfType('settings_updated');
    expect(events).toHaveLength(1);
    expect(events[0][3]).toMatch(/^Updated business timezone: .+ → America\/Vancouver$/);
    expect(events[0][4]).toMatchObject({ setting: 'business_timezone', newValue: 'America/Vancouver' });
  });
});
