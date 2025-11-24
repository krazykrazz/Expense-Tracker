const expenseRepository = require('./expenseRepository');
const db = require('../database/db');

// Mock the database
jest.mock('../database/db');

describe('expenseRepository', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      prepare: jest.fn(),
      exec: jest.fn(),
      transaction: jest.fn()
    };
    db.mockReturnValue(mockDb);
    jest.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all expenses', () => {
      const mockExpenses = [
        { id: 1, amount: 25.50, category: 'Food', place: 'Store' },
        { id: 2, amount: 100.00, category: 'Medical', place: 'Hospital' }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getAll();

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM expenses ORDER BY year DESC, month DESC, day DESC'
      );
      expect(mockStmt.all).toHaveBeenCalled();
      expect(result).toEqual(mockExpenses);
    });

    it('should handle database errors', () => {
      const mockStmt = {
        all: jest.fn().mockImplementation(() => {
          throw new Error('Database error');
        })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      expect(() => expenseRepository.getAll()).toThrow('Database error');
    });
  });

  describe('getById', () => {
    it('should return expense by id', () => {
      const mockExpense = { id: 1, amount: 25.50, category: 'Food', place: 'Store' };
      
      const mockStmt = {
        get: jest.fn().mockReturnValue(mockExpense)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getById(1);

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM expenses WHERE id = ?');
      expect(mockStmt.get).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockExpense);
    });

    it('should return undefined when expense not found', () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue(undefined)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getById(999);

      expect(result).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create new expense and return it with id', () => {
      const expenseData = {
        amount: 25.50,
        category: 'Food',
        place: 'Store',
        method: 'Credit Card',
        year: 2024,
        month: 11,
        day: 15,
        week: 46,
        tax_deductible: 0
      };

      const mockInsertStmt = {
        run: jest.fn().mockReturnValue({ lastInsertRowid: 1 })
      };
      const mockSelectStmt = {
        get: jest.fn().mockReturnValue({ id: 1, ...expenseData })
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockInsertStmt)
        .mockReturnValueOnce(mockSelectStmt);

      const result = expenseRepository.create(expenseData);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT INTO expenses (amount, category, place, method, year, month, day, week, tax_deductible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      expect(mockInsertStmt.run).toHaveBeenCalledWith(
        25.50, 'Food', 'Store', 'Credit Card', 2024, 11, 15, 46, 0
      );
      expect(result).toEqual({ id: 1, ...expenseData });
    });

    it('should handle insert errors', () => {
      const expenseData = {
        amount: 25.50,
        category: 'Food',
        place: 'Store',
        method: 'Credit Card',
        year: 2024,
        month: 11,
        day: 15,
        week: 46,
        tax_deductible: 0
      };

      const mockStmt = {
        run: jest.fn().mockImplementation(() => {
          throw new Error('Insert failed');
        })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      expect(() => expenseRepository.create(expenseData)).toThrow('Insert failed');
    });
  });

  describe('update', () => {
    it('should update existing expense', () => {
      const updateData = {
        amount: 30.00,
        category: 'Food',
        place: 'Updated Store',
        method: 'Debit Card',
        year: 2024,
        month: 11,
        day: 16,
        week: 46,
        tax_deductible: 0
      };

      const mockUpdateStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };
      const mockSelectStmt = {
        get: jest.fn().mockReturnValue({ id: 1, ...updateData })
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockUpdateStmt)
        .mockReturnValueOnce(mockSelectStmt);

      const result = expenseRepository.update(1, updateData);

      expect(mockUpdateStmt.run).toHaveBeenCalledWith(
        30.00, 'Food', 'Updated Store', 'Debit Card', 2024, 11, 16, 46, 0, 1
      );
      expect(result).toEqual({ id: 1, ...updateData });
    });

    it('should return null when expense not found', () => {
      const updateData = {
        amount: 30.00,
        category: 'Food',
        place: 'Store',
        method: 'Cash',
        year: 2024,
        month: 11,
        day: 15,
        week: 46,
        tax_deductible: 0
      };

      const mockStmt = {
        run: jest.fn().mockReturnValue({ changes: 0 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.update(999, updateData);

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete expense by id', () => {
      const mockStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.delete(1);

      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM expenses WHERE id = ?');
      expect(mockStmt.run).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });

    it('should return false when expense not found', () => {
      const mockStmt = {
        run: jest.fn().mockReturnValue({ changes: 0 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('getByMonth', () => {
    it('should return expenses for specific month', () => {
      const mockExpenses = [
        { id: 1, amount: 25.50, year: 2024, month: 11 },
        { id: 2, amount: 100.00, year: 2024, month: 11 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getByMonth(2024, 11);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM expenses WHERE year = ? AND month = ? ORDER BY day DESC'
      );
      expect(mockStmt.all).toHaveBeenCalledWith(2024, 11);
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('getByYear', () => {
    it('should return expenses for specific year', () => {
      const mockExpenses = [
        { id: 1, amount: 25.50, year: 2024, month: 11 },
        { id: 2, amount: 100.00, year: 2024, month: 10 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getByYear(2024);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM expenses WHERE year = ? ORDER BY month DESC, day DESC'
      );
      expect(mockStmt.all).toHaveBeenCalledWith(2024);
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('getTotalByMonth', () => {
    it('should return total expenses for month', () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ total: 125.50 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getTotalByMonth(2024, 11);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT SUM(amount) as total FROM expenses WHERE year = ? AND month = ?'
      );
      expect(mockStmt.get).toHaveBeenCalledWith(2024, 11);
      expect(result).toBe(125.50);
    });

    it('should return 0 when no expenses exist', () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ total: null })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getTotalByMonth(2024, 11);

      expect(result).toBe(0);
    });
  });

  describe('getTotalByYear', () => {
    it('should return total expenses for year', () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ total: 1500.75 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getTotalByYear(2024);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT SUM(amount) as total FROM expenses WHERE year = ?'
      );
      expect(mockStmt.get).toHaveBeenCalledWith(2024);
      expect(result).toBe(1500.75);
    });
  });

  describe('getByCategory', () => {
    it('should return expenses for specific category', () => {
      const mockExpenses = [
        { id: 1, amount: 25.50, category: 'Food' },
        { id: 2, amount: 30.00, category: 'Food' }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getByCategory('Food');

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM expenses WHERE category = ? ORDER BY year DESC, month DESC, day DESC'
      );
      expect(mockStmt.all).toHaveBeenCalledWith('Food');
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('getTaxDeductible', () => {
    it('should return tax deductible expenses for year', () => {
      const mockExpenses = [
        { id: 1, amount: 100.00, category: 'Tax - Medical', tax_deductible: 1 },
        { id: 2, amount: 50.00, category: 'Tax - Donation', tax_deductible: 1 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getTaxDeductible(2024);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM expenses WHERE year = ? AND tax_deductible = 1 ORDER BY month DESC, day DESC'
      );
      expect(mockStmt.all).toHaveBeenCalledWith(2024);
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('getTotalTaxDeductible', () => {
    it('should return total tax deductible amount for year', () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ total: 150.00 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getTotalTaxDeductible(2024);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT SUM(amount) as total FROM expenses WHERE year = ? AND tax_deductible = 1'
      );
      expect(mockStmt.get).toHaveBeenCalledWith(2024);
      expect(result).toBe(150.00);
    });

    it('should return 0 when no tax deductible expenses', () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue({ total: null })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getTotalTaxDeductible(2024);

      expect(result).toBe(0);
    });
  });

  describe('getCategoryTotals', () => {
    it('should return totals grouped by category for month', () => {
      const mockTotals = [
        { category: 'Food', total: 125.50 },
        { category: 'Medical', total: 200.00 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockTotals)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getCategoryTotals(2024, 11);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT category, SUM(amount) as total FROM expenses WHERE year = ? AND month = ? GROUP BY category ORDER BY total DESC'
      );
      expect(mockStmt.all).toHaveBeenCalledWith(2024, 11);
      expect(result).toEqual(mockTotals);
    });
  });

  describe('getWeeklyTotals', () => {
    it('should return totals grouped by week for month', () => {
      const mockTotals = [
        { week: 45, total: 100.00 },
        { week: 46, total: 150.50 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockTotals)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = expenseRepository.getWeeklyTotals(2024, 11);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT week, SUM(amount) as total FROM expenses WHERE year = ? AND month = ? GROUP BY week ORDER BY week ASC'
      );
      expect(mockStmt.all).toHaveBeenCalledWith(2024, 11);
      expect(result).toEqual(mockTotals);
    });
  });
});
