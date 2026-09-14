'use strict';

const { createGracefulShutdown } = require('./gracefulShutdown');

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeDeps(overrides = {}) {
  const order = [];
  const deps = {
    order,
    logger: makeLogger(),
    exit: jest.fn(),
    closeDatabase: jest.fn(async () => {
      order.push('closeDatabase');
    }),
    sseService: {
      closeAll: jest.fn(() => {
        order.push('sseClose');
        return 0;
      })
    },
    backupService: {
      stopScheduler: jest.fn(() => {
        order.push('stopScheduler');
      })
    },
    ...overrides
  };
  return deps;
}

function makeHttpServer(order) {
  return {
    close: jest.fn((cb) => {
      order.push('httpClose');
      cb();
    })
  };
}

describe('createGracefulShutdown', () => {
  it('tears down in a safe order: schedulers, then HTTP, then database', async () => {
    const deps = makeDeps();
    const httpServer = makeHttpServer(deps.order);
    const shutdown = createGracefulShutdown(deps);

    await shutdown('SIGTERM', { httpServer });

    // The database must close last — a request still in flight would otherwise
    // hit SQLITE_MISUSE on the shared connection.
    expect(deps.order).toEqual(['stopScheduler', 'sseClose', 'httpClose', 'closeDatabase']);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('stops scheduled cron tasks and clears pending timers', async () => {
    const deps = makeDeps();
    const shutdown = createGracefulShutdown(deps);
    const task = { stop: jest.fn() };
    const timer = setTimeout(() => {
      throw new Error('timer should have been cleared');
    }, 50);

    await shutdown('SIGTERM', { scheduledTasks: [task], timers: [timer] });

    expect(task.stop).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 80));
  });

  it('is idempotent — a second signal does not start a second teardown', async () => {
    const deps = makeDeps();
    const httpServer = makeHttpServer(deps.order);
    const shutdown = createGracefulShutdown(deps);

    await Promise.all([
      shutdown('SIGTERM', { httpServer }),
      shutdown('SIGINT', { httpServer })
    ]);

    expect(deps.backupService.stopScheduler).toHaveBeenCalledTimes(1);
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
    expect(httpServer.close).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it('closes SSE streams before the HTTP server, since they never end on their own', async () => {
    const deps = makeDeps();
    deps.sseService.closeAll = jest.fn(() => {
      deps.order.push('sseClose');
      return 3;
    });
    const httpServer = makeHttpServer(deps.order);
    const shutdown = createGracefulShutdown(deps);

    await shutdown('SIGTERM', { httpServer });

    expect(deps.order.indexOf('sseClose')).toBeLessThan(deps.order.indexOf('httpClose'));
    expect(deps.logger.info).toHaveBeenCalledWith('Closed 3 SSE connection(s)');
  });

  it('forces an exit when a step hangs past the timeout', async () => {
    jest.useFakeTimers();
    const deps = makeDeps({
      closeDatabase: jest.fn(() => new Promise(() => {})), // never resolves
      timeoutMs: 5000
    });
    const shutdown = createGracefulShutdown(deps);

    shutdown('SIGTERM', { httpServer: makeHttpServer(deps.order) });
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.exit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    expect(deps.exit).toHaveBeenCalledWith(1);

    jest.useRealTimers();
  });

  it('exits non-zero when a teardown step throws', async () => {
    const deps = makeDeps({
      closeDatabase: jest.fn(async () => {
        throw new Error('checkpoint failed');
      })
    });
    const shutdown = createGracefulShutdown(deps);

    await shutdown('SIGTERM', { httpServer: makeHttpServer(deps.order) });

    expect(deps.logger.error).toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('completes when there is no HTTP server yet (signal during startup)', async () => {
    const deps = makeDeps();
    const shutdown = createGracefulShutdown(deps);

    await shutdown('SIGTERM', {});

    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('does not let one bad scheduled task abort the shutdown', async () => {
    const deps = makeDeps();
    const shutdown = createGracefulShutdown(deps);
    const bad = {
      stop: jest.fn(() => {
        throw new Error('task already stopped');
      })
    };
    const good = { stop: jest.fn() };

    await shutdown('SIGTERM', { scheduledTasks: [bad, good] });

    expect(good.stop).toHaveBeenCalledTimes(1);
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });
});
