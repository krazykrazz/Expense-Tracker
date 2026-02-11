const fixedExpenseService = require('./fixedExpenseService');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const loanRepository = require('../repositories/loanRepository');
const { validateYearMonth } = require('../utils/validators');

// Mock dependencies
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../repositories/paymentMethodRepository');
jest.mock('../repositories/loanRepository');
jest.mock('./activityLogService');
jest.mock('../utils/validators');

// Default mock payment methods for validation
const mockPaymentMethods = [
  { id: 1, display_name: 'Cash', type: 'cash' },
  { id: 2, display_name: 'Debit', type: 'debit' },
  { id: 3, display_name: 'Cheque', type: 'cheque' },
  { id: 4, display_name: 'CIBC MC', type: 'credit_card' }
];

describe('fixedExpenseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default validator mock to not throw
    validateYearMonth.mockImplementation(() => {});
    // Default payment methods mock
    paymentMethodRepository.findAll.mockResolvedValue(mockPaymentMethods);
    // Default loan repository mock - return null for non-existent loans
    loanRepository.findById.mockResolvedValue(null);
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
      const mockCreatedExpense = { id: 1, ...expenseData, payment_due_day: null, linked_loan_id: null };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue(mockCreatedExpense);

      const result = await fixedExpenseService.createFixedExpense(expenseData);

      expect(result).toEqual(mockCreatedExpense);
      expect(fixedExpenseRepository.createFixedExpense).toHaveBeenCalledWith({
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: null,
        linked_loan_id: null
      });
    });

    it('should create a fixed expense with payment_due_day', async () => {
      const expenseData = {
        year: 2024,
        month: 11,
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 15
      };
      const mockCreatedExpense = { id: 1, ...expenseData, linked_loan_id: null };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue(mockCreatedExpense);

      const result = await fixedExpenseService.createFixedExpense(expenseData);

      expect(result).toEqual(mockCreatedExpense);
      expect(fixedExpenseRepository.createFixedExpense).toHaveBeenCalledWith({
        year: 2024,
        month: 11,
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 15,
        linked_loan_id: null
      });
    });

    it('should create a fixed expense with linked_loan_id', async () => {
      const mockLoan = { id: 1, name: 'Home Mortgage', is_paid_off: 0 };
      loanRepository.findById.mockResolvedValue(mockLoan);
      
      const expenseData = {
        year: 2024,
        month: 11,
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        linked_loan_id: 1
      };
      const mockCreatedExpense = { id: 1, ...expenseData, payment_due_day: null };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue(mockCreatedExpense);

      const result = await fixedExpenseService.createFixedExpense(expenseData);

      expect(result).toEqual(mockCreatedExpense);
      expect(loanRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should return warning when linked loan is paid off', async () => {
      const mockLoan = { id: 1, name: 'Home Mortgage', is_paid_off: 1 };
      loanRepository.findById.mockResolvedValue(mockLoan);
      
      const expenseData = {
        year: 2024,
        month: 11,
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        linked_loan_id: 1
      };
      const mockCreatedExpense = { id: 1, ...expenseData, payment_due_day: null };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue(mockCreatedExpense);

      const result = await fixedExpenseService.createFixedExpense(expenseData);

      expect(result.warning).toBe('Linked loan is marked as paid off');
    });

    it('should throw error when linked_loan_id is invalid', async () => {
      loanRepository.findById.mockResolvedValue(null);
      
      const expenseData = {
        year: 2024,
        month: 11,
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        linked_loan_id: 999
      };

      await expect(fixedExpenseService.createFixedExpense(expenseData)).rejects.toThrow('Invalid loan ID');
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
      fixedExpenseRepository.createFixedExpense.mockResolvedValue({ id: 1, ...expenseData, name: 'Rent', payment_due_day: null, linked_loan_id: null });

      await fixedExpenseService.createFixedExpense(expenseData);

      expect(fixedExpenseRepository.createFixedExpense).toHaveBeenCalledWith({
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: null,
        linked_loan_id: null
      });
    });
  });

  describe('updateFixedExpense', () => {
    const mockOldExpense = { id: 1, year: 2024, month: 11, name: 'Rent', amount: 1200, category: 'Housing', payment_type: 'Debit', payment_due_day: null, linked_loan_id: null };

    beforeEach(() => {
      fixedExpenseRepository.findById.mockResolvedValue(mockOldExpense);
    });

    it('should update existing fixed expense', async () => {
      const updateData = {
        name: 'Updated Rent',
        amount: 1300,
        category: 'Housing',
        payment_type: 'Debit'
      };
      const mockUpdatedExpense = { id: 1, year: 2024, month: 11, ...updateData, payment_due_day: null, linked_loan_id: null };
      fixedExpenseRepository.updateFixedExpense.mockResolvedValue(mockUpdatedExpense);

      const result = await fixedExpenseService.updateFixedExpense(1, updateData);

      expect(result).toEqual(mockUpdatedExpense);
      expect(fixedExpenseRepository.updateFixedExpense).toHaveBeenCalledWith(1, {
        name: 'Updated Rent',
        amount: 1300,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: null,
        linked_loan_id: null
      });
    });

    it('should update fixed expense with payment_due_day', async () => {
      const updateData = {
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 15
      };
      const mockUpdatedExpense = { id: 1, year: 2024, month: 11, ...updateData, linked_loan_id: null };
      fixedExpenseRepository.updateFixedExpense.mockResolvedValue(mockUpdatedExpense);

      const result = await fixedExpenseService.updateFixedExpense(1, updateData);

      expect(result).toEqual(mockUpdatedExpense);
      expect(fixedExpenseRepository.updateFixedExpense).toHaveBeenCalledWith(1, {
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 15,
        linked_loan_id: null
      });
    });

    it('should update fixed expense with linked_loan_id', async () => {
      const mockLoan = { id: 1, name: 'Home Mortgage', is_paid_off: 0 };
      loanRepository.findById.mockResolvedValue(mockLoan);
      
      const updateData = {
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        linked_loan_id: 1
      };
      const mockUpdatedExpense = { id: 1, year: 2024, month: 11, ...updateData, payment_due_day: null };
      fixedExpenseRepository.updateFixedExpense.mockResolvedValue(mockUpdatedExpense);

      const result = await fixedExpenseService.updateFixedExpense(1, updateData);

      expect(result).toEqual(mockUpdatedExpense);
      expect(loanRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should return warning when updating with paid off loan', async () => {
      const mockLoan = { id: 1, name: 'Home Mortgage', is_paid_off: 1 };
      loanRepository.findById.mockResolvedValue(mockLoan);
      
      const updateData = {
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        linked_loan_id: 1
      };
      const mockUpdatedExpense = { id: 1, year: 2024, month: 11, ...updateData, payment_due_day: null };
      fixedExpenseRepository.updateFixedExpense.mockResolvedValue(mockUpdatedExpense);

      const result = await fixedExpenseService.updateFixedExpense(1, updateData);

      expect(result.warning).toBe('Linked loan is marked as paid off');
    });

    it('should throw error when updating with invalid loan ID', async () => {
      loanRepository.findById.mockResolvedValue(null);
      
      const updateData = {
        name: 'Mortgage',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        linked_loan_id: 999
      };

      await expect(fixedExpenseService.updateFixedExpense(1, updateData)).rejects.toThrow('Invalid loan ID');
    });

    it('should throw error when id is missing', async () => {
      await expect(fixedExpenseService.updateFixedExpense(null, { name: 'Test', amount: 100, category: 'Housing', payment_type: 'Cash' }))
        .rejects.toThrow('Fixed expense ID is required');
    });

    it('should return null when fixed expense not found', async () => {
      fixedExpenseRepository.findById.mockResolvedValue(null);

      const result = await fixedExpenseService.updateFixedExpense(999, { name: 'Test', amount: 100, category: 'Housing', payment_type: 'Cash' });

      expect(result).toBeNull();
    });
  });

  describe('deleteFixedExpense', () => {
    beforeEach(() => {
      fixedExpenseRepository.findById.mockResolvedValue({ id: 1, name: 'Rent', amount: 1200, category: 'Housing', payment_type: 'Debit' });
    });

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

    it('should throw error for payment_due_day less than 1', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 0
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData))
        .rejects.toThrow('Payment due day must be between 1 and 31');
    });

    it('should throw error for payment_due_day greater than 31', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 32
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData))
        .rejects.toThrow('Payment due day must be between 1 and 31');
    });

    it('should throw error for negative payment_due_day', async () => {
      const invalidData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: -5
      };

      await expect(fixedExpenseService.createFixedExpense(invalidData))
        .rejects.toThrow('Payment due day must be between 1 and 31');
    });

    it('should accept null payment_due_day', async () => {
      const validData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: null
      };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue({ id: 1, ...validData, linked_loan_id: null });

      const result = await fixedExpenseService.createFixedExpense(validData);

      expect(result.payment_due_day).toBeNull();
    });

    it('should accept undefined payment_due_day', async () => {
      const validData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit'
      };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue({ id: 1, ...validData, payment_due_day: null, linked_loan_id: null });

      const result = await fixedExpenseService.createFixedExpense(validData);

      expect(result.payment_due_day).toBeNull();
    });

    it('should accept empty string payment_due_day as null', async () => {
      const validData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: ''
      };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue({ id: 1, ...validData, payment_due_day: null, linked_loan_id: null });

      await fixedExpenseService.createFixedExpense(validData);

      expect(fixedExpenseRepository.createFixedExpense).toHaveBeenCalledWith(
        expect.objectContaining({ payment_due_day: null })
      );
    });

    it('should accept valid payment_due_day values 1-31', async () => {
      const validData = {
        year: 2024,
        month: 11,
        name: 'Rent',
        amount: 1200,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 15
      };
      fixedExpenseRepository.createFixedExpense.mockResolvedValue({ id: 1, ...validData, linked_loan_id: null });

      const result = await fixedExpenseService.createFixedExpense(validData);

      expect(result.payment_due_day).toBe(15);
    });
  });
});
