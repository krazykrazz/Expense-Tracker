const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Build a signal handler that tears the process down in a safe order.
 *
 * Ordering is the point of this module: schedulers stop first so no new task can
 * start, then in-flight HTTP requests are allowed to finish, and only then is the
 * database closed. Closing the shared connection while a request is still using it
 * would throw SQLITE_MISUSE.
 *
 * Dependencies are injected so the ordering, idempotency and timeout behaviour can
 * be tested without starting a real server.
 *
 * @param {object} deps
 * @param {object} deps.logger
 * @param {Function} deps.closeDatabase
 * @param {object} deps.sseService
 * @param {object} deps.backupService
 * @param {Function} [deps.exit] - defaults to process.exit
 * @param {number} [deps.timeoutMs]
 * @returns {Function} shutdown(signal, resources)
 */
function createGracefulShutdown({
  logger,
  closeDatabase,
  sseService,
  backupService,
  exit = (code) => process.exit(code),
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  let shuttingDown = false;

  return async function shutdown(signal, resources = {}) {
    if (shuttingDown) {
      logger.debug(`Received ${signal} during shutdown, ignoring`);
      return;
    }
    shuttingDown = true;

    const { httpServer = null, scheduledTasks = [], timers = [] } = resources;

    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Exits anyway if a step hangs. unref'd so it cannot itself hold the loop open.
    const forceExit = setTimeout(() => {
      logger.warn(`Shutdown exceeded ${timeoutMs}ms, forcing exit`);
      exit(1);
    }, timeoutMs);
    if (typeof forceExit.unref === 'function') forceExit.unref();

    try {
      backupService.stopScheduler();

      for (const task of scheduledTasks) {
        try {
          task.stop();
        } catch (error) {
          logger.debug('Error stopping scheduled task:', error.message);
        }
      }

      for (const timer of timers) {
        if (timer) clearTimeout(timer);
      }

      // SSE responses never end on their own, so server.close() would wait forever.
      const closedStreams = sseService.closeAll();
      if (closedStreams > 0) {
        logger.info(`Closed ${closedStreams} SSE connection(s)`);
      }

      if (httpServer) {
        await new Promise((resolve) => httpServer.close(resolve));
        logger.info('HTTP server closed');
      }

      await closeDatabase();
      logger.info('Database connection closed, WAL checkpointed');

      logger.info('Shutdown complete');
      clearTimeout(forceExit);
      exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      clearTimeout(forceExit);
      exit(1);
    }
  };
}

module.exports = { createGracefulShutdown, DEFAULT_TIMEOUT_MS };
