const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanService = require('./loanService');

// Mock the dependencies
jest.mock('../repositories/expenseRepository');
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('./loanService');

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

      const result = await expenseService.getSummary(2024, 6, true);

      // Verify previous month data exists but with zero/null values
      expect(result).toHaveProperty('previous');
      expect(result.previous.total).toBe(0);
      expect(result.previous.monthlyGross).toBe(0); // Should default to 0 when null
      expect(result.previous.totalFixedExpenses).toBe(0); // Should default to 0 when null
    });
  });
});
