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
  let resErrorHandler;

  beforeEach(() => {
    jest.useFakeTimers();

    closeHandler = null;
    resErrorHandler = null;
    req = {
      on: jest.fn((event, handler) => {
        if (event === 'close') closeHandler = handler;
      }),
      destroyed: false
    };

    res = {
      setHeader: jest.fn(),
      write: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'error') resErrorHandler = handler;
      }),
      writableEnded: false,
      destroyed: false
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
    it('writes a keepalive comment after 15 seconds', () => {
      handleSSEConnection(req, res);
      expect(res.write).toHaveBeenCalledTimes(1); // only initial event so far

      jest.advanceTimersByTime(15000);

      expect(res.write).toHaveBeenCalledTimes(2);
      expect(res.write.mock.calls[1][0]).toBe(': keepalive\n\n');
    });

    it('writes multiple keepalive comments at 15s intervals', () => {
      handleSSEConnection(req, res);

      jest.advanceTimersByTime(45000); // 3 intervals

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

  describe('keepalive error detection', () => {
    it('removes client when keepalive write throws', () => {
      handleSSEConnection(req, res);
      const clientId = sseService.addClient.mock.calls[0][0];

      // Make write throw on the next call (keepalive)
      res.write.mockImplementation(() => {
        throw new Error('write EPIPE');
      });

      jest.advanceTimersByTime(15000);

      expect(sseService.removeClient).toHaveBeenCalledWith(clientId);
    });

    it('stops keepalive interval after write failure', () => {
      handleSSEConnection(req, res);

      // Make keepalive writes throw
      res.write.mockImplementation(() => {
        throw new Error('write EPIPE');
      });

      jest.advanceTimersByTime(15000); // first keepalive — throws, triggers cleanup
      res.write.mockClear();

      jest.advanceTimersByTime(30000); // no more keepalives should fire

      expect(res.write).not.toHaveBeenCalled();
    });

    it('only calls removeClient once when both keepalive error and close fire', () => {
      handleSSEConnection(req, res);

      res.write.mockImplementation(() => { throw new Error('write EPIPE'); });
      jest.advanceTimersByTime(15000); // triggers keepalive error → cleanup

      // Now close fires too
      closeHandler();

      expect(sseService.removeClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('res error handler', () => {
    it('registers an error handler on res', () => {
      handleSSEConnection(req, res);
      expect(res.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('removes client when res emits error', () => {
      handleSSEConnection(req, res);
      const clientId = sseService.addClient.mock.calls[0][0];

      resErrorHandler();

      expect(sseService.removeClient).toHaveBeenCalledWith(clientId);
    });

    it('stops keepalives after res error', () => {
      handleSSEConnection(req, res);

      resErrorHandler();
      res.write.mockClear();

      jest.advanceTimersByTime(50000);

      expect(res.write).not.toHaveBeenCalled();
    });
  });

  describe('proactive socket state detection', () => {
    it('removes client when req.destroyed is true at keepalive time', () => {
      handleSSEConnection(req, res);
      const clientId = sseService.addClient.mock.calls[0][0];

      req.destroyed = true;
      jest.advanceTimersByTime(15000);

      expect(sseService.removeClient).toHaveBeenCalledWith(clientId);
      // write should NOT have been called for keepalive (skipped due to destroyed check)
      expect(res.write).toHaveBeenCalledTimes(1); // only initial event
    });

    it('removes client when res.writableEnded is true at keepalive time', () => {
      handleSSEConnection(req, res);
      const clientId = sseService.addClient.mock.calls[0][0];

      res.writableEnded = true;
      jest.advanceTimersByTime(15000);

      expect(sseService.removeClient).toHaveBeenCalledWith(clientId);
      expect(res.write).toHaveBeenCalledTimes(1); // only initial event
    });

    it('removes client when res.destroyed is true at keepalive time', () => {
      handleSSEConnection(req, res);
      const clientId = sseService.addClient.mock.calls[0][0];

      res.destroyed = true;
      jest.advanceTimersByTime(15000);

      expect(sseService.removeClient).toHaveBeenCalledWith(clientId);
      expect(res.write).toHaveBeenCalledTimes(1); // only initial event
    });

    it('removes client when res.write returns false (backpressure)', () => {
      handleSSEConnection(req, res);
      const clientId = sseService.addClient.mock.calls[0][0];

      res.write.mockReturnValue(false);
      jest.advanceTimersByTime(15000);

      expect(sseService.removeClient).toHaveBeenCalledWith(clientId);
    });
  });
});
