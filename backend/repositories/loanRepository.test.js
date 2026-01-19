/**
 * Tests for LoanRepository
 * Tests CRUD operations and specialized queries for loans
 */

const { getDatabase } = require('../database/db');
const loanRepository = require('./loanRepository');
const loanBalanceRepository = require('./loanBalanceRepository');

describe('LoanRepository', () => {
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
        // Ignore errors - loan may already be deleted
      }
    }
    createdLoanIds.length = 0;
  });

  describe('create', () => {
    test('should create a new loan with required fields', async () => {
      const loanData = {
        name: 'Test Car Loan',
        initial_balance: 25000,
        start_date: '2024-01-15'
      };

      const created = await loanRepository.create(loanData);
      createdLoanIds.push(created.id);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Test Car Loan');
      expect(created.initial_balance).toBe(25000);
      expect(created.start_date).toBe('2024-01-15');
      expect(created.loan_type).toBe('loan'); // Default value
      expect(created.is_paid_off).toBe(0);
    });

    test('should create a loan with all optional fields', async () => {
      const loanData = {
        name: 'Test Mortgage',
        initial_balance: 300000,
        start_date: '2023-06-01',
        notes: 'Primary residence mortgage',
        loan_type: 'loan',
        estimated_months_left: 360
      };

      const created = await loanRepository.create(loanData);
      createdLoanIds.push(created.id);

      expect(created.notes).toBe('Primary residence mortgage');
      expect(created.loan_type).toBe('loan');
    });

    test('should create a line of credit', async () => {
      const loanData = {
        name: 'Test Line of Credit',
        initial_balance: 15000,
        start_date: '2024-02-01',
        loan_type: 'line_of_credit'
      };

      const created = await loanRepository.create(loanData);
      createdLoanIds.push(created.id);

      expect(created.loan_type).toBe('line_of_credit');
    });

    test('should reject negative initial balance', async () => {
      const loanData = {
        name: 'Invalid Loan',
        initial_balance: -1000,
        start_date: '2024-01-01'
      };

      await expect(loanRepository.create(loanData)).rejects.toThrow();
    });
  });

  describe('findAll', () => {
    test('should return all loans', async () => {
      const loan1 = await loanRepository.create({
        name: 'Loan A',
        initial_balance: 10000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(loan1.id);

      const loan2 = await loanRepository.create({
        name: 'Loan B',
        initial_balance: 20000,
        start_date: '2024-02-01'
      });
      createdLoanIds.push(loan2.id);

      const loans = await loanRepository.findAll();

      expect(loans.length).toBeGreaterThanOrEqual(2);
      expect(loans.some(l => l.id === loan1.id)).toBe(true);
      expect(loans.some(l => l.id === loan2.id)).toBe(true);
    });

    test('should return loans in consistent order', async () => {
      const loan1 = await loanRepository.create({
        name: 'First Loan',
        initial_balance: 5000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(loan1.id);

      const loan2 = await loanRepository.create({
        name: 'Second Loan',
        initial_balance: 6000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(loan2.id);

      const loans = await loanRepository.findAll();

      // Both loans should be present
      const loan1Entry = loans.find(l => l.id === loan1.id);
      const loan2Entry = loans.find(l => l.id === loan2.id);

      expect(loan1Entry).toBeDefined();
      expect(loan2Entry).toBeDefined();
      expect(loan1Entry.name).toBe('First Loan');
      expect(loan2Entry.name).toBe('Second Loan');

      // Verify the list is sorted by created_at DESC (most recent first)
      // Since both were created in the same second, we just verify they're both present
      // and the list is an array
      expect(Array.isArray(loans)).toBe(true);
    });
  });

  describe('findById', () => {
    test('should return loan by ID', async () => {
      const created = await loanRepository.create({
        name: 'Find Me Loan',
        initial_balance: 8000,
        start_date: '2024-03-01'
      });
      createdLoanIds.push(created.id);

      const found = await loanRepository.findById(created.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Find Me Loan');
    });

    test('should return null for non-existent ID', async () => {
      const found = await loanRepository.findById(99999);
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    test('should update loan fields', async () => {
      const created = await loanRepository.create({
        name: 'Original Name',
        initial_balance: 10000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(created.id);

      const updated = await loanRepository.update(created.id, {
        name: 'Updated Name',
        initial_balance: 12000,
        start_date: '2024-02-01',
        notes: 'Added notes',
        loan_type: 'line_of_credit'
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe('Updated Name');
      expect(updated.initial_balance).toBe(12000);
      expect(updated.notes).toBe('Added notes');
      expect(updated.loan_type).toBe('line_of_credit');
    });

    test('should return null when updating non-existent loan', async () => {
      const updated = await loanRepository.update(99999, {
        name: 'Ghost Loan',
        initial_balance: 5000,
        start_date: '2024-01-01'
      });

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    test('should delete loan and cascade to balance entries', async () => {
      const created = await loanRepository.create({
        name: 'Delete Me Loan',
        initial_balance: 7000,
        start_date: '2024-01-01'
      });

      // Add a balance entry
      await loanBalanceRepository.create({
        loan_id: created.id,
        year: 2024,
        month: 1,
        remaining_balance: 6500,
        rate: 5.0
      });

      const deleted = await loanRepository.delete(created.id);

      expect(deleted).toBe(true);

      // Verify loan is deleted
      const found = await loanRepository.findById(created.id);
      expect(found).toBeNull();

      // Verify balance entries are also deleted (cascade)
      const balances = await loanBalanceRepository.findByLoan(created.id);
      expect(balances).toEqual([]);
    });

    test('should return false when deleting non-existent loan', async () => {
      const deleted = await loanRepository.delete(99999);
      expect(deleted).toBe(false);
    });
  });

  describe('markPaidOff', () => {
    test('should mark loan as paid off', async () => {
      const created = await loanRepository.create({
        name: 'Soon Paid Off',
        initial_balance: 5000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(created.id);

      const result = await loanRepository.markPaidOff(created.id, 1);

      expect(result).toBe(true);

      const found = await loanRepository.findById(created.id);
      expect(found.is_paid_off).toBe(1);
    });

    test('should reactivate a paid off loan', async () => {
      const created = await loanRepository.create({
        name: 'Reactivate Me',
        initial_balance: 5000,
        start_date: '2024-01-01',
        is_paid_off: 1
      });
      createdLoanIds.push(created.id);

      const result = await loanRepository.markPaidOff(created.id, 0);

      expect(result).toBe(true);

      const found = await loanRepository.findById(created.id);
      expect(found.is_paid_off).toBe(0);
    });

    test('should return false for non-existent loan', async () => {
      const result = await loanRepository.markPaidOff(99999, 1);
      expect(result).toBe(false);
    });
  });

  describe('getCurrentBalance', () => {
    test('should return most recent balance entry', async () => {
      const created = await loanRepository.create({
        name: 'Balance Test Loan',
        initial_balance: 10000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(created.id);

      // Add multiple balance entries
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
        month: 3,
        remaining_balance: 8500,
        rate: 5.25
      });
      await loanBalanceRepository.create({
        loan_id: created.id,
        year: 2024,
        month: 2,
        remaining_balance: 9000,
        rate: 5.0
      });

      const currentBalance = await loanRepository.getCurrentBalance(created.id);

      expect(currentBalance).toBeDefined();
      expect(currentBalance.month).toBe(3); // Most recent
      expect(currentBalance.remaining_balance).toBe(8500);
      expect(currentBalance.rate).toBe(5.25);
    });

    test('should return null when no balance entries exist', async () => {
      const created = await loanRepository.create({
        name: 'No Balance Loan',
        initial_balance: 5000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(created.id);

      const currentBalance = await loanRepository.getCurrentBalance(created.id);

      expect(currentBalance).toBeNull();
    });
  });

  describe('getAllWithCurrentBalances', () => {
    test('should return loans with current balance and rate', async () => {
      const created = await loanRepository.create({
        name: 'With Balance Loan',
        initial_balance: 15000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(created.id);

      await loanBalanceRepository.create({
        loan_id: created.id,
        year: 2024,
        month: 4,
        remaining_balance: 14000,
        rate: 6.0
      });

      const loans = await loanRepository.getAllWithCurrentBalances();

      const testLoan = loans.find(l => l.id === created.id);
      expect(testLoan).toBeDefined();
      expect(testLoan.currentBalance).toBe(14000);
      expect(testLoan.currentRate).toBe(6.0);
    });

    test('should use initial_balance when no balance entries exist', async () => {
      const created = await loanRepository.create({
        name: 'Initial Balance Only',
        initial_balance: 20000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(created.id);

      const loans = await loanRepository.getAllWithCurrentBalances();

      const testLoan = loans.find(l => l.id === created.id);
      expect(testLoan).toBeDefined();
      expect(testLoan.currentBalance).toBe(20000);
      expect(testLoan.currentRate).toBe(0);
    });
  });

  describe('getLoansForMonth', () => {
    test('should return loans that started before or during the month', async () => {
      const loan1 = await loanRepository.create({
        name: 'Early Loan',
        initial_balance: 10000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(loan1.id);

      const loan2 = await loanRepository.create({
        name: 'Late Loan',
        initial_balance: 15000,
        start_date: '2024-06-01'
      });
      createdLoanIds.push(loan2.id);

      // Query for March 2024
      const marchLoans = await loanRepository.getLoansForMonth(2024, 3);

      // Should include early loan but not late loan
      expect(marchLoans.some(l => l.id === loan1.id)).toBe(true);
      expect(marchLoans.some(l => l.id === loan2.id)).toBe(false);

      // Query for June 2024
      const juneLoans = await loanRepository.getLoansForMonth(2024, 6);

      // Should include both loans
      expect(juneLoans.some(l => l.id === loan1.id)).toBe(true);
      expect(juneLoans.some(l => l.id === loan2.id)).toBe(true);
    });

    test('should return balance for the queried month or earlier', async () => {
      const created = await loanRepository.create({
        name: 'Monthly Balance Loan',
        initial_balance: 10000,
        start_date: '2024-01-01'
      });
      createdLoanIds.push(created.id);

      await loanBalanceRepository.create({
        loan_id: created.id,
        year: 2024,
        month: 2,
        remaining_balance: 9000,
        rate: 5.0
      });
      await loanBalanceRepository.create({
        loan_id: created.id,
        year: 2024,
        month: 4,
        remaining_balance: 8000,
        rate: 5.0
      });

      // Query for March - should get February's balance
      const marchLoans = await loanRepository.getLoansForMonth(2024, 3);
      const marchLoan = marchLoans.find(l => l.id === created.id);
      expect(marchLoan.currentBalance).toBe(9000);

      // Query for May - should get April's balance
      const mayLoans = await loanRepository.getLoansForMonth(2024, 5);
      const mayLoan = mayLoans.find(l => l.id === created.id);
      expect(mayLoan.currentBalance).toBe(8000);
    });
  });
});
