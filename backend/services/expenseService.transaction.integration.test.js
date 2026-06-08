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
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM expenses WHERE place LIKE 'TX_ROLLBACK_%'", (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
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
});
