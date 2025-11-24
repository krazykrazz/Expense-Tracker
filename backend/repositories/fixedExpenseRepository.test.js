const fixedExpenseRepository = require('./fixedExpenseRepository');
const db = require('../database/db');

// Mock the database
jest.mock('../database/db');

describe('fixedExpenseRepository', () => {
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
    it('should return all fixed expenses', () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing' },
        { id: 2, name: 'Insurance', amount: 300, category: 'Insurance' }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = fixedExpenseRepository.getAll();

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM fixed_expenses ORDER BY name ASC'
      );
      expect(mockStmt.all).toHaveBeenCalled();
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('getById', () => {
    it('should return fixed expense by id', () => {
      const mockExpense = { id: 1, name: 'Rent', amount: 1200, category: 'Housing' };
      
      const mockStmt = {
        get: jest.fn().mockReturnValue(mockExpense)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = fixedExpenseRepository.getById(1);

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM fixed_expenses WHERE id = ?');
      expect(mockStmt.get).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockExpense);
    });
  });

  describe('create', () => {
    it('should create new fixed expense', () => {
      const expenseData = {
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        description: 'Monthly rent'
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

      const result = fixedExpenseRepository.create(expenseData);

      expect(mockInsertStmt.run).toHaveBeenCalledWith(
        'Rent', 1200, 'Housing', 'Monthly rent'
      );
      expect(result).toEqual({ id: 1, ...expenseData });
    });
  });

  describe('update', () => {
    it('should update existing fixed expense', () => {
      const updateData = {
        name: 'Updated Rent',
        amount: 1300,
        category: 'Housing',
        description: 'Updated rent'
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

      const result = fixedExpenseRepository.update(1, updateData);

      expect(mockUpdateStmt.run).toHaveBeenCalledWith(
        'Updated Rent', 1300, 'Housing', 'Updated rent', 1
      );
      expect(result).toEqual({ id: 1, ...updateData });
    });
  });

  describe('delete', () => {
    it('should delete fixed expense by id', () => {
      const mockStmt = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = fixedExpenseRepository.delete(1);

      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM fixed_expenses WHERE id = ?');
      expect(mockStmt.run).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });
  });

  describe('getForMonth', () => {
    it('should return fixed expenses for specific month', () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, year: 2024, month: 11 },
        { id: 2, name: 'Insurance', amount: 300, year: 2024, month: 11 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = fixedExpenseRepository.getForMonth(2024, 11);

      expect(mockStmt.all).toHaveBeenCalledWith(2024, 11);
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('carryForward', () => {
    it('should carry forward expenses to next month', () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing' },
        { id: 2, name: 'Insurance', amount: 300, category: 'Insurance' }
      ];

      const mockSelectStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      const mockInsertStmt = {
        run: jest.fn().mockReturnValue({ lastInsertRowid: 3 })
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)
        .mockReturnValue(mockInsertStmt);

      const result = fixedExpenseRepository.carryForward(2024, 11);

      expect(mockSelectStmt.all).toHaveBeenCalledWith(2024, 11);
      expect(mockInsertStmt.run).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('should handle year rollover', () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing' }
      ];

      const mockSelectStmt = {
        all: jest.fn().mockReturnValue(mockExpenses)
      };
      const mockInsertStmt = {
        run: jest.fn().mockReturnValue({ lastInsertRowid: 2 })
      };
      
      mockDb.prepare
        .mockReturnValueOnce(mockSelectStmt)
        .mockReturnValue(mockInsertStmt);

      const result = fixedExpenseRepository.carryForward(2024, 12);

      // Should insert with year 2025, month 1
      expect(mockInsertStmt.run).toHaveBeenCalledWith(
        'Rent', 1200, 'Housing', undefined, 2025, 1
      );
    });
  });
});
