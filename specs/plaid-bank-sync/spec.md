# Plaid Bank Sync

Optional bank connection through Plaid. Transactions sync into an Import Inbox where they become expenses, confirm planned items, or are ignored. This spec has three parts:
- **As built** (what exists, how it works): the implementation reference.
- **Roadmap** (Phases 2–7): ordered so each phase only depends on earlier ones.
- **Open questions.**

Phase 1 (the PoC) is archived at [`specs/archive/plaid-integration/spec.md`](../archive/plaid-integration/spec.md). User-facing behaviour is in [`docs/features/PLAID_INTEGRATION.md`](../../docs/features/PLAID_INTEGRATION.md).

## Status

| Version | PR | Shipped |
|---|---|---|
| 1.14.0 | #425, #429 | Phase 1: in-app Plaid configuration, connect / sync / Import Inbox, add / match / confirm fixed expense / ignore, charged-amount matching, fixed-expense payment-method link |
| 1.15.0 | #431, #432 | Confirm income with deposits / Add income; bank state as a coloured payment-method pill |
| 1.16.0 | #434, #435, #436 | Automatic sync (scheduled + on open); bank badge on mapped payment methods; activity log for inbox decisions, mappings and sync failures; batched category suggestions; atomic disconnect |
| 1.17.0 | #438 | Pending transactions: add the day you spend, settle in place, cancelled-charge review |
| 1.18.0 | #440 | Reconnect expired logins (update mode), connection alerts, re-attach on reconnect (most of 2.2) |
| 1.19.0–1.19.2 | #442, #444, #446 | Credit card balance check (4.2, pulled forward) with the balance capture part of 2.1; balances refreshed via `/accounts/get`; card view and dark theme cleanup; more balance-check causes |
| 1.20.0 | #448 | Data freshness: "Not updating" status from Plaid's `/item/get` and institution status (2.6) |
| 1.21.0 | #450 | Bank file import fallback (2.7): Wealthsimple card/chequing and CIBC card CSV exports into the Inbox, merged with Plaid in either order |
| 1.21.1 | #452 | Inbox place suggestions (learned place per bank description, else the existing place the description starts with); balance check `from_file` cause |
| 1.21.2 | #454 | Dark mode coverage (includes the Bank Import screens) |
| 1.21.3 | #456 | Wealthsimple pending charges settle when the card balance shows they posted (`settleFromBalance`) |
| 1.21.4 | #459, #460 | Log in again on a "Not updating" bank (2.8, first version); fixes from the Plaid/CSV audit |
| 1.22.0 | #462, #464 | Log in again asks Plaid to fetch (`/transactions/refresh`) and opens the login when the bank needs one (2.8). Plaid's personal finance category stored on every staged transaction (`plaid_transactions_pfc_v1`, part of 2.1) and the pure card payment classifier `utils/plaidClassification.js` (part of 3.1), both groundwork for 3.2 |
| 1.23.0 | #466 | Credit card payments from the Inbox (3.2): Record payment on a card credit (taking the paying debit along), Link to card payment on the debit, Record payment to… for a card with no bank connection; payments recorded from the bank are marked in the card view. Fixes from the credit card payment audit (serialised DB transactions, reminder after a paid entered statement, local-date payment form) |
| 1.24.0 | #468 | Posted date follows the bank: Match and settle set a card expense's posted date from the settled transaction (replacing an estimate; the purchase date is never changed); the green check in the expense list is replaced by a marker only when an expense posts on a later statement; a pending charge made just before the statement closes shows **→ next?**; and a bank-linked card's Billing Cycles tab compares each of its last closed statements with the bank (`GET /api/plaid/card-cycles/:id`). One-off: 16 matched card expenses got the bank's posted date (production, Nov 7) |
| 1.24.1 | #470 | A same-day bank date only clears a posted date you entered when the bank reports real posting dates (CIBC), not purchase dates (Wealthsimple) |
| next | this PR | Spot-check fixes: Plaid taking over a settled bank-file row now passes its posting date to the linked card expense (`posted_date` log action); the posting-date test tolerates an occasional weekend posting; no double marker on a pending charge already dated on the next statement; the statement check can't show an older response or another card's cycles |

**Next:** the rest of Phase 2: 2.3 inbox badge, 2.4 refactors (before Phase 3 adds more Inbox actions), 2.1 capture of the remaining fields, 2.5 hygiene. Then Phase 3 (3.1 To review / Not expenses, which would also move card payments out of To review automatically) and 4.1. 3.2 is verified in production: the Oct 30 WS VISA and CIBC MC payments are recorded from the card credits with their chequing debits linked.

**Order changes:**
- **2026-11-03:** card balance reconciliation is the biggest day-to-day problem, so 4.2 was built before the rest of Phase 2. It only needed balance capture from 2.1, done as its own migration `plaid_account_balances_v1`; the transaction columns of 2.1 still come in `plaid_capture_v1`.
- **2026-11-04 → 06:** Plaid outages at Wealthsimple and CIBC's login-only updates (see [Production findings](#production-findings-2026-11-03--07)) pulled in 2.6, 2.7 and 2.8 ahead of the rest of Phase 2.
- **2026-11-07:** 3.2 needs to recognise card payments. Plaid's category columns (2.1) and `kindFor` (3.1) were pulled forward as their own PR, ahead of the rest of 2.1 and 3.1.

## Guiding principles

1. **The tracker is complete without Plaid; Plaid only makes it smarter.** Every feature works with manual entry. Plaid UI (header button, badges, coloured pills, inbox) appears only when Plaid is configured; while it isn't, no Plaid calls or background jobs run (check `isEnabled()` / `/api/plaid/status` first), and no screen depends on bank data.
2. **Nothing becomes money data without the user's say-so.** Every bank transaction goes through the inbox. Rules only pre-fill (no auto-add, Q6). Bank-driven *updates* to records the user already created are allowed when they follow the bank faithfully and are logged: settled amounts (as built), current-month balances (Phase 4), and optionally loan payments from confirmed fixed expenses (3.5).
3. **Never overwrite what the user typed.** Bank values fill empty slots, or update values that came from the bank; a hand-entered or hand-edited value wins, and the difference is shown. **Exceptions the owner chose:** a credit card expense's `posted_date` always follows the bank once the transaction is settled (Add, Match, a pending charge settling, or Plaid taking over a settled bank-file row), because statements are built from it; the purchase `date` is never changed. A bank date equal to the purchase date only replaces an entered posted date when the bank's dates are real posting dates (see Production findings).
4. **Never waste a Trial slot.** No flow may require disconnect + reconnect when update mode can repair the same Item (`TRIAL_ITEM_LIMIT = 10`, never refunded).
5. **Reuse the domain services for writes** (`expenseService`, `fixedExpenseService`, `incomeService`, `creditCardPaymentService`, `loanPaymentService`, `investmentValueService`, `loanBalanceService`). Validation, balances, activity log and SSE then behave as for manual entry.
6. **Every user-visible mutation emits an activity-log event** whose `entity_type` is routed by `useDataSync` (directly or via `ENTITY_TYPE_ALIASES`) to a consumer that refreshes.
7. **Secrets stay where Phase 1 put them:** encrypted with the key in `/config/secrets` (or `PLAID_TOKEN_KEY`); never logged, never sent to the browser, never in backups.
8. **Self-hosted first.** Everything works on a LAN-only install. Public exposure (Phase 7 webhooks) is optional.

---

# As built (v1.21.4, plus #462)

## Data

**Tables** (all created by `backend/database/schema.js`; columns added after release come from migrations):

| Table | Purpose | Key columns |
|---|---|---|
| `plaid_items` | One per connected bank login | `item_id` UNIQUE, `institution_name`, `access_token_enc` (AES-256-GCM `v1:iv:tag:ct`, 12-byte IV, 16-byte tag), `environment` (`sandbox`/`production`), `sync_cursor`, `last_synced_at`, `last_error`, `bank_updated_at`, `bank_update_failed_at`, `institution_status`, `institution_status_since` |
| `plaid_accounts` | Accounts of an item | `account_id` UNIQUE, `name`, `mask`, `type`, `subtype`, `payment_method_id` → payment_methods (SET NULL), `current_balance`, `available_balance`, `credit_limit`, `balance_currency`, `balance_as_of` |
| `plaid_transactions` | Staged bank transactions (from Plaid, or from a bank file: `transaction_id` starting `file:`) | `transaction_id` UNIQUE, `plaid_account_id`, `amount` (Plaid sign: + money out), `date` (posted), `authorized_date`, `name`, `merchant_name`, `status` (`new`/`added`/`matched`/`ignored`), `expense_id` (partial UNIQUE), `pending`, `pending_transaction_id`, `removed_at` |
| `plaid_fixed_expense_links` | Bank payment confirming a fixed expense | `plaid_transaction_id` UNIQUE, `fixed_expense_id` UNIQUE, `landed_date`, `planned_amount` |
| `plaid_income_links` | Deposit confirming (or creating) an income source | `plaid_transaction_id` UNIQUE, `income_source_id` UNIQUE, `landed_date`, `planned_amount` |

**Triggers** return a bank row to the inbox (`status = 'new'`) when its target is deleted: `plaid_transactions_unlink_on_expense_delete`, `…_on_fixed_expense_delete`, `…_on_income_source_delete`.

**Migrations:**
- `fixed_expenses_payment_method_id_backfill_v1`: links fixed expenses to payment methods by name.
- `plaid_transactions_pending_v1`: adds the `pending`, `pending_transaction_id` and `removed_at` columns.
- `plaid_account_balances_v1`: account balance columns (4.2).
- `plaid_item_freshness_v1`: `bank_updated_at`, `bank_update_failed_at`, `institution_status`, `institution_status_since` (2.6).

**Settings keys:**
- `plaid_client_id`, `plaid_secret_enc`, `plaid_environment`;
- `plaid_production_items_created` (Trial counter, never decremented);
- `plaid_auto_sync_enabled`, `plaid_auto_sync_interval_minutes`, `plaid_auto_sync_start_hour`, `plaid_auto_sync_end_hour` (defaults: on, 30 min, 06–23).

**Secrets:** the key is `<CONFIG_DIR>/secrets/plaid.key` (generated on first use, mode 600, excluded from backups) or `PLAID_TOKEN_KEY`. `PLAID_*` environment variables override the in-app keys and make Settings read-only.

## Backend

| Module | Responsibility |
|---|---|
| `config/plaid.js` | Effective config (env over settings), `isEnabled()`, cached Plaid client, token key load/generate |
| `utils/tokenCrypto.js` | AES-256-GCM encrypt/decrypt (IV and tag lengths checked) |
| `utils/plaidMatching.js` | Pure rules: expense match (same payment method, **charged** amount `COALESCE(original_cost, amount)` to the cent, ±3 days on purchase date), fixed-expense window (due −3/+10 days, clamped due day, settled only), deposits and income window (own month; next month in the last 3 days; previous month in the first 3), income ranking (learned name → name tokens → own month → amount) |
| `utils/plaidFreshness.js` | `isBankDataStale` (`STALE_AFTER_HOURS = 12`), shared by `connectionStatus` and the balance check |
| `utils/bankFileImport.js` | CSV parsing per bank format and the file ↔ Plaid merge rules (2.7) |
| `utils/placeSuggestion.js` | Inbox place pre-fill: learned place per cleaned description, else the longest existing place the description starts with |
| `repositories/plaidRepository.js` | Items/accounts, `applySyncBatch` (atomic page apply + cursor: pending replacement, file takeover, reconnect re-attach), `applyFileImport`, inbox queries, link tables, pending settlement and cancelled-charge queries, balance-check queries, `markSettled`, `findLinksForExpenses` |
| `services/plaidService.js` | Link token, connect (Trial counter, orphan cleanup), `markReconnected`, `requestRefresh` (2.8), mapping (+ `plaid_account_updated`), `syncItem` (per-item lock, mutation-during-pagination restart ×3, `/accounts/get` balances, `/item/get` + institution status, settle-from-balance when the balances were refreshed, error recorded once as `plaid_sync_failed`), `syncAll`, `findStaleItems`, `syncItems`, disconnect (atomic), `getStatus` (`needsAttention`, `staleData`) |
| `services/plaidInboxService.js` | `listInbox` (candidates, place and category suggestions, cancelled charges, `source: file\|plaid`), add / match / match-fixed / match-income / add-income / ignore / unignore (409 when a sync changed the row meanwhile; an added expense is undone), `applySettlements` (logs `settle_failed` when the expense can't be updated), `resolveCancelled`, per-row in-flight lock, `_logReview` |
| `services/plaidCardBalanceService.js` | Credit card balance check (4.2), `applyBankCreditLimit`, `settleFromBalance` |
| `services/plaidFileImportService.js` | `importFile` (validation, default start date, preview / apply, settlements, `plaid_file_imported`) |
| `services/plaidSettingsService.js` | Load/save/test/clear keys (encrypted secret), environment switch guard |
| `services/plaidSyncSchedulerService.js` | 5-minute tick: syncs banks older than interval − 3 min within active hours (business timezone); settings |
| `services/categorySuggestionService.getSuggestedCategories` | One grouped query for all inbox places (689 ms → 8 ms on production data) |
| `expenseService.getExpenses` / `fixedExpenseService` / `incomeService` | Attach `bankLink` / `bankConfirmation` for the UI |

**Sync rules:**
- **New rows:** pending and posted transactions are staged. A new Plaid transaction that matches an unclaimed bank-file row takes it over (2.7); one that matches a row kept from a disconnected connection re-attaches to it (2.2).
- **Updates and removals:** modified and removed rows only touch `status = 'new'`, except pending rows:
  - a posted transaction carrying `pending_transaction_id` replaces its pending row in place (keeping status and links);
  - a pending row that Plaid now sends as settled is updated and settled, reviewed or not; a settled row never goes back to pending;
  - a linked pending row whose amount changes is updated;
  - linked rows are returned as `settlements` and applied after the commit. The expense follows the bank if it still has the previous amount and isn't reimbursed or insurance-tracked; credit cards get `posted_date`;
  - a removed linked pending row gets `removed_at` and is reviewed as **Cancelled at bank** (Link to a settled row on the same account within 10 days and 25%, Keep, or Delete expense).
- **After the batch:** balances (`/accounts/get`), freshness (`/item/get`, institution status), settlements, then `settleFromBalance` for banks whose balance leaves pending out (only when the balances were refreshed in this sync).

## API (`/api/plaid`, behind `authMiddleware`; 503 when not configured except status and settings)

| Method | Path | Notes |
|---|---|---|
| GET | `/status` | `{ enabled, source, environment, trial, needsAttention, staleData }` |
| GET/PUT/DELETE | `/settings`; POST `/settings/test` | Keys; secret only ever masked |
| POST | `/link-token { itemId? }`; GET/POST `/items`; DELETE `/items/:id` | Connect (or update mode with `itemId`), list, disconnect |
| POST | `/items/:id/reconnected` | After update mode: clear the error, log, sync |
| POST | `/items/:id/refresh` | Ask Plaid to fetch now; `{ status: 'refreshing' \| 'needs_login' }` (2.8) |
| PUT | `/accounts/:id` | `{ paymentMethodId \| null }` |
| POST | `/accounts/:id/import-file` | `{ csv, fromDate?, dryRun? }`, 2 MB route-scoped JSON limit (2.7) |
| POST | `/sync` (`?ifStaleMinutes=N` for sync-on-open, background) | |
| GET | `/card-balances`; POST `/card-balances/:id/use-bank-limit` | Balance check (4.2) |
| GET/PUT | `/sync-settings` | Automatic sync schedule |
| GET | `/inbox?status=new\|ignored` | Rows with candidates and suggestions; `cancelled` for `new` |
| POST | `/inbox/:id/{add,match,match-fixed,match-income,add-income,cancelled,ignore,unignore}` | Decisions |

## Activity log and sync

| Event | Entity | When |
|---|---|---|
| `plaid_item_added` / `plaid_item_deleted` | plaid_item | Connect / disconnect |
| `plaid_item_updated` | plaid_item | Reconnected after a login error, or logged in again |
| `plaid_sync_failed` | plaid_item | A bank first goes into error |
| `plaid_account_updated` | plaid_account | Mapping changed |
| `plaid_sync_completed` | plaid_transaction | A sync changed staged rows (manual, scheduled, on open) |
| `plaid_file_imported` | plaid_transaction | A bank file added or updated rows |
| `plaid_transaction_updated` | plaid_transaction | Inbox decisions (`add`, `match`, `match_fixed`, `match_income`, `add_income`, `ignore`, `unignore`, `cancelled_keep`, `cancelled_delete`) and sync-driven `settled` / `pending_changed` / `settle_failed` |
| `settings_updated` | settings | `section: 'plaid'` (keys, never values) or `'plaid_auto_sync'` |

All `plaid_*` entity types route to the `plaid` window event. Consumers: `ImportInbox`, `BankConnections`, `useBankAccountLinks`, `usePlaidStatus` and `useCardBalanceChecks`. The records created or changed also log their own events (`expense_added`, `fixed_expense_updated`, …). Known gap: a sync whose only changes are re-attached rows or refreshed balances logs nothing, so other tabs don't refresh.

## Frontend (`components/bank-import/`)

- **`BankImportButton`:** header entry, hidden unless enabled, with the red attention / amber stale dot. It runs sync-on-open: on load, on tab visible (throttled to 5 min), and on modal open.
- **`BankImportModal`:** the Inbox and Connections tabs, portalled to `<body>`.
- **`ImportInbox`:** rows, filters, Add / Add income forms (place and category pre-filled), the Match picker (expenses, fixed expenses, income), the Cancelled-at-bank section, the Pending and From file badges.
- **`BankConnections`:** connect (Trial confirm), status chips, Reconnect / Log in again, freshness line, mapping, Import file, Sync now, last synced; contains `AutoSyncSettings` and `BankFileImport`.
- **`BankFileImport`:** file picker, preview, editable start date, Import.
- **`PlaidSettings`:** the Settings → Bank Import screen.
- **`bankConfirmation.js`:** pill states for the expense list and Fixed Expenses: `confirmed` green, `pending` yellow, `differs` / `cancelled` red-orange.
- **`cardBalanceCheck.js`**, **`CardBankBalance`** and `hooks/useCardBalanceChecks`: the balance check on the Financial card table and the card detail view.
- **`IncomeConfirmationIndicator`:** income has no pill, so it shows an icon.
- **`BankLinkedBadge`** with `hooks/useBankAccountLinks`: the Financial page badge on mapped payment methods.
- **`notifications/BankAttentionBanner`** with `hooks/usePlaidStatus`: the main-screen banner when a bank needs the user.

---

# Phase 0 findings (2026-11-02)

Production on the Trial plan: **Wealthsimple** (chequing, Visa, line of credit, 4 RRSP, 3 RESP) and **CIBC** (Mastercard). Measured with read-only calls (counts only).

| Measure | CIBC | Wealthsimple | Consequence |
|---|---|---|---|
| Login | Credentials, no OAuth | Credentials, no OAuth | Q1 closed: no `redirect_uri` needed; no consent expiry |
| Purchase date (`authorized_date`) | 20/20 (≈1.2 days before posting) | 0/86 | Wealthsimple expenses get the posting date |
| Pending | Marked `pending`; settles under a new id with `pending_transaction_id` | Sent as **settled** while still pending in the Wealthsimple app | CIBC: yellow → green. Wealthsimple: green at once; later amount changes arrive as *modified* (2.5 R10) |
| Balance includes pending | Yes, via `limit − available` | No (cached balance lags) | Balance check rules (4.2) |
| `merchant_name` | 18/20 | 51/86 | Place falls back to the raw description for ~40% of Wealthsimple rows |
| `merchant_entity_id` / logo / website | 9/20 | 17/86 | Merchant-id rules (5.2), logos |
| `personal_finance_category` | 20/20; 13 HIGH+ | 86/86; 31 HIGH+ (55 LOW) | Suggestions need confidence (5.1); classification (3.1) can use primary/detailed |
| Not-spending share | 1 LOAN_PAYMENTS | 10 TRANSFER_OUT, 7 TRANSFER_IN, 5 INCOME, 3 LOAN_PAYMENTS of 86 | ~30% of Wealthsimple rows aren't spending: Phase 3 |
| Location (city) | 18/20 | 0/86 | Low value |
| Extra products supported | Liabilities, Recurring, Transactions refresh | Investments, Transactions refresh (no Liabilities, no Recurring) | Phase 6 is per bank |
| Balances | every account | every account (incl. RRSP, RESP, LOC) | Phase 4 needs no extra product |

Balance check on the same day, done right (4.2 rules): CIBC tracker $1,554.40 = bank $1,554.40; WS VISA $2,129.92 vs $2,115.23. The difference is one $14.69 charge still pending at Wealthsimple. A naive comparison showed −$646.81 / −$1,000.00: it used the stored `current_balance`, which includes some future-dated expenses (2.4 R7), and CIBC's balance excludes pending.

# Production findings (2026-11-03 → 07)

What a week of real use showed; each one shaped 2.6–2.8 and the merge rules in 2.7.

| Finding | Evidence | Consequence |
|---|---|---|
| Both banks are **Classic** (credential) connections at Plaid; no OAuth in Canada | `institutionsSearch`: `oauth: false` for CIBC, Wealthsimple, Simplii | Outages and login prompts will recur; nothing to switch to |
| **Wealthsimple outage at Plaid**, Nov 3 → Nov 6 | `/item/get` last successful update stuck; institution status DOWN (`error_plaid`); our syncs kept succeeding with nothing new. A re-login didn't help; it recovered on its own | 2.6 "Not updating"; 2.7 file import as the fallback |
| **CIBC only gives Plaid data during a login** | New CIBC transactions arrived only right after a login, never from the scheduled syncs in between; the login expires ~24 h later (`ITEM_LOGIN_REQUIRED` at the next sync). `/transactions/refresh` returns `ITEM_LOGIN_REQUIRED` even minutes after a login. A login on a connection Plaid considers healthy fetched nothing; a login on one marked as needing a login fetched at once (Nov 6) | 2.8: Log in again = refresh request, then the login when needed |
| CIBC's pending charges arrive pending, then settle under a new id | As in Phase 0; the CIBC file then had Shoppers settled while Plaid still had it pending | 2.7: a file can settle a Plaid pending row |
| Wealthsimple never flags pending through Plaid, and its card balance leaves pending out | Plaid rows `pending = 0`, no `authorized_date`; the file marks them Pending; WS VISA differed from the tracker by exactly the pending charges | File pending rows stay pending after takeover; `settleFromBalance` settles them when the balance includes them |
| File vs Plaid dates | WS file date = purchase date, 0–1 day before Plaid's; CIBC file date = posting date = Plaid `date` | `dateKind` per format; ±3 days pairing; Plaid's `authorized_date` wins when present |
| Pairing quality on real data | WS card 51/51 and chequing 39/39 already-received rows paired exactly | Exact amount ±3 days is enough; the 25% tolerance only applies when one side is pending |
| Place names | Raw bank text matched the saved place for 32 of 78 reviewed rows; with learned places and the existing-place prefix, 57 of 78 | Inbox place suggestions (shipped in 1.21.1, a first step towards 5.2) |
| Plaid Dashboard limits on Trial | The Institution Status page isn't available on the Trial plan | 2.6 uses the API (`/item/get`, `/institutions/get_by_id`) |
| **Wealthsimple's Plaid `date` is mostly the purchase date** (Nov 7) | WS VISA: 45 of 58 rows have no `authorized_date`, 19 fall on a Saturday or Sunday, no `pending_transaction_id` ever; CIBC: 25 of 30 posted a day after authorization, none on a weekend | 1.24.1: a same-day date is evidence only from a bank whose dates are posting dates (`bankReportsPostingDates`: some later than the authorization date, at most 1 in 10 on a weekend) |
| **Plaid taking over a file row didn't update the posted date** (Nov 7 spot check) | Dollarama, added from a WS file dated Nov 5; Plaid took the row over with Nov 6, but the expense kept no posted date (only pending file rows passed dates on) | Fixed: a settled, linked file row passes Plaid's later date on (`postedDateOnly` settlement, `posted_date` log action) |

---

# Roadmap

| Phase | Goal | Depends on |
|---|---|---|
| **2** Foundation | Keep what Plaid sends; reconnect without new Trial slots; data freshness, bank file fallback, login-only banks (2.6–2.8, built); inbox badge; refactors and hygiene | — |
| **3** Money that isn't spending | Classify and record card payments, contributions, loan payments, refunds, transfers | 2.1, 2.4 |
| **4** Balances | Investment and loan values from bank balances; credit card balance check | 2.1 (3.2 makes 4.2 sharper) |
| **5** Less typing | Plaid categories, merchant rules, bulk actions | 2.1, 3.1 |
| **6** Extra Plaid products | CIBC statements and due dates (Liabilities); Wealthsimple contributions and holdings (Investments); fresh-data button | 2.2, 4.2 / 3.3 |
| **7** Webhooks (optional) | Near-instant sync for installs with a public hostname | 2.2 |

**Delivery:** one PR per numbered item. Release (`gh workflow run release.yml`, MINOR) after each phase, or after any item the owner wants in production sooner. Before each production deploy, take a DB backup (`VACUUM INTO`), and run full-suite validation with `.\scripts\run-test-summary.ps1`.

## Phase 2: Foundation

### 2.1 Keep everything Plaid already sends

**Why first:** Phases 3–5 all need data we receive on every sync and currently discard.

**Requirements**
1. Store, for every staged transaction:
   - `personal_finance_category` primary, detailed and confidence (**done with 3.2's groundwork**: migration `plaid_transactions_pfc_v1`, written on insert and every update path, `COALESCE` so a sync without it never clears it);
   - `merchant_entity_id`, `logo_url`, `website`, `original_description`;
   - `payment_channel`.
2. Store, for every account on every sync: `current`, `available`, `limit`, currency, and the time received. **Done with 4.2** (`plaid_account_balances_v1`); drop the `plaid_accounts` columns from `plaid_capture_v1`.
3. No behaviour change in this PR beyond showing a merchant logo (when present) in inbox rows.

**Design**
- **Migration `plaid_capture_v1`:**
  - `plaid_transactions` + `merchant_entity_id`, `logo_url`, `website`, `original_description`, `payment_channel` (all TEXT). The `pfc_*` columns already exist (`plaid_transactions_pfc_v1`).
  - `plaid_accounts` + `current_balance`, `available_balance`, `credit_limit` (REAL), `balance_currency`, `balance_as_of` (TEXT).
  - Same end state in `schema.js`.
  - Index `idx_plaid_transactions_merchant_entity` in the migration, because the column is migration-added.
- **Sync:**
  - `_fetchAllPages` already receives the accounts; `upsertAccount` writes their balances.
  - `applySyncBatch` writes the new transaction columns on insert and on update of `new` rows.
  - Request `include_original_description: true` via `options` on `/transactions/sync`.
- **Existing rows:** `pfc_*` stays NULL for rows staged before the migration (Q4: new rows only). A one-off backfill for **unreviewed** rows via `/transactions/get` (read-only, last 30 days) runs on the first sync after the migration. It is gated by setting `plaid_capture_backfill_done`.

**Tests:** capture on insert/update; reviewed rows unchanged; balance capture; backfill runs once.
**Docs:** DATABASE_SCHEMA, DATABASE_MIGRATIONS, PLAID_INTEGRATION (data section).

### 2.2 Reconnect expired logins (update mode) and item status

> **Status: mostly built (v1.18.0)**, after the 2026-11-03 CIBC incident (an expired login noticed only on the Connections tab, then fixed with disconnect, which cost a slot and left orphaned rows). Built without a migration:
> - `connectionStatus(item)` derives `ok` / `needs_login` / `gone` / `error` from `last_error` (`LOGIN_CODES`, `GONE_ITEM_CODES`); items carry `status`, `/status` returns `needsAttention`.
> - `createLinkToken({ itemId })` (update mode), `markReconnected(id)` + `POST /items/:id/reconnected`, `plaid_item_updated`.
> - Header attention dot (opens Connections), main-screen `BankAttentionBanner`, status chips + Reconnect, shared `usePlaidStatus` hook, `openBankImport(tab)` event.
> - Not in the original design, added for the incident: **re-attach on reconnect.** A disconnect + new connection re-sends ~30 days under new transaction ids; `applySyncBatch` re-attaches kept rows (`plaid_account_id IS NULL`, added/matched) by exact match, or a posted txn to a kept pending one (purchase date, name, amount ±25%), instead of inserting duplicates. `bankLink.disconnected` explains a pending pill that can't settle.
>
> **Still open:** `consent_expiring` / `/item/get` consent refresh (req. 1, 5; no current bank has an expiry, so low value), the `institution_down` split from `error` (2.6 shows Plaid's institution status instead), and the status column migration (only needed if status must survive something other than `last_error`, e.g. webhooks in Phase 7).
>
> **Verified in production** instead of the Sandbox `reset_login` check: CIBC went to `ITEM_LOGIN_REQUIRED` daily (Nov 3–6) and Reconnect repaired it each time on the same Item (Trial counter unchanged, sync cursor kept, no duplicates).

**Problem:** a password change or MFA reset makes the Item fail with `ITEM_LOGIN_REQUIRED`. Today the only fix is disconnect + reconnect, which costs a Trial slot and the cursor.

**Requirements**
1. Item health is tracked:
   - `ok`;
   - `needs_reauth` (`ITEM_LOGIN_REQUIRED`, `INVALID_CREDENTIALS`, `INVALID_MFA`, `USER_SETUP_REQUIRED`, `PENDING_DISCONNECT`);
   - `consent_expiring` (consent ends within 14 days; neither current bank has an expiry);
   - `error` (other item errors);
   - `institution_down` (transient, no user action).
2. Connections shows a status chip and **Reconnect** for `needs_reauth` / `consent_expiring`. It opens Link in **update mode** for the same Item: no new slot, cursor kept.
3. After a successful reconnect: status `ok`, `last_error` cleared, immediate sync.
4. The header icon shows an attention dot when any Item needs the user.
5. Consent expiry is refreshed from `/item/get` after connect, after reconnect and daily (first scheduler tick of the day).

**Design**
- **Migration `plaid_item_status_v1`:** `plaid_items` + `status TEXT NOT NULL DEFAULT 'ok'` (CHECK), `consent_expires_at`, `status_changed_at`. Backfill: rows with `last_error` → `error` or `needs_reauth` by code.
- **`plaidService`:**
  - `createLinkToken({ itemId })` sends update mode: `access_token`, no `products`.
  - `markReconnected(itemId)`: update mode has no public token to exchange.
  - `_classifyItemError(code)` replaces `setItemError`.
  - `refreshItemStatus(itemId)`.
  - `NEEDS_USER_CODES` in `findStaleItems` becomes `status = 'needs_reauth'`.
- **Routes:** `POST /link-token { itemId? }`, `POST /items/:id/reconnected`.
- **Activity log:** `plaid_item_updated` (reconnected; status changed to needs-reauth).
- **Sandbox path:** `/sandbox/item/reset_login`.

**Tests:** classification table; update-mode token has no products; reconnect doesn't increment the Trial counter; scheduler skips `needs_reauth`.
**Docs:** PLAID_INTEGRATION (Connections, Limitations), API, ACTIVITY_LOG, DATABASE_SCHEMA/MIGRATIONS.

### 2.3 Inbox count badge

**Requirements:** the header bank icon shows the number to review (status `new`, mapped accounts, not pending-cancelled; later only `review_bucket = 'spending'`), next to 2.2's attention dot (built; the count must not hide it).

**Design:**
- `GET /status` adds `toReview` and `needsAttention` (one indexed `COUNT(*)`).
- `BankImportButton` reloads them on the `plaid` / `expense` sync events.

**Tests:** counts; badge updates on `syncEvent`.
**Docs:** PLAID_INTEGRATION, USER_GUIDE.

### 2.4 Refactoring and cleanup

Planned now, because Phase 3 adds five more inbox actions and three more link tables. Each item is a separate commit with tests unchanged or extended.

| # | Item | Acceptance |
|---|---|---|
| R1 | Split `plaidInboxService` (652 lines) into: `plaidInboxService` (listing, candidates, suggestions), `plaidReviewService` (decisions and `_logReview`), and `plaidSettlementService` (`applySettlements`, `resolveCancelled`). The controller and `plaidService` call the new modules | Same behaviour; each file under ~300 lines |
| R2 | Move link-table access (fixed, income, and the Phase 3 links) from `plaidRepository` (922 lines) to `plaidLinkRepository`, with a shared `linkTransaction(tx, …)` / `unlinkTransaction(…)` pattern. Also split `applySyncBatch` (~150 lines) into one handler per case (pending replacement, file takeover, reconnect re-attach, insert, settle in place, update) | New link tables need no copy-paste |
| R3 | Split `ImportInbox.jsx` (445 lines) and `BankConnections.jsx` (400 lines, 9 `useState`): `inbox/InboxRow`, `AddExpenseForm`, `AddIncomeForm`, `MatchPicker`, `IncomeCandidates`, `CancelledRow`. Replace the action `if/else` chain with an action → API map | Same tests pass; adding an action is one map entry plus one component |
| R4 | Shared ranking helpers in `plaidMatching`: name tokens, learned names keyed by description, month windows. Reused by income now and by contributions and loans in Phase 3 | Income ranking PBT unchanged |
| R5 | `addAsExpense`: create the expense and link it in one DB transaction (`expenseService.createExpense` with a connection, as future-month creation does). **Interim (1.21.4):** a failed link deletes the expense and returns 409 | No orphan expense if linking fails |
| R6 | Shared backend Plaid test fixtures (`backend/test/plaidFixtures.js`: `account`, `txn`, `page`, `stage`, `connect`) | Duplicated helpers removed from the three Plaid test files |
| R7 | `payment_methods.current_balance` is maintained incrementally: expense create adds the amount whatever the date, while payments recalculate as of today. The screens already compute "as of today" (`getAllWithExpenseCounts`, `getAllBalanceTypes`); the stored value is only read by the reminder fallback (no statement) and the edit form. Make the stored value consistent: recalculate as of today on every change, or stop treating it as a balance | Reminder fallback and stored value equal the computed as-of-today balance (test with a future-dated expense) |
| R8 | Remove leftover PoC wording and dead code found during R1–R3. From the 1.21.4 audit: one `fail()` helper (defined in 5 files), shared `round2`/`cents`, the `0.25` and `'file:%'` literals replaced by `PENDING_AMOUNT_TOLERANCE` / `FILE_ID_PREFIX`, misplaced JSDoc in `plaidRepository`, one shared Plaid status fetch instead of one per hook | No `PoC` in user-facing text |

### 2.5 Data hygiene

1. **Retention (Q9):** the daily scheduler deletes `ignored` (and Phase 3 `not_expense` reviewed) rows older than 2 months by transaction date. Never linked rows. Setting `plaid_retention_months`.
2. **Unknown accounts:** the "hidden, map accounts" count covers only existing unmapped accounts; rows from accounts Plaid never listed are counted separately.
3. **Settings across tabs:** `plaid-settings-changed` also reaches other tabs (log `settings_updated` → route `settings` to that window event).
4. **Pending backfill on upgrade (R9):** the v1.17.0 upgrade didn't show charges already pending (the sync cursor had passed them). Productize the one-off fix: on the first sync after `plaid_transactions_pending_v1`, call `/transactions/get` (last 21 days) per Item once and insert missing pending rows. Gated by `plaid_pending_backfill_done`.
5. **Modified amounts on reviewed rows (R10):** Wealthsimple sends still-pending charges as settled, so a later amount change arrives as *modified* on an added/matched row, which is ignored today. Apply the `pending_changed` rule to any linked row: follow the bank if the expense still has the previous bank amount; log it. **Partly done (1.21.0):** a linked row still pending (e.g. from a Wealthsimple file) follows a *modified* that settles it, amount included; a *modified* amount on a linked row that is already settled is still ignored.
6. **Refresh events (from the 1.21.4 audit):** a sync whose only changes are re-attached rows or refreshed balances logs no `plaid_sync_completed`, so other tabs and the card balance check don't refresh. Count `reattached` in the totals and log balance-only changes.

**Tests:** retention keeps linked rows; backfill runs once; modified linked row follows the bank only when untouched.
**Docs:** PLAID_INTEGRATION (Staging rules, Limitations).

### 2.6 Data freshness ("Not updating")

> **Status: built.** Added after the 2026-11-04 Wealthsimple outage: Plaid couldn't fetch from Wealthsimple for 20+ hours (institution status DOWN, `error_plaid: 1`) while our syncs kept succeeding with nothing new, so the app looked healthy.

- **Why:** a sync only proves our side works. Plaid's own fetch from the bank is separate and invisible without asking.
- **Capture:** after each sync, `_refreshHealth` calls `/item/get` (`status.transactions.last_successful_update` / `last_failed_update`) and `/institutions/get_by_id` with `include_status` (`transactions_updates.status` / `last_status_change`). Both free. Stored by migration `plaid_item_freshness_v1`; failures keep the previous values and never fail the sync.
- **Status:** `connectionStatus` returns `stale` when there is no `last_error` and `bank_updated_at` is over 12 hours old (`STALE_AFTER_HOURS`). Plaid's institution rating is shown but never used to flag: it showed CIBC DOWN for weeks while CIBC worked.
- **UI:** `/status` adds `staleData`; amber header dot (red `needsAttention` wins); Connections shows a "Not updating" chip, "Bank data updated by Plaid: <time>" for every bank, and Plaid's rating when it's down or degraded. Stale banks keep syncing automatically.
- **Not here:** the Dashboard's Institution Status page isn't available on the Trial plan, which is why this uses the API.

### 2.7 Bank file import (fallback)

> **Status: built.** Added during the Nov 2026 Wealthsimple outage at Plaid (classic connection, 0% success) and CIBC's daily login prompts: both banks are Classic (credential-based) at Plaid, with no OAuth option in Canada yet, so outages will recur.

- **Formats** (`utils/bankFileImport.js`, detected from content):
  - Wealthsimple credit card (`transaction_date, transaction_type, status, merchant, amount, …`) and Wealthsimple chequing (`…, transaction_time, account_number, …, payee, amount`). `dateKind: purchase`. `status = Pending` → `pending = 1` (better than Plaid for Wealthsimple).
  - CIBC credit card: headerless `date, description, debit, credit, masked card`. Debit → +, credit → −. `dateKind: posted`, never pending. Can list several cards (second cardholder); one must end with the account mask.
  - Amounts are converted to Plaid's sign.
- **Identity:** `transaction_id = file:<sha256>` of format, account, date, amount cents, the row's identifying fields and its occurrence among identical rows; status excluded, so pending → completed updates in place.
- **Same transaction** (`sameTransaction`): exact amount with dates within ±3 days; or, if either is pending, the same sign, amount within 25% and similar names (first meaningful word). `pairRows` pairs one-to-one, globally: exact amounts first, then the smallest date gap, then the smallest amount difference.
- **Merge rules** (both directions, `mergeFileIntoRow` / `mergePlaidIntoFileRow`): Plaid's id wins. Pending → settled is one-way; settled evidence is a file's settled row, or Plaid's settled flag only for items that report pending at all (`bankReportsPending`; Wealthsimple never does, so a file's pending row stays pending after takeover until Plaid sends a `modified`, a newer file shows it Completed, or the balance shows it posted: after each sync whose `/accounts/get` succeeded, `plaidCardBalanceService.settleFromBalance` settles the `settling` rows left out of the "still pending" set when exactly one subset of them explains the card difference to the cent; cards whose balance includes pending, stale/erroring banks and ambiguous fits are skipped). Amount: the settled version's. `authorized_date`: Plaid's, else a purchase-dated file's. `date` (posted): Plaid's, or a posted-dated file's when the file settled the row. `merchant_name`: Plaid's, else the file's. Review status and expense link never change. A row settled by a file keeps Plaid's pending id, so Plaid's posted version (with `pending_transaction_id`) still replaces it in place.
- **File import** (`planFileImport`, one DB transaction in `applyFileImport`): same key → unchanged / update; else paired existing row (Plaid or older file row) → merged (counted `updated` if anything changed, else `alreadyFromBank` / `unchanged`); else insert. A settle on a row linked to an expense produces a settlement (`applySettlements`: amount, card posted date).
- **Takeover:** `applySyncBatch` → `_findFileRow`: a new Plaid transaction that is the same transaction as an unclaimed file row on the account takes it over via `mergePlaidIntoFileRow`. Counted as `fromFile` (and `updated`). Plaid pending for an already settled row is ignored (one-way).
- **Default start date:** the first date Plaid sent for the account (older history is already in the tracker), else 30 days back. Verified on production data: WS card 51/51 and chequing 39/39 rows already from Plaid paired exactly (dates 0-1 day apart); the leftovers were exactly the transactions missing since the outage. CIBC: the file settled Shoppers (pending at Plaid) keeping Plaid's purchase date.
- **API/UI:** `POST /accounts/:id/import-file { csv, fromDate?, dryRun? }` (JSON, 2 MB limit on that route only); Connections → Import file (mapped accounts) with a preview; Inbox "From file" tag; `plaid_file_imported` event. In the card balance check an added/matched row that exists only in a file is a `from_file` cause (Plaid's balance doesn't include it yet); unreviewed or ignored file rows aren't causes. The check warns when the bank's balance is stale (`utils/plaidFreshness.js`, shared with `connectionStatus`).
- **Validation (1.21.4):** a row with an empty amount, or a CIBC row with neither debit nor credit, is rejected (line number in the error), not imported as $0.00. The start date in the preview applies on Enter / leaving the field; older preview responses are ignored.
- **Not handled:** removing rows that disappear from a later export.

### 2.8 Banks that only update during a login ("Log in again")

> **Status: built** (1.21.4 button; #462 refresh request). From the CIBC findings above.

- **Problem:** CIBC lets Plaid fetch only during a login, and only when the connection is marked as needing one. Scheduled syncs find nothing between logins; the login expires after ~24 h. A login through update mode on a connection Plaid still considers healthy fetched nothing (tried Nov 6).
- **Button:** **Log in again** on a bank with status `stale` (Not updating). Reconnect stays for `needs_login`.
- **Flow:** `POST /items/:id/refresh` → `requestRefresh` calls `/transactions/refresh`.
  - Accepted → `{ status: 'refreshing' }`: Plaid fetches in the background; new rows arrive with the next sync.
  - `LOGIN_CODES` (CIBC, always) → the item's `last_error` is set (no activity log entry; the login that follows logs `plaid_item_updated`) → `{ status: 'needs_login' }` → the frontend opens Link update mode at once → `markReconnected` syncs and reports what came in. Verified in production: the login then brought the missing CIBC transactions.
  - Other Plaid errors → 502, the bank is left as it was.
- **Cost:** `/transactions/refresh` works on the Trial plan; on paid plans it may be billed per call. It's only ever called from the button, never automatically.
- **Fallback:** the file import (2.7) works whatever the bank's login state.

### Phase 2 exit criteria
- [ ] 2.1 capture and backfill in production; PFC and balances visible in the DB for new rows. *(Balances done with 4.2; PFC and the other transaction fields not started.)*
- [x] 2.2 an expired login repaired with Reconnect, without a new Trial slot. *(Verified in production on CIBC instead of a Sandbox `reset_login`; consent expiry still open, low value.)*
- [ ] 2.3 badge counts match the inbox.
- [ ] R1–R8 merged; no Plaid source file over ~350 lines. *(Not started; files have grown: `plaidRepository` 922, `plaidInboxService` 652, `plaidService` 618 lines.)*
- [ ] 2.5 items merged. *(R10 partly done; the rest not started.)*
- [x] 2.6 a stalled bank shows Not updating, from Plaid's own fetch time.
- [x] 2.7 Wealthsimple and CIBC files imported in production, merged with Plaid in either order without duplicates.
- [ ] 2.8 Log in again brings CIBC transactions without a new Trial slot. *(The mechanism was verified by hand on Nov 6: refresh → `ITEM_LOGIN_REQUIRED` → Reconnect brought the missing transactions. #462 shipped in 1.22.0: tick once the button has brought CIBC transactions in production in one go.)*
- [ ] Docs per the [matrix](#documentation-matrix); full-suite validation.

## Phase 3: Money that isn't spending

About 30% of Wealthsimple rows are transfers, card payments, income or loan payments. Today they can only be ignored, and the money movement goes unrecorded.

### 3.1 Classification: To review / Not expenses

**Requirements**
1. Each staged row gets a bucket:
   - **Not expenses:** `TRANSFER_IN`, `TRANSFER_OUT`, `INCOME`, `LOAN_PAYMENTS` (incl. `…_CREDIT_CARD_PAYMENT`), `BANK_FEES` interest, and credits on credit card accounts;
   - **To review:** everything else.
2. Inbox filters: **To review** (spending), **Not expenses**, **Ignored**. The badge (2.3) counts To review only.
3. Rows can be moved between buckets (an override that survives *modified* syncs).
4. **Deposits keep working as today:** confirm income / add income (2.0 of the old numbering).

**Design**
- **Migration:** `plaid_transactions` + `review_bucket TEXT NOT NULL DEFAULT 'spending'` (CHECK), `bucket_overridden INTEGER DEFAULT 0`, `ignore_reason TEXT`, `link_type TEXT` (`expense|fixed|income|card_payment|contribution|loan_payment|refund`).
- **Pure `plaidClassification.js`:** `bucketFor({ pfcPrimary, pfcDetailed, amount, accountType })` and `kindFor(...)` (`card_payment` / `transfer` / `income` / `loan_payment` / `fee`). Computed on insert and on update of `new` rows unless overridden. **`kindFor` exists with `card_payment` only** (built for 3.2): the category on either side; on a card, a credit whose text says payment/paiement/pmt; never text alone off the card (every Wealthsimple bill payment reads "<payee> - Bill payment"). `looksLikeCardPayment` is a weaker, hint-only version for chequing debits.
- **Review service:** `markReviewed(id, reason)` (ignore with a reason) and `setBucket(id, bucket)`.

**Tests:** classification table (PBT over sign × account type × PFC); override survives modified.

### 3.2 Card payments

> **Status: built** (#466). As built, where it differs from the design below:
> - Data access is in its own `plaidCardPaymentRepository` and the helpers shared with the inbox (per-row lock, errors, review log) are in `plaidInboxSupport`, so neither `plaidRepository` nor `plaidInboxService` grew. One entry point, `plaidCardPaymentService.act(id, body)`, dispatches by the row's side.
> - The card view gets `bankLinks` per payment from `GET /api/payment-methods/:id/credit-card-detail` (the endpoint it loads), not from `getPaymentHistory`.
> - `GET /inbox` rows carry `cardPayment` (`side`, `kind`, `looksLikeCardPayment`, `pairCandidates`, `paymentCandidates`) and the response carries `unconnectedCards`.

A payment leaves chequing as a debit and arrives on the card as a credit. Both bank rows resolve to **one** `credit_card_payments` row. Real rows (Oct 2026):

| Side | Account | Bank text | Amount |
|---|---|---|---|
| Card | WS VISA | "Credit Card Payment - From: Cash" | −$3,471.31 |
| Chequing | WS chequing | "Credit Card Payment" | +$3,471.31 |
| Card | CIBC MC | "PAYMENT THANK YOU/PAIEMEN T MERCI" | −$4,104.59 |
| Chequing | WS chequing | place "CIBC", raw "CIBC MASTERCARD - Bill payment" | +$4,104.59 |

The chequing text never reliably names the card, and Wealthsimple writes every bill payment as "<payee> - Bill payment". So the link between the two sides is **same cents, opposite sides, ±5 days**; category and text only label rows.

Terms: a **card row** is on an account mapped to a `credit_card` payment method; a **funding row** is on any other mapped account.

**Requirements**
1. **Card side records** (Q3). **Every** settled credit on a card row offers **Record payment**; `kindFor = card_payment` only adds the "Card payment" badge and makes it the primary action. It creates a `credit_card_payments` row (bank amount, card row's posted date) through `creditCardPaymentService.recordPayment`, so the balance, statement and activity log behave as for manual entry.
2. **Both sides at once:** when one funding debit pairs with the card credit, Record payment offers "Also mark the <account> debit on <date> as this payment", checked only when there is exactly one pair. Several pairs: listed, none preselected.
3. **Already recorded by hand** (same card, same cents, ±5 days, no card-side link): Record payment warns and offers **Match**.
4. **Funding side links:** a debit with a payment candidate (same cents, ±5 days, no funding-side link) offers **Link to card payment**. It never creates a payment, except:
5. **Card not connected:** when a credit card payment method has no bank account mapped, a funding debit can **Record payment to…** that card (no card-side row will ever arrive).
6. **Hints, not actions:** a funding debit that pairs with a card credit, or looks like a card payment, says where to record it. **Add** stays, but its form warns that adding a card payment as an expense counts the spending twice.
7. **Never twice:** at most one card-side and one funding-side link per payment.
8. **Undo:** deleting the payment returns its bank rows to the inbox. The card view marks bank-linked payments and its delete dialog says so.
9. **Pending** rows can't be recorded or linked until they settle.
10. **Balance check:** a payment with a card-side link is not a `tracker_only` cause; its card row is no longer unreviewed.

**Design:**
- `plaid_card_payment_links(plaid_transaction_id UNIQUE → CASCADE, credit_card_payment_id → CASCADE, side CHECK IN ('card','funding'), created_at, UNIQUE(credit_card_payment_id, side))`, in `schema.js` only (new tables need no migration).
- Trigger `plaid_transactions_unlink_on_card_payment_delete` (BEFORE DELETE ON `credit_card_payments`) sets linked rows back to `new`; it also fires when a card's payment method is deleted and its payments cascade. Linked rows are `matched` with `expense_id = NULL`, like fixed and income links.
- Pure rules in `plaidMatching`: `pairCardPayments(rows)` (symmetric, no auto-pick) and `findPaymentCandidates(row, payments)` (side rules).
- `plaidCardPaymentService` (not in `plaidInboxService`, which R1 still has to split): `record`, `recordFromFunding`, `link`. Payment, links and row statuses commit in one transaction through a hook inside `creditCardPaymentService.recordPayment` (`runInTransaction` can't nest). Shares the inbox's per-row lock.
- `POST /inbox/:id/card-payment { alsoLinkId? | paymentMethodId? | creditCardPaymentId? }`. The row's side decides which action; mismatched bodies are 400.
- Events: `credit_card_payment_added` (existing), plus `plaid_transaction_updated` (`action: 'card_payment'`) per linked bank row.
- `getPaymentHistory` adds `bankLinks` for the card view badge.

**Limitations:** one debit paying two cards, or one card paid from two debits, isn't paired; exact cents only.

**Tests:**
- The four rows above as fixtures.
- Record creates exactly one payment, updates the balance and links one or both rows; a conflicting second row rolls the payment back.
- Match; funding Link; second link on either side 409; Record payment to… refused for a connected card.
- Delete trigger, including the payment-method cascade.
- Balance check has no cause for a card-linked payment.
- PBT for pairing symmetry and the window.

### 3.3 Contributions close the loop on planned savings

The budget plan already has monthly allocations ("RRSP $300", optionally linked to an investment via `budget_allocations.investment_id`). Range views already compare planned savings with "saved" (income − fixed − variable). What's missing is whether the contribution **happened**.

**Requirements**
1. A debit of kind `transfer` offers **Record contribution**, with the month's allocations ranked by:
   - learned description;
   - investment or allocation name tokens ("RRSP", "TFSA");
   - exact amount;
   - month window (±3 days at the boundary).

   Several contributions can count towards one allocation.
2. **Without Plaid:** **Mark contributed** on an allocation in the Plan tab (principle 1).
3. **Plan tab:** "Planned $300 · Contributed $300 ✓" or "$150 of $300". `contributed` next to `allocated`.
4. **Range views** (`/budgets/history`, `period-summary`, `annual-summary`) add `contributed`.
5. **Contributions are never spending.**

**Design:**
- `investment_contributions`:

  | Column | Notes |
  |---|---|
  | `id`, `year`, `month` | |
  | `allocation_id` | SET NULL |
  | `investment_id` | SET NULL |
  | `date`, `amount > 0` | |
  | `source` | `manual` \| `bank` |
  | `plaid_transaction_id` | UNIQUE, SET NULL |
  | `notes`, `created_at` | |

  A delete trigger returns the bank row to the inbox.
- Carried-forward allocations (no `id`) are persisted first.
- Endpoints `POST /inbox/:id/contribution`, `GET|POST|DELETE /api/budgets/contributions`.
- Events `investment_contribution_added|deleted` (entity `budget`).

**Tests:** ranking; partial sums; carry-forward persisted; range totals.

### 3.4 Loan and line-of-credit payments

**Requirements**
1. A debit of kind `loan_payment` with **no** matching loan-linked fixed expense offers **Record loan payment**. Active loans are ranked by:
   - linked to a fixed expense on this payment method;
   - name tokens;
   - a similar last payment.
2. Created through `loanPaymentService.createPayment` (validation, mortgage snapshot, event) with the bank's date and amount.
3. **Duplicates:** an existing payment for that loan with the same amount ±5 days offers **Match**. A matching loan-linked fixed expense offers **Confirm fixed expense** first (3.5 then logs the payment).

**Design:** `plaid_loan_payment_links`, an unlink trigger on `loan_payments` delete, endpoint `POST /inbox/:id/loan-payment`.

### 3.5 Loan payments from confirmed fixed expenses (old 4.1)

**Today:** `autoPaymentLoggerService` suggests a payment on the due day, for the planned amount.

**Requirements**
1. Confirming a **loan-linked** fixed expense also logs the loan payment with the bank's landing date and amount:
   - **Ask:** pre-checked in the confirm dialog (the default);
   - **Always:** a setting.
2. `getPendingAutoLogSuggestions` skips fixed expenses with a bank-confirmed loan payment that month.
3. If a payment for that loan already exists within ±5 days, offer **Link to existing payment**.
4. Deleting the fixed expense keeps the loan payment; deleting the payment clears the link.

**Design:**
- `plaid_fixed_expense_links` + `loan_payment_id` (SET NULL).
- `createPaymentFromFixedExpense(fixedExpense, date, { amount })`.

### 3.6 Refunds as reimbursements

**Requirements**
1. A refund (credit, bucket spending) offers **Apply to an expense**. Candidates: same payment method, same merchant (place or `merchant_entity_id`), within 90 days before, with charged amount ≥ refund.
2. Applying sets `original_cost` and `amount` via `expenseService.updateExpense` (card balance, log), `link_type = 'refund'`.
3. **Full refund:** ask each time whether to delete the expense or keep it and ignore the refund (Q5).
4. Insurance-tracked medical expenses are excluded.

### Phase 3 exit criteria
- [ ] Inbox shows To review / Not expenses.
- [x] A real card payment recorded from the card side, with the chequing side linked. *(WS VISA $3,471.31 and CIBC MC $4,104.59 on Oct 30, both sides linked.)*
- [ ] A contribution recorded against an allocation, shown in the Plan tab.
- [ ] A loan payment recorded.
- [ ] Docs per the matrix; full-suite validation.

## Phase 4: Balances

### 4.1 Linked balances: investments, loans, lines of credit

**Decisions (owner):**
- The bank fills empty months and keeps the current month updated; it never overwrites a hand-entered value (Q8).
- Several bank accounts can sum into one item.
- RESPs stay unlinked (the `investments.type` CHECK allows TFSA/RRSP only; Q13).

**Requirements**
1. Connections: each account links to what it represents, by Plaid type:
   - `depository` / `credit` → payment method;
   - `investment` → investment;
   - `loan` → active loan;
   - or *Don't link*.
2. After each successful sync, for each linked item, the current business month's row is created, or updated if bank-sourced:
   - **Investments** (`investment_values`): the sum of `current`.
   - **Loans** (`loan_balances.remaining_balance`): `rate` is carried from the latest row. With no earlier row, nothing is written and the loan shows "Enter a balance and rate once to start automatic updates".
3. **Hand edits:** a hand-edited row becomes manual; deleting it lets the bank fill it again.
4. **Partial data:** if one bank of a summed item failed or has no balance, skip the update.
5. **No backfill:** the first sync in a new month starts that month; earlier months are never backfilled.
6. **Financial page:** bank badge and "Bank: $X · as of 3:20 pm" on linked investments and loans.
7. **Reminders:** the monthly value reminders are satisfied by bank rows (verify `reminderService`).

**Design:**
- **Migration:**
  - `plaid_accounts` + `investment_id`, `loan_id` (SET NULL; at most one target per account, enforced in the service);
  - `investment_values` and `loan_balances` + `source TEXT NOT NULL DEFAULT 'manual'`.
- **`plaidBalanceService.applyLinkedBalances(itemId)`** after `syncItem`. Writes go through `investmentValueService` / `loanBalanceService` with `source: 'bank'`, and their per-row events are suppressed. One `plaid_balances_updated` summary per changing sync (entities `investment_value` / `loan_balance`, so the Financial page refreshes).
- **Mapping API:** `PUT /accounts/:id { paymentMethodId? | investmentId? | loanId? }`, validated against the account type.
- **Frontend:** a grouped dropdown, and `useBankAccountLinks` extended to investments and loans.

**Tests:** summing; partial skip; never-overwrite-manual (PBT over sequences); rate carry-forward; month rollover; one summary event; nothing without Plaid.

### 4.2 Credit card balance check, utilization, limit

> **Status: built ahead of Phase 2** (see the order change under Status). As built:
> - `plaid_account_balances_v1` stores balances on every sync: `syncItem` calls `/accounts/get` (free; Plaid's cached balances) after the batch, because `/transactions/sync` only lists accounts that had transactions in the response. Found in production right after 1.19.0, where quiet syncs left the balances empty.
> - `plaidCardBalanceService.getCardBalances()` → `GET /api/plaid/card-balances`; `POST /card-balances/:id/use-bank-limit`.
> - Causes come from pairing bank rows (`new` **and `ignored`**: an ignored refund is a classic cause) with unlinked tracker expenses and card payments since the bank's first date: same signed amount within 5 days, then one tracker entry against two bank rows (split Amazon charges). Leftovers are `bank_only` / `tracker_only` / `settling` causes with their effect, plus `from_file` (in the tracker from a file-only row Plaid hasn't sent, so not in Plaid's balance; unlinked file rows aren't causes but still pair with tracker entries), `cancelled` (linked pending charge the bank dropped), `fixed_expense` (charge confirmed as a fixed expense; fixed expenses aren't in the card balance) and `credit_balance` (tracker balance is clamped at $0); the rest is `unexplained`. With a user-entered statement as the balance anchor, only activity posted after its cycle end is considered.
> - UI: the Financial page card table colours a linked card's Current balance with the expense list's bank pill classes (`cardBalanceProps`: `bank-pill-confirmed` / `bank-pill-differs`, details in the hover text). In the card detail view (`CardBankBalance.jsx`) the check is folded into the existing cards: a bank line in Current Balance, causes only when it differs, Use bank limit in the Credit Limit card. Utilization stays on the existing Credit Limit card (one figure, from the tracker balance).
> - Verified on production data: CIBC and Wealthsimple both matched to the cent.
> - **Stale bank data (1.21.0):** `bankError` warns when the bank isn't syncing or Plaid hasn't had new data for over 12 hours, because the bank side is then older than the tracker side.
> - **Settling from the balance (1.21.3):** for a card whose bank leaves pending out of its balance (Wealthsimple: `includesPending` false), after each sync whose `/accounts/get` succeeded, `settleFromBalance` marks posted the `settling` charges outside the one subset that explains the difference to the cent (≤ 12 charges; ambiguous or no exact fit → nothing; stale or erroring bank → nothing). A $0 difference counts too (the empty subset: all of them posted); until 1.24.5 it was skipped because the card status was `match` (Sobeys stayed pending after Wealthsimple posted it). Settlements go through `applySettlements`. On production data it settled the two Wealthsimple charges that had posted and kept the one still pending.
>
> **As built vs the requirements below:** "settling" means a linked pending charge on a bank whose balance excludes pending (not "linked in the last 2 days"); unrecorded card payments show as `bank_only` credits until recorded (3.2, built: a payment recorded from the inbox is linked to its bank credit and is no longer a cause). The response is `{ paymentMethodId, name, accounts, itemIds, status, bank: { owed, includesPending, asOf, currency }, tracker, difference, futureDated, causes, unexplained, awaitingMatch, splitCharges, limit, bankError }`.

**Requirements**
1. **Tracker side:** the balance as of today (business date), as the Financial page already computes it (`paymentMethodService.calculateCurrentBalance`). Never the stored `current_balance` (2.4 R7).
2. **Bank side:**
   - owed including pending = `limit − available` when both are present (CIBC);
   - otherwise `current`, labelled "may exclude charges still pending" (Wealthsimple).
3. **Show three numbers:** bank, tracker as of today, and future-dated entries ("+ $1,250.33 dated after today").
4. **Classify the difference:**
   - within expenses linked in the last 2 days → "settling";
   - otherwise list likely causes: unreviewed inbox rows on that card, and unrecorded card payments (3.2).
5. **Utilization** (owed ÷ limit) on the card row.
6. **Limit:** offer to fill `credit_limit` from the bank when it's empty or different. Never silently.

**Design:**
- `GET /api/plaid/card-balances` → per mapped card `{ bank, bankIncludesPending, tracker, futureDated, settling }`.
- Shown on the Financial page card row and the credit card detail view.

**Tests:** both bank styles; future-dated separation; settling window.

### Phase 4 exit criteria
- [ ] Production RRSP and LOC values update from bank balances without overwriting a hand-entered month.
- [x] Card balance check matches the Phase 0 manual result. *(Both cards matched to the cent in 1.19.0; differences since then are fully explained by causes.)*
- [ ] Docs per the matrix.

## Phase 5: Less typing

### 5.1 Plaid categories as suggestions
1. Map PFC (detailed first, then primary) to `CATEGORIES`, used after place history. Only `HIGH` / `VERY_HIGH` confidence.
2. The map lives in code (`plaidCategoryMap.js`), plus overrides in `plaid_category_overrides(pfc_detailed PRIMARY KEY, category)`.
3. Initial map (verify against the taxonomy):

   | Plaid category | Tracker category |
   |---|---|
   | `FOOD_AND_DRINK_GROCERIES` | Groceries |
   | other `FOOD_AND_DRINK_*` | Dining Out |
   | `TRANSPORTATION_GAS` | Gas |
   | other `TRANSPORTATION_*` | Automotive |
   | `RENT_AND_UTILITIES_RENT` | Housing |
   | other `RENT_AND_UTILITIES_*` | Utilities |
   | `GENERAL_SERVICES_INSURANCE` | Insurance |
   | `PERSONAL_CARE_*` | Personal Care |
   | `…CLOTHING_AND_ACCESSORIES` | Clothing |
   | `ENTERTAINMENT_*` | Entertainment |
   | `…PET_SUPPLIES` | Pet Care |
   | `…DONATIONS` | Tax - Donation (suggestion only) |
   | `MEDICAL_*` | none |

### 5.2 Merchant rules
0. **Built first step (1.21.1):** the Inbox pre-fills the place chosen before for the same cleaned bank description (store numbers, `- Purchase`-style suffixes and province removed), else the longest existing place the description starts with, else the bank's text (`utils/placeSuggestion.js`). Rules below add explicit, editable mappings and categories on top.
1. **Match on:** `merchant_entity_id` when present (stable across description variants), else description text (equals / starts with / contains). Optionally limited by payment method and amount range.
2. **A rule sets:** place, category, notes, action (`suggest` or `not_expense`).
3. **Learned:** after Add with a changed place or category, offer "Always use …".
4. **Managed** in Settings → Bank Import → Rules (list, edit, test against recent rows). Rule places respect place-name standardization.
5. **Design:**
   - Table `plaid_merchant_rules` (match fields, targets, action, priority, enabled).
   - Pure `applyRules(txn, rules)`: most specific first (entity id > equals > starts with > contains; scoped before global; priority; longest text). PBT for determinism and precedence.
   - Events `plaid_rule_added|updated|deleted`.

### 5.3 Bulk actions
- Select rows (all in filter).
- Bulk **Add** (pre-filled; rows without a category are skipped and reported), **Ignore** and **Mark reviewed**.
- `POST /inbox/bulk { action, ids, overrides? }` returns per-row results, with one event per row.

**Not building:** auto-add (Q6).

## Phase 6: Extra Plaid products (per bank, after 2.2)

Each needs a one-time update-mode consent for that bank (`additional_consented_products`, no new slot; Q7) and is offered only where the bank supports it.

### 6.1 Liabilities (CIBC)
1. **Data:** last statement balance and date, minimum payment, next due date, APR, last payment.
2. **Statement:** for the matching billing cycle (end date ±2 days), "Bank: $X vs calculated $Y". **Use bank amount** sets `actual_statement_balance` (`balance_source = 'bank'`); a user-entered value is never overwritten.
3. **Reminders:** due date and minimum payment feed the payment reminders when no user value exists.
4. **Storage:** `plaid_liability_snapshots` (13 months); `credit_card_billing_cycles` + `balance_source`.
5. **Wealthsimple** isn't supported: its cards stay manual.

### 6.2 Investments (Wealthsimple)
- **Contributions inside the brokerage** (they never touch chequing) come from investment transactions and feed 3.3's `investment_contributions` with `source = 'bank'`.
- **Holdings and cost basis:** optional, display only.

### 6.3 Ask the bank for fresh data
- **Partly built as 2.8:** `requestRefresh` (`/transactions/refresh`) behind Log in again on a stale bank; never automatic.
- **Still open:** a Sync now option for banks that accept the refresh without a login, with a cooldown of 1 per Item per hour (billed per call on paid plans).
- **History:** tried 2026-11-03 (Trial): Wealthsimple returned `INTERNAL_SERVER_ERROR` (Plaid's Wealthsimple connection was going down), CIBC `ITEM_LOGIN_REQUIRED`. On Nov 6, CIBC returned `ITEM_LOGIN_REQUIRED` minutes after a login; that's what 2.8 builds on. Not yet seen accepted by a healthy Item.

## Phase 7: Webhooks (optional)

For installs with a public HTTPS hostname. The owner's install sits behind a Cloudflare Tunnel.

1. **Settings → Bank Import → Webhooks:**
   - off by default;
   - a URL `https://<host>/api/plaid/webhook/<random-path>`, with **Generate path**;
   - **Send test** (Sandbox `fire_webhook`).
2. **Registering the URL:** new and reconnected Items register it; existing Items use `/item/webhook/update`.
3. **Handled webhooks:**

   | Webhook | Action |
   |---|---|
   | `SYNC_UPDATES_AVAILABLE` | `syncItem`, debounced 30 s |
   | `ITEM` errors, expiration, `LOGIN_REPAIRED`, `USER_PERMISSION_REVOKED` | Item status (2.2) |
   | `LIABILITIES` default update | Refresh the snapshot |
   | Anything else | Logged at debug |

4. **Verification:** every webhook's `Plaid-Verification` JWT (ES256, key cached by `kid`), `iat` ≤ 5 min, and body SHA-256. On failure: 401, logging the IP, never the body. Only `webhook_type`, `webhook_code` and `item_id` are trusted.
5. **Response:** within 10 s; the sync runs asynchronously. Scheduled sync stays as the backup.
6. **Exposure:**
   - A Cloudflare Access **Bypass** for `POST /api/plaid/webhook/*` only (Plaid can't send service-token headers), optionally with a WAF rule for Plaid's IPs.
   - The route is mounted before `authMiddleware`, with its own rate limit and a raw-body parser.

---

# Cross-cutting

## Documentation matrix

Every PR updates the docs its change touches. Recheck after each phase.

| Doc | 2.1 | 2.2 | 2.3 | 2.4–2.5 | 3.x | 4.x | 5.x | 6.x | 7 |
|---|---|---|---|---|---|---|---|---|---|
| `docs/features/PLAID_INTEGRATION.md` (behaviour, Staging rules, How banks differ, Limitations) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `docs/guides/USER_GUIDE.md` (Bank Import section) | | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `docs/API_DOCUMENTATION.md` (Endpoint Reference) | | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `docs/DATABASE_SCHEMA.md`, `docs/DATABASE_MIGRATIONS.md` | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `docs/features/ACTIVITY_LOG.md`, `REAL_TIME_SYNC.md` | | ✓ | | ✓ | ✓ | ✓ | ✓ | | |
| `docs/features/BUDGET*` / Budget Plan API (contributions) | | | | | 3.3 | | | 6.2 | |
| `docs/features/CREDIT_CARD_*` (balance check, statements) | | | | R7 | 3.2 | 4.2 | | 6.1 | |
| `docs/deployment/*` (webhook exposure) | | | | | | | | | ✓ |
| README / `docs/features/README.md` (one-line summary) | | | | | ✓ | ✓ | | | |

## Testing rules
- **Test types:** unit tests for pure rules (`plaidMatching`, `plaidClassification`, `applyRules`); PBT for windows, ranking, classification and never-overwrite sequences.
- **Integration tests** use a mocked Plaid client and real SQLite (no network in CI).
- **Frontend tests** mock `plaidApi`.
- **Without Plaid:** every slice includes a "Plaid not configured" test (no calls, no UI).

## Cleanup found but out of scope
- **R7** (stored `current_balance`) touches credit card code outside Plaid. Ship it as its own PR within Phase 2.
- **Reminder fallback:** `reminderService` falls back to `card.current_balance` when no statement exists. R7 fixes the source.

---

# Open questions

| # | Question | Decision / default |
|---|---|---|
| Q1 | OAuth redirect needed? | **Decided:** no; both banks use credentials |
| Q2 | Sync schedule | **Decided:** every 30 min 06:00–23:00 + on open |
| Q3 | Card payments, which side records? | **Decided (2026-11-07):** card side records, funding side links (3.2); exception: a funding debit can record for a card with no bank account connected |
| Q4 | Classify rows staged before capture? | **Decided:** new rows only, plus the 2.1 backfill of unreviewed rows |
| Q5 | Full refunds | **Decided:** ask each time |
| Q6 | Auto-add | **Decided:** not building |
| Q7 | Prompt for Liabilities/Investments consent per bank? | Yes, when the feature is turned on (Phase 6); balances need no consent |
| Q8 | Bank values overwrite hand-entered ones? | **Decided:** never |
| Q9 | Retention of ignored / not-expense rows | **Decided:** 2 months |
| Q10 | Usage/cost panel for paid plans | No; document plan limits |
| Q11 | Plaid IP allow-list for webhooks | Optional, documented |
| Q12 | One PR per numbered item | **Decided:** yes |
| Q13 | Add RESP as an investment type (table rebuild)? | Open; RESPs stay unlinked until decided |
| Q14 | R7: recalculate `current_balance` on every change, or retire it as a stored balance? | Open; decide in 2.4 |
| Q15 | CIBC only updates during a login: keep scheduled syncs for it, or treat it as "log in to update" (no scheduled syncs, no daily Needs login alert)? | Open; scheduled syncs kept for now (cheap, and they detect the expired login) |
| Q16 | Webhooks (Phase 7) now that both banks are Classic connections with Plaid-side fetch limits? | Open; low value until a bank fetches in the background reliably |
