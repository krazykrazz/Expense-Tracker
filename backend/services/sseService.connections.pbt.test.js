/**
 * @invariant Connection Count: getConnectionCount() always equals adds minus removes, never negative
 *
 * Feature: real-time-data-sync
 * Property 9: Connection count tracks adds and removes
 * **Validates: Requirements 8.1**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

describe('Property 9: Connection count tracks adds and removes', () => {
  let sseService;

  beforeEach(() => {
    jest.resetModules();
    // Provide a no-op activityLogRepository so broadcast doesn't hit DB
    jest.mock('../repositories/activityLogRepository', () => ({
      insert: jest.fn().mockResolvedValue(1)
    }));
    sseService = require('./sseService');
  });

  it('getConnectionCount equals adds minus removes and is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),  // total clients to add
        fc.integer({ min: 0, max: 20 }),  // how many to remove (capped to added)
        (addCount, removeCount) => {
          // Reset module for each property iteration
          jest.resetModules();
          jest.mock('../repositories/activityLogRepository', () => ({
            insert: jest.fn().mockResolvedValue(1)
          }));
          const svc = require('./sseService');

          const actualRemove = Math.min(removeCount, addCount);

          const ids = [];
          for (let i = 0; i < addCount; i++) {
            const id = `client-${i}`;
            ids.push(id);
            svc.addClient(id, { write: () => {} });
          }

          expect(svc.getConnectionCount()).toBe(addCount);

          for (let i = 0; i < actualRemove; i++) {
            svc.removeClient(ids[i]);
          }

          const expected = addCount - actualRemove;
          expect(svc.getConnectionCount()).toBe(expected);
          expect(svc.getConnectionCount()).toBeGreaterThanOrEqual(0);
        }
      ),
      pbtOptions()
    );
  });

  it('removing a non-existent client does not make count negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        (addCount) => {
          jest.resetModules();
          jest.mock('../repositories/activityLogRepository', () => ({
            insert: jest.fn().mockResolvedValue(1)
          }));
          const svc = require('./sseService');

          for (let i = 0; i < addCount; i++) {
            svc.addClient(`client-${i}`, { write: () => {} });
          }

          svc.removeClient('nonexistent-client');

          expect(svc.getConnectionCount()).toBe(addCount);
          expect(svc.getConnectionCount()).toBeGreaterThanOrEqual(0);
        }
      ),
      pbtOptions()
    );
  });
});
