const incomeRepository = require('./incomeRepository');
const { getDatabase } = require('../database/db');

// Mock the database module
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));

describe('incomeRepository', () => {
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

  describe('getIncomeSources', () => {
    it('should return all income sources for a month', async () => {
      const mockIncomes = [
        { id: 1, name: 'Salary', amount: 5000, year: 2024, month: 11 },
        { id: 2, name: 'Freelance', amount: 1500, year: 2024, month: 11 }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockIncomes);
      });

      const result = await incomeRepository.getIncomeSources(2024, 11);

      expect(mockDb.all).toHaveBeenCalled();
      expect(result).toEqual(mockIncomes);
    });

    it('should return empty array when no income sources exist', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      const result = await incomeRepository.getIncomeSources(2024, 11);

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(new Error('Database error'));
      });

      await expect(incomeRepository.getIncomeSources(2024, 11)).rejects.toThrow('Database error');
    });
  });

  describe('getTotalMonthlyGross', () => {
    it('should return total income for month', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { total: 6500 });
      });

      const result = await incomeRepository.getTotalMonthlyGross(2024, 11);

      expect(mockDb.get).toHaveBeenCalled();
      expect(result).toBe(6500);
    });

    it('should return 0 when no income exists', async () => {
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { total: 0 });
      });

      const result = await incomeRepository.getTotalMonthlyGross(2024, 11);

      expect(result).toBe(0);
    });
  });

  describe('createIncomeSource', () => {
    it('should create new income source', async () => {
      const incomeData = {
        year: 2024,
        month: 11,
        name: 'Salary',
        amount: 5000
      };

      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ lastID: 1 }, null);
      });

      const result = await incomeRepository.createIncomeSource(incomeData);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, ...incomeData, category: 'Other' });
    });

    it('should handle insert errors', async () => {
      const incomeData = {
        year: 2024,
        month: 11,
        name: 'Salary',
        amount: 5000
      };

      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(new Error('Insert failed'));
      });

      await expect(incomeRepository.createIncomeSource(incomeData)).rejects.toThrow('Insert failed');
    });
  });

  describe('updateIncomeSource', () => {
    it('should update existing income source', async () => {
      const updateData = {
        name: 'Updated Salary',
        amount: 5500
      };

      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 1 }, null);
      });
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { id: 1, year: 2024, month: 11, ...updateData });
      });

      const result = await incomeRepository.updateIncomeSource(1, updateData);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, year: 2024, month: 11, ...updateData });
    });

    it('should return null when income source not found', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const result = await incomeRepository.updateIncomeSource(999, { name: 'Test', amount: 100 });

      expect(result).toBeNull();
    });
  });

  describe('deleteIncomeSource', () => {
    it('should delete income source by id', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 1 }, null);
      });

      const result = await incomeRepository.deleteIncomeSource(1);

      expect(mockDb.run).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when income source not found', async () => {
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const result = await incomeRepository.deleteIncomeSource(999);

      expect(result).toBe(false);
    });
  });

  describe('copyFromPreviousMonth', () => {
    it('should copy income sources from previous month', async () => {
      const previousMonthSources = [
        { name: 'Salary', amount: 5000 },
        { name: 'Freelance', amount: 1500 }
      ];

      let insertCallCount = 0;
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, previousMonthSources);
      });
      mockDb.run.mockImplementation(function(sql, params, callback) {
        insertCallCount++;
        callback.call({ lastID: insertCallCount }, null);
      });

      const result = await incomeRepository.copyFromPreviousMonth(2024, 12);

      expect(mockDb.all).toHaveBeenCalled();
      expect(mockDb.run).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Salary');
      expect(result[1].name).toBe('Freelance');
    });

    it('should return empty array when no previous month sources exist', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      const result = await incomeRepository.copyFromPreviousMonth(2024, 12);

      expect(result).toEqual([]);
    });

    it('should handle year rollover (January copies from December)', async () => {
      const previousMonthSources = [
        { name: 'Salary', amount: 5000 }
      ];

      mockDb.all.mockImplementation((sql, params, callback) => {
        // Verify it's querying December of previous year
        expect(params).toEqual([2023, 12]);
        callback(null, previousMonthSources);
      });
      mockDb.run.mockImplementation(function(sql, params, callback) {
        callback.call({ lastID: 1 }, null);
      });

      const result = await incomeRepository.copyFromPreviousMonth(2024, 1);

      expect(result).toHaveLength(1);
      expect(result[0].year).toBe(2024);
      expect(result[0].month).toBe(1);
    });
  });
});
