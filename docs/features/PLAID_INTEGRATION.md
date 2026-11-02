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
   - Mapped payment methods show a small green **bank badge** next to their name on the Financial page (Payment Methods). Hovering it lists the linked bank accounts. Without Plaid configured, the Financial page makes no bank calls and shows no badges.
3. **Sync now** pulls changes for every connected bank and reports new / updated / removed counts. One failing bank does not stop the others.
   - The first sync covers about 30 days of history. Plaid may need a minute after connecting before history is ready.
   - Each bank shows when it last synced (date and time) and its last error.
4. **Automatic sync** (shown once a bank is connected): on by default, every **30 minutes from 06:00 to 23:00** in the business timezone (Settings), nothing overnight. Choose 30, 60 or 120 minutes and the hours, or turn it off. See [Automatic sync](#automatic-sync).
5. **Disconnect** removes the connection at Plaid and locally. Unreviewed and ignored transactions are deleted. Expenses already added, and their bank-confirmed colours, are kept.

### Automatic sync

Nobody needs to know about Sync now:

- **On a schedule:** a check runs every 5 minutes and syncs each bank whose last sync is older than the interval (with 3 minutes of slack, so "30 minutes" stays 30), during the active hours only.
- **When the app is opened:** loading the app, coming back to its tab (at most once every 5 minutes) or opening Bank Import syncs, in the background, any bank not synced in the last 30 minutes. This works at any hour, including overnight.
- **What is skipped:** banks waiting for you (expired login, removed at the bank) until they are reconnected, banks from another Plaid environment, and a bank that just failed (it is retried at the next interval, not every 5 minutes). Nothing runs while Plaid is not configured.
- **Results:** a sync that brings new, changed or removed transactions refreshes the inbox and connections in every open tab (toast "↻ Bank transactions synced"). Syncs with nothing new are silent.
- **Cost:** Plaid does not charge per sync call (Transactions is billed per connected account per month on paid plans, and is included in the Trial). Plaid itself collects new data from most banks 1 to 4 times a day, so most syncs find nothing new.

### Inbox tab

Lists posted transactions waiting for review, newest first, with the place (Plaid's merchant name, or the raw bank description), the bank's raw description, amount and payment method.

| Action | What happens |
|--------|--------------|
| **Add** | Opens an inline editor pre-filled with place, date and a category suggested from your history for that place. **Add expense** creates a normal expense (validation, activity log and sync all apply). For credit cards, the bank's posting date is stored as the posted date when it is later than the purchase date. |
| **Match** | Shown when existing expenses could be the same purchase: same payment method, same **charged** amount to the cent, date within ±3 days, and not already linked. For reimbursed or insurance-tracked expenses the charged amount is the original cost (what the card was charged), not the out-of-pocket amount; the picker shows both. Links the transaction to the chosen expense without changing it. The same picker lists **fixed expenses** the transaction could pay and, for deposits, **expected income** (see below). |
| **Ignore** | Hides the transaction. The **Ignored** filter lists ignored transactions with **Undo ignore**. |

- Refunds and credits on a credit card (zero or negative amounts) are labelled *Refund / credit* and can only be ignored. Money coming into a bank account is labelled *Deposit* (see [Income](#income-confirm-a-deposit)).
- Amounts in a currency other than CAD get a badge; they are not converted.

### Fixed expenses: confirm instead of adding

Fixed expenses (rent, mortgage, utilities, subscriptions) are usually logged ahead, often copied from the previous month. A bank charge that pays one should **confirm** it, not be added as a new expense: adding it would count the bill twice.

- **Which fixed expenses are offered:** for a charge (not a refund), the Match picker lists fixed expenses that:
  - use the **same payment method** (the fixed expense's linked payment method; its name is only a fallback for very old entries);
  - are **due from 3 days before to 10 days after** the date the charge landed (the bank's posted date), with the due day clamped to the month length. A fixed expense without a due day is offered for any charge in its month. The window crosses month ends, so a bill due on the 30th that lands on the 2nd still matches;
  - are **not already confirmed**.

  Exact amounts are listed first. When an amount is exact or within 10%, the row gets a **"Fixed: <name>"** badge.
- **Confirm:** links the transaction to the fixed expense and records when the payment **actually landed**. No expense is created.
- **Different amount:** bills vary, and copied-forward amounts go stale. The planned amount is updated to the bank amount through the normal fixed-expense update (validated, logged as `fixed_expense_updated`), and the picker says so before you confirm. If that update fails, the confirmation is undone.
- **In Fixed Expenses**, a confirmed item's **payment type pill turns green**. Hovering it shows the bank description, the date it landed and how many days before or after the due date, the bank amount, and the planned amount when it was updated. The pill turns amber if the planned amount is later edited away from the bank amount.
- **Each month is separate:** copying fixed expenses forward creates new, unconfirmed items. Deleting a confirmed fixed expense returns its transaction to the inbox.

The landing dates are the groundwork for a later phase: auto-logged loan payments (currently created on the due day) could use the actual date the payment landed.

### Income: confirm a deposit

Expected income (Income Management) is a monthly list of sources: a name, category and amount, with no day or account. A deposit (money into a chequing or savings account; credits on a credit card are refunds, not income) can confirm one of them or create one.

- **Which income is offered:** the Match picker lists income sources that are **not already confirmed** in the deposit's month. In the last 3 days of a month it also lists next month's income (pay due on the 1st that lands early before a weekend), and in the first 3 days the previous month's.
  - Ranking: sources this bank description confirmed before (by name, so next month's copied source is found automatically), then sources whose name words all appear in the description (*JAT* for "JAT - Direct deposit"), then the deposit's own month, then the closest amount.
  - A likely match (name fit or exact amount) gets an **"Income: <name>"** badge.
- **Confirm:** links the deposit to the income source and records when it **landed**. One deposit per income source: log pay that arrives more than once a month as separate sources.
- **Different amount:** the picker offers **Update to $X** (pre-checked). Checked, the income amount becomes the deposit amount through the normal income update (logged as `income_source_updated`); unchecked, the income keeps its amount. If the update fails, the confirmation is undone.
- **Add income:** for a deposit with no expected source (a one-off government payment, a gift), creates an income source in the deposit's month with the deposit amount. The name and category are pre-filled from an earlier confirmation of the same description, else the description and *Other*.
- **In Income Management**, a received income source shows the bank icon (income has no payment method pill) with the description, the date it landed and the deposit amount. It turns amber when the income amount differs from the deposit. Deleting the income source returns the deposit to the inbox.

### Bank-confirmed payment method in the expense list

Expenses that were added from, or matched to, a bank transaction show their **payment method pill in green**, so no extra icon is needed.

- Hovering the pill shows the bank's description, date and amount, and whether the expense was added from or matched to the bank. Screen readers hear "(confirmed by bank)" after the method name.
- If the expense amount is later edited so it no longer equals the bank amount to the cent, the pill turns amber and the hover text starts with "Amount differs from bank". Reimbursed expenses are compared using their original cost, since that is what the bank charged.
- Expenses without a link (cash, cheques, or anything not yet reviewed) keep the normal grey pill.

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

Tables `plaid_items`, `plaid_accounts`, `plaid_transactions`, `plaid_fixed_expense_links` and `plaid_income_links`; see [Database Schema](../DATABASE_SCHEMA.md#plaid-tables). The expense list (`GET /api/expenses`) adds a `bankLink` field to every expense: `{ status, name, rawName, date, amount }` or `null`. Fixed expenses and income sources get `bankConfirmation` (`{ landedDate, amount, plannedAmount, name }`) or `null`.

### API

All under `/api/plaid`; see the [Endpoint Reference](../API_DOCUMENTATION.md#plaid-bank-import--plaidroutesjs).

### Activity log

- `plaid_item_added` and `plaid_item_deleted` (entity `plaid_item`, institution name only).
- Saving or removing Plaid keys logs `settings_updated` (entity `settings`) describing what changed, e.g. "environment: Sandbox → Production, secret changed", never the values.
- Adding a transaction as an expense logs the normal `expense_added`. Confirming income with a different amount logs `income_source_updated`; Add income logs `income_source_added`.
- A sync that changed the inbox (Sync now, scheduled or on opening the app) logs `plaid_sync_completed` (entity `plaid_transaction`, counts and source only), which also refreshes other tabs. Changing the automatic sync schedule logs `settings_updated` with `section: 'plaid_auto_sync'`.
- Matches and ignores are not logged yet.

## Limitations

These are deferred to later phases:

- No webhooks: new transactions arrive with the next automatic sync, not instantly.
- No reconnect (Plaid "update mode") for an expired bank login. The connection shows the error; in the PoC, disconnect and reconnect (in Production this uses a Trial slot).
- Pending transactions are not shown. Changes made at the bank after you review a transaction are not reflected.
- Categories come only from your own history for the place; Plaid's categories are not used.
- No bulk actions, no inbox count badge, no medical/donation people allocation in the inline editor (edit the expense afterwards).
- Card payments, transfers and refunds are not recorded (ignore them).
- Confirmed fixed expenses don't yet feed auto-logged loan payments (those still use the due day).
- **Medical, donation, insurance and reimbursement details** are not in the inline Add form. Add the expense, then edit it in the expense list to set people, insurance, receipts or a reimbursement. its bank colour keeps comparing against the original charged amount.
- Card balances (Liabilities) and investments are not imported.
