// Jest setup file for backend tests
const { getDatabase } = require('./database/db');

// Global test timeout for property-based tests
jest.setTimeout(30000);

// Global cleanup after all tests
afterAll(async () => {
  try {
    const db = await getDatabase();
    
    // Clean up test data
    const tables = [
      'expense_people',
      'expenses', 
      'people',
      'fixed_expenses',
      'income_sources',
      'budgets',
      'loans',
      'loan_balances',
      'investments',
      'investment_values'
    ];
    
    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM ${table} WHERE 1=1`, (err) => {
          if (err && !err.message.includes('no such table')) {
            console.warn(`Warning: Could not clean ${table}:`, err.message);
          }
          resolve();
        });
      });
    }
    
    // Reset sequences
    await new Promise((resolve) => {
      db.run('DELETE FROM sqlite_sequence', (err) => {
        if (err && !err.message.includes('no such table')) {
          console.warn('Warning: Could not reset sequences:', err.message);
        }
        resolve();
      });
    });
    
    db.close();
  } catch (error) {
    console.warn('Warning: Global cleanup failed:', error.message);
  }
});

// Suppress console output during tests unless explicitly needed
const originalConsole = { ...console };
beforeAll(() => {
  // Only suppress in CI or when NODE_ENV is test
  if (process.env.CI || process.env.NODE_ENV === 'test') {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console
  if (process.env.CI || process.env.NODE_ENV === 'test') {
    Object.assign(console, originalConsole);
  }
});