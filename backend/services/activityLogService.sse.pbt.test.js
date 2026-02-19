/**
 * @invariant SSE Broadcast Per Entity Type: For any valid entity type passed to logEvent,
 *   the injected sseService.broadcast is called exactly once with that entity type after
 *   the repository insert completes.
 * @invariant SSE Failure Resilience: When sseService.broadcast throws, logEvent still
 *   resolves without throwing. When setSseService has not been called, logEvent completes
 *   without error.
 *
 * **Property 4: activityLogService triggers SSE broadcast per entity type**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

const fc = require('fast-check');
const activityLogService = require('./activityLogService');
const activityLogRepository = require('../repositories/activityLogRepository');
const { safeString, pbtOptions } = require('../test/pbtArbitraries');

// Entity types used in the application
const ENTITY_TYPES = [
  'expense', 'loan', 'budget', 'income', 'investment',
  'fixed_expense', 'payment_method', 'people'
];

const entityTypeArb = fc.constantFrom(...ENTITY_TYPES);

describe('activityLogService - SSE Integration Properties', () => {
  let mockSseService;
  let originalInsert;

  beforeEach(() => {
    // Mock repository insert to avoid real DB calls
    originalInsert = activityLogRepository.insert;
    activityLogRepository.insert = jest.fn().mockResolvedValue({ id: 1 });

    // Fresh mock SSE service for each test
    mockSseService = {
      broadcast: jest.fn().mockResolvedValue(undefined)
    };

    activityLogService.setSseService(mockSseService);
  });

  afterEach(() => {
    activityLogRepository.insert = originalInsert;
    // Reset SSE service to null after each test
    activityLogService.setSseService(null);
  });

  // ─── Property 4: SSE broadcast called exactly once per logEvent ───────────

  describe('Property 4: activityLogService triggers SSE broadcast per entity type', () => {
    it('should call sseService.broadcast exactly once with the correct entityType after insert', async () => {
      await fc.assert(
        fc.asyncProperty(
          entityTypeArb,
          safeString({ minLength: 1, maxLength: 50 }), // eventType
          safeString({ minLength: 1, maxLength: 200 }), // userAction
          async (entityType, eventType, userAction) => {
            mockSseService.broadcast.mockClear();
            activityLogRepository.insert.mockClear();

            await activityLogService.logEvent(eventType, entityType, null, userAction, null);

            // broadcast called exactly once
            expect(mockSseService.broadcast).toHaveBeenCalledTimes(1);
            // called with the correct entityType
            expect(mockSseService.broadcast).toHaveBeenCalledWith(entityType, null);
          }
        ),
        pbtOptions()
      );
    });

    it('should call broadcast AFTER the repository insert completes', async () => {
      await fc.assert(
        fc.asyncProperty(
          entityTypeArb,
          safeString({ minLength: 1, maxLength: 50 }),
          safeString({ minLength: 1, maxLength: 200 }),
          async (entityType, eventType, userAction) => {
            const callOrder = [];

            activityLogRepository.insert = jest.fn().mockImplementation(async () => {
              callOrder.push('insert');
              return { id: 1 };
            });

            mockSseService.broadcast = jest.fn().mockImplementation(async () => {
              callOrder.push('broadcast');
            });

            await activityLogService.logEvent(eventType, entityType, null, userAction, null);

            expect(callOrder).toEqual(['insert', 'broadcast']);
          }
        ),
        pbtOptions()
      );
    });

    it('should pass tabId from metadata to broadcast', async () => {
      await fc.assert(
        fc.asyncProperty(
          entityTypeArb,
          safeString({ minLength: 1, maxLength: 50 }),
          safeString({ minLength: 1, maxLength: 200 }),
          fc.option(fc.uuid(), { nil: null }),
          async (entityType, eventType, userAction, tabId) => {
            mockSseService.broadcast.mockClear();

            const metadata = tabId !== null ? { tabId } : null;
            await activityLogService.logEvent(eventType, entityType, null, userAction, metadata);

            expect(mockSseService.broadcast).toHaveBeenCalledTimes(1);
            expect(mockSseService.broadcast).toHaveBeenCalledWith(entityType, tabId);
          }
        ),
        pbtOptions()
      );
    });
  });

  // ─── Unit tests: SSE failure resilience (Req 3.3, 3.4) ───────────────────

  describe('SSE failure resilience', () => {
    it('should resolve without throwing when sseService.broadcast throws', async () => {
      mockSseService.broadcast = jest.fn().mockImplementation(async () => {
        throw new Error('SSE connection lost');
      });

      await expect(
        activityLogService.logEvent('expense_created', 'expense', 1, 'Added expense', null)
      ).resolves.not.toThrow();

      // Insert still happened
      expect(activityLogRepository.insert).toHaveBeenCalledTimes(1);
    });

    it('should resolve without throwing when sseService.broadcast throws synchronously', async () => {
      mockSseService.broadcast = jest.fn().mockImplementation(async () => {
        throw new Error('Async SSE error');
      });

      await expect(
        activityLogService.logEvent('expense_created', 'expense', 1, 'Added expense', null)
      ).resolves.not.toThrow();
    });

    it('should complete without error when setSseService has not been called', async () => {
      // Reset to null (no SSE service injected)
      activityLogService.setSseService(null);

      await expect(
        activityLogService.logEvent('expense_created', 'expense', 1, 'Added expense', null)
      ).resolves.not.toThrow();

      // Insert still happened
      expect(activityLogRepository.insert).toHaveBeenCalledTimes(1);
    });

    it('should not call broadcast when setSseService has not been called', async () => {
      activityLogService.setSseService(null);

      await activityLogService.logEvent('expense_created', 'expense', 1, 'Added expense', null);

      // mockSseService.broadcast should never be called since service is null
      expect(mockSseService.broadcast).not.toHaveBeenCalled();
    });

    it('should still insert the activity log entry even when broadcast fails', async () => {
      mockSseService.broadcast = jest.fn().mockImplementation(async () => {
        throw new Error('SSE down');
      });

      await activityLogService.logEvent('budget_updated', 'budget', 5, 'Updated budget', null);

      expect(activityLogRepository.insert).toHaveBeenCalledTimes(1);
      expect(activityLogRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'budget_updated',
          entity_type: 'budget',
          entity_id: 5,
          user_action: 'Updated budget'
        })
      );
    });
  });
});
