/**
 * Unit tests for syncController.handleSSEConnection
 * Tests: response headers, initial connected event, keepalive interval, client cleanup on close
 */

jest.mock('../services/sseService');
jest.mock('../config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const sseService = require('../services/sseService');
const { handleSSEConnection } = require('./syncController');

describe('syncController.handleSSEConnection', () => {
  let req;
  let res;
  let closeHandler;

  beforeEach(() => {
    jest.useFakeTimers();

    closeHandler = null;
    req = {
      on: jest.fn((event, handler) => {
        if (event === 'close') closeHandler = handler;
      })
    };

    res = {
      setHeader: jest.fn(),
      write: jest.fn()
    };

    sseService.addClient.mockClear();
    sseService.removeClient.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('response headers', () => {
    it('sets Content-Type to text/event-stream', () => {
      handleSSEConnection(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    });

    it('sets Cache-Control to no-cache', () => {
      handleSSEConnection(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    });

    it('sets Connection to keep-alive', () => {
      handleSSEConnection(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    });

    it('sets X-Accel-Buffering to no', () => {
      handleSSEConnection(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    });
  });

  describe('initial connected event', () => {
    it('writes an initial connected event on connection', () => {
      handleSSEConnection(req, res);

      expect(res.write).toHaveBeenCalledTimes(1);
      const written = res.write.mock.calls[0][0];
      expect(written).toMatch(/^data: /);
      expect(written).toMatch(/\n\n$/);

      const payload = JSON.parse(written.replace(/^data: /, '').trim());
      expect(payload.type).toBe('connected');
      expect(typeof payload.timestamp).toBe('string');
      // timestamp should be a valid ISO 8601 string
      expect(() => new Date(payload.timestamp)).not.toThrow();
      expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
    });
  });

  describe('client registration', () => {
    it('calls sseService.addClient with a clientId and res', () => {
      handleSSEConnection(req, res);
      expect(sseService.addClient).toHaveBeenCalledTimes(1);
      const [clientId, registeredRes] = sseService.addClient.mock.calls[0];
      expect(typeof clientId).toBe('string');
      expect(clientId.length).toBeGreaterThan(0);
      expect(registeredRes).toBe(res);
    });
  });

  describe('keepalive interval', () => {
    it('writes a keepalive comment after 25 seconds', () => {
      handleSSEConnection(req, res);
      expect(res.write).toHaveBeenCalledTimes(1); // only initial event so far

      jest.advanceTimersByTime(25000);

      expect(res.write).toHaveBeenCalledTimes(2);
      expect(res.write.mock.calls[1][0]).toBe(': keepalive\n\n');
    });

    it('writes multiple keepalive comments at 25s intervals', () => {
      handleSSEConnection(req, res);

      jest.advanceTimersByTime(75000); // 3 intervals

      // 1 initial + 3 keepalives
      expect(res.write).toHaveBeenCalledTimes(4);
      const keepaliveCalls = res.write.mock.calls.slice(1);
      keepaliveCalls.forEach(([frame]) => {
        expect(frame).toBe(': keepalive\n\n');
      });
    });
  });

  describe('cleanup on close', () => {
    it('registers a close handler on req', () => {
      handleSSEConnection(req, res);
      expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('calls sseService.removeClient with the same clientId on close', () => {
      handleSSEConnection(req, res);

      const clientId = sseService.addClient.mock.calls[0][0];
      expect(closeHandler).not.toBeNull();
      closeHandler();

      expect(sseService.removeClient).toHaveBeenCalledWith(clientId);
    });

    it('stops sending keepalives after close', () => {
      handleSSEConnection(req, res);

      // Trigger close before any keepalive fires
      closeHandler();

      jest.advanceTimersByTime(50000);

      // Only the initial connected event — no keepalives after close
      expect(res.write).toHaveBeenCalledTimes(1);
    });
  });
});
