import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleError, handleAsyncError } from './errorHandler';

describe('errorHandler utilities', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('handleError', () => {
    it('should log error to console by default', () => {
      const error = new Error('Test error');
      handleError(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[Unknown]', error);
    });

    it('should use custom context in log message', () => {
      const error = new Error('Test error');
      handleError(error, { context: 'MyComponent' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('[MyComponent]', error);
    });

    it('should not log to console when logToConsole is false', () => {
      const error = new Error('Test error');
      handleError(error, { logToConsole: false });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return error message object by default', () => {
      const error = new Error('Test error message');
      const result = handleError(error);

      expect(result).toEqual({
        message: 'Test error message',
        type: 'error'
      });
    });

    it('should use fallback message when error has no message', () => {
      const error = new Error();
      error.message = '';
      const result = handleError(error);

      expect(result).toEqual({
        message: 'An unexpected error occurred',
        type: 'error'
      });
    });

    it('should use custom fallback message', () => {
      const error = new Error();
      error.message = '';
      const result = handleError(error, { fallbackMessage: 'Custom fallback' });

      expect(result).toEqual({
        message: 'Custom fallback',
        type: 'error'
      });
    });

    it('should return null when showToUser is false', () => {
      const error = new Error('Test error');
      const result = handleError(error, { showToUser: false });

      expect(result).toBeNull();
    });

    it('should handle all options together', () => {
      const error = new Error('Specific error');
      const result = handleError(error, {
        showToUser: true,
        logToConsole: true,
        context: 'TestContext',
        fallbackMessage: 'Fallback'
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('[TestContext]', error);
      expect(result).toEqual({
        message: 'Specific error',
        type: 'error'
      });
    });
  });

  describe('handleAsyncError', () => {
    it('should return result on successful async function', async () => {
      const asyncFn = vi.fn().mockResolvedValue('success');
      const result = await handleAsyncError(asyncFn);

      expect(result).toBe('success');
      expect(asyncFn).toHaveBeenCalled();
    });

    it('should return null on error', async () => {
      const asyncFn = vi.fn().mockRejectedValue(new Error('Async error'));
      const result = await handleAsyncError(asyncFn);

      expect(result).toBeNull();
    });

    it('should log error when async function fails', async () => {
      const error = new Error('Async error');
      const asyncFn = vi.fn().mockRejectedValue(error);
      
      await handleAsyncError(asyncFn, { context: 'AsyncTest' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('[AsyncTest]', error);
    });

    it('should pass options to handleError', async () => {
      const error = new Error('Async error');
      const asyncFn = vi.fn().mockRejectedValue(error);
      
      await handleAsyncError(asyncFn, { logToConsole: false });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle async functions that return falsy values', async () => {
      const asyncFn = vi.fn().mockResolvedValue(0);
      const result = await handleAsyncError(asyncFn);

      expect(result).toBe(0);
    });

    it('should handle async functions that return undefined', async () => {
      const asyncFn = vi.fn().mockResolvedValue(undefined);
      const result = await handleAsyncError(asyncFn);

      expect(result).toBeUndefined();
    });
  });
});
