const expenseService = require('../services/expenseService');
const recurringExpenseService = require('../services/recurringExpenseService');
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../database/db');
const csv = require('csv-parser');
const multer = require('multer');

// Configure multer for file upload
const upload = multer({ dest: 'uploads/' });

/**
 * Create a new expense
 * POST /api/expenses
 */
async function createExpense(req, res) {
  try {
    const expenseData = req.body;
    const createdExpense = await expenseService.createExpense(expenseData);
    res.status(201).json(createdExpense);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get all expenses with optional year/month filtering
 * GET /api/expenses?year=2024&month=11
 */
async function getExpenses(req, res) {
  try {
    const { year, month } = req.query;
    const filters = {};
    
    if (year) {
      filters.year = parseInt(year);
    }
    
    if (month) {
      filters.month = parseInt(month);
    }
    
    // If year and month are provided, generate recurring expenses for that month first
    if (year && month) {
      await recurringExpenseService.generateExpensesForMonth(
        parseInt(year),
        parseInt(month)
      );
    }
    
    const expenses = await expenseService.getExpenses(filters);
    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Toggle highlight on an expense
 * PATCH /api/expenses/:id/highlight
 */
async function toggleHighlight(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const { highlighted } = req.body;
    const result = await expenseService.toggleHighlight(id, highlighted);
    
    if (!result) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Toggle tax deductible on an expense
 * PATCH /api/expenses/:id/tax
 */
async function toggleTaxDeductible(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const { tax_deductible } = req.body;
    const result = await expenseService.toggleTaxDeductible(id, tax_deductible);
    
    if (!result) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update an expense by ID
 * PUT /api/expenses/:id
 */
async function updateExpense(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const expenseData = req.body;
    const updatedExpense = await expenseService.updateExpense(id, expenseData);
    
    if (!updatedExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.status(200).json(updatedExpense);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete an expense by ID
 * DELETE /api/expenses/:id
 */
async function deleteExpense(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    const deleted = await expenseService.deleteExpense(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get summary data for a specific month
 * GET /api/expenses/summary?year=2024&month=11
 */
async function getSummary(req, res) {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month query parameters are required' });
    }
    
    const summary = await expenseService.getSummary(year, month);
    res.status(200).json(summary);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get annual summary data
 * GET /api/expenses/annual-summary?year=2024
 */
async function getAnnualSummary(req, res) {
  try {
    const { year } = req.query;
    
    if (!year) {
      return res.status(400).json({ error: 'Year query parameter is required' });
    }
    
    const summary = await expenseService.getAnnualSummary(parseInt(year));
    res.status(200).json(summary);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get monthly gross income
 * GET /api/monthly-gross?year=2024&month=11
 */
async function getMonthlyGross(req, res) {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month query parameters are required' });
    }
    
    const grossAmount = await expenseService.getMonthlyGross(parseInt(year), parseInt(month));
    res.status(200).json({ 
      year: parseInt(year),
      month: parseInt(month),
      grossAmount: grossAmount || 0
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Set monthly gross income
 * POST /api/monthly-gross
 */
async function setMonthlyGross(req, res) {
  try {
    const { year, month, grossAmount } = req.body;
    
    if (!year || !month || grossAmount === undefined || grossAmount === null) {
      return res.status(400).json({ error: 'Year, month, and grossAmount are required' });
    }
    
    const result = await expenseService.setMonthlyGross(
      parseInt(year), 
      parseInt(month), 
      parseFloat(grossAmount)
    );
    
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Convert MM/DD/YY date to YYYY-MM-DD format
 */
function convertDate(dateStr) {
  if (!dateStr) return null;
  
  // Handle MM/DD/YY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    let [month, day, year] = parts;
    
    // Convert 2-digit year to 4-digit
    if (year.length === 2) {
      const currentYear = new Date().getFullYear();
      const currentCentury = Math.floor(currentYear / 100) * 100;
      const yearNum = parseInt(year);
      
      // If year is greater than current year's last 2 digits, assume previous century
      if (yearNum > currentYear % 100) {
        year = (currentCentury - 100 + yearNum).toString();
      } else {
        year = (currentCentury + yearNum).toString();
      }
    }
    
    // Pad month and day with leading zeros
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
  
  return dateStr;
}

/**
 * Import expenses from CSV
 * POST /api/import
 * 
 * Imports expenses from CSV file. All imported expenses are treated as manual entries
 * (recurring_id = null, is_generated = 0) to ensure they are not linked to recurring templates.
 */
async function importExpenses(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const errors = [];
  let successCount = 0;
  let errorCount = 0;

  try {
    // Read and parse CSV file (skip first 3 rows, data starts at row 4)
    let rowCount = 0;
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv({ headers: false })) // Don't use first row as headers
        .on('data', (data) => {
          rowCount++;
          if (rowCount >= 4) { // Only process rows 4 and onwards
            results.push(data);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Process each row
    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      try {
        // Get values from columns by index (since we're not using headers)
        // Column A (0): Date, B (1): Place, C (2): Amount, D (3): Notes, E (4): Type, F (5): Week (ignored), G (6): Method
        const rowValues = Object.values(row);
        const dateStr = rowValues[0];
        const place = rowValues[1] || '';
        const amountStr = rowValues[2];
        const notes = rowValues[3] || '';
        const type = rowValues[4];
        const method = rowValues[6]; // Column G (skip F which is week)

        // Skip empty rows
        if (!dateStr || !amountStr || !type || !method) {
          continue;
        }

        // Clean amount: remove $, commas, and any other non-numeric characters except decimal point
        const cleanAmount = amountStr.toString().replace(/[$,]/g, '');
        const amount = parseFloat(cleanAmount);

        // Skip if amount is invalid
        if (isNaN(amount)) {
          continue;
        }

        // Convert date from MM/DD/YY to YYYY-MM-DD
        const convertedDate = convertDate(dateStr);
        
        // Map CSV columns to expense fields
        // Note: recurring_id and is_generated are explicitly excluded to ensure
        // imported expenses are treated as manual entries, not generated from templates
        const expenseData = {
          date: convertedDate,
          place: place.trim(),
          notes: notes.trim(),
          amount: amount,
          type: type.trim(),
          method: method.trim(),
          recurring_id: null,
          is_generated: 0
        };

        // Validate and create expense
        await expenseService.createExpense(expenseData);
        successCount++;
      } catch (error) {
        errorCount++;
        errors.push({
          row: i + 4, // +4 because data starts at row 4 in the spreadsheet
          data: row,
          error: error.message
        });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: 'Import completed',
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit to first 10 errors
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Backup database
 * GET /api/backup
 * 
 * Creates a complete backup of the SQLite database including:
 * - expenses table (with recurring_id and is_generated fields)
 * - monthly_gross table
 * - recurring_expenses table
 */
async function backupDatabase(req, res) {
  try {
    // Check if database file exists
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).json({ error: 'Database file not found' });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `expense-tracker-backup-${timestamp}.db`;

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the database file (includes all tables: expenses, monthly_gross, recurring_expenses)
    const fileStream = fs.createReadStream(DB_PATH);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming database file:', error);
      res.status(500).json({ error: 'Failed to backup database' });
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createExpense,
  getExpenses,
  updateExpense,
  toggleHighlight,
  toggleTaxDeductible,
  deleteExpense,
  getSummary,
  getAnnualSummary,
  getMonthlyGross,
  setMonthlyGross,
  importExpenses,
  backupDatabase,
  upload
};
