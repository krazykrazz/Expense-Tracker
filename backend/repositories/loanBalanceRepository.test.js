/**
 * Tests for LoanBalanceRepository
 * Tests CRUD operations and specialized queries for loan balance entries
 */

const { getDatabase } = require('../database/db');
const loanBalanceRepository = require('./loanBalanceRepository');
const loanRepository = require('./loanRepository');

describe('LoanBalanceRepository', () => {
  let db;
  let testLoan;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Create a test loan for balance entries
    testLoan = await loanRepository.create({
      name: 'Test Loan for Balances',
      initial_balance: 10000,
      start_date: '2024-01-01',
      loan_type: 'loan'
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (testLoan) {
      await loanRepository.delete(testLoan.id);
    }
    // Clean up any orphaned balance entries
    await new Promise((resolve) => {
      db.run('DELETE FROM loan_balances WHERE loan_id NOT IN (SELECT id FROM loans)', () => resolve());
    });
  });

  describe('create', () => {
    test('should create a new balance entry', async () => {
      const balanceData = {
        loan_id: testLoan.id,
        year: 2024,
        month: 1,
        remaining_balance: 9500,
        rate: 5.5
      };

      const created = await loanBalanceRepository.create(balanceData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.loan_id).toBe(testLoan.id);
      expect(created.year).toBe(2024);
      expect(created.month).toBe(1);
      expect(created.remaining_balance).toBe(9500);
      expect(created.rate).toBe(5.5);
    });

    test('should reject duplicate loan_id/year/month combination', async () => {
      const balanceData = {
        loan_id: testLoan.id,
        year: 2024,
        month: 2,
        remaining_balance: 9000,
        rate: 5.5
      };

      await loanBalanceRepository.create(balanceData);

      // Try to create duplicate
      await expect(loanBalanceRepository.create(balanceData)).rejects.toThrow();
    });

    test('should reject negative balance', async () => {
      const balanceData = {
        loan_id: testLoan.id,
        year: 2024,
        month: 3,
        remaining_balance: -100,
        rate: 5.5
      };

      await expect(loanBalanceRepository.create(balanceData)).rejects.toThrow();
    });

    test('should reject negative rate', async () => {
      const balanceData = {
        loan_id: testLoan.id,
        year: 2024,
        month: 4,
        remaining_balance: 9000,
        rate: -1
      };

      await expect(loanBalanceRepository.create(balanceData)).rejects.toThrow();
    });
  });

  describe('findByLoan', () => {
    test('should return all balance entries for a loan sorted by date descending', async () => {
      // Create multiple balance entries
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 1,
        remaining_balance: 9500,
        rate: 5.5
      });
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 3,
        remaining_balance: 8500,
        rate: 5.5
      });
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 2,
        remaining_balance: 9000,
        rate: 5.5
      });

      const balances = await loanBalanceRepository.findByLoan(testLoan.id);

      expect(balances).toHaveLength(3);
      // Should be sorted by year DESC, month DESC
      expect(balances[0].month).toBe(3);
      expect(balances[1].month).toBe(2);
      expect(balances[2].month).toBe(1);
    });

    test('should return empty array for loan with no balances', async () => {
      const balances = await loanBalanceRepository.findByLoan(testLoan.id);
      expect(balances).toEqual([]);
    });

    test('should return empty array for non-existent loan', async () => {
      const balances = await loanBalanceRepository.findByLoan(99999);
      expect(balances).toEqual([]);
    });
  });

  describe('findByLoanAndMonth', () => {
    test('should return balance entry for specific loan and month', async () => {
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 5,
        remaining_balance: 8000,
        rate: 5.25
      });

      const balance = await loanBalanceRepository.findByLoanAndMonth(testLoan.id, 2024, 5);

      expect(balance).toBeDefined();
      expect(balance.loan_id).toBe(testLoan.id);
      expect(balance.year).toBe(2024);
      expect(balance.month).toBe(5);
      expect(balance.remaining_balance).toBe(8000);
    });

    test('should return null when balance entry not found', async () => {
      const balance = await loanBalanceRepository.findByLoanAndMonth(testLoan.id, 2024, 12);
      expect(balance).toBeNull();
    });
  });

  describe('update', () => {
    test('should update an existing balance entry', async () => {
      const created = await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 6,
        remaining_balance: 7500,
        rate: 5.5
      });

      const updated = await loanBalanceRepository.update(created.id, {
        year: 2024,
        month: 6,
        remaining_balance: 7000,
        rate: 5.25
      });

      expect(updated).toBeDefined();
      expect(updated.remaining_balance).toBe(7000);
      expect(updated.rate).toBe(5.25);
    });

    test('should return null when updating non-existent entry', async () => {
      const updated = await loanBalanceRepository.update(99999, {
        year: 2024,
        month: 1,
        remaining_balance: 5000,
        rate: 5.0
      });

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    test('should delete an existing balance entry', async () => {
      const created = await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 7,
        remaining_balance: 6500,
        rate: 5.5
      });

      const deleted = await loanBalanceRepository.delete(created.id);

      expect(deleted).toBe(true);

      const found = await loanBalanceRepository.findByLoanAndMonth(testLoan.id, 2024, 7);
      expect(found).toBeNull();
    });

    test('should return false when deleting non-existent entry', async () => {
      const deleted = await loanBalanceRepository.delete(99999);
      expect(deleted).toBe(false);
    });
  });

  describe('upsert', () => {
    test('should create new entry when none exists', async () => {
      const result = await loanBalanceRepository.upsert({
        loan_id: testLoan.id,
        year: 2024,
        month: 8,
        remaining_balance: 6000,
        rate: 5.5
      });

      expect(result).toBeDefined();
      expect(result.remaining_balance).toBe(6000);

      const found = await loanBalanceRepository.findByLoanAndMonth(testLoan.id, 2024, 8);
      expect(found).toBeDefined();
      expect(found.remaining_balance).toBe(6000);
    });

    test('should update existing entry on conflict', async () => {
      // Create initial entry
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 9,
        remaining_balance: 5500,
        rate: 5.5
      });

      // Upsert with same loan_id/year/month
      const result = await loanBalanceRepository.upsert({
        loan_id: testLoan.id,
        year: 2024,
        month: 9,
        remaining_balance: 5000,
        rate: 5.25
      });

      expect(result).toBeDefined();

      const found = await loanBalanceRepository.findByLoanAndMonth(testLoan.id, 2024, 9);
      expect(found.remaining_balance).toBe(5000);
      expect(found.rate).toBe(5.25);
    });
  });

  describe('getBalanceHistory', () => {
    test('should return balance history sorted chronologically (ascending)', async () => {
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 3,
        remaining_balance: 8500,
        rate: 5.5
      });
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 1,
        remaining_balance: 9500,
        rate: 5.5
      });
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 2,
        remaining_balance: 9000,
        rate: 5.5
      });

      const history = await loanBalanceRepository.getBalanceHistory(testLoan.id);

      expect(history).toHaveLength(3);
      // Should be sorted chronologically (ascending)
      expect(history[0].month).toBe(1);
      expect(history[1].month).toBe(2);
      expect(history[2].month).toBe(3);
    });
  });

  describe('getTotalDebtOverTime', () => {
    test('should return aggregated debt across all active loans', async () => {
      // Create another test loan
      const testLoan2 = await loanRepository.create({
        name: 'Test Loan 2',
        initial_balance: 5000,
        start_date: '2024-01-01',
        loan_type: 'loan'
      });

      try {
        // Add balances for both loans
        await loanBalanceRepository.create({
          loan_id: testLoan.id,
          year: 2024,
          month: 10,
          remaining_balance: 4000,
          rate: 5.5
        });
        await loanBalanceRepository.create({
          loan_id: testLoan2.id,
          year: 2024,
          month: 10,
          remaining_balance: 3000,
          rate: 6.0
        });

        const totalDebt = await loanBalanceRepository.getTotalDebtOverTime();

        // Find the entry for 2024-10
        const oct2024 = totalDebt.find(d => d.year === 2024 && d.month === 10);
        expect(oct2024).toBeDefined();
        expect(oct2024.total_debt).toBe(7000); // 4000 + 3000
        expect(oct2024.loan_count).toBe(2);
      } finally {
        await loanRepository.delete(testLoan2.id);
      }
    });

    test('should exclude paid off loans from total debt', async () => {
      // Create a paid off loan
      const paidOffLoan = await loanRepository.create({
        name: 'Paid Off Loan',
        initial_balance: 5000,
        start_date: '2024-01-01',
        loan_type: 'loan',
        is_paid_off: 1
      });

      try {
        // Add balances
        await loanBalanceRepository.create({
          loan_id: testLoan.id,
          year: 2024,
          month: 11,
          remaining_balance: 3500,
          rate: 5.5
        });
        await loanBalanceRepository.create({
          loan_id: paidOffLoan.id,
          year: 2024,
          month: 11,
          remaining_balance: 2000,
          rate: 6.0
        });

        const totalDebt = await loanBalanceRepository.getTotalDebtOverTime();

        // Find the entry for 2024-11
        const nov2024 = totalDebt.find(d => d.year === 2024 && d.month === 11);
        expect(nov2024).toBeDefined();
        // Should only include active loan balance
        expect(nov2024.total_debt).toBe(3500);
        expect(nov2024.loan_count).toBe(1);
      } finally {
        await loanRepository.delete(paidOffLoan.id);
      }
    });

    test('should return results sorted chronologically', async () => {
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2024,
        month: 12,
        remaining_balance: 3000,
        rate: 5.5
      });
      await loanBalanceRepository.create({
        loan_id: testLoan.id,
        year: 2025,
        month: 1,
        remaining_balance: 2500,
        rate: 5.5
      });

      const totalDebt = await loanBalanceRepository.getTotalDebtOverTime();

      // Filter to our test entries
      const testEntries = totalDebt.filter(
        d => (d.year === 2024 && d.month === 12) || (d.year === 2025 && d.month === 1)
      );

      expect(testEntries.length).toBeGreaterThanOrEqual(2);
      // Should be sorted chronologically
      const dec2024Idx = testEntries.findIndex(d => d.year === 2024 && d.month === 12);
      const jan2025Idx = testEntries.findIndex(d => d.year === 2025 && d.month === 1);
      expect(dec2024Idx).toBeLessThan(jan2025Idx);
    });
  });
});
