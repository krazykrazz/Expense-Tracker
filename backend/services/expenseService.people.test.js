const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const peopleRepository = require('../repositories/peopleRepository');

// Mock the repositories
jest.mock('../repositories/expenseRepository');
jest.mock('../repositories/expensePeopleRepository');
jest.mock('../repositories/peopleRepository');

/**
 * Unit Tests for Expense Service - People Integration
 * Tests single person expense creation, multi-person expense creation,
 * allocation validation errors, and expense update with people changes
 * Requirements: 2.2, 2.4, 4.1
 */

describe('ExpenseService - People Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for peopleRepository.findById - return a valid person
    peopleRepository.findById.mockImplementation((id) => Promise.resolve({ id, name: `Person ${id}` }));
  });

  describe('Single person expense creation', () => {
    test('should create expense with single person allocation', async () => {
      // Mock repository responses
      const mockExpense = {
        id: 1,
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const mockAssociation = {
        id: 1,
        expenseId: 1,
        personId: 123,
        amount: 150.00
      };

      expenseRepository.create.mockResolvedValue(mockExpense);
      expensePeopleRepository.createAssociations.mockResolvedValue([mockAssociation]);
      // Note: getPeopleForExpenses returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpenses.mockResolvedValue({
        1: [{
          id: 123,
          amount: 150.00
        }]
      });

      // Test data
      const expenseData = {
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const personAllocations = [{
        personId: 123,
        amount: 150.00
      }];

      // Execute
      const result = await expenseService.createExpenseWithPeople(expenseData, personAllocations);

      // Verify
      expect(expenseRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA'
      }));

      expect(expensePeopleRepository.createAssociations).toHaveBeenCalledWith(1, personAllocations);

      expect(result).toEqual({
        ...mockExpense,
        people: [{
          id: 123,
          amount: 150.00
        }]
      });
    });

    test('should create expense without people when no allocations provided', async () => {
      // Mock repository response
      const mockExpense = {
        id: 1,
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      expenseRepository.create.mockResolvedValue(mockExpense);

      // Test data
      const expenseData = {
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      // Execute
      const result = await expenseService.createExpenseWithPeople(expenseData, []);

      // Verify
      expect(expenseRepository.create).toHaveBeenCalled();
      expect(expensePeopleRepository.createAssociations).not.toHaveBeenCalled();
      expect(result).toEqual(mockExpense);
    });
  });

  describe('Multi-person expense creation', () => {
    test('should create expense with multiple person allocations', async () => {
      // Mock repository responses
      const mockExpense = {
        id: 1,
        date: '2024-01-15',
        place: 'Family Doctor',
        amount: 300.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const mockAssociations = [
        { id: 1, expenseId: 1, personId: 123, amount: 150.00 },
        { id: 2, expenseId: 1, personId: 456, amount: 150.00 }
      ];

      expenseRepository.create.mockResolvedValue(mockExpense);
      expensePeopleRepository.createAssociations.mockResolvedValue(mockAssociations);
      // Note: getPeopleForExpenses returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpenses.mockResolvedValue({
        1: [
          { id: 123, amount: 150.00 },
          { id: 456, amount: 150.00 }
        ]
      });

      // Test data
      const expenseData = {
        date: '2024-01-15',
        place: 'Family Doctor',
        amount: 300.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const personAllocations = [
        { personId: 123, amount: 150.00 },
        { personId: 456, amount: 150.00 }
      ];

      // Execute
      const result = await expenseService.createExpenseWithPeople(expenseData, personAllocations);

      // Verify
      expect(expenseRepository.create).toHaveBeenCalled();
      expect(expensePeopleRepository.createAssociations).toHaveBeenCalledWith(1, personAllocations);

      expect(result).toEqual({
        ...mockExpense,
        people: [
          { id: 123, amount: 150.00 },
          { id: 456, amount: 150.00 }
        ]
      });
    });

    test('should create expense with unequal person allocations', async () => {
      // Mock repository responses
      const mockExpense = {
        id: 1,
        date: '2024-01-15',
        place: 'Specialist Clinic',
        amount: 250.00,
        type: 'Tax - Medical',
        method: 'Debit'
      };

      const mockAssociations = [
        { id: 1, expenseId: 1, personId: 123, amount: 100.00 },
        { id: 2, expenseId: 1, personId: 456, amount: 150.00 }
      ];

      expenseRepository.create.mockResolvedValue(mockExpense);
      expensePeopleRepository.createAssociations.mockResolvedValue(mockAssociations);
      // Note: getPeopleForExpenses returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpenses.mockResolvedValue({
        1: [
          { id: 123, amount: 100.00 },
          { id: 456, amount: 150.00 }
        ]
      });

      // Test data
      const expenseData = {
        date: '2024-01-15',
        place: 'Specialist Clinic',
        amount: 250.00,
        type: 'Tax - Medical',
        method: 'Debit'
      };

      const personAllocations = [
        { personId: 123, amount: 100.00 },
        { personId: 456, amount: 150.00 }
      ];

      // Execute
      const result = await expenseService.createExpenseWithPeople(expenseData, personAllocations);

      // Verify
      expect(result.people).toEqual([
        { id: 123, amount: 100.00 },
        { id: 456, amount: 150.00 }
      ]);
    });
  });

  describe('Allocation validation errors', () => {
    test('should reject allocations that do not sum to total', async () => {
      const expenseData = {
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 300.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const invalidAllocations = [
        { personId: 123, amount: 100.00 },
        { personId: 456, amount: 150.00 } // Total: 250.00, but expense is 300.00
      ];

      // Execute & Verify
      await expect(
        expenseService.createExpenseWithPeople(expenseData, invalidAllocations)
      ).rejects.toThrow(/Total allocated amount .* must equal expense amount/);

      expect(expenseRepository.create).not.toHaveBeenCalled();
      expect(expensePeopleRepository.createAssociations).not.toHaveBeenCalled();
    });

    test('should reject duplicate person IDs', async () => {
      const expenseData = {
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 300.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const invalidAllocations = [
        { personId: 123, amount: 150.00 },
        { personId: 123, amount: 150.00 } // Duplicate person ID
      ];

      // Execute & Verify
      await expect(
        expenseService.createExpenseWithPeople(expenseData, invalidAllocations)
      ).rejects.toThrow(/Cannot allocate to the same person multiple times/);

      expect(expenseRepository.create).not.toHaveBeenCalled();
      expect(expensePeopleRepository.createAssociations).not.toHaveBeenCalled();
    });

    test('should reject invalid person IDs', async () => {
      const expenseData = {
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const invalidAllocations = [
        { personId: null, amount: 150.00 }
      ];

      // Execute & Verify
      await expect(
        expenseService.createExpenseWithPeople(expenseData, invalidAllocations)
      ).rejects.toThrow(/Each allocation must have a valid personId/);

      expect(expenseRepository.create).not.toHaveBeenCalled();
      expect(expensePeopleRepository.createAssociations).not.toHaveBeenCalled();
    });

    test('should reject negative amounts', async () => {
      const expenseData = {
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const invalidAllocations = [
        { personId: 123, amount: -50.00 }
      ];

      // Execute & Verify
      await expect(
        expenseService.createExpenseWithPeople(expenseData, invalidAllocations)
      ).rejects.toThrow(/Each allocation amount must be a positive number/);

      expect(expenseRepository.create).not.toHaveBeenCalled();
      expect(expensePeopleRepository.createAssociations).not.toHaveBeenCalled();
    });

    test('should reject amounts with more than 2 decimal places', async () => {
      const expenseData = {
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.12,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const invalidAllocations = [
        { personId: 123, amount: 150.123 }
      ];

      // Execute & Verify
      await expect(
        expenseService.createExpenseWithPeople(expenseData, invalidAllocations)
      ).rejects.toThrow(/Allocation amounts must have at most 2 decimal places/);

      expect(expenseRepository.create).not.toHaveBeenCalled();
      expect(expensePeopleRepository.createAssociations).not.toHaveBeenCalled();
    });
  });

  describe('Expense update with people changes', () => {
    test('should update expense and people allocations', async () => {
      // Mock repository responses
      const mockExistingExpense = {
        id: 1,
        date: '2024-01-15',
        place: 'Old Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA',
        payment_method_id: null
      };

      const mockUpdatedExpense = {
        id: 1,
        date: '2024-01-16',
        place: 'Updated Clinic',
        amount: 200.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const mockUpdatedAssociations = [
        { id: 1, expenseId: 1, personId: 789, amount: 200.00 }
      ];

      // Mock findById for updateExpense to get old expense data
      expenseRepository.findById.mockResolvedValue(mockExistingExpense);
      expenseRepository.update.mockResolvedValue(mockUpdatedExpense);
      expensePeopleRepository.updateExpenseAllocations.mockResolvedValue(mockUpdatedAssociations);
      // Note: getPeopleForExpenses returns 'id' (not 'personId') for frontend compatibility
      expensePeopleRepository.getPeopleForExpenses.mockResolvedValue({
        1: [{ id: 789, amount: 200.00 }]
      });

      // Test data
      const expenseData = {
        date: '2024-01-16',
        place: 'Updated Clinic',
        amount: 200.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const personAllocations = [{
        personId: 789,
        amount: 200.00
      }];

      // Execute
      const result = await expenseService.updateExpenseWithPeople(1, expenseData, personAllocations);

      // Verify
      expect(expenseRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({
        date: '2024-01-16',
        place: 'Updated Clinic',
        amount: 200.00,
        type: 'Tax - Medical',
        method: 'VISA'
      }));

      expect(expensePeopleRepository.updateExpenseAllocations).toHaveBeenCalledWith(1, personAllocations);

      expect(result).toEqual({
        ...mockUpdatedExpense,
        people: [{
          id: 789,
          amount: 200.00
        }]
      });
    });

    test('should handle expense update when expense not found', async () => {
      // Mock findById to return null (expense not found)
      expenseRepository.findById.mockResolvedValue(null);

      const expenseData = {
        date: '2024-01-16',
        place: 'Updated Clinic',
        amount: 200.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      const personAllocations = [{
        personId: 789,
        amount: 200.00
      }];

      // Execute
      const result = await expenseService.updateExpenseWithPeople(999, expenseData, personAllocations);

      // Verify
      expect(result).toBeNull();
      expect(expensePeopleRepository.updateExpenseAllocations).not.toHaveBeenCalled();
    });

    test('should update expense and remove all people allocations', async () => {
      // Mock repository responses
      const mockExistingExpense = {
        id: 1,
        date: '2024-01-15',
        place: 'Old Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA',
        payment_method_id: null
      };

      const mockUpdatedExpense = {
        id: 1,
        date: '2024-01-16',
        place: 'Updated Clinic',
        amount: 200.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      // Mock findById for updateExpense to get old expense data
      expenseRepository.findById.mockResolvedValue(mockExistingExpense);
      expenseRepository.update.mockResolvedValue(mockUpdatedExpense);
      expensePeopleRepository.updateExpenseAllocations.mockResolvedValue([]);
      expensePeopleRepository.getPeopleForExpenses.mockResolvedValue({
        1: []
      });

      // Test data
      const expenseData = {
        date: '2024-01-16',
        place: 'Updated Clinic',
        amount: 200.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      // Execute - no people allocations
      const result = await expenseService.updateExpenseWithPeople(1, expenseData, []);

      // Verify
      expect(expenseRepository.update).toHaveBeenCalled();
      expect(expensePeopleRepository.updateExpenseAllocations).toHaveBeenCalledWith(1, []);

      expect(result).toEqual({
        ...mockUpdatedExpense,
        people: []
      });
    });
  });

  describe('Get expense with people', () => {
    test('should retrieve expense with associated people', async () => {
      // Mock repository responses
      const mockExpense = {
        id: 1,
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 300.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      // Mock data matches what repository actually returns (id, not personId)
      const mockPeople = [
        {
          id: 123,
          name: 'John Doe',
          dateOfBirth: '1990-01-01',
          amount: 150.00,
          originalAmount: 150.00
        },
        {
          id: 456,
          name: 'Jane Doe',
          dateOfBirth: '1992-05-15',
          amount: 150.00,
          originalAmount: 150.00
        }
      ];

      expenseRepository.findById.mockResolvedValue(mockExpense);
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue(mockPeople);

      // Execute
      const result = await expenseService.getExpenseWithPeople(1);

      // Verify
      expect(expenseRepository.findById).toHaveBeenCalledWith(1);
      expect(expensePeopleRepository.getPeopleForExpense).toHaveBeenCalledWith(1);

      expect(result).toEqual({
        ...mockExpense,
        people: [
          {
            id: 123,
            name: 'John Doe',
            dateOfBirth: '1990-01-01',
            amount: 150.00,
            originalAmount: 150.00
          },
          {
            id: 456,
            name: 'Jane Doe',
            dateOfBirth: '1992-05-15',
            amount: 150.00,
            originalAmount: 150.00
          }
        ]
      });
    });

    test('should return null when expense not found', async () => {
      expenseRepository.findById.mockResolvedValue(null);

      // Execute
      const result = await expenseService.getExpenseWithPeople(999);

      // Verify
      expect(result).toBeNull();
      expect(expensePeopleRepository.getPeopleForExpense).not.toHaveBeenCalled();
    });

    test('should retrieve expense with no people associations', async () => {
      // Mock repository responses
      const mockExpense = {
        id: 1,
        date: '2024-01-15',
        place: 'Medical Clinic',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'VISA'
      };

      expenseRepository.findById.mockResolvedValue(mockExpense);
      expensePeopleRepository.getPeopleForExpense.mockResolvedValue([]);

      // Execute
      const result = await expenseService.getExpenseWithPeople(1);

      // Verify
      expect(result).toEqual({
        ...mockExpense,
        people: []
      });
    });
  });
});