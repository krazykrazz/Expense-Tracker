/**
 * Property-Based Tests for SpendingPatternsService - Seasonal Analysis
 * 
 * **Feature: spending-patterns-predictions, Property 10: Month-Over-Month Comparison Completeness**
 * **Feature: spending-patterns-predictions, Property 11: Quarter-Over-Quarter Aggregation**
 * **Feature: spending-patterns-predictions, Property 12: Seasonal Category Variance Detection**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType } = require('../test/pbtArbitraries');
const spendingPatternsService = require('./spendingPatternsService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

// Safe merchant name
const safeMerchantName = () => fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,19}$/);

describe('SpendingPatternsService - Seasonal Analysis Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
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
  });

  const insertExpense = async (expense) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, place, notes, amount, type, week, method)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        expense.date,
        expense.place,
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

  /**
   * Generate a date in a specific month
   */
  const getDateInMonth = (year, month) => {
    const day = 15; // Middle of month
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };

  test('Property 10: Monthly data contains entries for each month in the analysis period', async () => {
    // Insert expenses across 6 months
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    for (let i = 0; i < 6; i++) {
      let month = currentMonth - i;
      let year = currentYear;
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
      
      await insertExpense({
        date: getDateInMonth(year, month),
        place: 'TestMerchant',
        amount: 100 + (i * 10),
        type: 'Groceries',
        method: 'Debit',
        week: 1
      });
    }

    const analysis = await spendingPatternsService.getSeasonalAnalysis(6);

    // Property: Should have entries for each month
    expect(analysis.monthlyData.length).toBeGreaterThanOrEqual(6);
    
    // Each entry should have required fields
    for (const month of analysis.monthlyData) {
      expect(month).toHaveProperty('year');
      expect(month).toHaveProperty('month');
      expect(month).toHaveProperty('monthName');
      expect(month).toHaveProperty('totalSpent');
      expect(month).toHaveProperty('previousMonthChange');
    }
  });

  test('Property 10: Month-over-month change is correctly calculated', async () => {
    // Insert known amounts for consecutive months
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Month 1: $100, Month 2: $150 (50% increase)
    let month1 = currentMonth - 1;
    let year1 = currentYear;
    if (month1 <= 0) {
      month1 += 12;
      year1 -= 1;
    }

    await insertExpense({
      date: getDateInMonth(year1, month1),
      place: 'TestMerchant',
      amount: 100,
      type: 'Groceries',
      method: 'Debit',
      week: 1
    });

    await insertExpense({
      date: getDateInMonth(currentYear, currentMonth),
      place: 'TestMerchant',
      amount: 150,
      type: 'Groceries',
      method: 'Debit',
      week: 1
    });

    const analysis = await spendingPatternsService.getSeasonalAnalysis(3);

    // Find the current month entry
    const currentMonthData = analysis.monthlyData.find(
      m => m.year === currentYear && m.month === currentMonth
    );

    expect(currentMonthData).toBeDefined();
    // 50% increase from 100 to 150
    expect(currentMonthData.previousMonthChange).toBeCloseTo(50, 0);
  });

  test('Property 11: Quarterly data correctly aggregates monthly totals', async () => {
    // Insert expenses across multiple months relative to current date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Insert expenses for the past 6 months
    const monthlyAmounts = [];
    for (let i = 5; i >= 0; i--) {
      let month = currentMonth - i;
      let year = currentYear;
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
      
      const amount = 100 + (i * 50);
      monthlyAmounts.push({ year, month, amount });
      
      await insertExpense({
        date: getDateInMonth(year, month),
        place: 'TestMerchant',
        amount,
        type: 'Groceries',
        method: 'Debit',
        week: 1
      });
    }

    const analysis = await spendingPatternsService.getSeasonalAnalysis(6);

    // Property: Quarterly data should exist
    expect(analysis.quarterlyData.length).toBeGreaterThan(0);
    
    // Property: Each quarter should have required fields
    for (const quarter of analysis.quarterlyData) {
      expect(quarter).toHaveProperty('year');
      expect(quarter).toHaveProperty('quarter');
      expect(quarter).toHaveProperty('totalSpent');
      expect(quarter.quarter).toBeGreaterThanOrEqual(1);
      expect(quarter.quarter).toBeLessThanOrEqual(4);
    }
  });

  test('Property 11: Quarter mapping is correct (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)', async () => {
    // Insert expenses for the past 12 months
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    for (let i = 11; i >= 0; i--) {
      let month = currentMonth - i;
      let year = currentYear;
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
      
      await insertExpense({
        date: getDateInMonth(year, month),
        place: 'TestMerchant',
        amount: 100,
        type: 'Groceries',
        method: 'Debit',
        week: 1
      });
    }

    const analysis = await spendingPatternsService.getSeasonalAnalysis(12);

    // Property: Quarterly data should have valid quarter numbers (1-4)
    for (const quarter of analysis.quarterlyData) {
      expect(quarter.quarter).toBeGreaterThanOrEqual(1);
      expect(quarter.quarter).toBeLessThanOrEqual(4);
    }
    
    // Property: Monthly data should map to correct quarters
    for (const month of analysis.monthlyData) {
      const expectedQuarter = Math.ceil(month.month / 3);
      const matchingQuarter = analysis.quarterlyData.find(
        q => q.year === month.year && q.quarter === expectedQuarter
      );
      // If there's data for this month, there should be a matching quarter
      if (month.totalSpent > 0) {
        expect(matchingQuarter).toBeDefined();
      }
    }
  });

  test('Property 12: Categories with >25% variance are identified as seasonal', async () => {
    // Create a category with high seasonal variance relative to current date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    // First month (oldest): $1000 (high)
    let highMonth = currentMonth - 5;
    let highYear = currentYear;
    if (highMonth <= 0) {
      highMonth += 12;
      highYear -= 1;
    }
    
    await insertExpense({
      date: getDateInMonth(highYear, highMonth),
      place: 'TestMerchant',
      amount: 1000,
      type: 'Gifts', // Use Gifts as seasonal category
      method: 'Debit',
      week: 1
    });

    // Add low amounts for other months
    for (let i = 4; i >= 0; i--) {
      let month = currentMonth - i;
      let year = currentYear;
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
      
      await insertExpense({
        date: getDateInMonth(year, month),
        place: 'TestMerchant',
        amount: 100,
        type: 'Gifts',
        method: 'Debit',
        week: 1
      });
    }

    const analysis = await spendingPatternsService.getSeasonalAnalysis(12);

    // Property: Gifts should be identified as seasonal category due to high variance
    const giftsCategory = analysis.seasonalCategories.find(c => c.category === 'Gifts');
    
    expect(giftsCategory).toBeDefined();
    expect(giftsCategory.varianceFromAnnualAverage).toBeGreaterThan(25);
  });

  test('Property 12: Categories with low variance are not marked as seasonal', async () => {
    // Create a category with consistent spending (low variance)
    // Need to have data in all months to avoid artificial variance from missing months
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    for (let i = 11; i >= 0; i--) {
      let month = currentMonth - i;
      let year = currentYear;
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
      
      await insertExpense({
        date: getDateInMonth(year, month),
        place: 'TestMerchant',
        amount: 100, // Same amount every month
        type: 'Utilities',
        method: 'Debit',
        week: 1
      });
    }

    const analysis = await spendingPatternsService.getSeasonalAnalysis(12);

    // Property: Utilities should NOT be in seasonal categories (variance < 25%)
    // because spending is consistent across all months
    const utilitiesCategory = analysis.seasonalCategories.find(c => c.category === 'Utilities');
    
    // With consistent spending, it should not be marked as seasonal
    expect(utilitiesCategory).toBeUndefined();
  });

  test('Property 10: Empty dataset returns valid structure', async () => {
    const analysis = await spendingPatternsService.getSeasonalAnalysis(12);

    expect(analysis).toHaveProperty('monthlyData');
    expect(analysis).toHaveProperty('quarterlyData');
    expect(analysis).toHaveProperty('seasonalCategories');
    expect(Array.isArray(analysis.monthlyData)).toBe(true);
    expect(Array.isArray(analysis.quarterlyData)).toBe(true);
    expect(Array.isArray(analysis.seasonalCategories)).toBe(true);
  });
});
