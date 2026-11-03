import { formatCurrency, formatDate } from '../../utils/formatters';

const toCents = (amount) => Math.round(Number(amount) * 100);

/**
 * @returns {'confirmed'|'differs'|'pending'|'cancelled'|null} how an expense compares to its linked bank
 * transaction: still pending at the bank, a pending charge the bank dropped (review in Bank Import), or
 * settled and equal / different. Reimbursed expenses are charged their original cost, so that is what the
 * bank saw.
 */
export const bankLinkState = (expense) => {
  const link = expense && expense.bankLink;
  if (!link) return null;
  if (link.pending && link.removed) return 'cancelled';
  if (link.pending) return 'pending';
  const charged = expense.original_cost ?? expense.amount;
  return toCents(charged) === toCents(link.amount) ? 'confirmed' : 'differs';
};

/** Hover text for an expense added from, or matched to, a bank transaction (null without a link). */
export const bankLinkTitle = (expense) => {
  const state = bankLinkState(expense);
  if (!state) return null;
  const { bankLink } = expense;
  const name = bankLink.name || bankLink.rawName || 'Unknown';
  const origin = bankLink.status === 'added' ? 'Added from bank' : 'Matched to bank transaction';
  const amountLine = `${formatDate(bankLink.date)} · ${formatCurrency(bankLink.amount)}`;
  if (state === 'cancelled') {
    return [`Pending charge dropped by the bank: ${name}`, amountLine, 'Review it in Bank Import → Inbox'].join('\n');
  }
  if (state === 'pending') {
    const settleLine = bankLink.disconnected
      ? `${origin}; the bank was disconnected. Connect it again to update when it settles`
      : `${origin}; updates when it settles`;
    return [`Pending at bank: ${name}`, amountLine, settleLine].join('\n');
  }
  const lines = [`Confirmed by bank: ${name}`, amountLine, origin];
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

const SR_TEXT = {
  confirmed: ' (confirmed by bank)',
  differs: ' (amount differs from bank)',
  pending: ' (pending at bank)',
  cancelled: ' (pending charge dropped by bank)'
};

/**
 * Props that colour a payment method pill by its bank state and put the bank details in its hover text:
 * green confirmed, yellow pending, red-orange when it needs attention (amount differs, dropped pending charge).
 * `className` is appended to the pill's own classes; `srText` goes in an `sr-only` span so screen readers
 * hear the state too.
 * @param {'confirmed'|'differs'|'pending'|'cancelled'|null} state
 * @param {string|null} title
 */
export const bankPillProps = (state, title) => {
  if (!state) return { className: '', attrs: {}, srText: null };
  return {
    className: ` bank-pill-${state}`,
    attrs: { title, 'data-testid': 'bank-method-pill', 'data-bank-state': state },
    srText: SR_TEXT[state]
  };
};
