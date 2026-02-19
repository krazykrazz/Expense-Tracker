/**
 * @invariant Broadcast Delivery: broadcast() writes exactly one SSE frame per connected client
 * @invariant Event Structure: Every SSE frame contains entityType, tabId, and a valid ISO 8601 timestamp
 * @invariant Activity Log: sync_broadcast log entry written iff at least one client is connected
 *
 * Feature: real-time-data-sync
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

const ENTITY_TYPES = ['expense', 'loan', 'budget', 'income', 'investment', 'fixed_expense', 'payment_method', 'people'];
const entityTypeArb = fc.constantFrom(...ENTITY_TYPES);
const tabIdArb = fc.option(fc.uuid(), { nil: null });

function makeMockClients(n) {
  return Array.from({ length: n }, () => {
    const writes = [];
    return { writes, res: { write: (data) => writes.push(data) } };
  });
}

// ─── Property 2: Broadcast delivers to all connected clients ─────────────────
// **Validates: Requirements 2.1**
describe('Property 2: Broadcast delivers to all connected clients', () => {
  it('writes exactly one SSE frame per connected client for any entity type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        entityTypeArb,
        tabIdArb,
        async (clientCount, entityType, tabId) => {
          jest.resetModules();
          jest.mock('../repositories/activityLogRepository', () => ({
            insert: jest.fn().mockResolvedValue(1)
          }));
          const sseService = require('./sseService');

          const mockClients = makeMockClients(clientCount);
          mockClients.forEach(({ res }, i) => sseService.addClient(`client-${i}`, res));

          await sseService.broadcast(entityType, tabId);

          for (const { writes } of mockClients) {
            expect(writes).toHaveLength(1);
          }
        }
      ),
      pbtOptions()
    );
  });
});

// ─── Property 3: Broadcast event structure invariant ─────────────────────────
// **Validates: Requirements 2.2, 2.3**
describe('Property 3: Broadcast event structure invariant', () => {
  it('SSE frame is valid JSON with entityType, tabId, and ISO 8601 timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityTypeArb,
        tabIdArb,
        async (entityType, tabId) => {
          jest.resetModules();
          jest.mock('../repositories/activityLogRepository', () => ({
            insert: jest.fn().mockResolvedValue(1)
          }));
          const sseService = require('./sseService');

          const writes = [];
          sseService.addClient('test-client', { write: (d) => writes.push(d) });

          await sseService.broadcast(entityType, tabId);

          expect(writes).toHaveLength(1);
          const frame = writes[0];

          expect(frame).toMatch(/^data: .+\n\n$/);

          const jsonStr = frame.replace(/^data: /, '').replace(/\n\n$/, '');
          const parsed = JSON.parse(jsonStr);

          expect(parsed).toHaveProperty('entityType', entityType);
          expect(parsed).toHaveProperty('tabId', tabId);
          expect(parsed).toHaveProperty('timestamp');

          const ts = new Date(parsed.timestamp);
          expect(ts.toISOString()).toBe(parsed.timestamp);
        }
      ),
      pbtOptions()
    );
  });
});

// ─── Property 11: Sync broadcast activity log entry ──────────────────────────
// **Validates: Requirements 12.1, 12.2, 12.4**
describe('Property 11: Sync broadcast activity log entry written only when clients are connected', () => {
  it('inserts exactly one log entry when N > 0 clients are connected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        entityTypeArb,
        tabIdArb,
        async (clientCount, entityType, tabId) => {
          jest.resetModules();
          const mockInsert = jest.fn().mockResolvedValue(1);
          jest.mock('../repositories/activityLogRepository', () => ({
            insert: mockInsert
          }));
          const sseService = require('./sseService');

          const mockClients = makeMockClients(clientCount);
          mockClients.forEach(({ res }, i) => sseService.addClient(`client-${i}`, res));

          await sseService.broadcast(entityType, tabId);

          expect(mockInsert).toHaveBeenCalledTimes(1);

          const call = mockInsert.mock.calls[0][0];
          expect(call.event_type).toBe('sync_broadcast');
          expect(call.entity_type).toBe(entityType);
          expect(call.entity_id).toBeNull();
          expect(call.user_action).toContain(entityType);
          expect(call.user_action).toContain('active session');
        }
      ),
      pbtOptions()
    );
  });

  it('does NOT insert a log entry when zero clients are connected', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityTypeArb,
        tabIdArb,
        async (entityType, tabId) => {
          jest.resetModules();
          const mockInsert = jest.fn().mockResolvedValue(1);
          jest.mock('../repositories/activityLogRepository', () => ({
            insert: mockInsert
          }));
          const sseService = require('./sseService');

          await sseService.broadcast(entityType, tabId);

          expect(mockInsert).not.toHaveBeenCalled();
        }
      ),
      pbtOptions()
    );
  });
});
