import { formatDate } from '../../utils/formatters';
import { laterStatement, mayPostOnLaterStatement } from '../../utils/statementCycle';
import './PostedTurnoverMarker.css';

const shortDate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
};

/**
 * Hover text for the posted date of a credit card expense, or null without one. `fromBank`: the expense is
 * linked to a settled bank transaction, so the date is the bank's.
 */
export const postedDateTitle = (expense, fromBank = false) =>
  (expense.posted_date ? `Posted ${formatDate(expense.posted_date)}${fromBank ? ' (from the bank)' : ''}` : null);

/**
 * Small marker next to a credit card expense's payment pill, shown only when it posted on a later statement
 * than it was made in ("→ Nov 2"), because that decides which bill it is on. Nothing for the ordinary case:
 * the posted date is in the pill's hover text.
 * @param {{expense: object, billingCycleDay: (number|null)}} props
 */
const PostedTurnoverMarker = ({ expense, billingCycleDay }) => {
  const later = laterStatement(expense, billingCycleDay);
  if (!later) return null;

  const text = `Made ${formatDate(expense.date)}, posted ${formatDate(expense.posted_date)}: on the statement closing ${formatDate(later.postedStatement)}, not ${formatDate(later.madeStatement)}`;
  return (
    <span className="posted-turnover" title={text} role="note" aria-label={text} data-testid="posted-turnover">
      <span aria-hidden="true">→ {shortDate(expense.posted_date)}</span>
    </span>
  );
};

/**
 * Marker for a pending credit card charge made just before the statement closes: it may post after the close
 * and land on the next bill. Disappears once the bank posts it (then PostedTurnoverMarker takes over if it did).
 * @param {{date: string, pending: boolean, billingCycleDay: (number|null)}} props
 */
export const PendingTurnoverMarker = ({ date, pending, billingCycleDay }) => {
  const risk = mayPostOnLaterStatement(date, pending, billingCycleDay);
  if (!risk) return null;

  const text = `Still pending, made ${formatDate(date)}: if it posts after ${formatDate(risk.statement)} it will be on the next statement`;
  return (
    <span className="posted-turnover pending-turnover" title={text} role="note" aria-label={text} data-testid="pending-turnover">
      <span aria-hidden="true">→ next?</span>
    </span>
  );
};

export default PostedTurnoverMarker;
