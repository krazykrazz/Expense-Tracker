/**
 * The notifications a user can switch on or off (Settings → Notifications). See specs/archive/discord-notifications/spec.md.
 * `defaultOn` applies until the user saves their own selection.
 */
const EVENTS = [
  { key: 'plaid_needs_attention', label: 'Bank needs login or was removed, or a sync error lasted over an hour', defaultOn: true },
  { key: 'plaid_stale', label: 'Bank not updating (Plaid has had no new data for over 24 hours)', defaultOn: true },
  { key: 'plaid_recovered', label: 'Bank recovered', defaultOn: true },
  { key: 'plaid_sync_changes', label: 'A bank sync brought new, changed or removed transactions, or balance changes', defaultOn: false },
  { key: 'loan_payment_unconfirmed', label: 'A loan payment from a bank account is still not recorded 5 days after its due date (and when it is)', defaultOn: true },
  { key: 'backup_failed', label: 'Backup failed (and recovered)', defaultOn: true },
  { key: 'backup_succeeded', label: 'Backup completed', defaultOn: false },
  { key: 'backup_restored', label: 'Backup restored', defaultOn: true }
];

/** Messages that follow another event's switch: the recovery of a failed backup is shown with "Backup failed". */
const TOGGLE_OF = { backup_recovered: 'backup_failed', loan_payment_recorded: 'loan_payment_unconfirmed' };

const EVENT_KEYS = EVENTS.map(event => event.key);
/**
 * The events that existed before the list of known events was saved with a selection. A default-on event added
 * since then starts switched on for a selection saved earlier; one the user has seen and switched off stays off.
 */
const LEGACY_EVENT_KEYS = ['plaid_needs_attention', 'plaid_stale', 'plaid_recovered', 'plaid_sync_changes', 'backup_failed', 'backup_succeeded', 'backup_restored'];
const DEFAULT_EVENT_KEYS = EVENTS.filter(event => event.defaultOn).map(event => event.key);
const toggleFor = (eventKey) => TOGGLE_OF[eventKey] || eventKey;
/** Settings key holding the last notified state of each bank and of the backup (notificationService). */
const STATE_KEY = 'notifications_state';

module.exports = { EVENTS, EVENT_KEYS, DEFAULT_EVENT_KEYS, LEGACY_EVENT_KEYS, toggleFor, STATE_KEY };
