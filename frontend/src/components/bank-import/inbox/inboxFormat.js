import { formatCurrency, formatDate } from '../../../utils/formatters';

/** Amounts in another currency are shown with a badge; they are not converted. */
export const EXPECTED_CURRENCY = 'CAD';

/**
 * A bank amount as people read it: money in (Plaid sends it negative: a deposit, a refund, a card payment received)
 * as "+$13.54", money out as "$13.54".
 */
export const formatSigned = (amount) => (amount < 0 ? `+${formatCurrency(Math.abs(amount))}` : formatCurrency(amount));

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dueLabel = (fixed) => (fixed.expectedDate ? `due ${formatDate(fixed.expectedDate)}` : `${MONTHS[fixed.month - 1]} ${fixed.year}, no due day`);

/** A fixed expense "closely" matches when the amounts are within 10% (or exactly equal). */
export const isCloseFixed = (txn, fixed) => !fixed.amountDiffers || Math.abs(fixed.amount - txn.amount) <= Math.abs(fixed.amount) * 0.1;

/** Expected income is a likely match when its name fits the deposit or the amount is exact. */
export const isCloseIncome = (income) => income.nameMatch || !income.amountDiffers;
/**
 * Whether "Update to <bank amount>" starts ticked when confirming a planned amount: only for a small difference
 * (within 5%), so a far-off amount (a $280 debit against a $2,800 plan) doesn't quietly change the plan.
 */
export const updatesPlanByDefault = (planned, actual) => Math.abs(Math.abs(actual) - Math.abs(planned)) <= Math.abs(planned) * 0.05;
