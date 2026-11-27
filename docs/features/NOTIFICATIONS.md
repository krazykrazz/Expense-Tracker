# Discord Notifications

Optional: get a Discord message when something needs your attention (a bank that needs a login, a bank Plaid has stopped hearing from, a failed backup) without having the app open. Messages are sent through [Notifiarr's Passthrough integration](https://notifiarr.wiki/pages/integrations/passthrough/), which posts them to a Discord channel. Off until configured under **⚙️ Settings → Notifications**.

Design and decisions: `specs/archive/discord-notifications/spec.md`.

## Setup

1. Have a Notifiarr account with its bot in your Discord server, and note your **API key** (notifiarr.com → Profile).
2. In Discord, turn on Developer Mode (User Settings → Advanced), right-click the channel to post to and choose **Copy Channel ID**.
3. **⚙️ Settings → Notifications:** enter the API key and the channel ID, press **Send test message** (nothing is saved by the test; a message should appear in the channel), turn on **Send notifications** and **Save**.

The API key is stored encrypted with the same key as your bank logins and only ever shown as a masked hint (`••••a9f1`). Leave the field blank to keep the saved one. **Remove** deletes the key and channel and turns notifications off (your choice of events is kept).

A backup restored on another machine cannot decrypt the saved key (the encryption key is not part of backups): Settings then says so, and you enter the key again.

## What You Can Be Told About

Each can be switched on or off in Settings.

| Event | Message (header line) | Shown | Default |
|---|---|---|---|
| Bank needs login, was removed, or has a sync error | `Bank Needs Login` / `Bank Connection Removed` / `Bank Sync Problem` | the bank, what to do, error code, last good sync, whether auto sync is paused | on |
| Bank not updating | `Bank Not Updating` | the bank, how long Plaid has had no data and what to do, when Plaid last got data, Plaid's status for the bank | on |
| Bank recovered | `Bank Recovered` | the bank, what the problem was, how long it lasted | on |
| A bank sync brought new activity | `New Bank Activity` or `Balances Changed` | the bank, the non-zero counts of new / updated / removed transactions, and one line per account whose balance moved (old → new amount) | off |
| Loan payment not recorded (and recorded) | `Loan Payment Not Recorded`, then `Loan Payment Recorded` | the loan, the month, what to do, amount, due date, the account it is paid from; then the month now recorded and, if different, the month still missing | on |
| Backup failed (and recovered) | `Backup Failed`, then `Backup Recovered` | type (manual / scheduled), last good backup, the error; or type, size, how long it was failing, file name | on |
| Backup completed | `Backup Created` | type, size, how many backups are kept, file name | off |
| Backup restored | `Backup Restored` | the file name restored | on |

Each message type has its own layout, in the style of Notifiarr's own notifications: a header line next to the app icon (`Expense Tracker: Backup Created`), the subject in bold under it (the bank), a sentence of context where useful, and only the details that make sense for that type. The colour bar shows the severity (red problem, amber warning or restore, green created or recovered, blue information) and the app version is the footer; Discord adds the time.

## When Messages Are Sent

Problems are announced when something **changes**, not every time it is seen:

- A bank that stays broken is announced **once**, however often it is synced. When it recovers you get one **Bank recovered** message, with how long it was down. Moving from one problem to another (for example *Not updating* to *Needs login*) sends a new message.
- A **sync error** is usually temporary at the bank, so it is only announced once it has lasted **an hour**. One that clears sooner sends nothing. Login problems and removed connections are announced straight away.
- **Not updating** is announced once Plaid's data from the bank is over **24 hours** old. (The bank icon and Connections tab flag it earlier, at 12 hours; some banks are only fetched about once a day, so notifications wait longer.)
- Banks are checked after each sync (automatic sync runs every 30 minutes during its active hours), and when **Log in again** finds a bank needs a login. Automatic sync skips banks that need a login, so that message is the one you will get for them.
- **Loan payments** (with Bank Import only): for a fixed expense linked to a loan and paid from a payment method that imports from the bank, the in-app prompt to log the payment waits 5 days after the due date for the bank payment to be confirmed in the Inbox. An hourly check (8 am to 10 pm, business timezone) looks at each such loan's latest payment whose wait is over: if it isn't recorded you get **Loan payment not recorded** once for that month, and **Loan payment recorded** once it (or a later month's) is. Loans paid another way, and everything without Plaid, are never checked.
- Backups are reported for the scheduled and manual backups, not for the temporary archive made by the browser download. A failure is announced once until a backup succeeds again.
- What the app last told you is remembered, so a restart or a new version does not repeat it. A message that could not be delivered is tried again at the next sync or backup. Disconnecting a bank forgets it, and restoring a backup resets everything (the saved states describe the backup's moment, not now): a bank that is broken right after a restore is announced again.

Every message is a new Discord message (editing the earlier one in place is possible with Notifiarr but not used).

## Privacy

Messages pass through Notifiarr and Discord, so they only carry what is needed:

- Bank and account **names**, error **codes**, ages and times, counts, backup file names and sizes, and balance changes (old → new amounts).
- **Never** card or account numbers, masks or last-4 digits, tokens, your API keys, or file paths. Any run of four or more digits in a name is hidden (`Dividend Visa 123456` becomes `Dividend Visa ••••`), and file paths in error text become `<path>`.

## Never in the Way

A notification can never fail or slow down a sync or a backup. It is sent in the background with a 5 second timeout; if Notifiarr is slow, down, or the key is wrong, the problem is only logged (never the key) and the next sync or backup tries again.

## Technical Notes

- Settings keys (in `settings`): `notifications_enabled`, `notifications_notifiarr_key_enc`, `notifications_channel_id`, `notifications_ping_user_id`, `notifications_events` (JSON list of enabled event keys; the defaults above apply until saved), `notifications_events_known` (the event keys that existed when it was saved: a default-on event added later starts switched on for an older selection; a selection saved before this key existed knew the first seven events) and `notifications_state` (last notified state per bank, per loan (`loan:<id>`, state `unconfirmed:YYYY-MM` or `ok`) and for the backup). No new tables.
- API: `GET` / `PUT` / `DELETE /api/settings/notifications` and `POST /api/settings/notifications/test` (see [API Documentation](../API_DOCUMENTATION.md#notifications--notificationroutesjs)). Saving and removing are logged as `settings_updated` (`section: 'notifications'`).
- Code: `notificationService` (rules and state), `notificationMessages` (text and privacy), `notifiarrProvider` (the Passthrough request), `notificationSettingsService`. They are called from `plaidSyncService` (status and changes after each sync), `plaidService` (a bank found to need a login, a disconnect), `backupService` and `loanPaymentBankCheckService` (hourly cron in `server.js`).
- Delivery counts only when Notifiarr answers `Pass through payload processed.`, not on the HTTP status alone. Discord IDs are kept as strings (they exceed JavaScript's safe integer range).
- The title icon is `frontend/public/notification-icon.png`, served from `raw.githubusercontent.com` (`ICON_URL` in `notifiarrProvider.js`). If it can't be loaded the message is still delivered without it.

## Not Included Yet

- **Pinging a user** on problems: the optional `pingUserId` is supported by the API and sent to Notifiarr as a string, but it is untested against Notifiarr (its documentation shows a number) and not offered in Settings.
- **Editing the earlier message** into "recovered" instead of posting a new one.
- **Batching** the optional sync-activity messages (they can arrive as often as every sync).
