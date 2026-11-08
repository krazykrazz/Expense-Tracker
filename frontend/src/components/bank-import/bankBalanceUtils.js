import { formatCAD } from '../../utils/formatters';

/**
 * Bank balance of a payment method linked to bank accounts (Plaid): the balance each account reported on the
 * last sync, summed when several accounts import into one method. Only what the bank said: nothing is
 * calculated from the tracker's own entries.
 */

/** Our last stored balance counts as old after this long (the same 12 hours as the "Not updating" status). */
const STALE_HOURS = 12;
const EXPECTED_CURRENCY = 'CAD';
/** Plaid's account type for chequing and savings accounts. */
const DEPOSIT_TYPE = 'depository';

const round2 = (n) => Math.round(n * 100) / 100;

const formatDateTime = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** "6:40 am" for today, "Nov 7, 6:40 am" otherwise. */
export function formatBankTime(iso, now = Date.now()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toDateString() === new Date(now).toDateString()
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : formatDateTime(iso);
}

/**
 * Why a balance may be out of date, worst first: the bank needs a login, the last sync failed, Plaid has no new
 * data from the bank (the connection's own status), or our last stored balance is simply old.
 * @returns {'login'|'error'|'plaid'|'old'|null}
 */
function staleReason(accounts, asOf, now) {
  const statuses = accounts.map(account => account.bankStatus || 'ok');
  if (statuses.some(status => status === 'needs_login' || status === 'gone')) return 'login';
  if (statuses.some(status => status === 'error')) return 'error';
  if (statuses.some(status => status === 'stale')) return 'plaid';
  if (!asOf || now - new Date(asOf).getTime() > STALE_HOURS * 3600 * 1000) return 'old';
  return null;
}

/**
 * @param {Array<{accountType?: string|null, currentBalance?: number|null, availableBalance?: number|null,
 *   balanceCurrency?: string|null, balanceAsOf?: string|null, bankStatus?: string, bankUpdatedAt?: string|null}>|undefined} accounts
 *   the bank accounts mapped to one payment method
 * @param {number} [now] epoch ms, for tests
 * @returns {{total: number, available: (number|null), asOf: (string|null), stale: boolean,
 *   staleReason: ('login'|'error'|'plaid'|'old'|null), bankUpdatedAt: (string|null), currency: (string|null)}|null}
 *   null without accounts, or when a sum would mislead: an account has no balance yet, they differ in currency, or one
 *   isn't a deposit account (a card or loan balance is an amount owed, not money in the bank)
 */
export function bankBalanceOf(accounts, now = Date.now()) {
  if (!accounts || accounts.length === 0) return null;
  if (accounts.some(account => account.accountType !== DEPOSIT_TYPE || typeof account.currentBalance !== 'number')) return null;

  const currencies = [...new Set(accounts.map(account => account.balanceCurrency || EXPECTED_CURRENCY))];
  // Different currencies can't be added up
  if (currencies.length > 1) return null;

  const total = round2(accounts.reduce((sum, account) => sum + account.currentBalance, 0));
  const available = accounts.every(account => typeof account.availableBalance === 'number')
    ? round2(accounts.reduce((sum, account) => sum + account.availableBalance, 0))
    : null;
  const asOf = accounts.map(account => account.balanceAsOf).filter(Boolean).sort()[0] ?? null;
  const bankUpdatedAt = accounts.map(account => account.bankUpdatedAt).filter(Boolean).sort()[0] ?? null;
  const reason = staleReason(accounts, asOf, now);
  return { total, available, asOf, stale: reason !== null, staleReason: reason, bankUpdatedAt, currency: currencies[0] };
}

const hasDifferentAvailable = (balance) => balance.available != null && Math.abs(balance.available - balance.total) >= 0.005;

/** The line shown in the row: "Bank $700.52 · as of 6:40 am", with the available amount when it differs. */
export function bankBalanceText(balance, now = Date.now()) {
  const when = balance.asOf ? formatBankTime(balance.asOf, now) : null;
  const parts = [`Bank ${formatCAD(balance.total)}`];
  if (hasDifferentAvailable(balance)) parts.push(`${formatCAD(balance.available)} available`);
  if (when) parts.push(`as of ${when}`);
  return parts.join(' · ') + (balance.stale ? ' (may be out of date)' : '');
}

const STALE_EXPLANATIONS = {
  login: 'The bank needs you to log in again (Bank Import → Connections), so this balance may be out of date.',
  error: 'The last sync with the bank failed, so this balance may be out of date.',
  plaid: "Plaid hasn't had new data from the bank for over 12 hours, so this balance may be out of date.",
  old: 'This balance is over 12 hours old: the bank may not be updating.'
};

/** Hover text: the balance, the available amount when it differs, when it was received and why it may be old. */
export function bankBalanceTitle(balance) {
  const lines = [`Bank balance: ${formatCAD(balance.total)}${balance.currency && balance.currency !== EXPECTED_CURRENCY ? ` ${balance.currency}` : ''}`];
  if (hasDifferentAvailable(balance)) lines.push(`Available: ${formatCAD(balance.available)}`);
  const when = balance.asOf ? formatDateTime(balance.asOf) : null;
  if (when) lines.push(`Received ${when}`);
  if (balance.staleReason === 'plaid' && balance.bankUpdatedAt) {
    const since = formatDateTime(balance.bankUpdatedAt);
    if (since) lines.push(`Plaid last had data from the bank ${since}`);
  }
  if (balance.staleReason) lines.push(STALE_EXPLANATIONS[balance.staleReason]);
  return lines.join('\n');
}
