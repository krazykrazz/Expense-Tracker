import { formatCAD as formatCurrency } from '../../utils/formatters';

/**
 * Text for the per-statement bank check, one line per entry that explains a difference.
 * `cause.effect` is its share of (bank − tracker): positive when the bank has more.
 * @param {object} cause one entry of `causes` from GET /api/plaid/card-cycles/:id
 */
export function describeCycleCause(cause) {
  const what = `${cause.name || 'Unnamed'} ${formatCurrency(Math.abs(cause.effect))} (${cause.date})`;
  switch (cause.type) {
    case 'bank_only':
      if (cause.effect < 0) {
        return cause.status === 'ignored'
          ? `Credit at the bank, ignored in the Inbox: ${what}`
          : `Credit at the bank, not recorded yet: ${what}. Review it in the Inbox`;
      }
      return cause.status === 'ignored'
        ? `Charge at the bank, ignored in the Inbox: ${what}`
        : `Charge at the bank, not in the tracker yet: ${what}. Review it in the Inbox`;
    case 'tracker_only':
      return cause.kind === 'payment'
        ? `Payment in the tracker, not at the bank: ${what}`
        : `In the tracker, not at the bank: ${what}. A typo, the wrong card or a duplicate?`;
    case 'other_statement':
      return cause.effect > 0
        ? `Posted at the bank in this statement, but on another statement in the tracker${cause.trackerDate ? ` (${cause.trackerDate})` : ''}: ${what}`
        : `In this statement in the tracker, but the bank posted it${cause.bankDate ? ` on ${cause.bankDate}` : ' in another statement'}: ${what}`;
    case 'amount_differs':
      return `Amount differs: ${cause.name || 'Unnamed'} is ${formatCurrency(Math.abs(cause.bankAmount))} at the bank and ${formatCurrency(Math.abs(cause.trackerAmount))} in the tracker (${cause.date})`;
    case 'fixed_expense':
      return `Confirmed as a fixed expense, which the card balance doesn't include: ${what}`;
    case 'cancelled':
      return `Pending charge the bank cancelled, still an expense in the tracker: ${what}. Review it in the Inbox`;
    case 'pending':
      return `Still pending at the bank, but in this statement in the tracker: ${what}`;
    default:
      return what;
  }
}

/** "Bank $812.40 · Tracker $790.00 · differs by $22.40" */
export function describeCycleTotals(cycle) {
  const tail = cycle.status === 'match' ? 'matches' : `differs by ${formatCurrency(Math.abs(cycle.difference))}`;
  return `Bank ${formatCurrency(cycle.bank.total)} · Tracker ${formatCurrency(cycle.tracker.total)} · ${tail}`;
}
