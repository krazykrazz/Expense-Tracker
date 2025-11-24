const fixedExpenseService = require('./fixedExpenseService');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const { validateNumber, validateString, validateYearMonth } = require('../utils/validators');

// Mock dependencies
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../utils/validators');

describe('fixedExpenseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default validator mocks to return true
    validateNumber.mockReturnValue(true);
    validateString.mockReturnValue(true);
    validateYearMonth.mockReturnValue(true);
  });

  describe('getAllFixedExpenses', () => {
    it('should return all fixed expenses from repository', async () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing' },
        { id: 2, name: 'Insurance', amount: 300, category: 'Insurance' }
      ];
      fixedExpenseRepository.getAll.mockResolvedValue(mockExpenses);

      const result = await fixedExpenseService.getAllFixedExpenses();

      expect(result).toEqual(mockExpenses);
      expect(fixedExpenseRepository.getAll).toHaveBeenCalledTimes(1);
    });

    it('should handle repository errors', async () => {
      const error = new Error('Database error');
      fixedExpenseRepository.getAll.mockRejectedValue(error);

      await expect(fixedExpenseService.getAllFixedExpenses()).rejects.toThrow('Database error');
    });
  });

  describe('getFixedExpenseById', () => {
    it('should return fixed expense by id', async () => {
      const mockExpense = { id: 1, name: 'Rent', amount: 1200, category: 'Housing' };
      fixedExpenseRepository.getById.mockResolvedValue(mockExpense);

      const result = await fixedExpenseService.getFixedExpenseById(1);

      expect(result).toEqual(mockExpense);
      expect(fixedExpenseRepository.getById).toHaveBeenCalledWith(1);
    });

    it('should validate id parameter', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (value !== 1) throw new Error(`${name} must be a valid number`);
        return true;
      });

      await expect(fixedExpenseService.getFixedExpenseById('invalid')).rejects.toThrow('ID must be a valid number');
      expect(validateNumber).toHaveBeenCalledWith('invalid', 'ID', { min: 1 });
    });

    it('should return null when expense not found', async () => {
      fixedExpenseRepository.getById.mockResolvedValue(null);

      const result = await fixedExpenseService.getFixedExpenseById(999);

      expect(result).toBeNull();
    });
  });

  describe('createFixedExpense', () => {
    const validExpenseData = {
      name: 'Rent',
      amount: 1200,
      category: 'Housing',
      description: 'Monthly rent payment'
    };

    it('should create a new fixed expense with valid data', async () => {
      const mockCreatedExpense = { id: 1, ...validExpenseData };
      fixedExpenseRepository.create.mockResolvedValue(mockCreatedExpense);

      const result = await fixedExpenseService.createFixedExpense(validExpenseData);

      expect(result).toEqual(mockCreatedExpense);
      expect(fixedExpenseRepository.create).toHaveBeenCalledWith(validExpenseData);
    });

    it('should validate name field', async () => {
      validateString.mockImplementation((value, name) => {
        if (!value || value.trim() === '') throw new Error(`${name} is required`);
        return true;
      });

      const invalidData = { ...validExpenseData, name: '' };
      
      await expect(fixedExpenseService.createFixedExpense(invalidData)).rejects.toThrow('Name is required');
      expect(validateString).toHaveBeenCalledWith('', 'Name', { minLength: 1, maxLength: 100 });
    });

    it('should validate amount field', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (value <= 0) throw new Error(`${name} must be greater than 0`);
        return true;
      });

      const invalidData = { ...validExpenseData, amount: -100 };
      
      await expect(fixedExpenseService.createFixedExpense(invalidData)).rejects.toThrow('Amount must be greater than 0');
      expect(validateNumber).toHaveBeenCalledWith(-100, 'Amount', { min: 0.01 });
    });

    it('should validate category field', async () => {
      validateString.mockImplementation((value, name) => {
        if (!value || value.trim() === '') throw new Error(`${name} is required`);
        return true;
      });

      const invalidData = { ...validExpenseData, category: '' };
      
      await expect(fixedExpenseService.createFixedExpense(invalidData)).rejects.toThrow('Category is required');
      expect(validateString).toHaveBeenCalledWith('', 'Category', { minLength: 1, maxLength: 50 });
    });

    it('should handle optional description field', async () => {
      const dataWithoutDescription = {
        name: 'Rent',
        amount: 1200,
        category: 'Housing'
      };
      const mockCreatedExpense = { id: 1, ...dataWithoutDescription, description: null };
      fixedExpenseRepository.create.mockResolvedValue(mockCreatedExpense);

      const result = await fixedExpenseService.createFixedExpense(dataWithoutDescription);

      expect(result).toEqual(mockCreatedExpense);
      expect(validateString).toHaveBeenCalledWith(undefined, 'Description', { required: false, maxLength: 255 });
    });
  });

  describe('updateFixedExpense', () => {
    const validUpdateData = {
      name: 'Updated Rent',
      amount: 1300,
      category: 'Housing',
      description: 'Updated monthly rent'
    };

    it('should update existing fixed expense', async () => {
      const mockUpdatedExpense = { id: 1, ...validUpdateData };
      fixedExpenseRepository.update.mockResolvedValue(mockUpdatedExpense);

      const result = await fixedExpenseService.updateFixedExpense(1, validUpdateData);

      expect(result).toEqual(mockUpdatedExpense);
      expect(fixedExpenseRepository.update).toHaveBeenCalledWith(1, validUpdateData);
    });

    it('should validate id parameter', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (typeof value !== 'number' || value < 1) throw new Error(`${name} must be a valid positive number`);
        return true;
      });

      await expect(fixedExpenseService.updateFixedExpense('invalid', validUpdateData)).rejects.toThrow('ID must be a valid positive number');
    });

    it('should validate update data fields', async () => {
      validateString.mockImplementation((value, name) => {
        if (name === 'Name' && (!value || value.trim() === '')) {
          throw new Error(`${name} is required`);
        }
        return true;
      });

      const invalidData = { ...validUpdateData, name: '' };
      
      await expect(fixedExpenseService.updateFixedExpense(1, invalidData)).rejects.toThrow('Name is required');
    });

    it('should handle partial updates', async () => {
      const partialUpdate = { amount: 1400 };
      const mockUpdatedExpense = { id: 1, name: 'Rent', amount: 1400, category: 'Housing' };
      fixedExpenseRepository.update.mockResolvedValue(mockUpdatedExpense);

      const result = await fixedExpenseService.updateFixedExpense(1, partialUpdate);

      expect(result).toEqual(mockUpdatedExpense);
      expect(fixedExpenseRepository.update).toHaveBeenCalledWith(1, partialUpdate);
    });
  });

  describe('deleteFixedExpense', () => {
    it('should delete fixed expense by id', async () => {
      fixedExpenseRepository.delete.mockResolvedValue(true);

      const result = await fixedExpenseService.deleteFixedExpense(1);

      expect(result).toBe(true);
      expect(fixedExpenseRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should validate id parameter', async () => {
      validateNumber.mockImplementation((value, name) => {
        if (typeof value !== 'number' || value < 1) throw new Error(`${name} must be a valid positive number`);
        return true;
      });

      await expect(fixedExpenseService.deleteFixedExpense('invalid')).rejects.toThrow('ID must be a valid positive number');
    });

    it('should return false when expense not found', async () => {
      fixedExpenseRepository.delete.mockResolvedValue(false);

      const result = await fixedExpenseService.deleteFixedExpense(999);

      expect(result).toBe(false);
    });
  });

  describe('getFixedExpensesForMonth', () => {
    it('should return fixed expenses for specific month', async () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing', year: 2024, month: 11 },
        { id: 2, name: 'Insurance', amount: 300, category: 'Insurance', year: 2024, month: 11 }
      ];
      fixedExpenseRepository.getForMonth.mockResolvedValue(mockExpenses);

      const result = await fixedExpenseService.getFixedExpensesForMonth(2024, 11);

      expect(result).toEqual(mockExpenses);
      expect(fixedExpenseRepository.getForMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should validate year and month parameters', async () => {
      await fixedExpenseService.getFixedExpensesForMonth(2024, 11);

      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should handle invalid year/month', async () => {
      validateYearMonth.mockImplementation(() => {
        throw new Error('Invalid year or month');
      });

      await expect(fixedExpenseService.getFixedExpensesForMonth(2024, 13)).rejects.toThrow('Invalid year or month');
    });
  });

  describe('carryForwardFixedExpenses', () => {
    it('should carry forward fixed expenses to next month', async () => {
      const mockCarriedExpenses = [
        { id: 3, name: 'Rent', amount: 1200, category: 'Housing', year: 2024, month: 12 },
        { id: 4, name: 'Insurance', amount: 300, category: 'Insurance', year: 2024, month: 12 }
      ];
      fixedExpenseRepository.carryForward.mockResolvedValue(mockCarriedExpenses);

      const result = await fixedExpenseService.carryForwardFixedExpenses(2024, 11);

      expect(result).toEqual(mockCarriedExpenses);
      expect(fixedExpenseRepository.carryForward).toHaveBeenCalledWith(2024, 11);
    });

    it('should validate year and month parameters', async () => {
      await fixedExpenseService.carryForwardFixedExpenses(2024, 11);

      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should handle carry forward errors', async () => {
      const error = new Error('Carry forward failed');
      fixedExpenseRepository.carryForward.mockRejectedValue(error);

      await expect(fixedExpenseService.carryForwardFixedExpenses(2024, 11)).rejects.toThrow('Carry forward failed');
    });

    it('should handle year rollover (December to January)', async () => {
      const mockCarriedExpenses = [
        { id: 5, name: 'Rent', amount: 1200, category: 'Housing', year: 2025, month: 1 }
      ];
      fixedExpenseRepository.carryForward.mockResolvedValue(mockCarriedExpenses);

      const result = await fixedExpenseService.carryForwardFixedExpenses(2024, 12);

      expect(result).toEqual(mockCarriedExpenses);
      expect(fixedExpenseRepository.carryForward).toHaveBeenCalledWith(2024, 12);
    });
  });

  describe('getTotalFixedExpensesForMonth', () => {
    it('should return total amount of fixed expenses for month', async () => {
      const mockExpenses = [
        { amount: 1200 },
        { amount: 300 },
        { amount: 150 }
      ];
      fixedExpenseRepository.getForMonth.mockResolvedValue(mockExpenses);

      const result = await fixedExpenseService.getTotalFixedExpensesForMonth(2024, 11);

      expect(result).toBe(1650);
      expect(fixedExpenseRepository.getForMonth).toHaveBeenCalledWith(2024, 11);
    });

    it('should return 0 when no fixed expenses exist', async () => {
      fixedExpenseRepository.getForMonth.mockResolvedValue([]);

      const result = await fixedExpenseService.getTotalFixedExpensesForMonth(2024, 11);

      expect(result).toBe(0);
    });

    it('should validate year and month parameters', async () => {
      fixedExpenseRepository.getForMonth.mockResolvedValue([]);
      
      await fixedExpenseService.getTotalFixedExpensesForMonth(2024, 11);

      expect(validateYearMonth).toHaveBeenCalledWith(2024, 11);
    });
  });

  describe('getFixedExpensesByCategory', () => {
    it('should return fixed expenses grouped by category', async () => {
      const mockExpenses = [
        { id: 1, name: 'Rent', amount: 1200, category: 'Housing' },
        { id: 2, name: 'Mortgage', amount: 1500, category: 'Housing' },
        { id: 3, name: 'Car Insurance', amount: 200, category: 'Insurance' },
        { id: 4, name: 'Health Insurance', amount: 400, category: 'Insurance' }
      ];
      fixedExpenseRepository.getAll.mockResolvedValue(mockExpenses);

      const result = await fixedExpenseService.getFixedExpensesByCategory();

      expect(result).toEqual({
        'Housing': [
          { id: 1, name: 'Rent', amount: 1200, category: 'Housing' },
          { id: 2, name: 'Mortgage', amount: 1500, category: 'Housing' }
        ],
        'Insurance': [
          { id: 3, name: 'Car Insurance', amount: 200, category: 'Insurance' },
          { id: 4, name: 'Health Insurance', amount: 400, category: 'Insurance' }
        ]
      });
    });

    it('should return empty object when no expenses exist', async () => {
      fixedExpenseRepository.getAll.mockResolvedValue([]);

      const result = await fixedExpenseService.getFixedExpensesByCategory();

      expect(result).toEqual({});
    });
  });
});
