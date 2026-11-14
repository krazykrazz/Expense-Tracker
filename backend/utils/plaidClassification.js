/**
 * Pure rules: what kind of money movement a staged bank transaction is, from Plaid's personal finance category
 * and the bank's description. Amounts use Plaid's sign: positive = money out of the account.
 *
 * Kinds: `card_payment`, `transfer` and `loan_payment`. `bucketFor` puts those in the Inbox's Not expenses tab
 * (spec 3.1); everything else, deposits included, stays in To review.
 */

const CARD_PAYMENT_PFC = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';
const BUCKETS = ['spending', 'not_expense'];
// Loan payments stay in To review: they are often matched to a fixed expense (mortgage)
const NOT_EXPENSE_KINDS = new Set(['card_payment', 'transfer']);
const E_TRANSFER_TEXT = /e-?transfer/i;

/** A credit on a card that says it's a payment: "Credit Card Payment - From: Cash", "PAYMENT THANK YOU/PAIEMEN T MERCI". */
const CARD_CREDIT_PAYMENT_TEXT = /\b(payment|paiement|paiemen|pmt)\b/i;
/** A debit elsewhere that names a credit card payment: "Credit Card Payment", "CIBC MASTERCARD - Bill payment". */
const CARD_PAYMENT_TEXT = /\bcredit\s*card\s*(payment|pmt)\b/i;
const PAYMENT_TEXT = /\b(payment|paiement|pmt)\b/i;
const CARD_ISSUER_TEXT = /\b(visa|master\s*card|mastercard|mc|amex|american\s*express)\b/i;

const textOf = ({ name, merchantName }) => [name, merchantName].filter(Boolean).join(' ');

/**
 * The money is moving the way a card payment does: into a card account, or out of any other account.
 * @param {{amount: number, isCard: boolean}} txn
 */
const isPaymentDirection = ({ amount, isCard }) => (isCard ? amount < 0 : amount > 0);

/**
 * @param {{pfcPrimary?: string|null, pfcDetailed?: string|null, amount: number, isCard: boolean, name?: string|null, merchantName?: string|null}} txn
 *   `isCard`: the account is mapped to a credit card payment method.
 * @returns {'card_payment'|'transfer'|'loan_payment'|null} `transfer` and `loan_payment` only for money out of
 *   an account that isn't a card (Plaid's primary category `TRANSFER_OUT` / `LOAN_PAYMENTS`)
 */
function kindFor(txn) {
  if (!isPaymentDirection(txn)) return null;
  if (txn.pfcDetailed === CARD_PAYMENT_PFC) return 'card_payment';
  // Text decides only on the card side. Elsewhere every bill payment reads "<payee> - Bill payment".
  if (txn.isCard && CARD_CREDIT_PAYMENT_TEXT.test(textOf(txn))) return 'card_payment';
  // Plaid files e-Transfers to people as TRANSFER_OUT too, but they are usually spending (babysitter, a contractor)
  if (!txn.isCard && txn.pfcPrimary === 'TRANSFER_OUT' && !E_TRANSFER_TEXT.test(textOf(txn))) return 'transfer';
  if (!txn.isCard && txn.pfcPrimary === 'LOAN_PAYMENTS') return 'loan_payment';
  return null;
}

/**
 * The Inbox tab a staged row belongs in: `not_expense` (Not expenses) for card payments and transfers out
 * between accounts; `spending` (To review) for everything else. Deposits always stay in To review (income and
 * insurer payouts, which Plaid often files as `TRANSFER_IN`, are acted on there), as do Interac e-Transfers,
 * loan payments, refunds on a card, bank fees and rows without a category.
 * @param {Parameters<typeof kindFor>[0]} txn
 * @returns {'spending'|'not_expense'}
 */
function bucketFor(txn) {
  return NOT_EXPENSE_KINDS.has(kindFor(txn)) ? 'not_expense' : 'spending';
}

/**
 * A weaker hint than `kindFor`: also true for a debit whose description reads like a credit card payment.
 * Used for warnings and hints only, never to enable an action.
 * @param {Parameters<typeof kindFor>[0]} txn
 */
function looksLikeCardPayment(txn) {
  if (kindFor(txn) === 'card_payment') return true;
  if (txn.isCard || !isPaymentDirection(txn)) return false;
  const text = textOf(txn);
  return CARD_PAYMENT_TEXT.test(text) || (PAYMENT_TEXT.test(text) && CARD_ISSUER_TEXT.test(text));
}

module.exports = {
  CARD_PAYMENT_PFC,
  BUCKETS,
  kindFor,
  bucketFor,
  looksLikeCardPayment
};
