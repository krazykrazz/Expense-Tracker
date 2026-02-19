/**
 * Unit tests for sseService edge cases
 * Feature: real-time-data-sync
 */

describe('sseService — edge cases', () => {
  let sseService;
  let mockInsert;

  beforeEach(() => {
    jest.resetModules();
    mockInsert = jest.fn().mockResolvedValue(1);
    jest.mock('../repositories/activityLogRepository', () => ({
      insert: mockInsert
    }));
    sseService = require('./sseService');
  });

  // ── Req 2.5: broadcast with zero clients does not throw ──────────────────
  describe('broadcast with zero clients', () => {
    it('does not throw when no clients are connected', async () => {
      await expect(sseService.broadcast('expense', null)).resolves.toBeUndefined();
    });

    it('does not call activityLogRepository.insert when no clients are connected', async () => {
      await sseService.broadcast('expense', null);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // ── Req 5.4: tabId null is included as-is in payload ────────────────────
  describe('broadcast with tabId null', () => {
    it('includes tabId: null in the SSE frame payload', async () => {
      const writes = [];
      sseService.addClient('c1', { write: (d) => writes.push(d) });

      await sseService.broadcast('expense', null);

      expect(writes).toHaveLength(1);
      const parsed = JSON.parse(writes[0].replace(/^data: /, '').replace(/\n\n$/, ''));
      expect(parsed.tabId).toBeNull();
    });
  });

  // ── Req 12.5: activityLogRepository.insert throws → broadcast still resolves ─
  describe('sync broadcast log resilience', () => {
    it('broadcast resolves even when activityLogRepository.insert throws', async () => {
      mockInsert.mockRejectedValue(new Error('DB error'));
      sseService.addClient('c1', { write: () => {} });

      await expect(sseService.broadcast('expense', 'tab-123')).resolves.toBeUndefined();
    });

    it('does not call activityLogRepository.insert when zero clients are connected', async () => {
      await sseService.broadcast('budget', 'tab-abc');
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // ── Dead client cleanup ──────────────────────────────────────────────────
  describe('dead client removal', () => {
    it('removes a client that throws on write and continues to other clients', async () => {
      const goodWrites = [];

      sseService.addClient('bad', { write: () => { throw new Error('broken pipe'); } });
      sseService.addClient('good', { write: (d) => goodWrites.push(d) });

      await sseService.broadcast('loan', null);

      // Good client still received the frame
      expect(goodWrites).toHaveLength(1);
      // Bad client was removed — only good client remains
      expect(sseService.getConnectionCount()).toBe(1);
    });
  });
});
