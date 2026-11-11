/** Payment method types a bank account can import into. */
export const MAPPABLE_TYPES = ['debit', 'credit_card'];

export const STATUS_LABELS = {
  needs_login: 'Needs login',
  gone: 'Connection removed',
  error: 'Sync problem',
  stale: 'Not updating'
};

export const STATUS_HELP = {
  needs_login: 'The bank needs you to log in again. Reconnect keeps this connection: no new Trial slot, nothing re-imported. Automatic sync is paused until then.',
  gone: 'The bank or Plaid no longer recognises this connection. Disconnect it, then connect the bank again.',
  error: 'Usually temporary at the bank; automatic sync keeps retrying.',
  stale: 'The app syncs fine, but Plaid hasn\'t received new data from this bank for over 12 hours. Some banks (CIBC) only send new data when you log in: use Log in again (same connection, no new Trial slot), or import a file. Don\'t disconnect.'
};

/** Plaid's view of the bank, shown only when it isn't healthy (its status data isn't always reliable). */
export const INSTITUTION_STATUS_TEXT = { DOWN: 'down', DEGRADED: 'degraded' };

/** "3 new, 1 updated, 0 removed" plus failed banks and a note while Plaid is still preparing history. */
export const describeSync = ({ totals, results }) => {
  const parts = [`${totals.added} new, ${totals.updated} updated, ${totals.removed} removed`];
  const failed = results.filter(r => r.error);
  if (failed.length > 0) {
    parts.push(failed.map(r => `${r.institutionName}: ${r.error}`).join('; '));
  }
  if (results.some(r => r.updateStatus === 'NOT_READY')) {
    parts.push('Plaid is still preparing history for a new connection. Try again in a minute.');
  }
  return parts.join(' · ');
};
