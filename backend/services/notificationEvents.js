/**
 * The notifications a user can switch on or off (Settings → Notifications). See specs/discord-notifications/spec.md.
 * `defaultOn` applies until the user saves their own selection.
 */
const EVENTS = [
  { key: 'plaid_needs_attention', label: 'Bank needs login, was removed, or has a sync error', defaultOn: true },
  { key: 'plaid_stale', label: 'Bank not updating (Plaid has had no new data for over 12 hours)', defaultOn: true },
  { key: 'plaid_recovered', label: 'Bank recovered', defaultOn: true },
  { key: 'plaid_sync_changes', label: 'A bank sync brought new, changed or removed transactions, or balance changes', defaultOn: false },
  { key: 'backup_failed', label: 'Backup failed (and recovered)', defaultOn: true },
  { key: 'backup_succeeded', label: 'Backup completed', defaultOn: false },
  { key: 'backup_restored', label: 'Backup restored', defaultOn: true }
];

/** Messages that follow another event's switch: the recovery of a failed backup is shown with "Backup failed". */
const TOGGLE_OF = { backup_recovered: 'backup_failed' };

const EVENT_KEYS = EVENTS.map(event => event.key);
const DEFAULT_EVENT_KEYS = EVENTS.filter(event => event.defaultOn).map(event => event.key);
const toggleFor = (eventKey) => TOGGLE_OF[eventKey] || eventKey;

module.exports = { EVENTS, EVENT_KEYS, DEFAULT_EVENT_KEYS, toggleFor };
