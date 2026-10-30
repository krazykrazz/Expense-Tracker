const dbHelper = require('../utils/dbHelper');

const COLUMNS = 'id, year, month, name, amount, investment_id AS investmentId, created_at, updated_at';

class AllocationRepository {
  /**
   * @param {{year: number, month: number, name: string, amount: number, investmentId: (number|null)}} allocation
   * @returns {Promise<Object>} the created allocation
   */
  async create({ year, month, name, amount, investmentId = null }) {
    const { lastID } = await dbHelper.execute(
      'INSERT INTO budget_allocations (year, month, name, amount, investment_id) VALUES (?, ?, ?, ?, ?)',
      [year, month, name, amount, investmentId]
    );
    return this.findById(lastID);
  }

  async findById(id) {
    return dbHelper.queryOne(`SELECT ${COLUMNS} FROM budget_allocations WHERE id = ?`, [id]);
  }

  async findByYearMonth(year, month) {
    return dbHelper.queryAll(
      `SELECT ${COLUMNS} FROM budget_allocations WHERE year = ? AND month = ? ORDER BY name ASC`,
      [year, month]
    );
  }

  /**
   * Stored allocation totals per month over an inclusive range of month indexes (year * 12 + month - 1).
   * @returns {Promise<Array<{year: number, month: number, total: number}>>}
   */
  async sumByMonthRange(startIdx, endIdx) {
    // The year prefilter lets SQLite use the (year, month) index
    return dbHelper.queryAll(
      `SELECT year, month, SUM(amount) AS total FROM budget_allocations
       WHERE year BETWEEN ? AND ? AND (year * 12 + month - 1) BETWEEN ? AND ?
       GROUP BY year, month`,
      [Math.floor(startIdx / 12), Math.floor(endIdx / 12), startIdx, endIdx]
    );
  }

  /**
   * @returns {Promise<Object|null>} the updated allocation, or null when the id does not exist
   */
  async update(id, { name, amount, investmentId = null }) {
    const { changes } = await dbHelper.execute(
      'UPDATE budget_allocations SET name = ?, amount = ?, investment_id = ? WHERE id = ?',
      [name, amount, investmentId, id]
    );
    return changes === 0 ? null : this.findById(id);
  }

  /**
   * @returns {Promise<boolean>} true when a row was deleted
   */
  async delete(id) {
    const { changes } = await dbHelper.execute('DELETE FROM budget_allocations WHERE id = ?', [id]);
    return changes > 0;
  }
}

module.exports = new AllocationRepository();
