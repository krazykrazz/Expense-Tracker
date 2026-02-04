const { errorHandler, asyncHandler } = require('./errorHandler');
const logger = require('../config/logger');

// Mock the logger
jest.mock('../config/logger', () => ({
  error: jest.fn()
}));

describe('errorHandler', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      path: '/api/test',
      method: 'GET'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    logger.error.mockClear();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  describe('errorHandler middleware', () => {
    it('should log error with message, path, and method', () => {
      const error = new Error('Test error');
      errorHandler(error, req, res, next);

      expect(logger.error).toHaveBeenCalledWith('Error occurred:', {
        message: 'Test error',
        stack: undefined,
        path: '/api/test',
        method: 'GET'
      });
    });

    it('should use error statusCode if provided', () => {
      const error = new Error('Not found');
      error.statusCode = 404;
      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not found'
      });
    });

    it('should use error status if statusCode not provided', () => {
      const error = new Error('Bad request');
      error.status = 400;
      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad request'
      });
    });

    it('should default to 500 if no status provided', () => {
      const error = new Error('Internal error');
      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal error'
      });
    });

    it('should include stack trace in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Dev error');
      error.stack = 'Error: Dev error\n    at test.js:1:1';
      errorHandler(error, req, res, next);

      expect(logger.error).toHaveBeenCalledWith('Error occurred:', {
        message: 'Dev error',
        stack: 'Error: Dev error\n    at test.js:1:1',
        path: '/api/test',
        method: 'GET'
      });
      expect(res.json).toHaveBeenCalledWith({
        error: 'Dev error',
        stack: 'Error: Dev error\n    at test.js:1:1',
        details: undefined
      });
    });

    it('should not include stack trace in production mode', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Prod error');
      error.stack = 'Error: Prod error\n    at test.js:1:1';
      errorHandler(error, req, res, next);

      expect(logger.error).toHaveBeenCalledWith('Error occurred:', {
        message: 'Prod error',
        stack: undefined,
        path: '/api/test',
        method: 'GET'
      });
      expect(res.json).toHaveBeenCalledWith({
        error: 'Prod error'
      });
    });

    it('should include error details in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Validation error');
      error.details = { field: 'email', issue: 'invalid format' };
      errorHandler(error, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          details: { field: 'email', issue: 'invalid format' }
        })
      );
      // Stack should be present in development
      expect(res.json.mock.calls[0][0]).toHaveProperty('stack');
    });

    it('should handle errors without message', () => {
      const error = new Error();
      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error'
      });
    });

    it('should handle non-Error objects', () => {
      const error = { message: 'String error' };
      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'String error'
      });
    });
  });

  describe('asyncHandler wrapper', () => {
    it('should call the wrapped function', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = asyncHandler(mockFn);

      await wrappedFn(req, res, next);

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
    });

    it('should pass through successful results', async () => {
      const mockFn = jest.fn(async (req, res) => {
        res.json({ success: true });
      });
      const wrappedFn = asyncHandler(mockFn);

      await wrappedFn(req, res, next);

      expect(mockFn).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should catch async errors and pass to next', async () => {
      const error = new Error('Async error');
      const mockFn = jest.fn().mockRejectedValue(error);
      const wrappedFn = asyncHandler(mockFn);

      await wrappedFn(req, res, next);

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
      expect(next).toHaveBeenCalledWith(error);
    });

    it('should handle Promise rejection', async () => {
      const error = new Error('Promise rejection');
      const mockFn = jest.fn(() => Promise.reject(error));
      const wrappedFn = asyncHandler(mockFn);

      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should work with multiple async handlers', async () => {
      const mockFn1 = jest.fn().mockResolvedValue('first');
      const mockFn2 = jest.fn().mockResolvedValue('second');
      
      const wrappedFn1 = asyncHandler(mockFn1);
      const wrappedFn2 = asyncHandler(mockFn2);

      await wrappedFn1(req, res, next);
      await wrappedFn2(req, res, next);

      expect(mockFn1).toHaveBeenCalled();
      expect(mockFn2).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });
});
