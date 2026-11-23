# Discord Notifications

**Status:** Implemented (v1), pending release. Deferred: pinging a user, in-place edits, batching (see below).

## Problem

Critical events only show up in the app (Connections tab) or in container logs: a bank that needs a login, a bank
Plaid stopped updating, a failed backup. Nothing reaches the user unless the app is open.

## Requirements

1. **Destination:** Discord via [Notifiarr Passthrough](https://notifiarr.wiki/pages/integrations/passthrough/)
   (`POST https://notifiarr.com/api/v1/notification/passthrough/<API_KEY>`). Notifiarr is the only provider in v1; the
   sending code sits behind a small provider interface so a direct Discord webhook can be added later.
2. **Configuration:** Settings UI: Notifiarr API key and Discord channel ID (the optional ping user ID is in the API but
   deferred in the UI). The API key is a
   secret: stored encrypted (`utils/tokenCrypto`, like the Plaid secret), never returned by the API (masked hint
   only), never logged. The host is fixed (`notifiarr.com`), so there is no user-supplied URL.
3. **Privacy:** messages pass through a third party. They carry institution names, account names, event types and
   error *codes* only. Balance changes are allowed (old -> new amounts), but never card or account numbers, masks /
   last-4 digits, or tokens. Any run of 4 or more digits in an account name is redacted before sending.
3. **Events** (each can be switched on/off in Settings):

   | Key | When | Default |
   |---|---|---|
   | `plaid_needs_attention` | A bank enters `needs_login` or `gone`, or an `error` lasts over an hour | on |
   | `plaid_stale` | Plaid has had no new data from a bank for over 24 h (the UI flags it at 12 h) | on |
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
7. **No in-place edits (deferred):** a recovery is a new message, not an edit of the failure message. Traffic is low;
   Notifiarr supports edits (`notification.update: true`, same `event`) if this is wanted later.

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
- **De-dupe state:** one `notifications_state` settings key (JSON map `stateKey -> { state, since, pending? }`, e.g.
  `plaid:3 -> { state: 'stale', since }`). `notify` skips when the state is unchanged; a recovery is sent only when
  the previous state was a problem. Every message is a new one (no in-place edits). Only delivered messages are
  remembered, so a failed delivery (problem or recovery) is retried on the next report. State survives restarts
  (the container restarts on every deploy and would otherwise re-announce every broken bank). No schema change, so
  no migration. Disconnecting a bank drops its state (`forgetBank`); a restore resets all states (`resetState`),
  since they describe the backup's moment.
- **Noise rules:** a sync `error` is only announced once it has lasted an hour (`pending` records when it began,
  so the hold survives restarts; an error that clears within the hour sends nothing). "Not updating" is only
  announced once Plaid's data is over 24 hours old (the UI flags it at 12 h); a bank between 12 and 24 h counts as ok.
- **Message names:** the message type is in the header line (see Message layout), so no per-message `event` id is used;
  two connections with the same bank name are told apart only by their messages' timing.
- **Hooks must not await notifications:** a send can take up to 5 s and sends run one at a time. Call them without
  `await` (they never reject). Report bank status with values read after `_refreshHealth`.
- **HTTP:** Node `fetch` with a 5 s `AbortController` timeout. No retries (state is only recorded after a
  successful post, so the next sync retries naturally).

### Message layout

Modelled on Notifiarr's own notifications (the Sonarr "New Backup Created" and "Deleted Episode" messages the user
shared); every message type decides its own layout in `notificationMessages.js`, and
`backend/scripts/notifiarr-poc.js` posts one sample of each, built with the real builders.

- **Header line** (`notification.name`, next to the app icon): `Expense Tracker: <Type>`, e.g. `Bank Needs Login`,
  `Bank Not Updating`, `Bank Recovered`, `New Bank Activity`, `Balances Changed`, `Backup Created`, `Backup Failed`,
  `Backup Recovered`, `Backup Restored`, `Test Message`. The `event` is left empty (Notifiarr shows it after the name;
  it is only needed to edit a message later).
- **Title** (bold subject): the bank's name for bank messages; none for backups.
- **Description:** one sentence of context where it helps (what to do for a login or stale bank, how long Plaid has had
  no data, that a restore replaced the database).
- **Fields:** only what fits the type: a bank problem shows error code / last good sync / auto sync; a sync shows the
  non-zero counts and one field per account whose balance moved; a backup shows type, size, backups kept and file name.
  No empty or bare-`0` field text (Notifiarr shows those as "Missing Value"); a field that has no value is left out.
- **No emoji:** the colour bar carries severity: red problem, amber warning or restore, green created or recovered,
  blue information. Footer `Expense Tracker v<version>`; Discord adds the time.
- **Icon:** `frontend/public/notification-icon.png` (256 px PNG rendered from `favicon.svg`; Discord does not render
  SVG). Notifiarr fetches it from a public URL, so the provider uses
  `https://raw.githubusercontent.com/krazykrazz/Expense-Tracker/main/frontend/public/notification-icon.png` (the repo
  is public; the icon only appears once the file is on `main`). The URL is a single constant in `notifiarrProvider`,
  so moving it (for example to jsDelivr) is a one-line change. A missing icon only drops the picture.
- **Content rules:** the privacy rules above apply to every field value (no masks, last-4 digits, tokens or file paths
  beyond the backup file name).

### Hook points (explicit calls, not a generic hook on `logEvent`)

Not every notifiable event is an activity-log event (stale has none), and not every log event is notifiable.
Implemented (all through a quiet wrapper that never awaits and swallows throws and rejections):

- `plaidSyncService.reportStatus(id)` re-reads the stored bank row (the sync has just cleared or set `last_error`
  and refreshed Plaid's health) and reports `connectionStatus` with the error code, last sync, Plaid's last fetch and
  institution status. Called after every successful sync (after `_logSync`), after a Plaid error in `syncItem`
  (after `setItemError`), and from `plaidService.requestRefresh` when "Log in again" finds the bank needs a login
  (automatic sync skips such banks, so nothing else would tell the user). A non-Plaid failure (network) reports nothing.
- `plaidSyncService._logSync`: `reportSyncChanges` when a sync brought new, updated or removed transactions or balance
  changes (re-attached rows alone are not news). Balance changes use the account name only (no mask / last-4).
- `plaidService.disconnectItem`: `forgetBank`. `backupService.restoreBackup`: `resetState`, then `reportBackupRestored`.
- `backupService.performBackup(targetPath, { trigger })`: only with a `trigger` (`manual` from the controller,
  `scheduled` from the scheduler) is a backup reported (`reportBackupSucceeded` / `reportBackupFailed`). The browser
  download passes none: it is a temporary archive.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/settings/notifications` | Masked settings (`keyHint`, `channelId`, `pingUserId`, `enabled`, `events`) |
| PUT | `/api/settings/notifications` | Save key (blank keeps the saved one), channel, ping user, enabled flag, event toggles |
| POST | `/api/settings/notifications/test` | Send a test message |
| DELETE | `/api/settings/notifications` | Remove key, channel and ping user; turn off (events kept) |

Route -> `notificationController` -> `notificationSettingsService`. Add `API_ENDPOINTS` entries and rows in the
Endpoint Reference of `docs/API_DOCUMENTATION.md`.

### Frontend

`components/system/NotificationSettings.jsx` (tab "🔔 Notifications" in `SettingsModal`): API key field (masked hint
when saved, blank keeps it), channel ID, master switch, one checkbox per event, Send test message, Save, Remove.
The ping user is not offered in the UI yet (deferred). Uses `services/notificationApi.js` (`apiClient`) and
`API_ENDPOINTS`; no bare `fetch`.

## Tasks

0. [x] **PoC** (`backend/scripts/notifiarr-poc.js`, key / channel from environment variables): post a test message,
   post a failure then update it to recovered with the same `event` id, check the success response, and confirm
   channel-ID number precision. Run once locally and once via `docker exec` in the production container.
1. [x] `notificationSettingsService` + validation + encrypted storage + tests
2. [x] `notificationService` + `notifiarrProvider` (payload mapping, success check, de-dupe state, 1 h error hold,
   24 h stale threshold, never throws, 4+ digit redaction) + tests, including restart persistence and "stays broken,
   no repeat"
3. [x] Routes, controller, `API_ENDPOINTS`, API docs
4. [x] Hook Plaid sync (needs attention / stale / recovered / changes)
5. [x] Hook backup (failed / succeeded / restored)
6. [x] Settings UI + tests
7. [x] Docs: `docs/features/` page, `docs/DATABASE_SCHEMA.md` (settings keys), `docs/guides/USER_GUIDE.md`, README
8. [ ] Full validation with `.\scripts\run-test-summary.ps1`; `npm run lint`

## Deferred

- **Pinging a user:** `pingUser` is sent as a string (a Discord ID can't be a JS number). Notifiarr's docs show an
  integer and this is untested; confirm with Send test message and a ping user set before relying on it.
- **In-place edits** (requirement 7).

## Open questions

- `plaid_sync_changes` can fire every 30 minutes per bank when activity is busy. It defaults to off; if enabled,
  should it be batched (for example, at most one message per bank per hour)?
- Does Notifiarr need the Passthrough integration enabled / a channel configured in its dashboard before the API
  accepts the call? The PoC succeeded; to confirm whether any dashboard setup was already in place.
- PoC result (2026-11-22): from the dev machine and from inside the production container, all three posts (test,
  failure, update-in-place) returned HTTP 200 with `Pass through payload processed.` in under 2 s.
