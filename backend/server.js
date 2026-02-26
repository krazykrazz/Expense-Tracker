const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');
const { initializeDatabase } = require('./database/db');
const expenseRoutes = require('./routes/expenseRoutes');
const backupRoutes = require('./routes/backupRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const fixedExpenseRoutes = require('./routes/fixedExpenseRoutes');
const loanRoutes = require('./routes/loanRoutes');
const loanBalanceRoutes = require('./routes/loanBalanceRoutes');
const loanPaymentRoutes = require('./routes/loanPaymentRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const healthRoutes = require('./routes/healthRoutes');
const placeNameRoutes = require('./routes/placeNameRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const investmentRoutes = require('./routes/investmentRoutes');
const investmentValueRoutes = require('./routes/investmentValueRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const peopleRoutes = require('./routes/peopleRoutes');
const merchantAnalyticsRoutes = require('./routes/merchantAnalyticsRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const paymentMethodRoutes = require('./routes/paymentMethodRoutes');
const billingCycleRoutes = require('./routes/billingCycleRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const syncRoutes = require('./routes/syncRoutes');
const authRoutes = require('./routes/authRoutes');
const backupService = require('./services/backupService');
const authService = require('./services/authService');
const activityLogService = require('./services/activityLogService');
const sseService = require('./services/sseService');
const billingCycleSchedulerService = require('./services/billingCycleSchedulerService');
const versionCheckService = require('./services/versionCheckService');
const logger = require('./config/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware, sseAuthMiddleware } = require('./middleware/authMiddleware');

// Wire SSE service into activityLogService (avoids circular dependency)
activityLogService.setSseService(sseService);

const app = express();
const PORT = process.env.PORT || 2626;

// Generate a unique startup ID that changes on every process restart
// Used by the frontend to detect container updates/restarts
try {
  app.locals.startupId = crypto.randomUUID();
} catch {
  app.locals.startupId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  logger.warn('crypto.randomUUID() unavailable, using fallback startupId');
}
logger.info(`Startup ID generated: ${app.locals.startupId}`);

// Trust proxy - required when running behind Docker/nginx/reverse proxy
// This allows express-rate-limit to correctly identify client IPs from X-Forwarded-For header
app.set('trust proxy', 1);

// Security middleware - Helmet sets various HTTP headers for security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'self'", "blob:"], // Allow PDF objects from blob URLs
      frameSrc: ["'self'", "blob:"], // Allow iframes with blob URLs for PDF viewing
      upgradeInsecureRequests: null // Disable for local network use
    }
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for local network
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow cross-origin for local network
}));

// Rate limiting configuration
// General API rate limit: 500 requests per minute per IP
// Note: The app fires ~13 parallel requests on page load/month change,
// so rapid navigation needs headroom. This is a local network app.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' // Skip health checks
});

// Rate limit for file uploads: 30 per 15 minutes
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'Too many file uploads, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limit for backup/restore: 5 per hour
const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many backup operations, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// SSE sync route — registered BEFORE generalLimiter so persistent connections
// are not counted against the per-IP rate limit.
// sseAuthMiddleware validates JWT from ?token= query param when Password_Gate is active.
app.use('/api/sync', sseAuthMiddleware, syncRoutes);

// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);

// CORS — restricted to configured origin or same-origin (no explicit origin header)
const corsOptions = {
  origin: process.env.CORS_ORIGIN || false,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Cookie parser — required for refresh token cookie handling
app.use(cookieParser());

// Body parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Auth routes — registered BEFORE authMiddleware (public endpoints)
app.use('/api/auth', authRoutes);

// Auth middleware — enforces JWT auth when Password_Gate is active
app.use('/api', authMiddleware);

// API routes
// Health check endpoint (no rate limiting)
app.use('/api', healthRoutes);

// Expense API routes
app.use('/api', expenseRoutes);

// Backup API routes - apply strict backup rate limiting only to write operations
// Download (GET /api/backup) and list (GET /api/backup/list) are excluded from rate limiting
app.use('/api/backup/manual', backupLimiter);
app.use('/api/backup/restore', backupLimiter);
app.use('/api/backup/restore-archive', backupLimiter);
app.use('/api', backupRoutes);

// Income API routes
app.use('/api/income', incomeRoutes);

// Fixed expense API routes
app.use('/api/fixed-expenses', fixedExpenseRoutes);

// Loan API routes
app.use('/api/loans', loanRoutes);

// Loan balance API routes
app.use('/api/loan-balances', loanBalanceRoutes);

// Loan payment API routes (payment-based tracking for loans and mortgages)
app.use('/api/loans', loanPaymentRoutes);

// Budget API routes
app.use('/api/budgets', budgetRoutes);

// Place name API routes
app.use('/api/expenses/place-names', placeNameRoutes);

// Category API routes
app.use('/api/categories', categoryRoutes);

// Investment API routes
app.use('/api/investments', investmentRoutes);

// Investment value API routes
app.use('/api/investment-values', investmentValueRoutes);

// Reminder API routes
app.use('/api/reminders', reminderRoutes);

// People API routes
app.use('/api/people', peopleRoutes);

// Merchant Analytics API routes
app.use('/api', merchantAnalyticsRoutes);

// Spending Patterns & Predictions Analytics API routes
app.use('/api/analytics', analyticsRoutes);

// Invoice API routes - apply upload rate limiting for POST requests
app.post('/api/invoices/upload', uploadLimiter);
app.use('/api/invoices', invoiceRoutes);

// Payment Method API routes - apply upload rate limiting for statement uploads
app.post('/api/payment-methods/:id/statements', uploadLimiter);
app.use('/api/payment-methods', paymentMethodRoutes);

// Billing Cycle History API routes (nested under payment-methods)
app.use('/api/payment-methods', billingCycleRoutes);

// Activity Log API routes
app.use('/api/activity-logs', activityLogRoutes);

// Settings API routes
app.use('/api/settings/timezone', settingsRoutes);

// Serve static files from the React app (after build)
// In container (production/staging): /app/frontend/dist, in development: ../frontend/dist
const isContainerEnv = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
const frontendPath = isContainerEnv
  ? path.join('/app', 'frontend', 'dist')
  : path.join(__dirname, '..', 'frontend', 'dist');

app.use(express.static(frontendPath));

// Catch-all handler: send back React's index.html for any non-API routes
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and start server
initializeDatabase()
  .then(async () => {
    // Initialize default admin user for auth infrastructure
    try {
      await authService.initializeDefaultUser();
    } catch (error) {
      logger.error('Auth initialization failed during startup (non-blocking):', error);
    }

    // Check for version upgrades and log to activity log (fire-and-forget)
    try {
      await versionCheckService.checkAndLogVersionUpgrade();
    } catch (error) {
      logger.error('Version check failed during startup (non-blocking):', error);
    }

    app.listen(PORT, '0.0.0.0', () => {
      logger.info('=== Expense Tracker Server Started ===');
      logger.info(`Environment Configuration:`);
      logger.info(`  - LOG_LEVEL: ${logger.getLogLevel()}`);
      logger.info(`  - TZ: Etc/UTC`);
      logger.info(`  - PORT: ${PORT}`);
      logger.info(`  - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
      logger.info('');
      logger.info('Security features enabled:');
      logger.info('  - Helmet security headers');
      logger.info('  - Rate limiting (500 req/min general, 10 uploads/15min, 5 backups/hr)');
      logger.info('  - CORS restricted (origin: ' + (process.env.CORS_ORIGIN || 'same-origin') + ')');
      logger.info('  - Auth middleware (Password_Gate: ' + (authService.isPasswordGateActive() ? 'active' : 'Open_Mode') + ')');
      logger.info('');
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`API available at http://localhost:${PORT}/api`);
      logger.info(`Frontend available at http://localhost:${PORT}`);
      logger.info('');
      logger.info('To access from other devices on your network:');
      logger.info('Find your local IP address and use: http://YOUR_LOCAL_IP:' + PORT);
      
      // Start backup scheduler
      backupService.startScheduler();
      const config = backupService.getConfig();
      if (config.enabled) {
        const nextBackup = backupService.getNextBackupTime();
        logger.info('');
        logger.info('Automatic backups enabled');
        logger.info(`Next backup: ${nextBackup ? nextBackup.toLocaleString() : 'Not scheduled'}`);
      }
      
      // Start activity log cleanup scheduler
      // Runs daily at 2:00 AM UTC (equivalent to 9:00 PM EST / 10:00 PM EDT)
      cron.schedule('0 2 * * *', async () => {
        try {
          logger.info('Starting scheduled activity log cleanup...');
          const result = await activityLogService.cleanupOldEvents();
          logger.info(`Activity log cleanup completed: ${result.deletedCount} events deleted, oldest remaining: ${result.oldestRemaining || 'none'}`);
        } catch (error) {
          logger.error('Activity log cleanup failed:', error);
        }
      }, { timezone: 'Etc/UTC' });
      logger.info('');
      logger.info('Activity log cleanup scheduled (daily at 2:00 AM UTC)');
      
      // Start billing cycle auto-generation scheduler
      // Runs hourly at :00 UTC — date-driven model checks business date transitions
      cron.schedule('0 * * * *', async () => {
        await billingCycleSchedulerService.runAutoGeneration();
      }, { timezone: 'Etc/UTC' });
      logger.info('');
      logger.info('Billing cycle auto-generation scheduled (hourly UTC)');
      
      // Initial run after startup to catch missed cycles during downtime (Req 5.3)
      setTimeout(async () => {
        logger.info('Running initial billing cycle auto-generation check...');
        await billingCycleSchedulerService.runAutoGeneration();
      }, 60000);
    });
  })
  .catch((err) => {
    logger.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
