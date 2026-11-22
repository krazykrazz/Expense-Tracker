# Discord Notifications

**Status:** Draft, awaiting review.

## Problem

Critical events only show up in the app (Connections tab) or in container logs: a bank that needs a login, a bank
Plaid stopped updating, a failed backup. Nothing reaches the user unless the app is open.

## Requirements

1. **Destination:** Discord via [Notifiarr Passthrough](https://notifiarr.wiki/pages/integrations/passthrough/)
   (`POST https://notifiarr.com/api/v1/notification/passthrough/<API_KEY>`). Notifiarr is the only provider in v1; the
   sending code sits behind a small provider interface so a direct Discord webhook can be added later.
2. **Configuration:** Settings UI: Notifiarr API key, Discord channel ID, optional ping user ID. The API key is a
   secret: stored encrypted (`utils/tokenCrypto`, like the Plaid secret), never returned by the API (masked hint
   only), never logged. The host is fixed (`notifiarr.com`), so there is no user-supplied URL.
3. **Privacy:** messages pass through a third party. They carry institution names, account names, event types and
   error *codes* only. Balance changes are allowed (old -> new amounts), but never card or account numbers, masks /
   last-4 digits, or tokens. Any run of 4 or more digits in an account name is redacted before sending.
3. **Events** (each can be switched on/off in Settings):

   | Key | When | Default |
   |---|---|---|
   | `plaid_needs_attention` | A bank enters `needs_login`, `gone` or `error` | on |
   | `plaid_stale` | A bank goes `stale` (Plaid has had no new data for over 12 h) | on |
   | `plaid_recovered` | A bank returns to `ok` after any of the above | on |
   | `plaid_sync_changes` | A sync brought new/updated/removed transactions or balance changes | off |
   | `backup_failed` | A manual or scheduled backup fails | on |
   | `backup_succeeded` | A backup completes | off |
   | `backup_restored` | A backup is restored | on |

4. **Repeat handling:** failure-type events fire on state change only (failure, then one recovery message). A bank
   that stays broken does not notify again, however often it is retried. Per-occurrence events
   (`plaid_sync_changes`, `backup_succeeded`, `backup_restored`) fire every time they happen.
5. **Never affects the caller:** a notification is fire-and-forget. A Notifiarr outage, bad key or timeout never fails
   a sync or backup and is only logged (`logger.warn`, without the API key).
6. **Test button:** Settings has "Send test message" that posts using the saved (or just-entered) key and channel and
   reports success or the failure reason.
7. **Update in place:** when a failure message was sent for a bank (or the backup), the matching recovery edits that
   message (`notification.update: true`, same `event` id) instead of posting a second one. If the update fails
   (message deleted, Notifiarr error), it falls back to a new message.

## Design

### Backend

- `backend/services/notificationService.js` (new)
  - `notify(eventKey, payload, { stateKey, state })`: loads settings, returns if notifications or that event are
    off, applies the state-change rule, builds a provider-neutral message (`title`, `description`, `fields`,
    `footer`, `colour`), hands it to the provider. Never throws.
  - Colour per event: red failure / amber stale / green recovered / blue info.
- `backend/services/notifiarrProvider.js` (new): maps the message to the Passthrough payload
  (`notification.name = 'Expense Tracker'`, `notification.event = <stateKey>`, `discord.color`,
  `discord.text.{title,description,fields,footer}`, `discord.ids.channel`, optional `discord.ping.pingUser`) and POSTs it.
  - Success requires HTTP 2xx **and** `details.response === 'Pass through payload processed.'`; anything else is a
    failure reported by the test button and logged as a warning.
  - `channel` and `pingUser` are Discord snowflakes that exceed `Number.MAX_SAFE_INTEGER`, so they are kept as digit
    strings and sent as JSON strings (never parsed to a JS number). PoC: Notifiarr accepts the channel as a string.
- `backend/services/notificationSettingsService.js` (new), modelled on `plaidSettingsService.js`:
  `getSettings()` (masked), `saveSettings()`, `sendTest()`. Stored via `settingsRepository` keys:
  `notifications_enabled`, `notifications_notifiarr_key_enc`, `notifications_channel_id`,
  `notifications_ping_user_id`, `notifications_events` (JSON of enabled keys).
  Saving emits a `settings_updated` activity-log event (`section: 'notifications'`) with the key redacted.
- **De-dupe state:** one `notifications_state` settings key (JSON map `stateKey -> { state, since }`, e.g.
  `plaid:3 -> { state: 'stale', since }`). While a bank stays in a problem state (even a different one) its single
  message is edited in place; a new problem after a recovery posts a new message. Only delivered messages are
  remembered, so a failed delivery is retried on the next sync. No schema change, so no migration. `notify` skips when the state is unchanged; a recovery
  message is sent only when the previous state was a problem. State survives restarts (needed: the container restarts
  on every deploy and would otherwise re-announce every broken bank).
- **HTTP:** Node `fetch` with a 5 s `AbortController` timeout. No retries in v1 (state is only recorded after a
  successful post, so the next sync retries naturally).

### Message layout

Modelled on the Sonarr notification the user shared; validated by `backend/scripts/notifiarr-poc.js`.

- **Title:** status emoji + short title (`🔴 Bank needs login`, `🟡 Bank not updating`, `🟢 Bank recovered`,
  `🔵 Backup completed`, `🔴 Backup failed`), with the app icon (`discord.text.icon`) beside it.
- **Fields:** inline fields in rows of three (bank, status, error code, ages, sizes, counts), then one full-width
  field for the action to take or the error text. Colour bar matches the status (red / amber / green / blue).
- **Footer:** `Expense Tracker v<version>`; Notifiarr/Discord adds the time.
- **Icon:** `frontend/public/notification-icon.png` (256 px PNG rendered from `favicon.svg`; Discord does not render
  SVG). Notifiarr fetches it from a public URL, so the provider uses
  `https://raw.githubusercontent.com/krazykrazz/Expense-Tracker/main/frontend/public/notification-icon.png` (the repo
  is public; the icon only appears once the file is on `main`). The URL is a single constant in `notifiarrProvider`,
  so moving it (for example to jsDelivr) is a one-line change. A missing icon only drops the picture.
- **Content rules:** the privacy rules above apply to every field value (no masks, last-4 digits, tokens or file paths
  beyond the backup file name).

### Hook points (explicit calls, not a generic hook on `logEvent`)

Not every notifiable event is an activity-log event (stale has none), and not every log event is notifiable.

- `plaidSyncService.syncItem` catch block: already guards on `item.lastError !== code`. Call `notify` there with
  `plaid:<id>` and state `needs_login | gone | error` (via `connectionStatus`).
- `plaidSyncService.syncItem` success path, after `_refreshHealth`: compute `connectionStatus` for the item and call
  `notify` with `plaid:<id>` and state `ok` or `stale`. A transition into `ok` from a problem state sends
  `plaid_recovered`. The recovery decision uses the previous *notified* state, not `item.lastError`, because
  `last_error` is cleared during the sync. `plaid_sync_changes` is called from `_logSync`, which already builds the
  human-readable summary.
- `plaid_sync_changes`: balance changes use institution and account name only (no mask / last-4), per the privacy rule.
- `backupService.performBackup` and the scheduled-backup catch: `backup_failed` with `stateKey: 'backup'`, state
  `failed`; a later success (`backup_succeeded` or not) clears that state. `backup_restored` after the restore commits.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/settings/notifications` | Masked settings (`keyHint`, `channelId`, `pingUserId`, `enabled`, `events`) |
| PUT | `/api/settings/notifications` | Save key (blank keeps the saved one), channel, ping user, enabled flag, event toggles |
| POST | `/api/settings/notifications/test` | Send a test message |

Route -> `notificationController` -> `notificationSettingsService`. Add `API_ENDPOINTS` entries and rows in the
Endpoint Reference of `docs/API_DOCUMENTATION.md`.

### Frontend

A `NotificationSettings.jsx` section next to `PlaidSettings.jsx` in Settings: API key field (masked hint when saved),
channel ID, optional ping user ID, master switch, one checkbox per event, Save, Send test message. Uses `apiClient` /
`API_ENDPOINTS` and `createLogger`; no bare `fetch`.

## Tasks

0. [x] **PoC** (`backend/scripts/notifiarr-poc.js`, key / channel from environment variables): post a test message,
   post a failure then update it to recovered with the same `event` id, check the success response, and confirm
   channel-ID number precision. Run once locally and once via `docker exec` in the production container.
1. [x] `notificationSettingsService` + validation + encrypted storage + tests
2. [x] `notificationService` + `notifiarrProvider` (payload mapping, success check, de-dupe state, update-in-place with
   fallback, never throws, 4+ digit redaction) + tests, including restart persistence and "stays broken, no repeat"
3. [x] Routes, controller, `API_ENDPOINTS`, API docs
4. [ ] Hook Plaid sync (needs attention / stale / recovered / changes)
5. [ ] Hook backup (failed / succeeded / restored)
6. [ ] Settings UI + tests
7. [ ] Docs: `docs/features/` page, `docs/DATABASE_SCHEMA.md` (settings keys), `docs/guides/USER_GUIDE.md`, README
8. [ ] Full validation with `.\scripts\run-test-summary.ps1`; `npm run lint`

## Open questions

- `plaid_sync_changes` can fire every 30 minutes per bank when activity is busy. It defaults to off; if enabled,
  should it be batched (for example, at most one message per bank per hour)?
- Does Notifiarr need the Passthrough integration enabled / a channel configured in its dashboard before the API
  accepts the call? The PoC succeeded; to confirm whether any dashboard setup was already in place.
- PoC result (2026-11-22): from the dev machine and from inside the production container, all three posts (test,
  failure, update-in-place) returned HTTP 200 with `Pass through payload processed.` in under 2 s. Whether the update
  replaced the earlier message in Discord is for the user to confirm visually.
