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
| next | — | Credit card balance check (4.2, pulled forward) with the balance capture part of 2.1 |

**Next:** 3.2 card payments (Record payment from the Inbox), the other half of card reconciliation. Then the rest of Phase 2 (capture the other Plaid fields, inbox badge, refactors), Phase 3 and the rest of Phase 4.

**Order change (2026-11-03):** card balance reconciliation is the biggest day-to-day problem, so 4.2 was built before the rest of Phase 2. It only needed balance capture from 2.1, done as its own migration `plaid_account_balances_v1`; the transaction columns of 2.1 still come in `plaid_capture_v1`.

## Guiding principles

1. **The tracker is complete without Plaid; Plaid only makes it smarter.** Every feature works with manual entry. Plaid UI (header button, badges, coloured pills, inbox) appears only when Plaid is configured; while it isn't, no Plaid calls or background jobs run (check `isEnabled()` / `/api/plaid/status` first), and no screen depends on bank data.
2. **Nothing becomes money data without the user's say-so.** Every bank transaction goes through the inbox. Rules only pre-fill (no auto-add, Q6). Bank-driven *updates* to records the user already created are allowed when they follow the bank faithfully and are logged: settled amounts (as built), current-month balances (Phase 4), and optionally loan payments from confirmed fixed expenses (3.5).
3. **Never overwrite what the user typed.** Bank values fill empty slots, or update values that came from the bank; a hand-entered or hand-edited value wins, and the difference is shown.
4. **Never waste a Trial slot.** No flow may require disconnect + reconnect when update mode can repair the same Item (`TRIAL_ITEM_LIMIT = 10`, never refunded).
5. **Reuse the domain services for writes** (`expenseService`, `fixedExpenseService`, `incomeService`, `creditCardPaymentService`, `loanPaymentService`, `investmentValueService`, `loanBalanceService`). Validation, balances, activity log and SSE then behave as for manual entry.
6. **Every user-visible mutation emits an activity-log event** whose `entity_type` is routed by `useDataSync` (directly or via `ENTITY_TYPE_ALIASES`) to a consumer that refreshes.
7. **Secrets stay where Phase 1 put them:** encrypted with the key in `/config/secrets` (or `PLAID_TOKEN_KEY`); never logged, never sent to the browser, never in backups.
8. **Self-hosted first.** Everything works on a LAN-only install. Public exposure (Phase 7 webhooks) is optional.

---

# As built (v1.17.0)

## Data

**Tables** (all created by `backend/database/schema.js`; columns added after release come from migrations):

| Table | Purpose | Key columns |
|---|---|---|
| `plaid_items` | One per connected bank login | `item_id` UNIQUE, `institution_name`, `access_token_enc` (AES-256-GCM `v1:iv:tag:ct`), `environment` (`sandbox`/`production`), `sync_cursor`, `last_synced_at`, `last_error` |
| `plaid_accounts` | Accounts of an item | `account_id` UNIQUE, `name`, `mask`, `type`, `subtype`, `payment_method_id` → payment_methods (SET NULL) |
| `plaid_transactions` | Staged bank transactions | `transaction_id` UNIQUE, `plaid_account_id`, `amount` (Plaid sign: + money out), `date` (posted), `authorized_date`, `name`, `merchant_name`, `status` (`new`/`added`/`matched`/`ignored`), `expense_id` (partial UNIQUE), `pending`, `pending_transaction_id`, `removed_at` |
| `plaid_fixed_expense_links` | Bank payment confirming a fixed expense | `plaid_transaction_id` UNIQUE, `fixed_expense_id` UNIQUE, `landed_date`, `planned_amount` |
| `plaid_income_links` | Deposit confirming (or creating) an income source | `plaid_transaction_id` UNIQUE, `income_source_id` UNIQUE, `landed_date`, `planned_amount` |

**Triggers** return a bank row to the inbox (`status = 'new'`) when its target is deleted: `plaid_transactions_unlink_on_expense_delete`, `…_on_fixed_expense_delete`, `…_on_income_source_delete`.

**Migrations:**
- `fixed_expenses_payment_method_id_backfill_v1`: links fixed expenses to payment methods by name.
- `plaid_transactions_pending_v1`: adds the `pending`, `pending_transaction_id` and `removed_at` columns.

**Settings keys:**
- `plaid_client_id`, `plaid_secret_enc`, `plaid_environment`;
- `plaid_production_items_created` (Trial counter, never decremented);
- `plaid_auto_sync_enabled`, `plaid_auto_sync_interval_minutes`, `plaid_auto_sync_start_hour`, `plaid_auto_sync_end_hour`.

**Secrets:** the key is `<CONFIG_DIR>/secrets/plaid.key` (generated on first use, mode 600, excluded from backups) or `PLAID_TOKEN_KEY`. `PLAID_*` environment variables override the in-app keys and make Settings read-only.

## Backend

| Module | Responsibility |
|---|---|
| `config/plaid.js` | Effective config (env over settings), `isEnabled()`, cached Plaid client, token key load/generate |
| `utils/tokenCrypto.js` | AES-256-GCM encrypt/decrypt |
| `utils/plaidMatching.js` | Pure rules: expense match (same payment method, **charged** amount `COALESCE(original_cost, amount)` to the cent, ±3 days on purchase date), fixed-expense window (due −3/+10 days, clamped due day, settled only), deposits and income window (own month; next month in the last 3 days; previous month in the first 3), income ranking (learned name → name tokens → own month → amount) |
| `repositories/plaidRepository.js` | Items/accounts, `applySyncBatch` (atomic page apply + cursor), inbox queries, link tables, pending settlement and cancelled-charge queries, `findLinksForExpenses` |
| `services/plaidService.js` | Link token, connect (Trial counter, orphan cleanup), mapping (+ `plaid_account_updated`), `syncItem` (per-item lock, mutation-during-pagination restart ×3, error recorded once as `plaid_sync_failed`), `syncAll`, `findStaleItems`, `syncItems`, disconnect (atomic) |
| `services/plaidInboxService.js` | `listInbox` (candidates, suggestions, cancelled charges), add / match / match-fixed / match-income / add-income / ignore / unignore, `applySettlements`, `resolveCancelled`, per-row in-flight lock, `_logReview` |
| `services/plaidSettingsService.js` | Load/save/test/clear keys (encrypted secret), environment switch guard |
| `services/plaidSyncSchedulerService.js` | 5-minute tick: syncs banks older than interval − 3 min within active hours (business timezone); settings |
| `services/categorySuggestionService.getSuggestedCategories` | One grouped query for all inbox places (689 ms → 8 ms on production data) |
| `expenseService.getExpenses` / `fixedExpenseService` / `incomeService` | Attach `bankLink` / `bankConfirmation` for the UI |

**Sync rules:**
- **New rows:** pending and posted transactions are staged.
- **Updates and removals:** modified and removed rows only touch `status = 'new'`, except pending rows:
  - a posted transaction carrying `pending_transaction_id` replaces its pending row in place (keeping status and links);
  - a linked pending row whose amount changes is updated;
  - linked rows are returned as `settlements` and applied after the commit. The expense follows the bank if it still has the previous amount and isn't reimbursed or insurance-tracked; credit cards get `posted_date`;
  - a removed linked pending row gets `removed_at` and is reviewed as **Cancelled at bank** (Link to a settled row on the same account within 10 days and 25%, Keep, or Delete expense).

## API (`/api/plaid`, behind `authMiddleware`; 503 when not configured except status and settings)

| Method | Path | Notes |
|---|---|---|
| GET | `/status` | `{ enabled, source, environment, trial }` |
| GET/PUT/DELETE | `/settings`; POST `/settings/test` | Keys; secret only ever masked |
| POST | `/link-token`; GET/POST `/items`; DELETE `/items/:id` | Connect, list, disconnect |
| PUT | `/accounts/:id` | `{ paymentMethodId \| null }` |
| POST | `/sync` (`?ifStaleMinutes=N` for sync-on-open, background) | |
| GET/PUT | `/sync-settings` | Automatic sync schedule |
| GET | `/inbox?status=new\|ignored` | Rows with candidates; `cancelled` for `new` |
| POST | `/inbox/:id/{add,match,match-fixed,match-income,add-income,cancelled,ignore,unignore}` | Decisions |

## Activity log and sync

| Event | Entity | When |
|---|---|---|
| `plaid_item_added` / `plaid_item_deleted` | plaid_item | Connect / disconnect |
| `plaid_sync_failed` | plaid_item | A bank first goes into error |
| `plaid_account_updated` | plaid_account | Mapping changed |
| `plaid_sync_completed` | plaid_transaction | A sync changed staged rows (manual, scheduled, on open) |
| `plaid_transaction_updated` | plaid_transaction | Inbox decisions (`add`, `match`, `match_fixed`, `match_income`, `add_income`, `ignore`, `unignore`, `cancelled_keep`, `cancelled_delete`) and sync-driven `settled` / `pending_changed` |
| `settings_updated` | settings | `section: 'plaid'` (keys, never values) or `'plaid_auto_sync'` |

All `plaid_*` entity types route to the `plaid` window event. Consumers: `ImportInbox`, `BankConnections` and `useBankAccountLinks`. The records created or changed also log their own events (`expense_added`, `fixed_expense_updated`, …).

## Frontend (`components/bank-import/`)

- **`BankImportButton`:** header entry, hidden unless enabled. It runs sync-on-open: on load, on tab visible (throttled to 5 min), and on modal open.
- **`BankImportModal`:** the Inbox and Connections tabs, portalled to `<body>`.
- **`ImportInbox`:** rows, filters, Add / Add income forms, the Match picker (expenses, fixed expenses, income), the Cancelled-at-bank section, and the Pending badge.
- **`BankConnections`:** connect (Trial confirm), mapping, Sync now, last synced; contains `AutoSyncSettings`.
- **`PlaidSettings`:** the Settings → Bank Import screen.
- **`bankConfirmation.js`:** pill states for the expense list and Fixed Expenses: `confirmed` green, `pending` yellow, `differs` / `cancelled` red-orange.
- **`IncomeConfirmationIndicator`:** income has no pill, so it shows an icon.
- **`BankLinkedBadge`** with `hooks/useBankAccountLinks`: the Financial page badge on mapped payment methods.

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

---

# Roadmap

| Phase | Goal | Depends on |
|---|---|---|
| **2** Foundation | Keep what Plaid sends; reconnect without new Trial slots; inbox badge; refactors and hygiene | — |
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
   - `personal_finance_category` primary, detailed and confidence;
   - `merchant_entity_id`, `logo_url`, `website`, `original_description`;
   - `payment_channel`.
2. Store, for every account on every sync: `current`, `available`, `limit`, currency, and the time received. **Done with 4.2** (`plaid_account_balances_v1`); drop the `plaid_accounts` columns from `plaid_capture_v1`.
3. No behaviour change in this PR beyond showing a merchant logo (when present) in inbox rows.

**Design**
- **Migration `plaid_capture_v1`:**
  - `plaid_transactions` + `pfc_primary`, `pfc_detailed`, `pfc_confidence`, `merchant_entity_id`, `logo_url`, `website`, `original_description`, `payment_channel` (all TEXT).
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
> **Still open:** `consent_expiring` / `/item/get` refresh (req. 1, 5; no current bank has an expiry, so low value), the `institution_down` split from `error`, and the status column migration (only needed if status must survive something other than `last_error`, e.g. webhooks in Phase 7). Sandbox `reset_login` verification (2.x acceptance) is still to be done by hand.

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
| R1 | Split `plaidInboxService` (601 lines) into: `plaidInboxService` (listing, candidates, suggestions), `plaidReviewService` (decisions and `_logReview`), and `plaidSettlementService` (`applySettlements`, `resolveCancelled`). The controller and `plaidService` call the new modules | Same behaviour; each file under ~300 lines |
| R2 | Move link-table access (fixed, income, and the Phase 3 links) from `plaidRepository` (561 lines) to `plaidLinkRepository`, with a shared `linkTransaction(tx, …)` / `unlinkTransaction(…)` pattern | New link tables need no copy-paste |
| R3 | Split `ImportInbox.jsx` (442 lines): `inbox/InboxRow`, `AddExpenseForm`, `AddIncomeForm`, `MatchPicker`, `IncomeCandidates`, `CancelledRow`. Replace the action `if/else` chain with an action → API map | Same tests pass; adding an action is one map entry plus one component |
| R4 | Shared ranking helpers in `plaidMatching`: name tokens, learned names keyed by description, month windows. Reused by income now and by contributions and loans in Phase 3 | Income ranking PBT unchanged |
| R5 | `addAsExpense`: create the expense and link it in one DB transaction (`expenseService.createExpense` with a connection, as future-month creation does) | No orphan expense if linking fails |
| R6 | Shared backend Plaid test fixtures (`backend/test/plaidFixtures.js`: `account`, `txn`, `page`, `stage`, `connect`) | Duplicated helpers removed from the three Plaid test files |
| R7 | `payment_methods.current_balance` is maintained incrementally: expense create adds the amount whatever the date, while payments recalculate as of today. The screens already compute "as of today" (`getAllWithExpenseCounts`, `getAllBalanceTypes`); the stored value is only read by the reminder fallback (no statement) and the edit form. Make the stored value consistent: recalculate as of today on every change, or stop treating it as a balance | Reminder fallback and stored value equal the computed as-of-today balance (test with a future-dated expense) |
| R8 | Remove leftover PoC wording and dead code found during R1–R3 | No `PoC` in user-facing text |

### 2.5 Data hygiene

1. **Retention (Q9):** the daily scheduler deletes `ignored` (and Phase 3 `not_expense` reviewed) rows older than 2 months by transaction date. Never linked rows. Setting `plaid_retention_months`.
2. **Unknown accounts:** the "hidden, map accounts" count covers only existing unmapped accounts; rows from accounts Plaid never listed are counted separately.
3. **Settings across tabs:** `plaid-settings-changed` also reaches other tabs (log `settings_updated` → route `settings` to that window event).
4. **Pending backfill on upgrade (R9):** the v1.17.0 upgrade didn't show charges already pending (the sync cursor had passed them). Productize the one-off fix: on the first sync after `plaid_transactions_pending_v1`, call `/transactions/get` (last 21 days) per Item once and insert missing pending rows. Gated by `plaid_pending_backfill_done`.
5. **Modified amounts on reviewed rows (R10):** Wealthsimple sends still-pending charges as settled, so a later amount change arrives as *modified* on an added/matched row, which is ignored today. Apply the `pending_changed` rule to any linked row: follow the bank if the expense still has the previous bank amount; log it.

**Tests:** retention keeps linked rows; backfill runs once; modified linked row follows the bank only when untouched.
**Docs:** PLAID_INTEGRATION (Staging rules, Limitations).

### Phase 2 exit criteria
- [ ] 2.1 capture and backfill in production; PFC and balances visible in the DB for new rows.
- [ ] 2.2 a Sandbox `reset_login` repaired with Reconnect, without a new Trial slot.
- [ ] 2.3 badge counts match the inbox.
- [ ] R1–R8 merged; no Plaid source file over ~350 lines.
- [ ] 2.5 items merged.
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
- **Pure `plaidClassification.js`:** `bucketFor({ pfcPrimary, pfcDetailed, amount, accountType })` and `kindFor(...)` (`card_payment` / `transfer` / `income` / `loan_payment` / `fee`). Computed on insert and on update of `new` rows unless overridden.
- **Review service:** `markReviewed(id, reason)` (ignore with a reason) and `setBucket(id, bucket)`.

**Tests:** classification table (PBT over sign × account type × PFC); override survives modified.

### 3.2 Card payments

**Requirements**
1. **Card side records** (Q3 revised). A credit on a card account of kind `card_payment` (or whose description contains "payment") shows **Card payment → Record payment**. It creates a `credit_card_payments` row (bank amount, posted date) via `creditCardPaymentService.recordPayment`, so the balance updates and the payment is logged.
2. **Already recorded by hand** (same card, amount, ±5 days): offer **Match** instead.
3. **Chequing side:** a debit of kind `card_payment` offers **Same payment** (link to the card payment recorded from the card side, same amount ±5 days) or Mark reviewed. Never record twice.
4. Deleting the card payment returns the bank row(s) to the inbox.

**Design:**
- `plaid_card_payment_links(plaid_transaction_id UNIQUE → CASCADE, credit_card_payment_id → CASCADE, created_at)`. The chequing and card rows can both link to one payment, so `credit_card_payment_id` is not unique.
- An unlink trigger on `credit_card_payments` delete.
- Endpoints `POST /inbox/:id/card-payment { paymentMethodId? , creditCardPaymentId? }`.

**Tests:** record creates exactly one payment and updates the balance; match; both-sides guard; delete trigger.

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
- [ ] A real card payment recorded from the card side, with the chequing side linked.
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
> - Causes come from pairing bank rows (`new` **and `ignored`**: an ignored refund is a classic cause) with unlinked tracker expenses and card payments since the bank's first date: same signed amount within 5 days, then one tracker entry against two bank rows (split Amazon charges). Leftovers are `bank_only` / `tracker_only` / `settling` causes with their effect; the rest is `unexplained`.
> - UI: the Financial page card table colours a linked card's Current balance with the expense list's bank pill classes (`cardBalanceProps`: `bank-pill-confirmed` / `bank-pill-differs`, details in the hover text); `CardBankBalancePanel` in the card detail view. Utilization stays on the existing Credit Limit card (one figure, from the tracker balance).
> - Verified on production data: CIBC and Wealthsimple both matched to the cent.

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
- [ ] Card balance check matches the Phase 0 manual result.
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
- A Sync now option calling `/transactions/refresh`.
- Cooldown: 1 per Item per hour.
- Never automatic (billed per call on paid plans).

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
| Q3 | Card payments, which side records? | **Revised:** card side records, chequing links (3.2); confirm when building |
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
