const dbHelper = require('../utils/dbHelper');
const { linkTransaction } = require('./plaidLinkRepository');

const { fail } = require('../utils/httpError');

const PAYMENT_SELECT = `SELECT p.id, p.payment_method_id AS paymentMethodId, pm.display_name AS paymentMethodName, p.amount,
              p.payment_date AS date, p.notes,
              EXISTS (SELECT 1 FROM plaid_card_payment_links l WHERE l.credit_card_payment_id = p.id AND l.side = 'card') AS cardLinked,
              EXISTS (SELECT 1 FROM plaid_card_payment_links l WHERE l.credit_card_payment_id = p.id AND l.side = 'funding') AS fundingLinked
       FROM credit_card_payments p
       JOIN payment_methods pm ON pm.id = p.payment_method_id`;
const withLinkFlags = (row) => ({ ...row, cardLinked: Boolean(row.cardLinked), fundingLinked: Boolean(row.fundingLinked) });

/**
 * Data access for credit card payments seen from the Import Inbox: which recorded payments a bank row could be
 * one side of, and the links between bank transactions and payments (`plaid_card_payment_links`).
 */
class PlaidCardPaymentRepository {
  /**
   * Recorded payments dated in a range, with whether each already has a bank row on either side.
   * @returns {Promise<Array<{id: number, paymentMethodId: number, paymentMethodName: string, amount: number, date: string,
   *   notes: (string|null), cardLinked: boolean, fundingLinked: boolean}>>}
   */
  async findPaymentsInRange(fromDate, toDate) {
    const rows = await dbHelper.queryAll(
      `${PAYMENT_SELECT} WHERE p.payment_date >= ? AND p.payment_date <= ? ORDER BY p.payment_date, p.id`,
      [fromDate, toDate]
    );
    return rows.map(withLinkFlags);
  }

  /** One payment in the shape of {@link findPaymentsInRange}, or null. */
  async findPaymentById(id) {
    const row = await dbHelper.queryOne(`${PAYMENT_SELECT} WHERE p.id = ?`, [id]);
    return row ? withLinkFlags(row) : null;
  }

  /** Active credit cards no bank account is mapped to: no card-side row will ever arrive for their payments. */
  async findUnconnectedCreditCards() {
    return dbHelper.queryAll(
      `SELECT pm.id, pm.display_name AS name FROM payment_methods pm
       WHERE pm.type = 'credit_card' AND pm.is_active = 1
         AND NOT EXISTS (SELECT 1 FROM plaid_accounts pa WHERE pa.payment_method_id = pm.id)
       ORDER BY pm.display_name`
    );
  }

  async isCardConnected(paymentMethodId) {
    const row = await dbHelper.queryOne(
      'SELECT 1 AS connected FROM plaid_accounts WHERE payment_method_id = ? LIMIT 1',
      [paymentMethodId]
    );
    return Boolean(row);
  }

  /**
   * Mark a bank row reviewed ('matched') and link it to a payment, inside `tx` when given (so a payment and its
   * links commit together) or in a transaction of its own.
   * @param {{run: Function}|null} tx
   * @param {'card'|'funding'} side
   * @throws 409 when the row was no longer 'new' or the payment already has a row on that side
   */
  async link(tx, transactionId, paymentId, side) {
    const apply = async (conn) => {
      let linked;
      try {
        linked = await linkTransaction(conn, 'cardPayment', transactionId, [paymentId, side]);
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          throw fail(`That payment already has a bank transaction on the ${side === 'card' ? 'card' : 'paying account'} side`, 409);
        }
        throw err;
      }
      if (!linked) throw fail('Bank transaction was already reviewed', 409);
    };
    return tx ? apply(tx) : dbHelper.runInTransaction(apply);
  }

  /**
   * Bank rows linked to payments, for the card view.
   * @returns {Promise<Map<number, Array<{side: string, date: string, name: string, amount: number, accountName: (string|null), accountMask: (string|null)}>>>}
   */
  async findLinksForPayments(paymentIds) {
    const links = new Map();
    const CHUNK = 500;
    for (let i = 0; i < paymentIds.length; i += CHUNK) {
      const chunk = paymentIds.slice(i, i + CHUNK);
      const rows = await dbHelper.queryAll(
        `SELECT l.credit_card_payment_id AS paymentId, l.side, pt.date, pt.amount, COALESCE(pt.merchant_name, pt.name) AS name,
                pa.name AS accountName, pa.mask AS accountMask
         FROM plaid_card_payment_links l
         JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
         LEFT JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
         WHERE l.credit_card_payment_id IN (${chunk.map(() => '?').join(',')})
         ORDER BY l.side, pt.date`,
        chunk
      );
      for (const { paymentId, ...link } of rows) {
        if (!links.has(paymentId)) links.set(paymentId, []);
        links.get(paymentId).push(link);
      }
    }
    return links;
  }
}

module.exports = new PlaidCardPaymentRepository();
