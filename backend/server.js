const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database/db');
const expenseRoutes = require('./routes/expenseRoutes');
const backupRoutes = require('./routes/backupRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const fixedExpenseRoutes = require('./routes/fixedExpenseRoutes');
const loanRoutes = require('./routes/loanRoutes');
const loanBalanceRoutes = require('./routes/loanBalanceRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const healthRoutes = require('./routes/healthRoutes');
const placeNameRoutes = require('./routes/placeNameRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const backupService = require('./services/backupService');
const logger = require('./config/logger');
const { configureTimezone, getTimezone } = require('./config/timezone');
const { errorHandler } = require('./middleware/errorHandler');

// Configure timezone at startup
configureTimezone();

const app = express();
const PORT = process.env.PORT || 2626;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API routes
// Health check endpoint
app.use('/api', healthRoutes);

// Expense API routes
app.use('/api', expenseRoutes);

// Backup API routes
app.use('/api', backupRoutes);

// Income API routes
app.use('/api/income', incomeRoutes);

// Fixed expense API routes
app.use('/api/fixed-expenses', fixedExpenseRoutes);

// Loan API routes
app.use('/api/loans', loanRoutes);

// Loan balance API routes
app.use('/api/loan-balances', loanBalanceRoutes);

// Budget API routes
app.use('/api/budgets', budgetRoutes);

// Place name API routes
app.use('/api/expenses/place-names', placeNameRoutes);

// Category API routes
app.use('/api/categories', categoryRoutes);

// Serve static files from the React app (after build)
// In container: /app/frontend/dist, in development: ../frontend/dist
const frontendPath = process.env.NODE_ENV === 'production' 
  ? path.join('/app', 'frontend', 'dist')
  : path.join(__dirname, '..', 'frontend', 'dist');

app.use(express.static(frontendPath));

// Catch-all handler: send back React's index.html for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      logger.info('=== Expense Tracker Server Started ===');
      logger.info(`Environment Configuration:`);
      logger.info(`  - LOG_LEVEL: ${logger.getLogLevel()}`);
      logger.info(`  - SERVICE_TZ: ${getTimezone()}`);
      logger.info(`  - PORT: ${PORT}`);
      logger.info(`  - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
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
    });
  })
  .catch((err) => {
    logger.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
