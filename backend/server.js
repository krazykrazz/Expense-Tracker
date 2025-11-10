const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { initializeDatabase } = require('./database/db');
const expenseRoutes = require('./routes/expenseRoutes');

const app = express();
const PORT = process.env.PORT || 2424;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Expense Tracker API is running' });
});

// Expense API routes
app.use('/api', expenseRoutes);

// Serve static files from the React app (after build)
app.use(express.static(path.join(__dirname, 'client', 'dist')));

// Catch-all handler: send back React's index.html for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
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
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
