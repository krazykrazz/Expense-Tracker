const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const { getDatabase } = require('../database/db');

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

describe('ExpenseService transaction integration', () => {
  let db;

  async function cleanupTxExpenses() {
    const rows = await dbAll(db, "SELECT id FROM expenses WHERE place LIKE 'TX_ROLLBACK_%'");
    for (const row of rows) {
      try {
        await expenseService.deleteExpense(row.id);
      } catch (_) {
        // Fallback for partially-created rows in failed test paths.
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM expenses WHERE id = ?', [row.id], (err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
      }
    }
  }

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve) => db.close(resolve));
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupTxExpenses();
  });

  test('createExpense with future months rolls back inserted expenses and card balance on failure', async () => {
    const cardBefore = await dbGet(
      db,
      "SELECT id, current_balance FROM payment_methods WHERE display_name = 'Credit Card'"
    );
    expect(cardBefore).toBeTruthy();

    const originalCreate = expenseRepository.create.bind(expenseRepository);
    let createCalls = 0;

    jest.spyOn(expenseRepository, 'create').mockImplementation(async (expense, dbConnection = null) => {
      createCalls += 1;
      if (createCalls === 2) {
        throw new Error('Injected create failure');
      }
      return originalCreate(expense, dbConnection);
    });

    await expect(
      expenseService.createExpense(
        {
          date: '2026-05-10',
          place: 'TX_ROLLBACK_CARD_TEST',
          notes: 'transaction rollback verification',
          amount: 42.25,
          type: 'Groceries',
          method: 'Credit Card'
        },
        2
      )
    ).rejects.toThrow('Failed to create future expenses. Please try again.');

    const createdRows = await dbAll(
      db,
      "SELECT id FROM expenses WHERE place = 'TX_ROLLBACK_CARD_TEST'"
    );
    expect(createdRows).toHaveLength(0);

    const cardAfter = await dbGet(
      db,
      "SELECT current_balance FROM payment_methods WHERE id = ?",
      [cardBefore.id]
    );
    expect(cardAfter.current_balance).toBe(cardBefore.current_balance);
  });

  test('updateExpense with future months rolls back updated row and card balance on failure', async () => {
    const originalExpense = await expenseService.createExpense(
      {
        date: '2026-04-10',
        place: 'TX_ROLLBACK_UPDATE_ORIGINAL',
        notes: 'before update',
        amount: 20.0,
        type: 'Groceries',
        method: 'Credit Card'
      },
      0
    );

    const cardBefore = await dbGet(
      db,
      "SELECT id, current_balance FROM payment_methods WHERE display_name = 'Credit Card'"
    );
    expect(cardBefore).toBeTruthy();

    jest.spyOn(expenseRepository, 'create').mockImplementation(async (expense, dbConnection = null) => {
      throw new Error('Injected update-future create failure');
    });

    await expect(
      expenseService.updateExpense(
        originalExpense.id,
        {
          date: '2026-04-11',
          place: 'TX_ROLLBACK_UPDATE_CHANGED',
          notes: 'after update',
          amount: 55.0,
          type: 'Groceries',
          method: 'Credit Card'
        },
        2
      )
    ).rejects.toThrow('Failed to create future expenses. Please try again.');

    const reloaded = await expenseRepository.findById(originalExpense.id);
    expect(reloaded.place).toBe('TX_ROLLBACK_UPDATE_ORIGINAL');
    expect(reloaded.amount).toBe(20);
    expect(reloaded.date).toBe('2026-04-10');

    const changedRows = await dbAll(
      db,
      "SELECT id FROM expenses WHERE place = 'TX_ROLLBACK_UPDATE_CHANGED'"
    );
    expect(changedRows).toHaveLength(0);

    const cardAfter = await dbGet(
      db,
      "SELECT current_balance FROM payment_methods WHERE id = ?",
      [cardBefore.id]
    );
    expect(cardAfter.current_balance).toBe(cardBefore.current_balance);
  });
});
