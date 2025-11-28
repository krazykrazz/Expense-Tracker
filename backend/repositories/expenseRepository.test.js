const expenseRepository = require('./expenseRepository');
const { getDatabase } = require('../database/db');

// Mock the database module
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));

describe('expenseRepository', () => {
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

  describe('create', () => {
    it('should create new expense and return it with id', async () => {
      const expenseData = {
        date: '2024-11-15',
        place: 'Store',
        notes: 'Test note',
        amount: 25.50,
        type: 'Groceries',
        week: 3,
        method: 'Credit Card'
      };

      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ lastID: 1 }, null);
      });

      const result = await expenseRepository.create(expenseData);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, ...expenseData });
    });

    it('should handle insert errors', async () => {
      const expenseData = {
        date: '2024-11-15',
        place: 'Store',
        amount: 25.50,
        type: 'Groceries',
        week: 3,
        method: 'Credit Card'
      };

      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(new Error('Insert failed'));
      });

      await expect(expenseRepository.create(expenseData)).rejects.toThrow('Insert failed');
    });
  });

  describe('findAll', () => {
    it('should return all expenses', async () => {
      const mockExpenses = [
        { id: 1, amount: 25.50, type: 'Groceries', place: 'Store' },
        { id: 2, amount: 100.00, type: 'Tax - Medical', place: 'Hospital' }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockExpenses);
      });

      const result = await expenseRepository.findAll();

      expect(mockDb.all).toHaveBeenCalled();
      expect(result).toEqual(mockExpenses);
    });

    it('should filter by year and month', async () => {
      const mockExpenses = [
        { id: 1, amount: 25.50, date: '2024-11-15' }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockExpenses);
      });

      const result = await expenseRepository.findAll({ year: 2024, month: 11 });

      expect(mockDb.all).toHaveBeenCalled();
      expect(result).toEqual(mockExpenses);
    });

    it('should handle database errors', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(new Error('Database error'));
      });

      await expect(expenseRepository.findAll()).rejects.toThrow('Database error');
    });
  });

  describe('findById', () => {
    it('should return expense by id', async () => {
      const mockExpense = { id: 1, amount: 25.50, type: 'Groceries', place: 'Store' };
      
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, mockExpense);
      });

      const result = await expenseRepository.findById(1);

      expect(mockDb.get).toHaveBeenCalled();
      expect(result).toEqual(mockExpense);
    });

    it('should return null when expense not found', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, null);
      });

      const result = await expenseRepository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update existing expense', async () => {
      const updateData = {
        date: '2024-11-16',
        place: 'Updated Store',
        amount: 30.00,
        type: 'Groceries',
        week: 3,
        method: 'Debit'
      };

      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 1 }, null);
      });
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { id: 1, ...updateData });
      });

      const result = await expenseRepository.update(1, updateData);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, ...updateData });
    });

    it('should return null when expense not found', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const result = await expenseRepository.update(999, { amount: 30.00 });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete expense by id', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 1 }, null);
      });

      const result = await expenseRepository.delete(1);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when expense not found', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const result = await expenseRepository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('getTaxDeductibleExpenses', () => {
    it('should return tax deductible expenses for year', async () => {
      const mockExpenses = [
        { id: 1, amount: 100.00, type: 'Tax - Medical' },
        { id: 2, amount: 50.00, type: 'Tax - Donation' }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockExpenses);
      });

      const result = await expenseRepository.getTaxDeductibleExpenses(2024);

      expect(mockDb.all).toHaveBeenCalled();
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('getDistinctPlaces', () => {
    it('should return distinct places', async () => {
      const mockPlaces = [
        { place: 'Store A' },
        { place: 'Store B' }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockPlaces);
      });

      const result = await expenseRepository.getDistinctPlaces();

      expect(mockDb.all).toHaveBeenCalled();
      expect(result).toEqual(['Store A', 'Store B']);
    });
  });
});
