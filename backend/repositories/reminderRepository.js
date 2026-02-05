const { getDatabase } = require('../database/db');

class ReminderRepository {
  /**
   * Get all active credit cards with payment due dates
   * Includes billing_cycle_day for statement balance calculation
   * @returns {Promise<Array>} Array of credit cards with due date info
   * _Requirements: 5.1_
   */
  async getCreditCardsWithDueDates() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          id,
          display_name,
          full_name,
          current_balance,
          credit_limit,
          payment_due_day,
          billing_cycle_day,
          billing_cycle_start,
          billing_cycle_end
        FROM payment_methods
        WHERE type = 'credit_card'
          AND is_active = 1
          AND payment_due_day IS NOT NULL
        ORDER BY display_name ASC
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }
  /**
   * Get all active investments with their value status for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of investments with hasValue flag
   */
  async getInvestmentsWithValueStatus(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          i.id,
          i.name,
          i.type,
          CASE 
            WHEN iv.id IS NOT NULL THEN 1 
            ELSE 0 
          END as hasValue
        FROM investments i
        LEFT JOIN investment_values iv 
          ON i.id = iv.investment_id 
          AND iv.year = ? 
          AND iv.month = ?
        ORDER BY i.name ASC
      `;
      
      db.all(sql, [year, month], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Get all active loans with their balance status for a specific month
   * Only includes loans that have started (start_date <= requested month)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of loans with hasBalance flag
   */
  async getLoansWithBalanceStatus(year, month) {
    const db = await getDatabase();
    
    // Build the first day of the requested month for comparison
    // Format: YYYY-MM-01
    const monthStr = month.toString().padStart(2, '0');
    const requestedMonthStart = `${year}-${monthStr}-01`;
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          l.id,
          l.name,
          l.loan_type,
          CASE 
            WHEN lb.id IS NOT NULL THEN 1 
            ELSE 0 
          END as hasBalance
        FROM loans l
        LEFT JOIN loan_balances lb 
          ON l.id = lb.loan_id 
          AND lb.year = ? 
          AND lb.month = ?
        WHERE l.is_paid_off = 0
          AND date(l.start_date) <= date(?)
        ORDER BY l.name ASC
      `;
      
      db.all(sql, [year, month, requestedMonthStart], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Get medical expenses with in-progress insurance claims
   * Queries expenses where type = 'Tax - Medical', insurance_eligible = 1, claim_status = 'in_progress'
   * Includes days_pending calculation and associated person names
   * @param {Date} referenceDate - Reference date for days_pending calculation (defaults to today)
   * @returns {Promise<Array>} Array of expenses with pending claims
   * _Requirements: 1.1, 1.2_
   */
  async getMedicalExpensesWithPendingClaims(referenceDate = new Date()) {
    const db = await getDatabase();
    
    // Format reference date as YYYY-MM-DD for SQLite
    const refDateStr = referenceDate.toISOString().split('T')[0];
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          e.id,
          e.date,
          e.place,
          e.amount,
          e.original_cost,
          CAST(julianday(?) - julianday(e.date) AS INTEGER) as days_pending,
          GROUP_CONCAT(p.name, ', ') as person_names
        FROM expenses e
        LEFT JOIN expense_people ep ON e.id = ep.expense_id
        LEFT JOIN people p ON ep.person_id = p.id
        WHERE e.type = 'Tax - Medical'
          AND e.insurance_eligible = 1
          AND e.claim_status = 'in_progress'
        GROUP BY e.id
        ORDER BY days_pending DESC
      `;
      
      db.all(sql, [refDateStr], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }
}

module.exports = new ReminderRepository();
