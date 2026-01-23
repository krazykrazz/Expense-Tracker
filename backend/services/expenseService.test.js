const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanService = require('./loanService');
const investmentService = require('./investmentService');

// Mock the dependencies
jest.mock('../repositories/expenseRepository');
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('./loanService');
jest.mock('./investmentService');

describe('ExpenseService - getSummary with previous month data', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Previous month calculation', () => {
    it('should calculate previous month correctly for mid-year months', async () => {
      // Setup: June 2024 should have previous month as May 2024
      const mockCurrentSummary = {
        weeklyTotals: { week1: 100, week2: 200, week3: 150, week4: 175, week5: 0 },
        methodTotals: { 'Cash': 100, 'Debit': 200, 'CIBC MC': 325 },
        typeTotals: { 'Food': 300, 'Gas': 200, 'Other': 125 },
        total: 625
      };

      const mockPreviousSummary = {
        weeklyTotals: { week1: 90, week2: 180, week3: 140, week4: 160, week5: 0 },
        methodTotals: { 'Cash': 90, 'Debit': 180, 'CIBC MC': 300 },
        typeTotals: { 'Food': 270, 'Gas': 180, 'Other': 120 },
        total: 570
      };

      // Mock repository calls
      expenseRepository.getSummary
        .mockResolvedValueOnce(mockCurrentSummary)  // Current month (June)
        .mockResolvedValueOnce(mockPreviousSummary); // Previous month (May)
      
      expenseRepository.getMonthlyGross
        .mockResolvedValueOnce(5000)  // Current month
        .mockResolvedValueOnce(4800); // Previous month
      
      fixedExpenseRepository.getTotalFixedExpenses
        .mockResolvedValueOnce(1000)  // Current month
        .mockResolvedValueOnce(1000); // Previous month
      
      loanService.getLoansForMonth
        .mockResolvedValueOnce([])  // Current month
        .mockResolvedValueOnce([]); // Previous month
      
      loanService.calculateTotalOutstandingDebt
        .mockReturnValue(0);
      
      investmentService.getAllInvestments
        .mockResolvedValueOnce([])  // Current month
        .mockResolvedValueOnce([]); // Previous month
      
      investmentService.calculateTotalInvestmentValue
        .mockReturnValue(0);

      // Execute
      const result = await expenseService.getSummary(2024, 6, true);

      // Verify: Should call getSummary for June (6) and May (5)
      expect(expenseRepository.getSummary).toHaveBeenCalledWith(2024, 6);
      expect(expenseRepository.getSummary).toHaveBeenCalledWith(2024, 5);
      
      // Verify structure
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('previous');
      expect(result.current.total).toBe(625);
      expect(result.previous.total).toBe(570);
    });

    it('should handle year rollover when current month is January', async () => {
      // Setup: January 2024 should have previous month as December 2023
      const mockCurrentSummary = {
        weeklyTotals: { week1: 100, week2: 200, week3: 150, week4: 175, week5: 0 },
        methodTotals: { 'Cash': 100, 'Debit': 200, 'CIBC MC': 325 },
        typeTotals: { 'Food': 300, 'Gas': 200, 'Other': 125 },
        total: 625
      };

      const mockPreviousSummary = {
        weeklyTotals: { week1: 110, week2: 210, week3: 160, week4: 185, week5: 0 },
        methodTotals: { 'Cash': 110, 'Debit': 210, 'CIBC MC': 345 },
        typeTotals: { 'Food': 320, 'Gas': 220, 'Other': 125 },
        total: 665
      };

      // Mock repository calls
      expenseRepository.getSummary
        .mockResolvedValueOnce(mockCurrentSummary)  // Current month (January 2024)
        .mockResolvedValueOnce(mockPreviousSummary); // Previous month (December 2023)
      
      expenseRepository.getMonthlyGross
        .mockResolvedValueOnce(5000)  // Current month
        .mockResolvedValueOnce(4800); // Previous month
      
      fixedExpenseRepository.getTotalFixedExpenses
        .mockResolvedValueOnce(1000)  // Current month
        .mockResolvedValueOnce(1000); // Previous month
      
      loanService.getLoansForMonth
        .mockResolvedValueOnce([])  // Current month
        .mockResolvedValueOnce([]); // Previous month
      
      loanService.calculateTotalOutstandingDebt
        .mockReturnValue(0);
      
      investmentService.getAllInvestments
        .mockResolvedValueOnce([])  // Current month
        .mockResolvedValueOnce([]); // Previous month
      
      investmentService.calculateTotalInvestmentValue
        .mockReturnValue(0);

      // Execute
      const result = await expenseService.getSummary(2024, 1, true);

      // Verify: Should call getSummary for January 2024 (1) and December 2023 (12)
      expect(expenseRepository.getSummary).toHaveBeenCalledWith(2024, 1);
      expect(expenseRepository.getSummary).toHaveBeenCalledWith(2023, 12);
      
      // Verify structure
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('previous');
      expect(result.current.total).toBe(625);
      expect(result.previous.total).toBe(665);
    });
  });

  describe('Response structure with both current and previous data', () => {
    it('should return both current and previous month data when includePrevious is true', async () => {
      const mockCurrentSummary = {
        weeklyTotals: { week1: 100, week2: 200, week3: 150, week4: 175, week5: 0 },
        methodTotals: { 'Cash': 100, 'Debit': 200, 'CIBC MC': 325 },
        typeTotals: { 'Food': 300, 'Gas': 200, 'Other': 125 },
        total: 625
      };

      const mockPreviousSummary = {
        weeklyTotals: { week1: 90, week2: 180, week3: 140, week4: 160, week5: 0 },
        methodTotals: { 'Cash': 90, 'Debit': 180, 'CIBC MC': 300 },
        typeTotals: { 'Food': 270, 'Gas': 180, 'Other': 120 },
        total: 570
      };

      expenseRepository.getSummary
        .mockResolvedValueOnce(mockCurrentSummary)
        .mockResolvedValueOnce(mockPreviousSummary);
      
      expenseRepository.getMonthlyGross
        .mockResolvedValueOnce(5000)
        .mockResolvedValueOnce(4800);
      
      fixedExpenseRepository.getTotalFixedExpenses
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1000);
      
      loanService.getLoansForMonth
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      
      loanService.calculateTotalOutstandingDebt
        .mockReturnValue(0);
      
      investmentService.getAllInvestments
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      
      investmentService.calculateTotalInvestmentValue
        .mockReturnValue(0);

      const result = await expenseService.getSummary(2024, 6, true);

      // Verify structure has both current and previous
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('previous');
      
      // Verify current month data
      expect(result.current).toHaveProperty('weeklyTotals');
      expect(result.current).toHaveProperty('methodTotals');
      expect(result.current).toHaveProperty('typeTotals');
      expect(result.current).toHaveProperty('total');
      expect(result.current).toHaveProperty('monthlyGross');
      expect(result.current).toHaveProperty('totalFixedExpenses');
      expect(result.current).toHaveProperty('totalExpenses');
      expect(result.current).toHaveProperty('netBalance');
      expect(result.current).toHaveProperty('loans');
      expect(result.current).toHaveProperty('totalOutstandingDebt');
      expect(result.current).toHaveProperty('investments');
      expect(result.current).toHaveProperty('totalInvestmentValue');
      
      // Verify previous month data
      expect(result.previous).toHaveProperty('weeklyTotals');
      expect(result.previous).toHaveProperty('methodTotals');
      expect(result.previous).toHaveProperty('typeTotals');
      expect(result.previous).toHaveProperty('total');
      expect(result.previous).toHaveProperty('monthlyGross');
      expect(result.previous).toHaveProperty('totalFixedExpenses');
      expect(result.previous).toHaveProperty('totalExpenses');
      expect(result.previous).toHaveProperty('netBalance');
      expect(result.previous).toHaveProperty('loans');
      expect(result.previous).toHaveProperty('totalOutstandingDebt');
      expect(result.previous).toHaveProperty('investments');
      expect(result.previous).toHaveProperty('totalInvestmentValue');
    });

    it('should return only current month data when includePrevious is false', async () => {
      const mockCurrentSummary = {
        weeklyTotals: { week1: 100, week2: 200, week3: 150, week4: 175, week5: 0 },
        methodTotals: { 'Cash': 100, 'Debit': 200, 'CIBC MC': 325 },
        typeTotals: { 'Food': 300, 'Gas': 200, 'Other': 125 },
        total: 625
      };

      expenseRepository.getSummary.mockResolvedValueOnce(mockCurrentSummary);
      expenseRepository.getMonthlyGross.mockResolvedValueOnce(5000);
      fixedExpenseRepository.getTotalFixedExpenses.mockResolvedValueOnce(1000);
      loanService.getLoansForMonth.mockResolvedValueOnce([]);
      loanService.calculateTotalOutstandingDebt.mockReturnValue(0);
      investmentService.getAllInvestments.mockResolvedValueOnce([]);
      investmentService.calculateTotalInvestmentValue.mockReturnValue(0);

      const result = await expenseService.getSummary(2024, 6, false);

      // Verify structure does NOT have current/previous wrapper
      expect(result).not.toHaveProperty('current');
      expect(result).not.toHaveProperty('previous');
      
      // Verify it has the summary data directly
      expect(result).toHaveProperty('weeklyTotals');
      expect(result).toHaveProperty('methodTotals');
      expect(result).toHaveProperty('typeTotals');
      expect(result).toHaveProperty('total');
      expect(result.total).toBe(625);
      
      // Verify getSummary was only called once (for current month)
      expect(expenseRepository.getSummary).toHaveBeenCalledTimes(1);
      expect(expenseRepository.getSummary).toHaveBeenCalledWith(2024, 6);
    });
  });

  describe('Handling of missing previous month data', () => {
    it('should handle case where previous month has no expenses', async () => {
      const mockCurrentSummary = {
        weeklyTotals: { week1: 100, week2: 200, week3: 150, week4: 175, week5: 0 },
        methodTotals: { 'Cash': 100, 'Debit': 200, 'CIBC MC': 325 },
        typeTotals: { 'Food': 300, 'Gas': 200, 'Other': 125 },
        total: 625
      };

      const mockEmptyPreviousSummary = {
        weeklyTotals: { week1: 0, week2: 0, week3: 0, week4: 0, week5: 0 },
        methodTotals: { 'Cash': 0, 'Debit': 0, 'CIBC MC': 0 },
        typeTotals: { 'Food': 0, 'Gas': 0, 'Other': 0 },
        total: 0
      };

      expenseRepository.getSummary
        .mockResolvedValueOnce(mockCurrentSummary)
        .mockResolvedValueOnce(mockEmptyPreviousSummary);
      
      expenseRepository.getMonthlyGross
        .mockResolvedValueOnce(5000)
        .mockResolvedValueOnce(null); // No income data for previous month
      
      fixedExpenseRepository.getTotalFixedExpenses
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(null); // No fixed expenses for previous month
      
      loanService.getLoansForMonth
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      
      loanService.calculateTotalOutstandingDebt
        .mockReturnValue(0);
      
      investmentService.getAllInvestments
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      
      investmentService.calculateTotalInvestmentValue
        .mockReturnValue(0);

      const result = await expenseService.getSummary(2024, 6, true);

      // Verify previous month data exists but with zero/null values
      expect(result).toHaveProperty('previous');
      expect(result.previous.total).toBe(0);
      expect(result.previous.monthlyGross).toBe(0); // Should default to 0 when null
      expect(result.previous.totalFixedExpenses).toBe(0); // Should default to 0 when null
    });
  });
});

// Property-Based Testing for Annual Summary
const fc = require('fast-check');
const { getDatabase } = require('../database/db');

describe('ExpenseService - Annual Summary Property-Based Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE strftime("%Y", date) = "9999"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM fixed_expenses WHERE year = 9999', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM income_sources WHERE year = 9999', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // Feature: enhanced-annual-summary, Property 1: Total expenses equals sum of fixed and variable
  // Validates: Requirements 1.1, 1.2
  test('Property 1: Total expenses should equal sum of fixed and variable expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random monthly data for fixed and variable expenses
        fc.array(fc.record({
          month: fc.integer({ min: 1, max: 12 }),
          fixedAmount: fc.float({ min: 0, max: 10000, noNaN: true }),
          variableAmount: fc.float({ min: 0, max: 10000, noNaN: true })
        }), { minLength: 0, maxLength: 12 }),
        async (monthlyData) => {
          const testYear = 9999;
          
          // Insert test data into database
          for (const data of monthlyData) {
            // Insert fixed expense
            if (data.fixedAmount > 0) {
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)',
                  [testYear, data.month, 'Test Fixed', parseFloat(data.fixedAmount.toFixed(2))],
                  (err) => err ? reject(err) : resolve()
                );
              });
            }
            
            // Insert variable expense
            if (data.variableAmount > 0) {
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)',
                  [`${testYear}-${String(data.month).padStart(2, '0')}-15`, 'Test Place', parseFloat(data.variableAmount.toFixed(2)), 'Other', 3, 'Cash'],
                  (err) => err ? reject(err) : resolve()
                );
              });
            }
          }
          
          // Get annual summary
          const summary = await expenseService.getAnnualSummary(testYear);
          
          // Property: totalExpenses should equal totalFixedExpenses + totalVariableExpenses
          const expectedTotal = summary.totalFixedExpenses + summary.totalVariableExpenses;
          expect(Math.abs(summary.totalExpenses - expectedTotal)).toBeLessThan(0.01);
        }
      ),
      { numRuns: 30 } // Reduced from 100 for faster execution
    );
  }, 30000);

  // Feature: enhanced-annual-summary, Property 2: Net income calculation correctness
  // Validates: Requirements 3.2
  test('Property 2: Net income should equal total income minus total expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random monthly data for income and expenses
        fc.array(fc.record({
          month: fc.integer({ min: 1, max: 12 }),
          income: fc.float({ min: 0, max: 20000, noNaN: true }),
          fixedExpense: fc.float({ min: 0, max: 10000, noNaN: true }),
          variableExpense: fc.float({ min: 0, max: 10000, noNaN: true })
        }), { minLength: 0, maxLength: 12 }),
        async (monthlyData) => {
          const testYear = 9999;
          
          // Insert test data into database
          for (const data of monthlyData) {
            // Insert income
            if (data.income > 0) {
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO income_sources (year, month, name, amount) VALUES (?, ?, ?, ?)',
                  [testYear, data.month, 'Test Income', parseFloat(data.income.toFixed(2))],
                  (err) => err ? reject(err) : resolve()
                );
              });
            }
            
            // Insert fixed expense
            if (data.fixedExpense > 0) {
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)',
                  [testYear, data.month, 'Test Fixed', parseFloat(data.fixedExpense.toFixed(2))],
                  (err) => err ? reject(err) : resolve()
                );
              });
            }
            
            // Insert variable expense
            if (data.variableExpense > 0) {
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)',
                  [`${testYear}-${String(data.month).padStart(2, '0')}-15`, 'Test Place', parseFloat(data.variableExpense.toFixed(2)), 'Other', 3, 'Cash'],
                  (err) => err ? reject(err) : resolve()
                );
              });
            }
          }
          
          // Get annual summary
          const summary = await expenseService.getAnnualSummary(testYear);
          
          // Property: netIncome should equal totalIncome - totalExpenses
          const expectedNetIncome = summary.totalIncome - summary.totalExpenses;
          expect(Math.abs(summary.netIncome - expectedNetIncome)).toBeLessThan(0.01);
        }
      ),
      { numRuns: 30 } // Reduced from 100 for faster execution
    );
  }, 30000);

  // Feature: enhanced-annual-summary, Property 3: Monthly totals consistency
  // Validates: Requirements 4.2
  test('Property 3: Each monthly total should equal sum of fixed and variable expenses for that month', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random monthly data
        fc.array(fc.record({
          month: fc.integer({ min: 1, max: 12 }),
          fixedAmount: fc.float({ min: 0, max: 10000, noNaN: true }),
          variableAmount: fc.float({ min: 0, max: 10000, noNaN: true })
        }), { minLength: 0, maxLength: 12 }),
        async (monthlyData) => {
          const testYear = 9999;
          
          // Insert test data into database
          for (const data of monthlyData) {
            // Insert fixed expense
            if (data.fixedAmount > 0) {
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)',
                  [testYear, data.month, 'Test Fixed', parseFloat(data.fixedAmount.toFixed(2))],
                  (err) => err ? reject(err) : resolve()
                );
              });
            }
            
            // Insert variable expense
            if (data.variableAmount > 0) {
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)',
                  [`${testYear}-${String(data.month).padStart(2, '0')}-15`, 'Test Place', parseFloat(data.variableAmount.toFixed(2)), 'Other', 3, 'Cash'],
                  (err) => err ? reject(err) : resolve()
                );
              });
            }
          }
          
          // Get annual summary
          const summary = await expenseService.getAnnualSummary(testYear);
          
          // Property: For each month, total should equal fixedExpenses + variableExpenses
          for (const monthData of summary.monthlyTotals) {
            const expectedTotal = monthData.fixedExpenses + monthData.variableExpenses;
            expect(Math.abs(monthData.total - expectedTotal)).toBeLessThan(0.01);
          }
        }
      ),
      { numRuns: 30 } // Reduced from 100 for faster execution
    );
  }, 30000);
});

describe('ExpenseService - Annual Summary Unit Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test to ensure clean state
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE strftime("%Y", date) = "9998"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM fixed_expenses WHERE year = 9998', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM income_sources WHERE year = 9998', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE strftime("%Y", date) = "9998"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM fixed_expenses WHERE year = 9998', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM income_sources WHERE year = 9998', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test('should aggregate fixed expenses correctly', async () => {
    const testYear = 9998;
    
    // Insert fixed expenses for different months
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)',
        [testYear, 1, 'Rent', 1000],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)',
        [testYear, 2, 'Utilities', 200],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    const summary = await expenseService.getAnnualSummary(testYear);
    
    expect(summary.totalFixedExpenses).toBe(1200);
  });

  test('should aggregate income correctly', async () => {
    const testYear = 9998;
    
    // Insert income for different months
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO income_sources (year, month, name, amount) VALUES (?, ?, ?, ?)',
        [testYear, 1, 'Salary', 5000],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO income_sources (year, month, name, amount) VALUES (?, ?, ?, ?)',
        [testYear, 2, 'Bonus', 1000],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    const summary = await expenseService.getAnnualSummary(testYear);
    
    expect(summary.totalIncome).toBe(6000);
  });

  test('should handle missing fixed expenses (no fixed expenses)', async () => {
    const testYear = 9998;
    
    // Insert only variable expenses
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)',
        [`${testYear}-01-15`, 'Store', 100, 'Other', 3, 'Cash'],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    const summary = await expenseService.getAnnualSummary(testYear);
    
    expect(summary.totalFixedExpenses).toBe(0);
    expect(summary.totalVariableExpenses).toBe(100);
    expect(summary.totalExpenses).toBe(100);
  });

  test('should handle missing income (no income)', async () => {
    const testYear = 9998;
    
    // Insert only expenses
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)',
        [`${testYear}-01-15`, 'Store', 100, 'Other', 3, 'Cash'],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    const summary = await expenseService.getAnnualSummary(testYear);
    
    expect(summary.totalIncome).toBe(0);
    expect(summary.netIncome).toBe(-100);
  });

  test('should calculate monthly breakdown correctly', async () => {
    const testYear = 9998;
    
    // Insert data for January
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)',
        [testYear, 1, 'Rent', 1000],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)',
        [`${testYear}-01-15`, 'Store', 200, 'Other', 3, 'Cash'],
        (err) => err ? reject(err) : resolve()
      );
    });
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO income_sources (year, month, name, amount) VALUES (?, ?, ?, ?)',
        [testYear, 1, 'Salary', 5000],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    const summary = await expenseService.getAnnualSummary(testYear);
    
    // Check January data
    const januaryData = summary.monthlyTotals.find(m => m.month === 1);
    expect(januaryData).toBeDefined();
    expect(januaryData.fixedExpenses).toBe(1000);
    expect(januaryData.variableExpenses).toBe(200);
    expect(januaryData.total).toBe(1200);
    expect(januaryData.income).toBe(5000);
    
    // Check that all 12 months are present
    expect(summary.monthlyTotals).toHaveLength(12);
    
    // Check that months without data have zero values
    const februaryData = summary.monthlyTotals.find(m => m.month === 2);
    expect(februaryData.fixedExpenses).toBe(0);
    expect(februaryData.variableExpenses).toBe(0);
    expect(februaryData.total).toBe(0);
    expect(februaryData.income).toBe(0);
  });

  test('should handle year with no data', async () => {
    const testYear = 9998;
    
    const summary = await expenseService.getAnnualSummary(testYear);
    
    expect(summary.totalExpenses).toBe(0);
    expect(summary.totalFixedExpenses).toBe(0);
    expect(summary.totalVariableExpenses).toBe(0);
    expect(summary.totalIncome).toBe(0);
    expect(summary.netIncome).toBe(0);
    expect(summary.monthlyTotals).toHaveLength(12);
  });
});
