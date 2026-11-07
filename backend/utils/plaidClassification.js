/**
 * Pure rules: what kind of money movement a staged bank transaction is, from Plaid's personal finance category
 * and the bank's description. Amounts use Plaid's sign: positive = money out of the account.
 *
 * Only `card_payment` exists so far; transfers, income, loan payments and fees come with inbox classification.
 */

const CARD_PAYMENT_PFC = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';

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
 * @param {{pfcDetailed?: string|null, amount: number, isCard: boolean, name?: string|null, merchantName?: string|null}} txn
 *   `isCard`: the account is mapped to a credit card payment method.
 * @returns {'card_payment'|null}
 */
function kindFor(txn) {
  if (!isPaymentDirection(txn)) return null;
  if (txn.pfcDetailed === CARD_PAYMENT_PFC) return 'card_payment';
  // Text decides only on the card side. Elsewhere every bill payment reads "<payee> - Bill payment".
  if (txn.isCard && CARD_CREDIT_PAYMENT_TEXT.test(textOf(txn))) return 'card_payment';
  return null;
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
  kindFor,
  looksLikeCardPayment
};
