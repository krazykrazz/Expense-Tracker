import { formatCurrency, formatDate } from '../../../utils/formatters';

/** Amounts in another currency are shown with a badge; they are not converted. */
export const EXPECTED_CURRENCY = 'CAD';

export const formatSigned = (amount) => (amount < 0 ? `-${formatCurrency(Math.abs(amount))}` : formatCurrency(amount));

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dueLabel = (fixed) => (fixed.expectedDate ? `due ${formatDate(fixed.expectedDate)}` : `${MONTHS[fixed.month - 1]} ${fixed.year}, no due day`);

/** A fixed expense "closely" matches when the amounts are within 10% (or exactly equal). */
export const isCloseFixed = (txn, fixed) => !fixed.amountDiffers || Math.abs(fixed.amount - txn.amount) <= Math.abs(fixed.amount) * 0.1;

/** Expected income is a likely match when its name fits the deposit or the amount is exact. */
export const isCloseIncome = (income) => income.nameMatch || !income.amountDiffers;
