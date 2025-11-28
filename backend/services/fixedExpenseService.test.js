const fixedExpenseService = require('./fixedExpenseService');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const { validateYearMonth } = require('../utils/validators');

// Mock dependencies
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../utils/validators');

describe('fixedExpenseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default validator mock to not throw
    validateYearMonth.mockImplementation(() => {});
  });

  describe('getMonthlyFixedExpenses', () => {
    it('should return fixed expenses and total for a month', async () => {
      const mockItems = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing', year: 2024, month: 11 },
        { id: 2, name: 'Insurance', amount: 300, category: 'Insurance', year: 2024, month: 11 }
      ];
      fixedExpenseRepository.getFixedExpenses.mockResolvedValue(mockItems);
      fixedExpenseRepository.getTotalFixedExpenses.mockResolvedValue(1500);

      const result = await fixedExpenseService.getMonthlyFixedExpenses(2024, 11);

      expect(result).toEqual({
        items: mockItems,
        total: 1500
      });
      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
      expect(fixedExpenseRepository.getFixedExpenses).toHaveBeenCalledWith(2024, 11);
      expect(fixedExpenseRepository.getTotalFixedExpenses).toHaveBeenCalledWith(2024, 11);
    });

    it('should handle invalid year/month', async () => {
      validateYearMonth.mockImplementation(() => {
        throw new Error('Invalid year or month');
      });

      await expect(fixedExpenseService.getMonthlyFixedExpenses(2024, 13)).rejects.toThrow('Invalid year or month');
    });

    it('should return empty items and zero total when no expenses exist', async () => {
      fixedExpenseRepository.getFixedExpenses.mockResolvedValue([]);
      fixedExpenseRepository.getTotalFixedExpenses.mockResolvedValue(0);

      const result = await fixedExpenseService.getMonthlyFixedExpenses(2024, 11);

      expect(result).toEqual({
        items: [],
        total: 0
      });
    });
  });

  describe('createFixedExpense', () => {
    it('should create a new fixed expense with valid data', async () => {
      const expenseData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit'
      };
      const mockCreatedExpense = { id: 1, ...expenseData };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue(mockCreatedExpense);

      const result = await fixedExpenseService.createFixedExpense(expenseData);

      expect(result).toEqual(mockCreatedExpense);
      expect(fixedExpenseRepository.createFixedExpense).toHaveBeenCalledWith({
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit'
      });
    });

    it('should throw error when name is missing', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: '',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit'
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData)).rejects.toThrow('Name is required');
    });

    it('should throw error when amount is missing', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        category: 'Housing',
        payment_type: 'Debit'
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData)).rejects.toThrow('Amount is required');
    });

    it('should throw error when category is invalid', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'InvalidCategory',
        payment_type: 'Debit'
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData)).rejects.toThrow('Invalid category');
    });

    it('should throw error when payment_type is invalid', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'InvalidPayment'
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData)).rejects.toThrow('Invalid payment type');
    });

    it('should throw error when year/month is missing', async () => {
      const invalidData = {
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit'
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData)).rejects.toThrow('Year and month are required');
    });

    it('should trim whitespace from name', async () => {
      const expenseData = {
        year: 2024,
        month: 11,
        name: '  Rent  ',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit'
      };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue({ id: 1, ...expenseData, name: 'Rent' });

      await fixedExpenseService.createFixedExpense(expenseData);

      expect(fixedExpenseRepository.createFixedExpense).toHaveBeenCalledWith({
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit'
      });
    });
  });

  describe('updateFixedExpense', () => {
    it('should update existing fixed expense', async () => {
      const updateData = {
        name: 'Updated Rent',
        amount: 1300,
        category: 'Housing',
        payment_type: 'Debit'
      };
      const mockUpdatedExpense = { id: 1, year: 2024, month: 11, ...updateData };
      fixedExpenseRepository.updateFixedExpense.mockResolvedValue(mockUpdatedExpense);

      const result = await fixedExpenseService.updateFixedExpense(1, updateData);

      expect(result).toEqual(mockUpdatedExpense);
      expect(fixedExpenseRepository.updateFixedExpense).toHaveBeenCalledWith(1, {
        name: 'Updated Rent',
        amount: 1300,
        category: 'Housing',
        payment_type: 'Debit'
      });
    });

    it('should throw error when id is missing', async () => {
      await expect(fixedExpenseService.updateFixedExpense(null, { name: 'Test', amount: 100, category: 'Housing', payment_type: 'Cash' }))
        .rejects.toThrow('Fixed expense ID is required');
    });

    it('should return null when fixed expense not found', async () => {
      fixedExpenseRepository.updateFixedExpense.mockResolvedValue(null);

      const result = await fixedExpenseService.updateFixedExpense(999, { name: 'Test', amount: 100, category: 'Housing', payment_type: 'Cash' });

      expect(result).toBeNull();
    });
  });

  describe('deleteFixedExpense', () => {
    it('should delete fixed expense by id', async () => {
      fixedExpenseRepository.deleteFixedExpense.mockResolvedValue(true);

      const result = await fixedExpenseService.deleteFixedExpense(1);

      expect(result).toBe(true);
      expect(fixedExpenseRepository.deleteFixedExpense).toHaveBeenCalledWith(1);
    });

    it('should throw error when id is missing', async () => {
      await expect(fixedExpenseService.deleteFixedExpense(null))
        .rejects.toThrow('Fixed expense ID is required');
    });

    it('should return false when fixed expense not found', async () => {
      fixedExpenseRepository.deleteFixedExpense.mockResolvedValue(false);

      const result = await fixedExpenseService.deleteFixedExpense(999);

      expect(result).toBe(false);
    });
  });

  describe('carryForwardFixedExpenses', () => {
    it('should carry forward fixed expenses from previous month', async () => {
      const mockCopiedExpenses = [
        { id: 3, year: 2024, month: 12, name: 'Rent', amount: 1200, category: 'Housing', payment_type: 'Debit' },
        { id: 4, year: 2024, month: 12, name: 'Insurance', amount: 300, category: 'Insurance', payment_type: 'Cash' }
      ];
      fixedExpenseRepository.getFixedExpenses.mockResolvedValue([
        { id: 1, name: 'Rent', amount: 1200 },
        { id: 2, name: 'Insurance', amount: 300 }
      ]);
      fixedExpenseRepository.copyFixedExpenses.mockResolvedValue(mockCopiedExpenses);

      const result = await fixedExpenseService.carryForwardFixedExpenses(2024, 12);

      expect(result).toEqual({
        items: mockCopiedExpenses,
        count: 2
      });
      expect(validateYearMonth).toHaveBeenCalledWith(2024, 12);
      expect(fixedExpenseRepository.copyFixedExpenses).toHaveBeenCalledWith(2024, 11, 2024, 12);
    });

    it('should return empty result when no previous month expenses exist', async () => {
      fixedExpenseRepository.getFixedExpenses.mockResolvedValue([]);

      const result = await fixedExpenseService.carryForwardFixedExpenses(2024, 12);

      expect(result).toEqual({
        items: [],
        count: 0
      });
    });

    it('should handle invalid year/month', async () => {
      validateYearMonth.mockImplementation(() => {
        throw new Error('Invalid year or month');
      });

      await expect(fixedExpenseService.carryForwardFixedExpenses(2024, 13)).rejects.toThrow('Invalid year or month');
    });

    it('should handle year rollover (January copies from December)', async () => {
      const mockCopiedExpenses = [
        { id: 2, year: 2025, month: 1, name: 'Rent', amount: 1200, category: 'Housing', payment_type: 'Debit' }
      ];
      fixedExpenseRepository.getFixedExpenses.mockResolvedValue([
        { id: 1, name: 'Rent', amount: 1200 }
      ]);
      fixedExpenseRepository.copyFixedExpenses.mockResolvedValue(mockCopiedExpenses);

      const result = await fixedExpenseService.carryForwardFixedExpenses(2025, 1);

      expect(fixedExpenseRepository.getFixedExpenses).toHaveBeenCalledWith(2024, 12);
      expect(fixedExpenseRepository.copyFixedExpenses).toHaveBeenCalledWith(2024, 12, 2025, 1);
      expect(result.count).toBe(1);
    });
  });

  describe('validateFixedExpense', () => {
    it('should throw error for name exceeding max length', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'A'.repeat(101),
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit'
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData))
        .rejects.toThrow('Name must not exceed 100 characters');
    });

    it('should throw error for negative amount', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: -100,
        category: 'Housing',
        payment_type: 'Debit'
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData))
        .rejects.toThrow('Amount must be a non-negative number');
    });
  });
});
