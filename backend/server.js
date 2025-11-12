const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database/db');
const expenseRoutes = require('./routes/expenseRoutes');
const recurringExpenseRoutes = require('./routes/recurringExpenseRoutes');
const backupRoutes = require('./routes/backupRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const fixedExpenseRoutes = require('./routes/fixedExpenseRoutes');
const backupService = require('./services/backupService');

const app = express();
const PORT = process.env.PORT || 2424;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Expense Tracker API is running' });
});

// Expense API routes
app.use('/api', expenseRoutes);

// Recurring expense API routes
app.use('/api', recurringExpenseRoutes);

// Backup API routes
app.use('/api', backupRoutes);

// Income API routes
app.use('/api/income', incomeRoutes);

// Fixed expense API routes
app.use('/api/fixed-expenses', fixedExpenseRoutes);

// Serve static files from the React app (after build)
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// Catch-all handler: send back React's index.html for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
      console.log(`Frontend available at http://localhost:${PORT}`);
      console.log(`\nTo access from other devices on your network:`);
      console.log(`Find your local IP address and use: http://YOUR_LOCAL_IP:${PORT}`);
      
      // Start backup scheduler
      backupService.startScheduler();
      const config = backupService.getConfig();
      if (config.enabled) {
        const nextBackup = backupService.getNextBackupTime();
        console.log(`\nAutomatic backups enabled`);
        console.log(`Next backup: ${nextBackup ? nextBackup.toLocaleString() : 'Not scheduled'}`);
      }
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
