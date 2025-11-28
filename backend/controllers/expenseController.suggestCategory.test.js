const expenseController = require('./expenseController');
const categorySuggestionService = require('../services/categorySuggestionService');

// Mock the category suggestion service
jest.mock('../services/categorySuggestionService');

describe('ExpenseController - getSuggestedCategory', () => {
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
      json: jest.fn().mockReturnThis()
    };
  });

  describe('GET /api/expenses/suggest-category', () => {
    test('should return suggestion and breakdown for valid place', async () => {
      const mockSuggestion = {
        category: 'Groceries',
        confidence: 0.85,
        count: 17
      };
      const mockBreakdown = [
        { category: 'Groceries', count: 17, lastUsed: '2025-11-25' },
        { category: 'Other', count: 3, lastUsed: '2025-10-15' }
      ];

      req.query = { place: 'Walmart' };
      categorySuggestionService.getSuggestedCategory.mockResolvedValue(mockSuggestion);
      categorySuggestionService.getCategoryBreakdown.mockResolvedValue(mockBreakdown);

      await expenseController.getSuggestedCategory(req, res);

      expect(categorySuggestionService.getSuggestedCategory).toHaveBeenCalledWith('Walmart');
      expect(categorySuggestionService.getCategoryBreakdown).toHaveBeenCalledWith('Walmart');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        suggestion: mockSuggestion,
        breakdown: mockBreakdown
      });
    });

    test('should return 400 when place parameter is missing', async () => {
      req.query = {};

      await expenseController.getSuggestedCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Place query parameter is required'
      });
      expect(categorySuggestionService.getSuggestedCategory).not.toHaveBeenCalled();
    });

    test('should return 400 when place parameter is empty string', async () => {
      req.query = { place: '' };

      await expenseController.getSuggestedCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Place query parameter is required'
      });
      expect(categorySuggestionService.getSuggestedCategory).not.toHaveBeenCalled();
    });

    test('should return 400 when place parameter is whitespace only', async () => {
      req.query = { place: '   ' };

      await expenseController.getSuggestedCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Place query parameter is required'
      });
      expect(categorySuggestionService.getSuggestedCategory).not.toHaveBeenCalled();
    });

    test('should return null suggestion for place with no history', async () => {
      req.query = { place: 'NewPlace' };
      categorySuggestionService.getSuggestedCategory.mockResolvedValue(null);
      categorySuggestionService.getCategoryBreakdown.mockResolvedValue([]);

      await expenseController.getSuggestedCategory(req, res);

      expect(categorySuggestionService.getSuggestedCategory).toHaveBeenCalledWith('NewPlace');
      expect(categorySuggestionService.getCategoryBreakdown).toHaveBeenCalledWith('NewPlace');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        suggestion: null,
        breakdown: []
      });
    });

    test('should return 500 when service throws an error', async () => {
      req.query = { place: 'Walmart' };
      categorySuggestionService.getSuggestedCategory.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expenseController.getSuggestedCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Database connection failed'
      });
    });
  });
});
