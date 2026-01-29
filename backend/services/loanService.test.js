/**
 * Tests for LoanService
 * Tests business logic for loan management
 */

const { getDatabase } = require('../database/db');
const loanService = require('./loanService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');

describe('LoanService', () => {
  let db;
  const createdLoanIds = [];

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up created loans
    for (const id of createdLoanIds) {
      try {
        await loanRepository.delete(id);
      } catch (e) {
        // Ignore errors
      }
    }
    createdLoanIds.length = 0;
  });

  describe('validateLoan', () => {
    test('should accept valid loan data', () => {
      const validLoan = {
        name: 'Valid Loan',
        initial_balance: 10000,
        start_date: '2024-01-15'
      };

      expect(() => loanService.validateLoan(validLoan)).not.toThrow();
    });

    test('should reject empty name', () => {
      const invalidLoan = {
        name: '',
        initial_balance: 10000,
        start_date: '2024-01-15'
      };

      expect(() => loanService.validateLoan(invalidLoan)).toThrow();
    });

    test('should reject name exceeding 100 characters', () => {
      const invalidLoan = {
        name: 'A'.repeat(101),
        initial_balance: 10000,
        start_date: '2024-01-15'
      };

      expect(() => loanService.validateLoan(invalidLoan)).toThrow();
    });

    test('should reject negative initial balance', () => {
      const invalidLoan = {
        name: 'Test Loan',
        initial_balance: -1000,
        start_date: '2024-01-15'
      };

      expect(() => loanService.validateLoan(invalidLoan)).toThrow();
    });

    test('should reject invalid date format', () => {
      const invalidLoan = {
        name: 'Test Loan',
        initial_balance: 10000,
        start_date: '01-15-2024' // Wrong format
      };

      expect(() => loanService.validateLoan(invalidLoan)).toThrow('Start date must be in YYYY-MM-DD format');
    });

    test('should reject invalid date', () => {
      const invalidLoan = {
        name: 'Test Loan',
        initial_balance: 10000,
        start_date: '2024-13-45' // Invalid month/day
      };

      expect(() => loanService.validateLoan(invalidLoan)).toThrow();
    });

    test('should reject invalid loan type', () => {
      const invalidLoan = {
        name: 'Test Loan',
        initial_balance: 10000,
        start_date: '2024-01-15',
        loan_type: 'invalid_type'
      };

      expect(() => loanService.validateLoan(invalidLoan)).toThrow('Loan type must be "loan", "line_of_credit", or "mortgage"');
    });

    test('should accept valid loan types', () => {
      const loanType = {
        name: 'Test Loan',
        initial_balance: 10000,
        start_date: '2024-01-15',
        loan_type: 'loan'
      };

      const locType = {
        name: 'Test LOC',
        initial_balance: 10000,
        start_date: '2024-01-15',
        loan_type: 'line_of_credit'
      };

      const mortgageType = {
        name: 'Test Mortgage',
        initial_balance: 10000,
        start_date: '2024-01-15',
        loan_type: 'mortgage'
      };

      expect(() => loanService.validateLoan(loanType)).not.toThrow();
      expect(() => loanService.validateLoan(locType)).not.toThrow();
      expect(() => loanService.validateLoan(mortgageType)).not.toThrow();
    });

    test('should reject negative estimated_months_left', () => {
      const invalidLoan = {
        name: 'Test Loan',
        initial_balance: 10000,
        start_date: '2024-01-15',
        estimated_months_left: -5
      };

      expect(() => loanService.validateLoan(invalidLoan)).toThrow();
    });

    test('should reject non-integer estimated_months_left', () => {
      const invalidLoan = {
        name: 'Test Loan',
        initial_balance: 10000,
        start_date: '2024-01-15',
        estimated_months_left: 12.5
      };

      expect(() => loanService.validateLoan(invalidLoan)).toThrow('Estimated months left must be a whole number');
    });

    test('should accept valid estimated_months_left', () => {
      const validLoan = {
        name: 'Test Loan',
        initial_balance: 10000,
        start_date: '2024-01-15',
        estimated_months_left: 24
      };

      expect(() => loanService.validateLoan(validLoan)).not.toThrow();
    });
  });

  describe('createLoan', () => {
    test('should create a loan with trimmed name', async () => {
      const loanData = {
        name: '  Test Loan  ',
        initial_balance: 10000,
        start_date: '2024-01-15'
      };

      const created = await loanService.createLoan(loanData);
      createdLoanIds.push(created.id);

      expect(created.name).toBe('Test Loan');
    });

    test('should create a loan with default loan_type', async () => {
      const loanData = {
        name: 'Default Type Loan',
        initial_balance: 10000,
        start_date: '2024-01-15'
      };

      const created = await loanService.createLoan(loanData);
      createdLoanIds.push(created.id);

      expect(created.loan_type).toBe('loan');
    });

    test('should create a loan with notes trimmed', async () => {
      const loanData = {
        name: 'Notes Loan',
        initial_balance: 10000,
        start_date: '2024-01-15',
        notes: '  Some notes  '
      };

      const created = await loanService.createLoan(loanData);
      createdLoanIds.push(created.id);

      expect(created.notes).toBe('Some notes');
    });

    test('should set is_paid_off to 0 by default', async () => {
      const loanData = {
        name: 'Active Loan',
        initial_balance: 10000,
        start_date: '2024-01-15'
      };

      const created = await loanService.createLoan(loanData);
      createdLoanIds.push(created.id);

      expect(created.is_paid_off).toBe(0);
    });
  });

  describe('updateLoan', () => {
    test('should update loan fields', async () => {
      const created = await loanService.createLoan({
        name: 'Original Loan',
        initial_balance: 10000,
        start_date: '2024-01-15'
      });
      createdLoanIds.push(created.id);

      const updated = await loanService.updateLoan(created.id, {
        name: 'Updated Loan',
        initial_balance: 12000,
        start_date: '2024-02-01',
        loan_type: 'line_of_credit'
      });

      expect(updated.name).toBe('Updated Loan');
      expect(updated.initial_balance).toBe(12000);
      expect(updated.loan_type).toBe('line_of_credit');
    });

    test('should return null for non-existent loan', async () => {
      const updated = await loanService.updateLoan(99999, {
        name: 'Ghost Loan',
        initial_balance: 5000,
        start_date: '2024-01-01'
      });

      expect(updated).toBeNull();
    });
  });

  describe('deleteLoan', () => {
    test('should delete existing loan', async () => {
      const created = await loanService.createLoan({
        name: 'Delete Me',
        initial_balance: 5000,
        start_date: '2024-01-15'
      });

      const deleted = await loanService.deleteLoan(created.id);

      expect(deleted).toBe(true);
    });

    test('should return false for non-existent loan', async () => {
      const deleted = await loanService.deleteLoan(99999);
      expect(deleted).toBe(false);
    });
  });

  describe('markPaidOff', () => {
    test('should mark loan as paid off and return updated loan', async () => {
      const created = await loanService.createLoan({
        name: 'Pay Off Loan',
        initial_balance: 5000,
        start_date: '2024-01-15'
      });
      createdLoanIds.push(created.id);

      const updated = await loanService.markPaidOff(created.id, true);

      expect(updated).toBeDefined();
      expect(updated.is_paid_off).toBe(1);
    });

    test('should reactivate a paid off loan', async () => {
      const created = await loanService.createLoan({
        name: 'Reactivate Loan',
        initial_balance: 5000,
        start_date: '2024-01-15'
      });
      createdLoanIds.push(created.id);

      // Mark as paid off
      await loanService.markPaidOff(created.id, true);

      // Reactivate
      const updated = await loanService.markPaidOff(created.id, false);

      expect(updated.is_paid_off).toBe(0);
    });

    test('should return null for non-existent loan', async () => {
      const updated = await loanService.markPaidOff(99999, true);
      expect(updated).toBeNull();
    });
  });

  describe('getCurrentRate', () => {
    test('should return rate from most recent balance entry', async () => {
      const created = await loanService.createLoan({
        name: 'Rate Test Loan',
        initial_balance: 10000,
        start_date: '2024-01-15'
      });
      createdLoanIds.push(created.id);

      await loanBalanceRepository.create({
        loan_id: created.id,
        year: 2024,
        month: 1,
        remaining_balance: 9500,
        rate: 5.0
      });
      await loanBalanceRepository.create({
        loan_id: created.id,
        year: 2024,
        month: 2,
        remaining_balance: 9000,
        rate: 5.25
      });

      const rate = await loanService.getCurrentRate(created.id);

      expect(rate).toBe(5.25);
    });

    test('should return 0 when no balance entries exist', async () => {
      const created = await loanService.createLoan({
        name: 'No Balance Loan',
        initial_balance: 10000,
        start_date: '2024-01-15'
      });
      createdLoanIds.push(created.id);

      const rate = await loanService.getCurrentRate(created.id);

      expect(rate).toBe(0);
    });
  });

  describe('getAllLoans', () => {
    test('should return loans with isPaidOff boolean', async () => {
      const activeLoan = await loanService.createLoan({
        name: 'Active Loan',
        initial_balance: 10000,
        start_date: '2024-01-15'
      });
      createdLoanIds.push(activeLoan.id);

      const loans = await loanService.getAllLoans();

      const testLoan = loans.find(l => l.id === activeLoan.id);
      expect(testLoan).toBeDefined();
      expect(testLoan.isPaidOff).toBe(false);
    });

    test('should include currentBalance and currentRate', async () => {
      const created = await loanService.createLoan({
        name: 'Balance Rate Loan',
        initial_balance: 10000,
        start_date: '2024-01-15'
      });
      createdLoanIds.push(created.id);

      await loanBalanceRepository.create({
        loan_id: created.id,
        year: 2024,
        month: 3,
        remaining_balance: 8500,
        rate: 6.0
      });

      const loans = await loanService.getAllLoans();

      const testLoan = loans.find(l => l.id === created.id);
      expect(testLoan.currentBalance).toBe(8500);
      expect(testLoan.currentRate).toBe(6.0);
    });
  });

  describe('getLoansForMonth', () => {
    test('should filter out paid off loans', async () => {
      const activeLoan = await loanService.createLoan({
        name: 'Active Monthly Loan',
        initial_balance: 10000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(activeLoan.id);

      const paidOffLoan = await loanService.createLoan({
        name: 'Paid Off Monthly Loan',
        initial_balance: 5000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(paidOffLoan.id);

      // Mark one as paid off
      await loanService.markPaidOff(paidOffLoan.id, true);

      const loans = await loanService.getLoansForMonth(2024, 6);

      expect(loans.some(l => l.id === activeLoan.id)).toBe(true);
      expect(loans.some(l => l.id === paidOffLoan.id)).toBe(false);
    });

    test('should return loans with isPaidOff set to false', async () => {
      const created = await loanService.createLoan({
        name: 'Monthly Test Loan',
        initial_balance: 10000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(created.id);

      const loans = await loanService.getLoansForMonth(2024, 6);

      const testLoan = loans.find(l => l.id === created.id);
      expect(testLoan).toBeDefined();
      expect(testLoan.isPaidOff).toBe(false);
    });
  });

  describe('calculateTotalOutstandingDebt', () => {
    test('should sum all currentBalance values', () => {
      const loans = [
        { id: 1, name: 'Loan 1', currentBalance: 10000 },
        { id: 2, name: 'Loan 2', currentBalance: 5000 },
        { id: 3, name: 'Loan 3', currentBalance: 15000 }
      ];

      const total = loanService.calculateTotalOutstandingDebt(loans);

      expect(total).toBe(30000);
    });

    test('should handle empty array', () => {
      const total = loanService.calculateTotalOutstandingDebt([]);
      expect(total).toBe(0);
    });

    test('should handle loans with missing currentBalance', () => {
      const loans = [
        { id: 1, name: 'Loan 1', currentBalance: 10000 },
        { id: 2, name: 'Loan 2' }, // No currentBalance
        { id: 3, name: 'Loan 3', currentBalance: 5000 }
      ];

      const total = loanService.calculateTotalOutstandingDebt(loans);

      expect(total).toBe(15000);
    });

    test('should handle loans with zero balance', () => {
      const loans = [
        { id: 1, name: 'Loan 1', currentBalance: 10000 },
        { id: 2, name: 'Loan 2', currentBalance: 0 }
      ];

      const total = loanService.calculateTotalOutstandingDebt(loans);

      expect(total).toBe(10000);
    });
  });
});
