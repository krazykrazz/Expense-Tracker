import { formatCAD as formatCurrency } from '../../utils/formatters';

/**
 * Text for the credit card balance check (bank vs tracker), shared by the card table mark and the
 * detail view panel. `card` is one entry of GET /api/plaid/card-balances.
 */

const formatTime = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** "Tracker is $50.00 higher than the bank" (difference = bank − tracker). */
export function describeDifference(difference) {
  if (difference == null || Math.abs(difference) < 0.005) return 'Matches the bank';
  return difference < 0
    ? `Tracker is ${formatCurrency(-difference)} higher than the bank`
    : `Tracker is ${formatCurrency(difference)} lower than the bank`;
}

export function bankBalanceLabel(card) {
  if (!card.bank) return 'Bank balance not received yet';
  const when = formatTime(card.bank.asOf);
  return `Bank: ${formatCurrency(card.bank.owed)}${card.bank.includesPending ? ' incl. pending' : ''}${when ? ` (as of ${when})` : ''}`;
}

/** One line per likely cause of a difference. */
export function describeCause(cause) {
  const what = `${cause.name || 'Unnamed'} ${formatCurrency(Math.abs(cause.amount))} (${cause.date})`;
  switch (cause.type) {
    case 'bank_only':
      if (cause.amount < 0) {
        return cause.inboxStatus === 'ignored'
          ? `Credit at the bank, ignored in the Inbox: ${what}. A refund or payment not recorded in the tracker?`
          : `Credit at the bank, not recorded yet: ${what}. Review it in the Inbox`;
      }
      return cause.inboxStatus === 'ignored'
        ? `Charge at the bank, ignored in the Inbox: ${what}`
        : `Charge at the bank, not in the tracker yet: ${what}${cause.pending ? ' (pending)' : ''}. Review it in the Inbox`;
    case 'tracker_only':
      return cause.kind === 'payment'
        ? `Payment in the tracker, not at the bank: ${formatCurrency(cause.amount)} (${cause.date})`
        : `In the tracker, not at the bank: ${what}. A typo, the wrong card, a duplicate, or not posted yet?`;
    case 'settling':
      return `Still pending at the bank, which leaves pending charges out of its balance: ${what}`;
    case 'cancelled':
      return `Pending charge the bank cancelled, still an expense in the tracker: ${what}. Review it in the Inbox`;
    case 'fixed_expense':
      return `Confirmed as a fixed expense, which the card balance doesn't include: ${what}`;
    case 'credit_balance':
      return `The card is ${formatCurrency(Math.abs(cause.amount))} in credit at the bank; the tracker's balance stops at $0.00`;
    default:
      return what;
  }
}

/**
 * Props that colour a card's Current balance by its bank check, like the expense list's payment pill:
 * green when it matches the bank, red-orange when it differs; details in the hover text and, for screen
 * readers, in `srText`. Nothing for cards not linked to a bank or before the bank has sent a balance.
 * @param {object|undefined} check one card from GET /api/plaid/card-balances
 */
export function cardBalanceProps(check) {
  if (!check || check.status === 'unknown') return { className: '', attrs: {}, srText: null };
  const state = check.status === 'match' ? 'confirmed' : 'differs';
  return {
    className: ` bank-pill-${state}${check.bankError ? ' bank-pill-stale' : ''}`,
    attrs: { title: balanceCheckTitle(check), 'data-testid': 'card-balance-check', 'data-bank-state': state },
    srText: ` (${describeDifference(check.difference).toLowerCase()}${check.bankError ? '; bank not syncing' : ''})`
  };
}

/** Hover text for the card table: the numbers, then the causes. */
export function balanceCheckTitle(card) {
  const lines = [describeDifference(card.difference), bankBalanceLabel(card), `Tracker: ${formatCurrency(card.tracker)} as of today`];
  if (card.bankError) lines.push(card.bankError);
  if (card.status === 'differs') {
    for (const cause of card.causes || []) lines.push(`• ${describeCause(cause)}`);
    if (Math.abs(card.unexplained || 0) >= 0.005) lines.push(`• ${formatCurrency(Math.abs(card.unexplained))} not explained by the bank's recent history`);
  }
  if (card.futureDated?.count > 0) {
    lines.push(`Not counted: ${formatCurrency(card.futureDated.amount)} dated after today (${card.futureDated.count})`);
  }
  if (card.awaitingMatch > 0) {
    lines.push(`${card.awaitingMatch} Inbox ${card.awaitingMatch === 1 ? 'transaction matches an entry' : 'transactions match entries'} already in the tracker: Match in Bank Import`);
  }
  return lines.join('\n');
}
