# Plaid Integration — Phase 1 PoC: connect a bank + review inbox

## Summary

A limited proof of concept that answers two questions:

1. **Connectivity:** can the self-hosted app link a real bank through [Plaid](https://plaid.com/docs/) (Trial plan) and reliably pull its transactions?
2. **Inbox:** is reviewing incoming transactions the right workflow? Each one is either **added as a new expense**, **matched** to an expense already entered by hand, or **ignored**.

Nothing becomes an expense without an explicit action. Anything not needed to answer those two questions is deferred (see *Out of scope*).

## Plaid account context (owner setup, outside the code)

- **Trial plan** granted: real Production data, free, **max 10 Production Items ever** (an Item = one bank login; removing one does not give the slot back).
- Keys: `client_id` plus a **Sandbox** secret and a **Production** secret. Build and test against Sandbox (fake banks, unlimited Items, login `user_good` / `pass_good`). Only connect a real bank once the Sandbox flow works end to end.
- Desktop-web OAuth runs in a Plaid pop-up, so no redirect URI or public URL is needed on the LAN.

## Requirements

1. **Config (in-app first).** Anyone running the Docker image sets Plaid up in **Settings → Bank Import**: environment (`sandbox` | `production`), Client ID and secret, with **Test connection** (checks the keys with Plaid without saving) and **Save**. Country is fixed to `CA`.
   - Keys are shown back only as masked hints; a blank field keeps the saved value.
   - Switching environment is refused while banks from the other environment are connected; removing keys is refused while any bank is connected.
   - Optional override: if any of `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV` is set, environment variables are the only source and the settings screen is read-only.
   - `GET /api/plaid/status` → `{ enabled, source, environment, trial }`.
   - When disabled, the header entry point is hidden and every Plaid endpoint except status and settings returns 503.
2. **Secret and token security.**
   - The Plaid secret (setting `plaid_secret_enc`) and bank access tokens are encrypted with AES-256-GCM.
   - The key is generated on first use at `<CONFIG_DIR>/secrets/plaid.key` (mode 0600), or comes from `PLAID_TOKEN_KEY`. It is never stored in the DB, and `secrets/` is not in backups, so a backup never contains a usable secret or token.
   - Secrets and tokens are never logged, sent to the frontend, or written to the activity log.
3. **Connect.**
   - "Connect a bank" opens Plaid Link (Transactions product). The backend exchanges the `public_token` and stores the Item and its accounts.
   - In `production` the button first confirms: "Uses 1 of 10 Trial connections (N used)".
4. **Account → payment method.**
   - Each linked account has a dropdown: an existing active payment method, or *Don't import*.
   - Transactions from accounts with no payment method selected are kept but hidden from the inbox. They appear once an account is mapped.
5. **Sync (manual).**
   - "Sync now" calls `/transactions/sync` per Item from the stored cursor and pages through `has_more`. The new cursor is saved in the same DB transaction as the staged rows.
   - The first sync requests 30 days of history.
   - Staging rules:
     - **Pending transactions are skipped.** Only posted ones are staged.
     - `added` → insert, unique on `transaction_id` (re-sync is idempotent).
     - `modified` → update the row if it is still `new`.
     - `removed` → delete the row if it is still `new`.
     - Rows already added, matched or ignored are never touched by sync.
   - The response returns counts (`added`, `updated`, `removed`).
6. **Inbox.**
   - Lists `new` staged transactions from mapped accounts, newest first: date, place (`merchant_name ?? name`), amount, payment method, Plaid's raw `name`.
   - Rows with amount ≤ 0 (refunds/credits; Plaid uses positive = money out) are listed but can only be ignored.
   - **Match candidates:** non-linked expenses with the same `payment_method_id`, the same **charged** amount (`COALESCE(original_cost, amount)`, the same rule credit card balances use) to the cent, and a date within ±3 days, closest date first. When candidates exist the row shows a "Possible match" hint.
7. **Inbox actions.** Each action changes one row, and the row leaves the inbox.
   - **Add as new:** inline editor pre-filled with date, place, amount and payment method; category from `categorySuggestionService` for the place (else empty, so the user must pick); optional notes. It creates the expense through `expenseService.createExpense`, so normal validation, week calculation, activity logging and SSE apply. Status becomes `added`.
   - **Match:** choose one of the match candidates. No expense is created or changed. Status becomes `matched`.
   - **Confirm a fixed expense:** choose a planned fixed expense the charge pays (same payment method, due from 3 days before to 10 days after the landing date). Records the landing date; a different amount updates the plan to the bank amount. Status becomes `matched`, with no expense.
   - **Ignore:** status becomes `ignored`. An **Ignored** filter shows these rows with an **Undo** action that puts them back to `new`.
8. **Disconnect.** Calls `/item/remove`. The confirmation warns that in `production` the Trial slot is not refunded. Staged rows still `new` or `ignored` are deleted. Expenses already created are untouched.
9. **Bank-confirmed indicator in the expense list.**
   - Expenses linked to a bank transaction (*Add as new* or *Match*) show a small bank icon next to the existing indicators.
   - Tooltip: "Confirmed by bank: `<Plaid name>`, `<date>`, `<amount>`". It also says whether the expense was added from the bank or matched to one entered by hand.
   - If the expense's amount was later edited and no longer equals the bank amount to the cent, the icon shows a warning state ("Amount differs from bank: $X").
   - Expenses with no link show nothing (no "unconfirmed" noise, since cash and cheque expenses can never be confirmed).
   - An expense can be linked to at most one bank transaction.
10. **Activity log.**
   - `plaid_item_added` and `plaid_item_deleted` (institution name only).
   - Add-as-new emits the normal `expense_added`.
   - Sync, match and ignore are not logged in the PoC.

## Design

### Dependencies and CSP
- Backend `plaid` (official Node SDK); frontend `react-plaid-link` (`usePlaidLink`).
- Helmet CSP in `backend/server.js`: add `https://cdn.plaid.com` to `scriptSrc` and `frameSrc`, and `https://*.plaid.com` to `connectSrc`.

### Data (`backend/database/schema.js`)
New tables only, so `schema.js` (`CREATE TABLE IF NOT EXISTS`) creates them on existing databases too and no migration is needed, as with `budget_allocations`.
- `plaid_items(id, item_id UNIQUE, institution_name, access_token_enc, sync_cursor, environment CHECK IN ('sandbox','production'), last_synced_at, last_error, created_at, updated_at)`
- `plaid_accounts(id, plaid_item_id → plaid_items ON DELETE CASCADE, account_id UNIQUE, name, mask, type, subtype, payment_method_id → payment_methods ON DELETE SET NULL, created_at, updated_at)`
- `plaid_transactions(id, transaction_id UNIQUE, plaid_account_id → plaid_accounts ON DELETE SET NULL, amount, iso_currency_code, date, authorized_date, name, merchant_name, status CHECK IN ('new','added','matched','ignored') DEFAULT 'new', expense_id → expenses ON DELETE SET NULL, created_at, updated_at)`, indexes on `(status, date)` and `plaid_account_id`. `SET NULL` (not CASCADE) on the account, so added/matched rows and the bank-confirmed icon survive a disconnect.
- Partial unique index `ON plaid_transactions(expense_id) WHERE expense_id IS NOT NULL` (one bank transaction per expense; also blocks double-matching).
- `updated_at` triggers on all three tables.
- `expenses` is unchanged. The link lives in `plaid_transactions.expense_id`.
- "Non-linked expense" for match candidates means no `plaid_transactions` row references it.
- The Trial usage counter is the `plaid_production_items_created` setting. It is incremented on every Production connection and never decremented, because Plaid never refunds a slot.

### Field mapping (Add as new)
| Expense | Source |
|---|---|
| `date` | `authorized_date ?? date` |
| `posted_date` | `date` when the payment method is a credit card and it is later than the expense date, else NULL |
| `place` | `merchant_name ?? name` (editable) |
| `amount` | `amount` (> 0) |
| `type` | user choice, pre-filled from `categorySuggestionService` |
| `method` / `payment_method_id` | from the account mapping |

### Backend
- `config/plaid.js`: effective config from env vars, otherwise the in-memory copy of saved settings (`setStoredCredentials`); token key from `PLAID_TOKEN_KEY` or the generated key file (`getTokenKey({ create })`); `isEnabled()`; builds `PlaidApi` clients; `logPlaidStatus()` at startup.
- `plaidSettingsService`: load at startup and after a backup restore, get (masked), save, test, clear; logs `settings_updated`.
- `utils/tokenCrypto.js`: `encrypt` / `decrypt` (AES-256-GCM, random IV; stored as `v1:iv:tag:ciphertext`).
- `utils/plaidMatching.js`: pure match-candidate predicate and date helpers (PBT-tested).
- `plaidRepository`: items, accounts and transactions in one repository; small enough for the PoC. `applySyncBatch` applies a full sync and the new cursor in one transaction.
- `plaidService`: status, link token, exchange and account fetch, account mapping, sync (with a per-item lock and restart on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`), disconnect. Plaid errors become 502s; raw axios errors (which carry the secret in their config) are never logged.
- `plaidInboxService`: list (with inline match candidates and category suggestions), add, match, ignore and unignore. Actions are serialised per row, and the status update is conditional (`WHERE status = 'new'`).
- `expenseService.getExpenses` attaches `bankLink: { status, name, rawName, date, amount } | null` with one batched `plaid_transactions` lookup (like `people` for medical expenses), rather than changing `expenseRepository.findAll`, which has many other callers.
- `plaidController` (`asyncHandler`). Routes under `/api/plaid`, gated by a 503 middleware except `/status`:
  - `GET /status`
  - `POST /link-token`
  - `POST /items` (exchange), `GET /items` (with accounts), `DELETE /items/:id`
  - `PUT /accounts/:id` (`{ paymentMethodId | null }`)
  - `POST /sync`
  - `GET /inbox?status=new|ignored` (each row carries its `matchCandidates`, so there is no separate matches endpoint)
  - `POST /inbox/:id/add`
  - `POST /inbox/:id/match` (`{ expenseId }`)
  - `POST /inbox/:id/ignore`
  - `POST /inbox/:id/unignore`

### Frontend
- `API_ENDPOINTS` entries + `services/plaidApi.js` (via `apiClient`).
- One **Bank Import** modal (`components/bank-import/`), opened from a header bank icon (`BankImportButton`) that is shown only when `status.enabled` and re-checks status when settings change (window event). It has two tabs:
  - **Connections:** Connect a bank, list of Items with their accounts and payment-method dropdowns (debit and credit card methods), Sync now (shows the counts), Disconnect.
  - **Inbox:** New/Ignored filter and a row list. Each row has *Add* (inline editor), *Match* (candidate picker) and *Ignore*.
- `BankConfirmedIndicator` component, rendered in `ExpenseList` rows with the other indicators, driven by `expense.bankLink`. The amount check uses `original_cost ?? amount` (reimbursed expenses are charged their original cost). After an Add or Match the modal calls `refreshExpenses`, because the originating tab ignores its own SSE broadcast.
- `plaid_item` activity events are not routed by `useDataSync`; they only matter inside the modal.
- `PlaidSettings` panel in a new **Settings → Bank Import** tab (theme variables only; the existing `.settings-section` style is light-only in dark mode).

### Deployment
- No configuration needed in the image: keys are entered in the app, and the key file lives under `/config/secrets` (gitignored, excluded from the Docker build context and from backups).
- `docker-compose.yml` keeps commented-out `PLAID_*` entries for env-var users; `docker-compose.preview.yml` deliberately does not pass them through (configure preview in Settings). Staging and preview run on copies of production data, so they should use Sandbox keys only: a disconnect there would remove the real Item at Plaid.
- Restoring a backup on another host asks for the secret again, and banks must be reconnected (a Trial slot each in Production) unless `secrets/plaid.key` is copied over too.

## Out of scope (later phases)

Planned in detail in [`specs/plaid-bank-sync/spec.md`](../plaid-bank-sync/spec.md).

- Scheduled sync / webhooks
- Pending→posted handling
- Changes made at the bank after a transaction has been reviewed
- Re-auth / update-mode Link (PoC: disconnect + reconnect, Sandbox only)
- Plaid category mapping (beyond `categorySuggestionService`) and Plaid's merchant-name cleanup
- Bulk actions; header badge
- Transfers / credit-card payments → `credit_card_payments`; refunds as negative or credit entries
- **Auto-logged payments from bank confirmations:** use the confirmed landing date (`plaid_fixed_expense_links.landed_date`) instead of the due day for loan-linked fixed expenses.
- Liabilities (card balances and due dates); Investments; auto-approve rules
- Medical/donation people and insurance fields in the inline editor (use the full expense form later)

## Testing

- Unit: `tokenCrypto` round-trip and tamper rejection; match-candidate predicate (PBT: same method ∧ same cents ∧ |Δdate| ≤ 3 ⇔ candidate); field mapping.
- Integration (Plaid client mocked; no network in CI):
  - Sync is idempotent across repeated pages
  - The cursor is saved only after the last page
  - Pending transactions are skipped
  - `modified` / `removed` touch only `new` rows
  - Add creates exactly one expense and links it
  - Match links without creating anything
  - Ignore → unignore round-trip
  - Disconnect keeps the created expenses
  - The expense list returns `bankLink` for linked expenses and `null` otherwise
  - A second match to the same expense is rejected
- Frontend: `BankConfirmedIndicator` renders added, matched, amount-differs, reimbursed and none states; inbox add/match/ignore/undo flows; connections mapping, Trial confirmation, sync summary and disconnect warning; header button hidden when disabled.
- Routes: 503 when disabled, status always answers, body/tab-id wiring.
- Manual: Sandbox end to end (`user_good` / `pass_good`), then one real account on the Trial plan.

## Exit criteria

- A real bank connects on the Trial plan, and Sync pulls at least 30 days of posted transactions.
- A month of real transactions can be reviewed in the inbox, with no duplicates after repeated syncs.
- Matches find most hand-entered expenses.
- Write down the findings (match hit rate, place-name quality, pain points) here to scope phase 2.

## Findings

### Sandbox run (2026-11-01, local dev on a copy of production data)

The full flow worked through the real UI against Plaid Sandbox (RBC Royal Bank, `user_good`):
- **Connect and map:** Link (embedded login; CSP OK) → exchange → token stored encrypted → 15 accounts listed. Plaid Checking was mapped to *Debit - RBC* and Plaid Credit Card to *RBC VISA*; the dropdown offered only active debit and credit-card methods.
- **Sync:** 16 new transactions, all CAD. A repeat sync returned 0 new and the database kept 16 distinct ids. 4 rows on unmapped accounts were hidden, with the notice shown.
- **Inbox display:** refunds were labelled and could only be ignored.
- **Category suggestions came from real history:** Starbucks → Gifts (15× in history), unknown merchants left blank.
- **Add, debit:** Starbucks became an expense with the edits applied and the link stored.
- **Add, credit card:** Touchstone kept purchase date 10-08 with posted date 10-09.
- **Match:** a hand-entered McDonald's $12.00 dated one day earlier was offered as the only candidate. Matching linked it without changing the expense.
- **Ignore:** ignore, undo ignore and re-ignore all worked.
- **Expense list:** green bank icons with correct tooltips. Editing the matched amount to $13.00 turned the icon amber ("Amount differs from bank: $12.00").
- **Disconnect:** the item and accounts were removed; unreviewed and ignored rows deleted; the 3 added/matched links kept (account NULL) and the 3 expenses untouched. `plaid_item_added` and `plaid_item_deleted` were logged; no secrets in the logs.

Fixed during the run:
- The modal was clipped by the sticky header's stacking context. It now renders through a portal to `<body>`, with a regression test.
- Negative amounts showed as `$-500.00`; they now show as `-$500.00`.

Observations for phase 2:
- An open inbox does not refresh when expenses change elsewhere; reopening it or switching filters does. Consider refreshing on the `expense` sync event.
- Sandbox Link shows a "script embedded more than once" warning in dev (React StrictMode double mount); it does not affect production builds.
- Card payments ("AUTOMATIC PAYMENT - THANK") and transfers appear as ordinary rows. Auto-classifying them as "not expenses" would cut review effort.
- Still to do: real-bank Trial run (OAuth flow at a real institution, match hit rate on real data).

### In-app configuration run (2026-11-02, local dev, no `PLAID_*` env vars, copy of production data)

- **Fresh install:** status `{ enabled: false, source: 'none' }`; no header icon; Plaid endpoints return 503 pointing to Settings; no key file yet.
- **Fake keys:** "Test connection" made a real Plaid round trip, showed "Plaid rejected these keys: invalid client_id or secret provided", and saved nothing.
- **Saving the Sandbox keys:**
  - Masked hints only; `plaid.key` generated on save.
  - `plaid_secret_enc` stored as `v1:…` ciphertext (no plaintext anywhere in the settings rows).
  - Log: "configured via Settings".
- **After a server restart:** still enabled from settings; a Link token was issued with the saved keys. After a page reload, header icon present, masked hints shown, and "Test connection" with blank fields used the saved keys and was accepted.
- **Production with the saved Sandbox secret:** "Test connection" was rejected by Plaid, as expected (each environment has its own secret); nothing was saved.
- **Fixed:** the shared `.settings-section` style renders light-on-light in dark mode in every Settings tab (pre-existing). The Bank Import tab uses its own theme-aware section style; the other tabs are unchanged.

### Code audit (2026-11-02, `/expense-tracker-audit`)

Fixed in this branch:
- **Medium:** deleting an added or matched expense stranded its bank transaction as `added`/`matched` with no expense, invisible everywhere. A `BEFORE DELETE ON expenses` trigger now returns it to `new`.
- **Medium:** `ExpenseContext.handleExpenseUpdated` replaced the row with the PUT response, which has no `bankLink`, so the bank icon (including "amount differs") vanished right after an edit. The existing link is now kept.
- **Medium:** `connectItem` only created the encryption key while encrypting, after the token exchange. A key-file failure, or a failed insert, left a live Item at Plaid with no local record. The key is now checked before the exchange, and the Item is removed at Plaid if storing it fails.
- **Low:** settings save encrypts before writing anything, so there is no half-saved client ID.
- **Low:** `docker-compose.preview.yml` no longer passes `PLAID_*` through from the shell, since a stray variable silently overrode the in-app settings.

Deferred (Low, phase 2):
- Non-transactional multi-step writes: disconnect (two deletes), and add-as-expense then link.
- Rows for an account Plaid never listed count as "hidden, map accounts" with nothing to map.
- No activity log, and therefore no cross-tab refresh, for account mapping, sync, match and ignore.
- Per-place category-suggestion queries on every inbox load.
- The settings-changed event only reaches the current tab.

### Staging review (2026-11-02)

- **Fixed:** match candidates compared the bank amount with `expenses.amount`, which for reimbursed and insurance-tracked expenses is only the out-of-pocket share. A $200 charge with $50 out of pocket was never offered, leaving Add (a duplicate) or Ignore. Matching now uses `COALESCE(original_cost, amount)`, and the picker shows both amounts.
- **Confirmed:** inline Add goes through `expenseService.createExpense`, so medical, donation, insurance and reimbursement details are set by editing the expense afterwards. The bank icon compares against the charged amount.
- **Fixed expenses (added):** a charge can **confirm** a planned fixed expense instead of being added, which would double-count it.
  - **Candidates:** same payment method (`payment_method_id`, else the `payment_type` display name as a fallback), due from 3 days before to 10 days after the posted date (due day clamped to the month length; no due day means the same month), any amount, exact amounts ranked first.
- **Fixed expense payment method link (fixed):** fixed expenses stored only the payment method's display name. The create/update queries never wrote `payment_method_id`, so a rename orphaned them (⚠️ in the modal, failing edits, no bank matches) and edits left stale ids (4 rows on the staging copy pointed at the old, inactive "Debit").
  - **Writes:** create, update and carry-forward now resolve `payment_method_id` from the name.
  - **Migration:** `fixed_expenses_payment_method_id_backfill_v1` links existing rows and corrects stale ids. On the staging copy, linked rows went 25 → 71 and mismatches 4 → 0; only the 192 legacy 'Fixed' rows (2009–2024) stay unlinked.
  - **Renames:** renaming a payment method updates stored names on its fixed expenses and expenses.
  - **Confirming:** stores the landing date in `plaid_fixed_expense_links` (a new table, so no migration). A different amount updates the plan through `fixedExpenseService.updateFixedExpense`; if that fails, the link is undone.
  - **Display:** Fixed Expenses shows a bank icon with when the payment landed and how many days from the due date, amber if the plan is later edited away from the bank amount.
  - **Delete:** deleting the fixed expense returns the transaction to the inbox.

## Tasks

- [x] Branch `feature/plaid-integration`
- [x] Config + `tokenCrypto` + tests
- [x] Schema (3 tables, no migration needed) + schema tests
- [x] `plaidRepository`, `plaidService` (link/exchange/sync/disconnect) + tests with a mocked client
- [x] `plaidInboxService` (list/matches/add/match/ignore) + tests
- [x] Controller/routes + CSP update + route tests
- [x] `bankLink` on the expense list + tests
- [x] Frontend: API layer, Bank Import modal (Connections + Inbox), `BankConfirmedIndicator` in `ExpenseList` + tests
- [x] Manual Sandbox run (see Findings)
- [x] In-app configuration (Settings → Bank Import, generated key file, env-var override) + tests + manual run (see Findings)
- [ ] One real Trial connection; record findings
- [x] Docs: `docs/features/PLAID_INTEGRATION.md`, `API_DOCUMENTATION.md` Endpoint Reference, `DATABASE_SCHEMA.md`, `ACTIVITY_LOG.md`, `DOCKER_DEPLOYMENT.md` env vars, README, features index
- [ ] Changelog entries are added by the Release workflow (versions are not bumped on feature branches)
- [ ] Full-suite validation: `.\scripts\run-test-summary.ps1`; then move this spec to `specs/archive/`
