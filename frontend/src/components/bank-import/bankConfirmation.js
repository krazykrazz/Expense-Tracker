import { formatCurrency, formatDate } from '../../utils/formatters';

const toCents = (amount) => Math.round(Number(amount) * 100);

/**
 * @returns {'confirmed'|'differs'|null} how an expense compares to its linked bank transaction.
 * Reimbursed expenses are charged their original cost, so that is what the bank saw.
 */
export const bankLinkState = (expense) => {
  const link = expense && expense.bankLink;
  if (!link) return null;
  const charged = expense.original_cost ?? expense.amount;
  return toCents(charged) === toCents(link.amount) ? 'confirmed' : 'differs';
};

/** Hover text for an expense added from, or matched to, a bank transaction (null without a link). */
export const bankLinkTitle = (expense) => {
  const state = bankLinkState(expense);
  if (!state) return null;
  const { bankLink } = expense;
  const lines = [
    `Confirmed by bank: ${bankLink.name || bankLink.rawName || 'Unknown'}`,
    `${formatDate(bankLink.date)} · ${formatCurrency(bankLink.amount)}`,
    bankLink.status === 'added' ? 'Added from bank' : 'Matched to bank transaction'
  ];
  if (state === 'differs') lines.unshift(`Amount differs from bank: ${formatCurrency(bankLink.amount)}`);
  return lines.join('\n');
};

/** @returns {'confirmed'|'differs'|null} how a fixed expense compares to the bank payment that confirmed it. */
export const fixedConfirmationState = (fixedExpense) => {
  const confirmation = fixedExpense && fixedExpense.bankConfirmation;
  if (!confirmation) return null;
  return toCents(fixedExpense.amount) === toCents(confirmation.amount) ? 'confirmed' : 'differs';
};

const landedText = ({ landedDate, daysFromDue }) => {
  const when = `landed ${formatDate(landedDate)}`;
  if (daysFromDue == null) return when;
  if (daysFromDue === 0) return `${when} (on the due date)`;
  const days = Math.abs(daysFromDue);
  return `${when} (${days} day${days === 1 ? '' : 's'} ${daysFromDue > 0 ? 'after' : 'before'} the due date)`;
};

/** Hover text for a fixed expense confirmed by a bank payment (null when unconfirmed). */
export const fixedConfirmationTitle = (fixedExpense) => {
  const state = fixedConfirmationState(fixedExpense);
  if (!state) return null;
  const confirmation = fixedExpense.bankConfirmation;
  const lines = [
    `Confirmed by bank: ${confirmation.name || 'bank transaction'}`,
    `${landedText(confirmation)} · ${formatCurrency(confirmation.amount)}`
  ];
  if (confirmation.plannedAmount != null && toCents(confirmation.plannedAmount) !== toCents(confirmation.amount)) {
    lines.push(`Planned ${formatCurrency(confirmation.plannedAmount)}, updated to the bank amount`);
  }
  if (state === 'differs') lines.unshift(`Amount differs from bank: ${formatCurrency(confirmation.amount)}`);
  return lines.join('\n');
};

/**
 * Props that colour a payment method pill by its bank state (green confirmed, amber amount differs) and put
 * the bank details in its hover text. `className` is appended to the pill's own classes; `srText` goes in an
 * `sr-only` span so screen readers hear the state too.
 * @param {'confirmed'|'differs'|null} state
 * @param {string|null} title
 */
export const bankPillProps = (state, title) => {
  if (!state) return { className: '', attrs: {}, srText: null };
  return {
    className: ` bank-pill-${state}`,
    attrs: { title, 'data-testid': 'bank-method-pill', 'data-bank-state': state },
    srText: state === 'confirmed' ? ' (confirmed by bank)' : ' (amount differs from bank)'
  };
};
