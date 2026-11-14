const dbHelper = require('../utils/dbHelper');
const { descriptionKey } = require('../utils/plaidMatching');

const INSURANCE_TYPE = 'Tax - Medical';

/**
 * Claim columns, with what bank deposits reimbursed so far and the before-the-bank snapshot held by the claim's
 * earliest link (null without links).
 */
const CLAIM_SELECT = `
  SELECT e.id AS expenseId, e.date, e.place, e.type, e.method, e.insurance_eligible AS insuranceEligible,
         e.claim_status AS claimStatus, e.original_cost AS originalCost, e.amount AS outOfPocket,
         COALESCE((SELECT SUM(l.amount) FROM plaid_insurance_links l WHERE l.expense_id = e.id), 0) AS reimbursed,
         (SELECT COUNT(*) FROM plaid_insurance_links l WHERE l.expense_id = e.id) AS linkCount,
         f.previous_amount AS firstPreviousAmount, f.previous_status AS firstPreviousStatus,
         f.previous_people AS firstPreviousPeople, f.outside_bank AS firstOutsideBank
  FROM expenses e
  LEFT JOIN plaid_insurance_links f
    ON f.id = (SELECT MIN(l.id) FROM plaid_insurance_links l WHERE l.expense_id = e.id)`;

const placeholders = (values) => values.map(() => '?').join(',');
const allOn = (conn) => (conn ? conn.all : dbHelper.queryAll);

/**
 * Insurer deposits applied to insurance claims (spec 3.7): candidate claims, links (several claims per deposit,
 * several deposits per claim) and the writes, which take the runInTransaction connection so a whole deposit
 * applies or undoes together.
 */
class PlaidInsuranceRepository {
  /**
   * Insurance-eligible medical expenses dated in [fromDate, toDate] that a deposit can reimburse: In progress and
   * Not claimed, plus Paid ones with an out-of-pocket amount above $0 (a second plan paying the co-pay).
   */
  async findCandidateClaims(fromDate, toDate) {
    return dbHelper.queryAll(
      `${CLAIM_SELECT}
       WHERE e.insurance_eligible = 1 AND e.type = ? AND e.date BETWEEN ? AND ?
         AND (e.claim_status IN ('in_progress', 'not_claimed') OR (e.claim_status = 'paid' AND e.amount > 0))
       ORDER BY e.date, e.id`,
      [INSURANCE_TYPE, fromDate, toDate]
    );
  }

  /** The given expenses as claims (whatever their type or status, for validation), on `conn` when given. */
  async findClaimsByIds(expenseIds, conn = null) {
    if (expenseIds.length === 0) return [];
    return allOn(conn)(`${CLAIM_SELECT} WHERE e.id IN (${placeholders(expenseIds)})`, expenseIds);
  }

  /**
   * People allocations of the given expenses.
   * @returns {Promise<Map<number, Array<{personId: number, name: string, originalAmount: (number|null), amount: number}>>>}
   */
  async findPeopleForExpenses(expenseIds, conn = null) {
    const byExpense = new Map();
    if (expenseIds.length === 0) return byExpense;
    const rows = await allOn(conn)(
      `SELECT ep.expense_id AS expenseId, ep.person_id AS personId, p.name, ep.original_amount AS originalAmount, ep.amount
       FROM expense_people ep
       JOIN people p ON p.id = ep.person_id
       WHERE ep.expense_id IN (${placeholders(expenseIds)})
       ORDER BY ep.expense_id, p.name, ep.person_id`,
      expenseIds
    );
    for (const { expenseId, ...person } of rows) {
      const list = byExpense.get(expenseId) || [];
      list.push(person);
      byExpense.set(expenseId, list);
    }
    return byExpense;
  }

  /** The claims a deposit reimbursed, oldest link first. */
  async findLinksForDeposit(transactionId, conn = null) {
    return allOn(conn)(
      `SELECT id, plaid_transaction_id AS plaidTransactionId, expense_id AS expenseId, amount
       FROM plaid_insurance_links WHERE plaid_transaction_id = ? ORDER BY id`,
      [transactionId]
    );
  }

  /** A claim's links, earliest first (the first one holds the before-the-bank snapshot). */
  async findLinksForClaim(expenseId, conn = null) {
    return allOn(conn)(
      `SELECT id, plaid_transaction_id AS plaidTransactionId, expense_id AS expenseId, amount,
              previous_amount AS previousAmount, previous_status AS previousStatus, previous_people AS previousPeople,
              outside_bank AS outsideBank
       FROM plaid_insurance_links WHERE expense_id = ? ORDER BY id`,
      [expenseId]
    );
  }

  /**
   * Bank descriptions (plaidMatching.descriptionKey) of deposits applied to insurance claims before.
   * @returns {Promise<Set<string>>}
   */
  async findLearnedInsuranceKeys() {
    const rows = await dbHelper.queryAll(
      `SELECT DISTINCT pt.merchant_name AS merchantName, pt.name
       FROM plaid_insurance_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id`
    );
    return new Set(rows.map(descriptionKey).filter(Boolean));
  }

  /**
   * Bank reimbursements of the given expenses, oldest first.
   * @returns {Promise<Map<number, Array<{plaidTransactionId: number, amount: number, date: string, name: string}>>>}
   */
  async findReimbursementsForExpenses(expenseIds) {
    const byExpense = new Map();
    if (expenseIds.length === 0) return byExpense;
    const rows = await dbHelper.queryAll(
      `SELECT l.expense_id AS expenseId, l.plaid_transaction_id AS plaidTransactionId, l.amount,
              COALESCE(pt.authorized_date, pt.date) AS date, COALESCE(pt.merchant_name, pt.name) AS name
       FROM plaid_insurance_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
       WHERE l.expense_id IN (${placeholders(expenseIds)})
       ORDER BY l.id`,
      expenseIds
    );
    for (const { expenseId, ...reimbursement } of rows) {
      const list = byExpense.get(expenseId) || [];
      list.push(reimbursement);
      byExpense.set(expenseId, list);
    }
    return byExpense;
  }

  // ─── Writes (on the runInTransaction connection) ───

  /** Move a deposit still waiting for review to 'matched'. @returns {Promise<boolean>} false when it wasn't 'new' */
  async markDepositMatched(conn, transactionId) {
    const { changes } = await conn.run(
      "UPDATE plaid_transactions SET status = 'matched', expense_id = NULL WHERE id = ? AND status = 'new'",
      [transactionId]
    );
    return changes > 0;
  }

  /** Send a matched deposit back to the Inbox. @returns {Promise<boolean>} false when it wasn't 'matched' */
  async markDepositNew(conn, transactionId) {
    const { changes } = await conn.run(
      "UPDATE plaid_transactions SET status = 'new' WHERE id = ? AND status = 'matched'",
      [transactionId]
    );
    return changes > 0;
  }

  /**
   * @param {{transactionId: number, expenseId: number, amount: number, previousAmount: number,
   *   previousStatus: (string|null), previousPeople: Array<{personId: number, amount: number}>, outsideBank: number}} link
   *   `outsideBank`: what the claim had been reimbursed outside the bank before its first deposit
   */
  async insertLink(conn, { transactionId, expenseId, amount, previousAmount, previousStatus, previousPeople, outsideBank }) {
    await conn.run(
      `INSERT INTO plaid_insurance_links
         (plaid_transaction_id, expense_id, amount, previous_amount, previous_status, previous_people, outside_bank)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [transactionId, expenseId, amount, previousAmount, previousStatus, JSON.stringify(previousPeople), outsideBank]
    );
  }

  /** Copy a before-the-bank snapshot onto another link (the claim's next earliest, when the earliest is undone). */
  async updateLinkSnapshot(conn, linkId, { previousAmount, previousStatus, previousPeople, outsideBank }) {
    await conn.run(
      'UPDATE plaid_insurance_links SET previous_amount = ?, previous_status = ?, previous_people = ?, outside_bank = ? WHERE id = ?',
      [previousAmount, previousStatus, previousPeople, outsideBank ?? null, linkId]
    );
  }

  async deleteLinksForDeposit(conn, transactionId) {
    await conn.run('DELETE FROM plaid_insurance_links WHERE plaid_transaction_id = ?', [transactionId]);
  }

  /** Set a claim's out-of-pocket amount and claim status (original cost unchanged). */
  async updateClaim(conn, expenseId, amount, claimStatus) {
    await conn.run('UPDATE expenses SET amount = ?, claim_status = ? WHERE id = ?', [amount, claimStatus, expenseId]);
  }

  async updatePersonAmount(conn, expenseId, personId, amount) {
    await conn.run('UPDATE expense_people SET amount = ? WHERE expense_id = ? AND person_id = ?', [amount, expenseId, personId]);
  }
}

module.exports = new PlaidInsuranceRepository();
module.exports.INSURANCE_TYPE = INSURANCE_TYPE;
