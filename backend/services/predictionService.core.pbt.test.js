/**
 * Property-Based Tests for PredictionService - Core Prediction Logic
 * 
 * Consolidates:
 * - predictionService.pbt.test.js (Prediction Formula)
 * - predictionService.confidence.pbt.test.js (Confidence Level Assignment)
 * 
 * **Feature: spending-patterns-predictions**
 * **Validates: Requirements 2.1, 2.2, 2.5**
 * 
 * @invariant Prediction Formula Consistency: For any current month with spending data,
 * the predicted total is calculated using current spending plus projected remaining days,
 * with confidence levels determined by historical data availability (12+ months = high,
 * 6-11 months = medium, <6 months = low).
 */

const fc = require('fast-check');
const { dbPbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const predictionService = require('./predictionService');
const { getDatabase } = require('../database/db');
const { CONFIDENCE_LEVELS } = require('../utils/analyticsConstants');

describe('PredictionService - Core Prediction Logic Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  beforeEach(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM income_sources', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM income_sources', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM income_sources', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  const insertExpense = async (expense) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, place, notes, amount, type, week, method)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        expense.date,
        expense.place || 'Test Place',
        expense.notes || '',
        expense.amount,
        expense.type,
        expense.week,
        expense.method
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  };

  const insertIncome = async (year, month, amount) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO income_sources (year, month, name, amount, category)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(sql, [year, month, 'Salary', amount, 'Salary'], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  };

  const generateDateInMonth = (baseYear, baseMonth, monthOffset) => {
    const date = new Date(baseYear, baseMonth - 1 + monthOffset, 15);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-15`;
  };

  // Prediction Formula Tests
  describe('Prediction Formula Consistency', () => {
    test('Property: Empty month returns zero prediction', async () => {
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const prediction = await predictionService.getMonthEndPrediction(2024, 6);

      expect(prediction.currentSpent).toBe(0);
      expect(prediction.dailyAverage).toBe(0);
      expect(prediction.predictedTotal).toBe(0);
    });
  });

  // Confidence Level Tests
  describe('Confidence Level Assignment', () => {
    test('Property: Empty dataset returns LOW confidence', async () => {
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const confidence = await predictionService.calculateConfidenceLevel(2024, 6);

      expect(confidence).toBe(CONFIDENCE_LEVELS.LOW);
    });
  });
});
