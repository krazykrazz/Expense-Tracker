# Plaid Bank Import (Phase 1 PoC)

Connect bank and credit card accounts through [Plaid](https://plaid.com/docs/), pull their posted transactions, and review them in an **Import Inbox**: add each one as a new expense, match it to an expense you already entered, or ignore it. Nothing becomes an expense without an explicit action.

This is a proof of concept. Sync is manual, and only the Plaid **Transactions** product is used. See [Limitations](#limitations).

Spec: [specs/plaid-integration/spec.md](../../specs/plaid-integration/spec.md).

## Setup

### 1. Plaid account

1. Create a Plaid Dashboard account and apply for the free **Trial plan** (US/Canada accounts created on or after 15 April 2026). It gives real bank data for up to **10 Production connections, ever**. Disconnecting a bank does **not** give the slot back.
2. Under Developers → Keys, copy the `client_id`, the **Sandbox** secret and the **Production** secret.
3. Build and test with Sandbox first: it has fake banks, unlimited connections, and the test login `user_good` / `pass_good`.

### 2. Configuration (in the app)

Open **Settings → Bank Import**:

1. Choose **Sandbox** or **Production**. Each environment has its own secret.
2. Paste the **Client ID** and the **Secret** for that environment.
3. Click **Test connection**. This asks Plaid for a Link token with those keys and shows whether Plaid accepted them, without saving anything.
4. Click **Save**. The bank icon appears in the header straight away.

How the settings form behaves:
- After saving, the form shows only masked hints (`••••1234`). The secret is never sent back to the browser.
- To change only some values, leave the other fields blank: a blank field keeps the saved value.
- Switching Sandbox ↔ Production is refused while banks from the other environment are connected, because a bank's connection only works in the environment it was made in. Disconnect them first (Bank Import → Connections).
- **Remove keys** turns the feature off. It is refused while any bank is connected.
- If Production is enabled and the app has no password, the screen recommends setting one (Settings → Security), since anyone on the network could otherwise open it.

Until keys are saved, the header button is hidden and every `/api/plaid/*` endpoint except `/status` and `/settings` returns 503. The server log reports `Plaid integration enabled (sandbox, configured via Settings)` on startup. Incomplete configurations are logged as warnings that list what is missing; secrets are never logged.

#### How secrets are stored

- **The encryption key:** generated automatically the first time it is needed, at `<CONFIG_DIR>/secrets/plaid.key` (`/config/secrets/plaid.key` in Docker). The file is readable only by the app user.
- **What it protects:** both the Plaid secret (setting `plaid_secret_enc`) and every bank access token are encrypted with it using AES-256-GCM.
- **Backups:** they contain only the database, invoices, statements and `backupConfig.json`, never the `secrets/` folder. A backup on its own can't be used to reach your bank data.
- **Restoring on another machine** (or after losing `/config/secrets`): the Bank Import tab asks you to re-enter the secret, and each bank must be reconnected. In Production, every reconnection uses another Trial slot. To avoid that when migrating, copy `secrets/plaid.key` to the new `/config` alongside the restore.

#### Optional: environment variables

Container-managed setups can configure Plaid with environment variables instead. If **any** of `PLAID_CLIENT_ID`, `PLAID_SECRET` or `PLAID_ENV` is set, they are the only source used, and the settings screen becomes read-only.

| Variable | Value |
|----------|-------|
| `PLAID_CLIENT_ID` | Your Plaid `client_id` |
| `PLAID_SECRET` | The secret for the chosen environment |
| `PLAID_ENV` | `sandbox` or `production` |
| `PLAID_TOKEN_KEY` | Optional. 32-byte key (base64 or hex) used instead of the generated key file. It works with either configuration method |

- **Docker:** put the values in an untracked `.env` file next to `docker-compose.yml`, then uncomment the `PLAID_*` lines in the `expense-tracker` service. Never commit secrets.
- **Already using `PLAID_TOKEN_KEY`:** keep it set. Your existing bank connections were encrypted with it, and they can't be read without it.

> **Staging and preview:** don't give a container that runs on a *copy* of production data your Production keys or `secrets/plaid.key`. Disconnecting a bank there would remove the real connection at Plaid. Leave them unconfigured, or use Sandbox keys.

### 3. Content Security Policy

Plaid Link loads from `https://cdn.plaid.com`. The helmet CSP in `backend/server.js` allows it in `script-src` and `frame-src`, and allows `https://*.plaid.com` in `connect-src`.

## Using it

The **bank icon** in the header opens the Bank Import modal. It appears as soon as Plaid keys are saved.

### Connections tab

1. **Connect a bank** opens Plaid Link. In Production it first asks you to confirm, showing how many Trial connections you have used.
2. For each account, choose the **payment method** it pays from (debit or credit card payment methods), or *Don't import*. Transactions from unmapped accounts are kept but hidden from the inbox.
3. **Sync now** pulls changes for every connected bank and reports new / updated / removed counts. One failing bank does not stop the others.
   - The first sync covers about 30 days of history. Plaid may need a minute after connecting before history is ready.
4. **Disconnect** removes the connection at Plaid and locally. Unreviewed and ignored transactions are deleted. Expenses already added, and their bank-confirmed icons, are kept.

### Inbox tab

Lists posted transactions waiting for review, newest first, with the place (Plaid's merchant name, or the raw bank description), the bank's raw description, amount and payment method.

| Action | What happens |
|--------|--------------|
| **Add** | Opens an inline editor pre-filled with place, date and a category suggested from your history for that place. **Add expense** creates a normal expense (validation, activity log and sync all apply). For credit cards, the bank's posting date is stored as the posted date when it is later than the purchase date. |
| **Match** | Shown when existing expenses could be the same purchase: same payment method, same amount to the cent, date within ±3 days, and not already linked. Links the transaction to the chosen expense without changing it. |
| **Ignore** | Hides the transaction. The **Ignored** filter lists ignored transactions with **Undo ignore**. |

- Refunds and credits (zero or negative amounts) are labelled *Refund / credit* and can only be ignored.
- Amounts in a currency other than CAD get a badge; they are not converted.

### Bank-confirmed icon in the expense list

Expenses that were added from, or matched to, a bank transaction show a small bank icon next to the other indicators.

- The tooltip shows the bank's description, date and amount, and whether the expense was added from or matched to the bank.
- If the expense amount is later edited so it no longer equals the bank amount to the cent, the icon turns amber and the tooltip starts with "Amount differs from bank". Reimbursed expenses are compared using their original cost, since that is what the bank charged.
- Expenses without a link (cash, cheques, or anything not yet reviewed) show nothing.

## How it works

- **Tokens:** Plaid access tokens are encrypted with AES-256-GCM using the Plaid encryption key (`secrets/plaid.key`, or `PLAID_TOKEN_KEY`) and stored in `plaid_items.access_token_enc`. The key is never written to the database, and the `secrets/` folder is not backed up, so backups never contain a usable token. Tokens are never logged, returned to the browser, or written to the activity log.
- **Environment guard:** a bank connected in one environment is never used against the other. Sync refuses it with "Disconnect it and connect again", and Disconnect removes it locally without calling Plaid.
- **Sync:** each bank is synced with Plaid's `/transactions/sync` from its stored cursor.
  - All pages are fetched first. The staged changes and the new cursor are then saved in one database transaction, so a failure part-way leaves nothing half-applied.
  - If Plaid reports data changed mid-pagination, the sync restarts from the saved cursor (up to 3 times).
  - Two syncs of the same bank never run at once.
- **Staging rules:**
  - Pending transactions are skipped; Plaid sends them again once posted.
  - New transactions are inserted once (unique `transaction_id`, so re-syncing is safe).
  - Modified and removed transactions only affect rows still waiting for review. Anything you have added, matched or ignored is never changed by a sync.
- **One link per expense:** a unique index on `plaid_transactions.expense_id` ensures an expense is linked to at most one bank transaction.
- **Deleting a linked expense** sends its bank transaction back to the inbox (as "To review"), so it can be re-added, matched to another expense, or ignored. It is never silently lost.
- **Trial counter:** every Production connection increments the `plaid_production_items_created` setting, which is never decremented, matching Plaid's rule.
- **Backups:** see [How secrets are stored](#how-secrets-are-stored). A restore also reloads the saved Plaid settings, so the app immediately reflects the keys (or lack of them) in the restored database.

### Data

Tables `plaid_items`, `plaid_accounts` and `plaid_transactions`; see [Database Schema](../DATABASE_SCHEMA.md#plaid-tables). The expense list (`GET /api/expenses`) adds a `bankLink` field to every expense: `{ status, name, rawName, date, amount }` or `null`.

### API

All under `/api/plaid`; see the [Endpoint Reference](../API_DOCUMENTATION.md#plaid-bank-import--plaidroutesjs).

### Activity log

- `plaid_item_added` and `plaid_item_deleted` (entity `plaid_item`, institution name only).
- Saving or removing Plaid keys logs `settings_updated` (entity `settings`) describing what changed, e.g. "environment: Sandbox → Production, secret changed", never the values.
- Adding a transaction as an expense logs the normal `expense_added`.
- Syncs, matches and ignores are not logged in the PoC.

## Limitations

These are deferred to later phases:

- No scheduled sync or webhooks; use **Sync now**.
- No reconnect (Plaid "update mode") for an expired bank login. The connection shows the error; in the PoC, disconnect and reconnect (in Production this uses a Trial slot).
- Pending transactions are not shown. Changes made at the bank after you review a transaction are not reflected.
- Categories come only from your own history for the place; Plaid's categories are not used.
- No bulk actions, no inbox count badge, no medical/donation people allocation in the inline editor (edit the expense afterwards).
- Card payments, transfers and refunds are not recorded (ignore them).
- Card balances (Liabilities) and investments are not imported.
