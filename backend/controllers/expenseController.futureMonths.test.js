/**
 * Unit tests for expense controller futureMonths functionality
 * Tests the "Add to future months" feature for create and update operations
 * 
 * Validates: Requirements 1.3, 2.3, 4.1, 4.2
 */

const expenseController = require('./expenseController');
const expenseService = require('../services/expenseService');

// Mock the expense service
jest.mock('../services/expenseService');

describe('ExpenseController - Future Months Feature', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      query: {},
      params: {},
      body: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('POST /api/expenses - createExpense with futureMonths', () => {
    const baseExpenseData = {
      date: '2025-01-15',
      place: 'Netflix',
      amount: 15.99,
      type: 'Subscriptions',
      method: 'VISA',
      notes: 'Monthly subscription'
    };

    test('should create expense without futureMonths (backward compatible)', async () => {
      const mockExpense = { id: 1, ...baseExpenseData, week: 3 };
      req.body = { ...baseExpenseData };
      
      expenseService.createExpense.mockResolvedValue(mockExpense);

      await expenseController.createExpense(req, res);

      expect(expenseService.createExpense).toHaveBeenCalledWith(baseExpenseData, 0);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockExpense);
    });

    test('should create expense with futureMonths=0 (backward compatible)', async () => {
      const mockExpense = { id: 1, ...baseExpenseData, week: 3 };
      req.body = { ...baseExpenseData, futureMonths: 0 };
      
      expenseService.createExpense.mockResolvedValue(mockExpense);

      await expenseController.createExpense(req, res);

      expect(expenseService.createExpense).toHaveBeenCalledWith(baseExpenseData, 0);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockExpense);
    });

    test('should create expense with futureMonths and return formatted response', async () => {
      const mockResult = {
        expense: { id: 1, ...baseExpenseData, week: 3 },
        futureExpenses: [
          { id: 2, ...baseExpenseData, date: '2025-02-15', week: 3 },
          { id: 3, ...baseExpenseData, date: '2025-03-15', week: 3 },
          { id: 4, ...baseExpenseData, date: '2025-04-15', week: 3 }
        ]
      };
      req.body = { ...baseExpenseData, futureMonths: 3 };
      
      expenseService.createExpense.mockResolvedValue(mockResult);

      await expenseController.createExpense(req, res);

      expect(expenseService.createExpense).toHaveBeenCalledWith(baseExpenseData, 3);
      expect(res.status).toHaveBeenCalledWith(201);
      
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.expense).toEqual(mockResult.expense);
      expect(responseBody.futureExpenses).toEqual(mockResult.futureExpenses);
      expect(responseBody.message).toContain('3 future months');
      expect(responseBody.message).toContain('April 2025');
    });

    test('should generate correct message for 1 future month', async () => {
      const mockResult = {
        expense: { id: 1, ...baseExpenseData, week: 3 },
        futureExpenses: [
          { id: 2, ...baseExpenseData, date: '2025-02-15', week: 3 }
        ]
      };
      req.body = { ...baseExpenseData, futureMonths: 1 };
      
      expenseService.createExpense.mockResolvedValue(mockResult);

      await expenseController.createExpense(req, res);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.message).toContain('1 future month');
      expect(responseBody.message).not.toContain('months');
    });

    test('should pass futureMonths to service with people allocations', async () => {
      const peopleAllocations = [{ personId: 1, amount: 50 }];
      const mockResult = {
        expense: { id: 1, ...baseExpenseData, type: 'Tax - Medical', week: 3, people: [] },
        futureExpenses: [
          { id: 2, ...baseExpenseData, type: 'Tax - Medical', date: '2025-02-15', week: 3, people: [] }
        ]
      };
      req.body = { ...baseExpenseData, type: 'Tax - Medical', amount: 50, peopleAllocations, futureMonths: 1 };
      
      expenseService.createExpenseWithPeople.mockResolvedValue(mockResult);

      await expenseController.createExpense(req, res);

      expect(expenseService.createExpenseWithPeople).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Tax - Medical', amount: 50 }),
        peopleAllocations,
        1
      );
    });

    test('should return 400 for service validation errors', async () => {
      req.body = { ...baseExpenseData, futureMonths: 15 };
      
      expenseService.createExpense.mockRejectedValue(new Error('Future months must be between 0 and 12'));

      await expenseController.createExpense(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Future months must be between 0 and 12' });
    });
  });

  describe('PUT /api/expenses/:id - updateExpense with futureMonths', () => {
    const baseExpenseData = {
      date: '2025-01-15',
      place: 'Netflix',
      amount: 17.99,
      type: 'Subscriptions',
      method: 'VISA',
      notes: 'Updated subscription'
    };

    test('should update expense without futureMonths (backward compatible)', async () => {
      const mockExpense = { id: 1, ...baseExpenseData, week: 3 };
      req.params = { id: '1' };
      req.body = { ...baseExpenseData };
      
      expenseService.updateExpense.mockResolvedValue(mockExpense);

      await expenseController.updateExpense(req, res);

      expect(expenseService.updateExpense).toHaveBeenCalledWith(1, baseExpenseData, 0);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockExpense);
    });

    test('should update expense with futureMonths and return formatted response', async () => {
      const mockResult = {
        expense: { id: 1, ...baseExpenseData, week: 3 },
        futureExpenses: [
          { id: 5, ...baseExpenseData, date: '2025-02-15', week: 3 },
          { id: 6, ...baseExpenseData, date: '2025-03-15', week: 3 }
        ]
      };
      req.params = { id: '1' };
      req.body = { ...baseExpenseData, futureMonths: 2 };
      
      expenseService.updateExpense.mockResolvedValue(mockResult);

      await expenseController.updateExpense(req, res);

      expect(expenseService.updateExpense).toHaveBeenCalledWith(1, baseExpenseData, 2);
      expect(res.status).toHaveBeenCalledWith(200);
      
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.expense).toEqual(mockResult.expense);
      expect(responseBody.futureExpenses).toEqual(mockResult.futureExpenses);
      expect(responseBody.message).toContain('2 future months');
      expect(responseBody.message).toContain('March 2025');
    });

    test('should pass futureMonths to service with people allocations', async () => {
      const peopleAllocations = [{ personId: 1, amount: 100 }];
      const mockResult = {
        expense: { id: 1, ...baseExpenseData, type: 'Tax - Medical', week: 3, people: [] },
        futureExpenses: [
          { id: 7, ...baseExpenseData, type: 'Tax - Medical', date: '2025-02-15', week: 3, people: [] }
        ]
      };
      req.params = { id: '1' };
      req.body = { ...baseExpenseData, type: 'Tax - Medical', amount: 100, peopleAllocations, futureMonths: 1 };
      
      expenseService.updateExpenseWithPeople.mockResolvedValue(mockResult);

      await expenseController.updateExpense(req, res);

      expect(expenseService.updateExpenseWithPeople).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'Tax - Medical', amount: 100 }),
        peopleAllocations,
        1
      );
    });

    test('should return 404 when expense not found', async () => {
      req.params = { id: '999' };
      req.body = { ...baseExpenseData, futureMonths: 1 };
      
      expenseService.updateExpense.mockResolvedValue(null);

      await expenseController.updateExpense(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Expense not found' });
    });

    test('should return 400 for invalid expense ID', async () => {
      req.params = { id: 'invalid' };
      req.body = { ...baseExpenseData };

      await expenseController.updateExpense(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid expense ID' });
    });

    test('should return 400 for service validation errors', async () => {
      req.params = { id: '1' };
      req.body = { ...baseExpenseData, futureMonths: -1 };
      
      expenseService.updateExpense.mockRejectedValue(new Error('Future months must be between 0 and 12'));

      await expenseController.updateExpense(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Future months must be between 0 and 12' });
    });
  });

  describe('Success message generation', () => {
    test('should generate message with correct month name for year boundary', async () => {
      const baseExpenseData = {
        date: '2025-11-15',
        place: 'Test',
        amount: 10,
        type: 'Other',
        method: 'Cash'
      };
      const mockResult = {
        expense: { id: 1, ...baseExpenseData, week: 3 },
        futureExpenses: [
          { id: 2, ...baseExpenseData, date: '2025-12-15', week: 3 },
          { id: 3, ...baseExpenseData, date: '2026-01-15', week: 3 },
          { id: 4, ...baseExpenseData, date: '2026-02-15', week: 3 }
        ]
      };
      req.body = { ...baseExpenseData, futureMonths: 3 };
      
      expenseService.createExpense.mockResolvedValue(mockResult);

      await expenseController.createExpense(req, res);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.message).toContain('February 2026');
    });
  });
});
