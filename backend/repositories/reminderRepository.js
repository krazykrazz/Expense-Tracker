const { getDatabase } = require('../database/db');

class ReminderRepository {
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
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of loans with hasBalance flag
   */
  async getLoansWithBalanceStatus(year, month) {
    const db = await getDatabase();
    
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
        ORDER BY l.name ASC
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
}

module.exports = new ReminderRepository();
