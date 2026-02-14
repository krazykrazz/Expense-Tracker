const budgetController = require('./budgetController');
const budgetService = require('../services/budgetService');

// Mock the budget service
jest.mock('../services/budgetService');

describe('BudgetController - Unit Tests', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Setup mock request and response objects
    req = {
      query: {},
      params: {},
      body: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('GET /api/budgets - getBudgets', () => {
    test('should return budgets for valid year and month', async () => {
      const mockBudgets = [
        { id: 1, year: 2025, month: 11, category: 'Groceries', limit: 500 }
      ];

      req.query = { year: '2025', month: '11' };
      budgetService.getBudgets.mockResolvedValue(mockBudgets);

      await budgetController.getBudgets(req, res);

      expect(budgetService.getBudgets).toHaveBeenCalledWith('2025', '11');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ budgets: mockBudgets });
    });

    test('should return 400 when year is missing', async () => {
      req.query = { month: '11' };

      await budgetController.getBudgets(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_DATE',
          message: 'Year and month query parameters are required'
        }
      });
    });

    test('should return 400 when month is missing', async () => {
      req.query = { year: '2025' };

      await budgetController.getBudgets(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_DATE',
          message: 'Year and month query parameters are required'
        }
      });
    });

    test('should return 400 for invalid date', async () => {
      req.query = { year: '2025', month: '13' };
      budgetService.getBudgets.mockRejectedValue(new Error('Invalid year or month specified'));

      await budgetController.getBudgets(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_DATE',
          message: 'Invalid year or month specified'
        }
      });
    });
  });

  describe('POST /api/budgets - createBudget', () => {
    test('should create budget with valid data', async () => {
      const mockBudget = { id: 1, year: 2025, month: 11, category: 'Groceries', limit: 500 };

      req.body = { year: 2025, month: 11, category: 'Groceries', limit: 500 };
      budgetService.createBudget.mockResolvedValue(mockBudget);

      await budgetController.createBudget(req, res);

      expect(budgetService.createBudget).toHaveBeenCalledWith(2025, 11, 'Groceries', 500);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockBudget);
    });

    test('should return 400 when required fields are missing', async () => {
      req.body = { year: 2025, month: 11 }; // Missing category and limit

      await budgetController.createBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Year, month, category, and limit are required'
        }
      });
    });

    test('should return 400 for invalid budget amount', async () => {
      req.body = { year: 2025, month: 11, category: 'Groceries', limit: -100 };
      budgetService.createBudget.mockRejectedValue(
        new Error('Budget limit must be a positive number greater than zero')
      );

      await budgetController.createBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_BUDGET_AMOUNT',
          message: 'Budget limit must be a positive number greater than zero',
          details: {
            field: 'limit',
            constraint: 'must be > 0'
          }
        }
      });
    });

    test('should return 400 for invalid category', async () => {
      req.body = { year: 2025, month: 11, category: 'Tax - Medical', limit: 500 };
      budgetService.createBudget.mockRejectedValue(
        new Error('Budget can only be set for Food, Gas, Other categories')
      );

      await budgetController.createBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_CATEGORY',
          message: 'Budget can only be set for Food, Gas, Other categories'
        }
      });
    });

    test('should return 409 for duplicate budget', async () => {
      req.body = { year: 2025, month: 11, category: 'Groceries', limit: 500 };
      budgetService.createBudget.mockRejectedValue(
        new Error('A budget already exists for this category and month')
      );

      await budgetController.createBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'DUPLICATE_BUDGET',
          message: 'A budget already exists for this category and month'
        }
      });
    });
  });

  describe('PUT /api/budgets/:id - updateBudget', () => {
    test('should update budget with valid data', async () => {
      const mockBudget = { id: 1, year: 2025, month: 11, category: 'Groceries', limit: 600 };

      req.params = { id: '1' };
      req.body = { limit: 600 };
      budgetService.updateBudget.mockResolvedValue(mockBudget);

      await budgetController.updateBudget(req, res);

      expect(budgetService.updateBudget).toHaveBeenCalledWith(1, 600);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockBudget);
    });

    test('should return 400 for invalid budget ID', async () => {
      req.params = { id: 'invalid' };
      req.body = { limit: 600 };

      await budgetController.updateBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid budget ID'
        }
      });
    });

    test('should return 400 when limit is missing', async () => {
      req.params = { id: '1' };
      req.body = {};

      await budgetController.updateBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Limit is required'
        }
      });
    });

    test('should return 404 when budget not found', async () => {
      req.params = { id: '999' };
      req.body = { limit: 600 };
      budgetService.updateBudget.mockRejectedValue(new Error('Budget not found'));

      await budgetController.updateBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'BUDGET_NOT_FOUND',
          message: 'Budget not found'
        }
      });
    });
  });

  describe('DELETE /api/budgets/:id - deleteBudget', () => {
    test('should delete budget successfully', async () => {
      req.params = { id: '1' };
      budgetService.deleteBudget.mockResolvedValue(true);

      await budgetController.deleteBudget(req, res);

      expect(budgetService.deleteBudget).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    test('should return 400 for invalid budget ID', async () => {
      req.params = { id: 'invalid' };

      await budgetController.deleteBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid budget ID'
        }
      });
    });

    test('should return 404 when budget not found', async () => {
      req.params = { id: '999' };
      budgetService.deleteBudget.mockRejectedValue(new Error('Budget not found'));

      await budgetController.deleteBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'BUDGET_NOT_FOUND',
          message: 'Budget not found'
        }
      });
    });
  });

  describe('GET /api/budgets/summary - getBudgetSummary', () => {
    test('should return budget summary for valid year and month', async () => {
      const mockSummary = {
        totalBudgeted: 1500,
        totalSpent: 1200,
        remaining: 300,
        progress: 80,
        budgetsOnTrack: 2,
        totalBudgets: 3,
        categories: []
      };

      req.query = { year: '2025', month: '11' };
      budgetService.getBudgetSummary.mockResolvedValue(mockSummary);

      await budgetController.getBudgetSummary(req, res);

      expect(budgetService.getBudgetSummary).toHaveBeenCalledWith('2025', '11');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockSummary);
    });

    test('should return 400 when year or month is missing', async () => {
      req.query = { year: '2025' };

      await budgetController.getBudgetSummary(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_DATE',
          message: 'Year and month query parameters are required'
        }
      });
    });
  });

  describe('GET /api/budgets/history - getBudgetHistory', () => {
    test('should return budget history for valid parameters', async () => {
      const mockHistory = {
        period: { start: '2025-06-01', end: '2025-11-01', months: 6 },
        categories: {}
      };

      req.query = { year: '2025', month: '11', months: '6' };
      budgetService.getBudgetHistory.mockResolvedValue(mockHistory);

      await budgetController.getBudgetHistory(req, res);

      expect(budgetService.getBudgetHistory).toHaveBeenCalledWith('2025', '11', 6);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockHistory);
    });

    test('should use default period of 6 months when not specified', async () => {
      const mockHistory = {
        period: { start: '2025-06-01', end: '2025-11-01', months: 6 },
        categories: {}
      };

      req.query = { year: '2025', month: '11' };
      budgetService.getBudgetHistory.mockResolvedValue(mockHistory);

      await budgetController.getBudgetHistory(req, res);

      expect(budgetService.getBudgetHistory).toHaveBeenCalledWith('2025', '11', 6);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 400 for invalid period', async () => {
      req.query = { year: '2025', month: '11', months: '24' };
      budgetService.getBudgetHistory.mockRejectedValue(
        new Error('Period must be 3, 6, or 12 months')
      );

      await budgetController.getBudgetHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Period must be 3, 6, or 12 months'
        }
      });
    });
  });

  describe('POST /api/budgets/copy - copyBudgets', () => {
    test('should copy budgets successfully', async () => {
      const mockResult = { copied: 3, skipped: 0, overwritten: 0 };

      req.body = {
        sourceYear: 2025,
        sourceMonth: 10,
        targetYear: 2025,
        targetMonth: 11,
        overwrite: false
      };
      budgetService.copyBudgets.mockResolvedValue(mockResult);

      await budgetController.copyBudgets(req, res);

      expect(budgetService.copyBudgets).toHaveBeenCalledWith(2025, 10, 2025, 11, false);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    test('should return 400 when required fields are missing', async () => {
      req.body = { sourceYear: 2025, sourceMonth: 10 };

      await budgetController.copyBudgets(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'sourceYear, sourceMonth, targetYear, and targetMonth are required'
        }
      });
    });

    test('should return 400 when source month has no budgets', async () => {
      req.body = {
        sourceYear: 2025,
        sourceMonth: 10,
        targetYear: 2025,
        targetMonth: 11
      };

      const error = new Error('No budgets found in source month');
      error.code = 'NO_BUDGETS_TO_COPY';
      budgetService.copyBudgets.mockRejectedValue(error);

      await budgetController.copyBudgets(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'NO_BUDGETS_TO_COPY',
          message: 'No budgets found in source month'
        }
      });
    });

    test('should return 409 when target month has budgets and overwrite is false', async () => {
      req.body = {
        sourceYear: 2025,
        sourceMonth: 10,
        targetYear: 2025,
        targetMonth: 11,
        overwrite: false
      };

      const error = new Error('Target month already has budgets. Set overwrite=true to replace.');
      error.code = 'COPY_CONFLICT';
      budgetService.copyBudgets.mockRejectedValue(error);

      await budgetController.copyBudgets(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'COPY_CONFLICT',
          message: 'Target month already has budgets. Set overwrite=true to replace.'
        }
      });
    });
  });

  describe('GET /api/budgets/suggest - suggestBudget', () => {
    test('should return budget suggestion with historical data', async () => {
      const mockSuggestion = {
        category: 'Groceries',
        suggestedAmount: 450,
        averageSpending: 437.50,
        basedOnMonths: 3
      };

      req.query = { year: '2025', month: '11', category: 'Groceries' };
      budgetService.suggestBudgetAmount.mockResolvedValue(mockSuggestion);

      await budgetController.suggestBudget(req, res);

      expect(budgetService.suggestBudgetAmount).toHaveBeenCalledWith('2025', '11', 'Groceries');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockSuggestion);
    });

    test('should return 0 suggestion with no historical data', async () => {
      const mockSuggestion = {
        category: 'Groceries',
        suggestedAmount: 0,
        averageSpending: 0,
        basedOnMonths: 0
      };

      req.query = { year: '2025', month: '11', category: 'Groceries' };
      budgetService.suggestBudgetAmount.mockResolvedValue(mockSuggestion);

      await budgetController.suggestBudget(req, res);

      expect(budgetService.suggestBudgetAmount).toHaveBeenCalledWith('2025', '11', 'Groceries');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockSuggestion);
    });

    test('should use available months when insufficient data', async () => {
      const mockSuggestion = {
        category: 'Groceries',
        suggestedAmount: 200,
        averageSpending: 180.00,
        basedOnMonths: 2
      };

      req.query = { year: '2025', month: '11', category: 'Groceries' };
      budgetService.suggestBudgetAmount.mockResolvedValue(mockSuggestion);

      await budgetController.suggestBudget(req, res);

      expect(budgetService.suggestBudgetAmount).toHaveBeenCalledWith('2025', '11', 'Groceries');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockSuggestion);
    });

    test('should return 400 when year is missing', async () => {
      req.query = { month: '11', category: 'Groceries' };

      await budgetController.suggestBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Year, month, and category query parameters are required'
        }
      });
    });

    test('should return 400 when month is missing', async () => {
      req.query = { year: '2025', category: 'Groceries' };

      await budgetController.suggestBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Year, month, and category query parameters are required'
        }
      });
    });

    test('should return 400 when category is missing', async () => {
      req.query = { year: '2025', month: '11' };

      await budgetController.suggestBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Year, month, and category query parameters are required'
        }
      });
    });

    test('should return 400 for invalid year or month', async () => {
      req.query = { year: '2025', month: '13', category: 'Groceries' };
      budgetService.suggestBudgetAmount.mockRejectedValue(
        new Error('Invalid year or month specified')
      );

      await budgetController.suggestBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_DATE',
          message: 'Invalid year or month specified'
        }
      });
    });

    test('should return 400 for invalid category', async () => {
      req.query = { year: '2025', month: '11', category: 'Tax - Medical' };
      budgetService.suggestBudgetAmount.mockRejectedValue(
        new Error('Budget can only be set for Housing, Utilities, Groceries, Dining Out, Insurance, Gas, Automotive, Entertainment, Subscriptions, Recreation Activities, Pet Care, Other categories')
      );

      await budgetController.suggestBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_CATEGORY',
          message: 'Budget can only be set for Housing, Utilities, Groceries, Dining Out, Insurance, Gas, Automotive, Entertainment, Subscriptions, Recreation Activities, Pet Care, Other categories'
        }
      });
    });

    test('should return 500 for internal errors', async () => {
      req.query = { year: '2025', month: '11', category: 'Groceries' };
      budgetService.suggestBudgetAmount.mockRejectedValue(
        new Error('Database connection failed')
      );

      await budgetController.suggestBudget(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Database connection failed'
        }
      });
    });
  });
});

