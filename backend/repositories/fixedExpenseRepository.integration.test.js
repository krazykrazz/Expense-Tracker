const fixedExpenseRepository = require('./fixedExpenseRepository');
const { getDatabase } = require('../database/db');

// Mock the database module
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));

describe('fixedExpenseRepository', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn()
    };
    getDatabase.mockResolvedValue(mockDb);
    jest.clearAllMocks();
  });

  describe('getFixedExpenses', () => {
    it('should return all fixed expenses for a month', async () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing', year: 2024, month: 11 },
        { id: 2, name: 'Insurance', amount: 300, category: 'Insurance', year: 2024, month: 11 }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockExpenses);
      });

      const result = await fixedExpenseRepository.getFixedExpenses(2024, 11);

      expect(mockDb.all).toHaveBeenCalled();
      expect(result).toEqual(mockExpenses);
    });

    it('should return empty array when no fixed expenses exist', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      const result = await fixedExpenseRepository.getFixedExpenses(2024, 11);

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(new Error('Database error'));
      });

      await expect(fixedExpenseRepository.getFixedExpenses(2024, 11)).rejects.toThrow('Database error');
    });
  });

  describe('getTotalFixedExpenses', () => {
    it('should return total fixed expenses for month', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { total: 1500 });
      });

      const result = await fixedExpenseRepository.getTotalFixedExpenses(2024, 11);

      expect(mockDb.get).toHaveBeenCalled();
      expect(result).toBe(1500);
    });

    it('should return 0 when no fixed expenses exist', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { total: 0 });
      });

      const result = await fixedExpenseRepository.getTotalFixedExpenses(2024, 11);

      expect(result).toBe(0);
    });
  });

  describe('createFixedExpense', () => {
    it('should create new fixed expense', async () => {
      const expenseData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Bank Transfer'
      };

      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ lastID: 1 }, null);
      });

      const result = await fixedExpenseRepository.createFixedExpense(expenseData);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result.id).toBe(1);
      expect(result.name).toBe('Rent');
      expect(result.amount).toBe(1200);
    });

    it('should handle insert errors', async () => {
      const expenseData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Bank Transfer'
      };

      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(new Error('Insert failed'));
      });

      await expect(fixedExpenseRepository.createFixedExpense(expenseData)).rejects.toThrow('Insert failed');
    });
  });

  describe('updateFixedExpense', () => {
    it('should update existing fixed expense', async () => {
      const updateData = {
        name: 'Updated Rent',
        amount: 1300,
        category: 'Housing',
        payment_type: 'Bank Transfer'
      };

      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 1 }, null);
      });
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { id: 1, year: 2024, month: 11, ...updateData });
      });

      const result = await fixedExpenseRepository.updateFixedExpense(1, updateData);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, year: 2024, month: 11, ...updateData });
    });

    it('should return null when fixed expense not found', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const result = await fixedExpenseRepository.updateFixedExpense(999, { name: 'Test', amount: 100 });

      expect(result).toBeNull();
    });
  });

  describe('deleteFixedExpense', () => {
    it('should delete fixed expense by id', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 1 }, null);
      });

      const result = await fixedExpenseRepository.deleteFixedExpense(1);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when fixed expense not found', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const result = await fixedExpenseRepository.deleteFixedExpense(999);

      expect(result).toBe(false);
    });
  });

  describe('getFixedExpensesByCategory', () => {
    it('should return fixed expenses for specific category', async () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing' }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockExpenses);
      });

      const result = await fixedExpenseRepository.getFixedExpensesByCategory(2024, 11, 'Housing');

      expect(mockDb.all).toHaveBeenCalled();
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('getCategoryTotals', () => {
    it('should return totals grouped by category', async () => {
      const mockTotals = [
        { category: 'Housing', total: 1200 },
        { category: 'Insurance', total: 300 }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockTotals);
      });

      const result = await fixedExpenseRepository.getCategoryTotals(2024, 11);

      expect(mockDb.all).toHaveBeenCalled();
      expect(result).toEqual({
        'Housing': 1200,
        'Insurance': 300
      });
    });
  });

  describe('copyFixedExpenses', () => {
    it('should copy fixed expenses from one month to another', async () => {
      const sourceExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing', payment_type: 'Bank Transfer' },
        { id: 2, name: 'Insurance', amount: 300, category: 'Insurance', payment_type: 'Credit Card' }
      ];

      // First call returns source expenses
      let allCallCount = 0;
      mockDb.all.mockImplementation((sql, params, callback) => {
        allCallCount++;
        if (allCallCount === 1) {
          callback(null, sourceExpenses);
        } else {
          callback(null, []);
        }
      });

      // Run calls for creating new expenses
      let runCallCount = 0;
      mockDb.run.mockImplementation(function(sql, params, callback) {
        runCallCount++;
        callback.call({ lastID: runCallCount + 2 }, null);
      });

      const result = await fixedExpenseRepository.copyFixedExpenses(2024, 11, 2024, 12);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Rent');
      expect(result[1].name).toBe('Insurance');
    });

    it('should return empty array when no source expenses exist', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      const result = await fixedExpenseRepository.copyFixedExpenses(2024, 11, 2024, 12);

      expect(result).toEqual([]);
    });
  });
});
