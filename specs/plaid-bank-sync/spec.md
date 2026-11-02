# Plaid Bank Sync: Phase 2+ (reliable daily use → less typing → deeper integration)

## Summary

Builds on the Phase 1 PoC ([`specs/plaid-integration/spec.md`](../plaid-integration/spec.md), merged in #425 and #429): connect banks through Plaid, sync posted transactions, and review them in the Import Inbox (Add / Match expense / Confirm fixed expense / Ignore), with bank-confirmed icons on expenses and fixed expenses.

This spec plans the next phases. Each is a separate PR (or a few) and can be shipped and used on its own:

| Phase | Goal | Contents |
|---|---|---|
| **0** | Validate on real data | One real bank on the Trial plan; record findings that tune Phases 2–3 |
| **2** | Reliable for daily use | Reconnect (update mode), scheduled sync, inbox badge + cross-tab refresh, not-expense handling (card payments, transfers, income), refunds as reimbursements, data hygiene |
| **3** | Less typing | Plaid categories, merchant rules (pre-fill only), bulk actions, pending transactions |
| **4** | Deeper integration | Auto-logged loan payments from bank confirmations, credit card balances/statements (Liabilities), investment values (Investments) |
| **5** (post-Phase 2, optional) | Faster updates | Webhooks for installs with a public hostname (verified, path-scoped), on top of scheduled sync |

Out of scope throughout: other users' money movement (Transfer/Payment Initiation), EU/UK institutions, mobile-web OAuth redirect flows, multi-user households.

## Guiding principles (apply to every phase)

1. **Nothing becomes money data without the user's say-so.** Every bank transaction lands in the inbox; rules only pre-fill (no auto-add, decided Q6). The one exception is Phase 4.1's optional "Always" setting for loan payments created from a fixed expense the user confirmed.
2. **Never waste a Trial slot.** No flow may require disconnect + reconnect when update mode can repair the same Item (`TRIAL_ITEM_LIMIT = 10`, never refunded).
3. **Self-hosted first.** Everything works on a LAN-only install. Public exposure (Phase 5) is optional and minimal.
4. **Reuse existing services for writes** (`expenseService`, `fixedExpenseService`, `creditCardPaymentService`, `loanPaymentService`, `investmentValueService`) so validation, balances, activity log and SSE behave as for manual entry.
5. **Secrets stay where Phase 1 put them:** encrypted with the key in `/config/secrets` (or `PLAID_TOKEN_KEY`), never logged, never sent to the browser, not in backups.
6. **Every user-visible mutation emits an activity-log event** whose `entity_type` is routed by `useDataSync` (directly or via `ENTITY_TYPE_ALIASES`).

---

## Phase 0: real-bank validation (gate for Phases 2–3)

Not code. Connect **one** real bank (the one you use most) on the Trial plan in production, sync, and use the inbox for 2–4 weeks. Record in this spec:

| Measure | Why it matters |
|---|---|
| OAuth or credentials login; did the desktop pop-up work? | Decides whether a registered HTTPS `redirect_uri` is needed (Open question Q1) |
| `merchant_name` fill rate and quality vs `name` | Tunes merchant rules (3.2) and default place text |
| `personal_finance_category` accuracy against your categories | Decides how far Plaid categories can be trusted (3.1) |
| How often pending → posted changes the amount (tips, holds, FX) | Decides whether Phase 3.5 is worth it |
| Match hit rate: hand-entered expenses that found their bank transaction | Tunes the ±3-day window; reveals systematic date offsets |
| Share of inbox rows that are transfers / card payments / payroll | Sizes Phase 2.4 |
| Fixed expenses confirmed vs missed, and how late they landed | Tunes the −3/+10 window |
| Item health over the period (`last_error`) | Sizes the urgency of Phase 2.1 |

---

## Phase 2: reliable for daily use

### 2.0 Income: confirm deposits (shipped first, small slice)

Suggested after the first real-bank connection: a payroll deposit showed as "Refund / credit" with only Ignore. Same pattern as Phase 1's fixed-expense confirmation. Decisions: one deposit per income source (pay that arrives more than once a month is logged as separate sources); a different amount updates the income, offered pre-checked; unplanned deposits can be added as income.

1. Deposits (money in on a non-credit-card account) are labelled *Deposit*; credit-card credits stay *Refund / credit*.
2. Match offers unconfirmed income sources in the deposit's month, plus next month in its last 3 days and the previous month in its first 3 days. Ranked by learned name (an earlier confirmation of the same bank description), then name words in the description, then own month, then closest amount. Likely matches get an "Income: <name>" badge.
3. Confirm links the deposit (`plaid_income_links`, landed date, planned amount), optionally updating the income amount through `incomeService.updateIncomeSource`; undone if that fails.
4. Add income creates the income source in the deposit's month through `incomeService.createIncomeSource`, name/category pre-filled from learning, else the description and *Other*.
5. Income Management shows a bank icon (landed date, deposit amount; amber when the amount differs). Deleting the income source returns the deposit to the inbox (trigger).

- [x] `plaid_income_links` + trigger; matching helpers (PBT); repository; `match-income` / `add-income` endpoints; inbox UI; Income Management indicator; tests; docs

### 2.1 Reconnect expired logins (Plaid update mode)

**Problem:** bank logins expire (password change, MFA re-consent, OAuth consent expiry, often 90 days–12 months). Today the only fix is disconnect + reconnect, which **consumes a new Trial slot** and loses the sync cursor.

**Requirements**
1. Item health is tracked: `ok`, `needs_reauth` (`ITEM_LOGIN_REQUIRED`, `INVALID_CREDENTIALS`, `INVALID_MFA`, `USER_SETUP_REQUIRED`, …), `consent_expiring` (consent ends within 14 days), `error` (other `ITEM_ERROR`s), `institution_down` (`INSTITUTION_DOWN`/`INSTITUTION_NOT_RESPONDING`, transient: retry later, no user action).
2. Connections tab shows status per bank with a **Reconnect** button when `needs_reauth` or `consent_expiring`. Reconnect opens Link in **update mode** for the **same Item** (no new Trial slot, cursor kept).
3. On successful update-mode exit, status returns to `ok`, `last_error` clears, and a sync runs immediately.
4. Sync skips `needs_reauth` Items (no repeated failing calls) and reports them as "needs reconnect" in the sync summary.
5. Consent expiry is refreshed from `/item/get` (`consent_expiration_time`) after connect, after reconnect, and once a day by the scheduled sync.
6. The header icon shows an attention dot when any Item needs reconnecting (combined with the badge in 2.3).

**Design**
- Schema (migration; existing table): `plaid_items` + `status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok','needs_reauth','consent_expiring','error','institution_down'))`, `consent_expires_at TEXT`, `status_changed_at TEXT`. Backfill: `last_error` set → `error`.
- `plaidService`:
  - `createLinkToken({ itemId })`: when `itemId` is given, decrypt its token and call `/link/token/create` with `access_token` and **without** `products` (update mode). The environment must match the Item's.
  - `markReconnected(itemId)`: after Link `onSuccess` in update mode there is **no public token to exchange**; mark `ok`, refresh `/item/get`, run `syncItem`.
  - `_classifyItemError(code)` → status; applied in `syncItem`'s catch (replaces the plain `setItemError`).
  - `refreshItemStatus(itemId)` → `/item/get`.
- Routes: `POST /api/plaid/link-token` body `{ itemId? }`; `POST /api/plaid/items/:id/reconnected`.
- Frontend: `BankConnections` status chip + Reconnect (`usePlaidLink` with the update-mode token; `onSuccess` → `reconnected`).
- Activity log: `plaid_item_updated` ("Reconnected RBC Royal Bank"; status changes such as "RBC Royal Bank needs reconnecting").
- Sandbox test path: `/sandbox/item/reset_login` forces `ITEM_LOGIN_REQUIRED` for an Item (backend script + integration test with a mocked client).

**Tests:** status classification table (unit); sync skips `needs_reauth`; update-mode token has `access_token` and no products; reconnect does not increment the Trial counter; Sandbox `reset_login` round trip (manual).

### 2.2 Scheduled sync

**Status: built early as a Phase 1.5 slice**, with these differences from the design below:
- One 5-minute cron tick syncs each bank whose last sync or attempt is older than the interval minus 3 minutes, instead of a cron expression per schedule. Changing settings needs no re-registration, and catching up after startup comes for free.
- Settings use `plaid_auto_sync_enabled`, `_interval_minutes`, `_start_hour` and `_end_hour` (whole hours), set on the Connections tab through `GET/PUT /api/plaid/sync-settings`.
- Sync on open is `POST /api/plaid/sync?ifStaleMinutes=30` from `BankImportButton`: on app load, when the tab becomes visible again (throttled to 5 minutes) and when the modal opens. It runs outside the request's tab context, so the opening tab also gets the event.
- `plaid_sync_completed` (entity `plaid_transaction`, routed as `plaid`) is logged for manual, scheduled and on-open syncs that changed something. `ImportInbox` and `BankConnections` refresh on it. This covers 2.3's sync part; the badge is still to do.
- Banks with user-fixable errors (`ITEM_LOGIN_REQUIRED` etc.) are skipped until 2.1 reconnect exists.
- Not built yet: "Ask the bank for fresh data" (`/transactions/refresh`) and `plaid_items.last_sync_source`.

**Requirements**
1. A background job syncs every `ok`/`consent_expiring` Item **every 30 minutes between 06:00 and 23:00** business time (the last run at 23:00) and not overnight. Configurable in Settings → Bank Import: Off, interval (30 / 60 / 120 minutes) and active hours (start, end).
   - Why this is cheap: `/transactions/sync` is not billed per call (Transactions is billed per account per month on paid plans; included in the Trial) and the limit is about 30 calls per minute per Item. Plaid itself pulls from most banks 1–4 times a day, so most runs return nothing; frequent polling only shortens the delay after Plaid has new data.
2. **Sync on open:** when the app loads (and when the Bank Import modal opens), the frontend calls `POST /api/plaid/sync?ifStaleMinutes=30`. The server syncs only if the last successful sync of any Item is older than 30 minutes, in the background (responds immediately with `{ started: true|false }`); the badge and inbox update through the 2.3 SSE events. Users never need to know Sync now exists. Applies at any hour, including overnight.
3. Startup catch-up: one sync 2 minutes after start if inside active hours and the last successful sync is older than the interval.
4. One sync at a time across the app (manual Sync now, sync on open and the scheduler share one guard; a second request returns "sync already running" / `started: false`).
5. Results are visible: "Last synced 12:00 (auto) · 3 new" on the Connections tab; failures surface as Item status (2.1), not silent logs.
6. **Sync now** keeps working, and gains an optional "Ask the bank for fresh data" (`/transactions/refresh`, included in the Trial bundle; billed per call on paid plans, so it is never automatic) with a cooldown of 1 per Item per hour.
7. The scheduler never runs when Plaid is disabled or no Items exist.

**Design**
- `plaidSyncSchedulerService` (pattern: `billingCycleSchedulerService`): `node-cron` job(s) registered in `server.js` with `{ timezone: businessTimezone }`, re-registered when the setting or timezone changes; guarded by a module-level `running` flag + the existing per-Item lock.
- One cron expression built from the settings, e.g. `*/30 6-22 * * *` plus `0 23 * * *` for the defaults.
- Settings: `plaid_sync_enabled` (default on), `plaid_sync_interval_minutes` (30), `plaid_sync_active_start` (`06:00`), `plaid_sync_active_end` (`23:00`), stored via `plaidSettingsService`, exposed in `GET/PUT /api/plaid/settings` (not secrets; validated: interval in {30, 60, 120}, start < end).
- `POST /api/plaid/sync` accepts `ifStaleMinutes` (bounded 5–1440); without it, it behaves as today (manual Sync now).
- Frontend: `BankImportButton` (always mounted in the header) fires the stale-sync call once on mount and once when the tab becomes visible again after > 30 minutes hidden; `BankImportModal` fires it on open. Failures are silent (status shows in Connections).
- `plaid_items.last_sync_source` (`manual|scheduled|on_open|webhook`) for display.
- Activity log: `plaid_sync_completed` **only when something changed** (new/updated/removed > 0 or status changed), entity `plaid_transaction`, so other tabs refresh the badge and inbox. No events for no-op runs (matches the billing-cycle scheduler rule).

**Tests:** cron expression from settings (PBT over interval × hours); scheduler registers/unregisters with settings; skips when disabled; catch-up only inside active hours; stale check (synced 29 vs 31 minutes ago); concurrency guard (manual, on-open and scheduled together); event only on change; frontend fires the stale call on mount, on modal open and on visibility after 30 minutes hidden, not on every render.

### 2.3 Inbox badge and cross-tab refresh

**Requirements**
1. The header bank icon shows the **number of transactions to review** (status `new`, mapped accounts), e.g. a small "7", and an attention dot for 2.1 issues.
2. Inbox actions (add, match, confirm fixed, ignore, unignore), sync results and account-mapping changes refresh the badge and any open inbox in **other tabs** via SSE; the acting tab ignores its own broadcast as usual.
3. The count endpoint is cheap (single indexed `COUNT(*)`).

**Design**
- `GET /api/plaid/status` adds `toReview` and `needsAttention`.
- Activity events (currently missing; closes audit gap):
  - `plaid_transaction_updated` for add/match/confirm/ignore/unignore (metadata: action, transaction id, linked expense/fixed expense id; **no** bank descriptions in metadata beyond the merchant name)
  - `plaid_account_updated` for mapping changes
  - `plaid_sync_completed` (2.2)
- `useDataSync`: route `plaid_transaction`, `plaid_account`, `plaid_item` → new `plaid` key, dispatched as a window `syncEvent` consumed by `BankImportButton` (badge) and `ImportInbox`/`BankConnections` (reload) via `useSyncEvent`.
- Inbox: refresh on the `expense`/`fixed_expense` sync events as well (fixes the staging finding: an inbox left open did not update after expenses changed elsewhere).

**Tests:** status counts; every inbox mutation logs exactly one event; frontend routing test for the new entity types; badge renders and updates on `syncEvent`.

### 2.4 Not-expense handling (card payments, transfers, income, fees)

**Problem:** on real accounts a large share of rows are not spending: credit card payments from chequing, transfers between own accounts, payroll, interest. Today they must each be ignored by hand, and card payments are not recorded anywhere.

**Requirements**
1. Store Plaid's classification on every staged row: `personal_finance_category.primary`/`.detailed` and `confidence_level`.
2. Inbox gains filters: **To review** (spending), **Not expenses**, **Ignored**. Rows are classified automatically:
   - `TRANSFER_IN`, `TRANSFER_OUT` (own-account transfers), `INCOME`, `LOAN_PAYMENTS` (incl. `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`), `BANK_FEES` interest income/charges → **Not expenses**
   - everything else → **To review**
   - amount ≤ 0 on a credit card account (payment received) → **Not expenses**
3. A **Not expenses** row offers the right action for its type:
   - **Card payment** (debit side, from a chequing account): **Record as credit card payment** → choose the card (pre-selected when one card payment method is mapped to an account at the same institution, or when the description contains the card's name) → creates a `credit_card_payments` entry via `creditCardPaymentService.recordPayment` (balance updated as today) and links the transaction.
   - **Card payment received** (credit side, on the card account): **Link to card payment** if a matching `credit_card_payments` row exists (same card, same amount, ±5 days), else Ignore. Prevents recording the same payment twice when both accounts are connected.
   - **Loan / mortgage payment**: **Confirm fixed expense** (existing) when a loan-linked fixed expense matches; Phase 4.1 adds loan payment logging.
   - **Income**: **Confirm income** / **Add income** (2.0).
   - **Transfer / fee**: **Mark reviewed** (= ignore with a reason) or **Add as expense anyway** (bank fees can be real costs).
4. Users can move a row between To review and Not expenses (overrides the classification for that row).
5. Duplicate guard: a transaction linked to a card payment cannot also be added or matched.

**Design**
- Schema (migration on existing tables):
  - `plaid_transactions` + `pfc_primary TEXT`, `pfc_detailed TEXT`, `pfc_confidence TEXT`, `review_bucket TEXT NOT NULL DEFAULT 'spending' CHECK(review_bucket IN ('spending','not_expense'))`, `bucket_overridden INTEGER NOT NULL DEFAULT 0`, `ignore_reason TEXT`. Sync stores the PFC fields; the bucket is computed on insert and on `modified` unless overridden.
  - New `plaid_card_payment_links(plaid_transaction_id UNIQUE → plaid_transactions CASCADE, credit_card_payment_id UNIQUE → credit_card_payments CASCADE, created_at)`. Trigger: deleting the card payment returns the transaction to the inbox (same pattern as expenses/fixed expenses).
- `plaidClassification.js` (pure): `bucketFor({ pfcPrimary, pfcDetailed, amount, accountType })` + `cardPaymentCandidates(txn, cards, payments)`.
- Inbox service: `recordCardPayment(id, paymentMethodId)`, `linkCardPayment(id, creditCardPaymentId)`, `markReviewed(id, reason)`, `setBucket(id, bucket)`.
- Count for the badge uses `review_bucket = 'spending'` only.
- Existing rows: the migration leaves `pfc_*` NULL (bucket `spending`); a one-off "Re-classify" runs on the next full sync because Plaid resends nothing for old rows. Alternatively, accept that only new rows are classified (see Q4).

**Tests:** classification table (PBT over amount sign × account type × PFC); card-payment record creates exactly one `credit_card_payments` row and updates the balance; both-sides guard; delete trigger; bucket override survives `modified` sync.

### 2.5 Refunds and credits as reimbursements

**Requirements**
1. A refund row (amount < 0 on a card or debit account, bucket spending) offers **Apply to an expense**: candidates are expenses on the same payment method, same merchant (normalized place or Plaid merchant), within 90 days before the refund, whose charged amount ≥ the refund.
2. Applying sets the expense's reimbursement the same way the expense form does (`original_cost` = charged amount, `amount` = charged − refunded, via `expenseService.updateExpense` so validation, card balance and activity log apply) and links the transaction (`status = matched`, link type `refund`).
3. A full refund (refund = charged) offers **Mark expense refunded** (amount 0 is not allowed for expenses, so this deletes the expense after confirmation, or the user ignores the refund; see Q5).
4. Medical expenses with insurance tracking are excluded (their `original_cost` is managed by the insurance flow).

**Design**
- `plaid_transactions.link_type TEXT` (`expense|refund|fixed|card_payment`), set when matched; `expense_id` reused for refunds.
- The expense's payment method pill hover text lists both the charge and the refund.

**Tests:** candidate rules (PBT on amounts/dates); applying twice is rejected; insurance-tracked medical expenses are never candidates; card balance unchanged in net effect.

### 2.6 Data hygiene (audit deferrals)

1. **Transactional multi-step writes:** `disconnectItem` (delete unreviewed + delete item) and `addAsExpense` (create expense + link) each in one transaction (pass the transaction connection into `expenseService` the way `createExpense` does for future months).
2. **"Hidden, map accounts"** counts only rows whose account exists and is unmapped; rows from accounts Plaid never listed are counted separately ("from unknown accounts").
3. **Retention:** ignored and not-expense rows older than 2 months (by transaction date) are deleted by the daily scheduler run (configurable via `plaid_retention_months`; linked rows are never deleted). Deleted rows cannot come back: Plaid only resends a transaction if it is modified, and an unknown `modified` id is ignored.
4. **Category suggestions:** one grouped query per inbox load instead of one per place.
5. **Settings change event** (`plaid-settings-changed`) also travels across tabs (via 2.3's SSE routing).

### Phase 2 tasks
- [ ] Phase 0 findings recorded
- [ ] 2.1 schema migration + status classification + update mode + reconnect UI + tests
- [ ] 2.2 scheduler service + settings + catch-up + tests
- [ ] 2.3 status counts + activity events + `useDataSync` routing + badge + tests
- [ ] 2.4 PFC columns + classification + card payment record/link + filters + tests
- [ ] 2.5 refunds → reimbursement + tests
- [ ] 2.6 hygiene items + tests
- [ ] Docs: `PLAID_INTEGRATION.md`, `API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`, `DATABASE_MIGRATIONS.md`, `ACTIVITY_LOG.md`, `REAL_TIME_SYNC.md`
- [ ] Full-suite validation (`.\scripts\run-test-summary.ps1`)

---

## Phase 3: less typing

### 3.1 Plaid categories as suggestions

1. Map Plaid `personal_finance_category` (detailed first, then primary) to the app's `CATEGORIES`, used **after** the place-history suggestion (history wins).
2. The mapping is a table in code (`plaidCategoryMap.js`), with an editable override table (`plaid_category_overrides(pfc_detailed PRIMARY KEY, category)`) so a user can say "`ENTERTAINMENT_TV_AND_MOVIES` is Subscriptions for me".
3. Low-confidence (`LOW`/`UNKNOWN`) Plaid categories are not suggested.
4. Initial mapping (to verify against the PFC taxonomy at implementation):
   - `FOOD_AND_DRINK_GROCERIES` → Groceries; other `FOOD_AND_DRINK_*` → Dining Out
   - `TRANSPORTATION_GAS` → Gas; `TRANSPORTATION_*` (parking, tolls, transit) → Automotive
   - `RENT_AND_UTILITIES_RENT` → Housing; other `RENT_AND_UTILITIES_*` → Utilities
   - `GENERAL_SERVICES_INSURANCE` → Insurance; `PERSONAL_CARE_*` → Personal Care
   - `GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES` → Clothing; `ENTERTAINMENT_*` → Entertainment
   - `GENERAL_MERCHANDISE_PET_SUPPLIES` → Pet Care; `GOVERNMENT_AND_NON_PROFIT_DONATIONS` → Tax - Donation (suggestion only)
   - `MEDICAL_*` → no suggestion (Tax - Medical needs people and insurance decisions)
   - everything else → no suggestion

### 3.2 Merchant rules

**Requirements**
1. A rule matches incoming transactions by **bank text** (`merchant_name` or `name`) with `equals` / `starts with` / `contains` (case-insensitive), optionally limited to one payment method and an amount range.
2. A rule sets any of: place (display name), category, notes, and a default action: `suggest` (pre-fill only, the default) or `not_expense` (moves the row to the Not expenses filter, e.g. internal transfers Plaid misclassifies; still reviewed by the user).
3. Rules are learned: after **Add**, if the user changed the place or category from the suggestion, offer "Always use *Coffee Shop* · *Dining Out* for `SQ *COFFEE SHOP`?" (one click, editable).
4. Rules are managed in Settings → Bank Import → **Rules** (list, edit, delete, test against recent transactions).
5. Rule-produced place names respect place-name standardization: if `place_names` maps the rule's place to a standardized name, the standardized name is used.

**Design**
- `plaid_merchant_rules(id, match_text, match_type CHECK IN ('equals','starts_with','contains'), payment_method_id NULL → payment_methods SET NULL, amount_min, amount_max, place, category, notes, action CHECK IN ('suggest','not_expense'), priority INTEGER, enabled INTEGER, created_at, updated_at)`.
- Evaluation: most specific first (equals > starts_with > contains; payment-method-scoped before global; then priority; then longest `match_text`). Pure function `applyRules(txn, rules)` → `{ place, category, notes, action, ruleId }`, PBT-tested for determinism and precedence.
- Inbox rows show which rule applied ("Rule: Coffee").
- Activity log: `plaid_rule_added/updated/deleted`.

### 3.3 Auto-add: not building (decided Q6)

Rules only pre-fill. The inbox stays the single review point; bulk Add (3.4) covers the "many routine rows" case with one click while keeping the user in the loop. Revisit only if Phase 3 use shows bulk Add is still too slow.

### 3.4 Bulk actions

1. Select rows (checkboxes, "select all in this filter").
2. Bulk **Add** (each row uses its pre-filled place and category; rows without a category are skipped and reported), bulk **Ignore**, bulk **Mark reviewed** (not-expenses).
3. Server-side: `POST /api/plaid/inbox/bulk` with `{ action, ids, overrides? }`; each row processed independently (per-row results), one activity event per row (cross-tab sync) plus a summary toast.

### 3.5 Pending transactions (decide after Phase 0)

1. Stage pending rows read-only (greyed, "Pending"): no actions except Ignore.
2. When Plaid posts the transaction, the posted row (new `transaction_id`, with `pending_transaction_id` pointing at the pending one) replaces it and inherits any ignore. Pending rows removed by Plaid disappear.
3. Matching and fixed-expense confirmation only ever use posted rows.

- Schema: `plaid_transactions.pending INTEGER DEFAULT 0`, `pending_transaction_id TEXT`.

### Phase 3 tasks
- [ ] 3.1 category map + overrides + tests
- [ ] 3.2 rules table, evaluation (PBT), learn-from-add prompt, Rules UI, tests
- [ ] 3.4 bulk endpoint + UI + tests
- [ ] 3.5 pending (if Phase 0 shows value)
- [ ] Docs + full-suite validation

---

## Phase 4: deeper integration with existing features

### 4.1 Auto-logged loan payments from bank confirmations

**Today:** `autoPaymentLoggerService` suggests a loan payment for a loan-linked fixed expense once its **due day** has passed, dated on the due day, for the planned amount; the user accepts in `AutoLogPrompt`.

**Requirements**
1. When a **loan-linked** fixed expense is confirmed by a bank transaction (Phase 1 Confirm, or Phase 3 rule), the loan payment is created **from the bank data**: date = `landed_date`, amount = bank amount.
2. Behaviour setting (Settings → Bank Import): **Ask** (default: the confirm dialog shows "Also log a $1,500.00 payment to *RBC Mortgage* on Oct 3?" pre-checked) or **Always**.
3. The due-day suggestion (`getPendingAutoLogSuggestions`) **skips** fixed expenses that already have a bank-confirmed loan payment for the month, so the old prompt never offers a duplicate.
4. If a loan payment for that loan already exists within ±5 days of the landing date (logged by hand or by the old prompt), the dialog offers **Link to existing payment** instead of creating one.
5. Created through `autoPaymentLoggerService.createPaymentFromFixedExpense(fixedExpense, landedDate)` with the bank amount, so mortgage auto-snapshots, validation and the `auto_payment_logged` event apply; notes say "Bank-confirmed".
6. Un-confirming (deleting the fixed expense) does not delete the loan payment; deleting the loan payment clears the link.

**Design**
- `plaid_fixed_expense_links` + `loan_payment_id INTEGER → loan_payments(id) ON DELETE SET NULL` (migration).
- `createPaymentFromFixedExpense` gains an optional `amount` override (defaults to `fixedExpense.amount`, unchanged for existing callers).
- Fixed Expenses tooltip adds "Loan payment logged".

### 4.2 Credit card balances and statements (Plaid Liabilities)

**Requirements**
1. For connected credit card accounts mapped to a credit card payment method, fetch (daily, with the scheduled sync) the **current balance**, **last statement balance and date**, **minimum payment**, **next due date**, **last payment amount/date** (`/liabilities/get` + account balances).
2. **Statement reconciliation:** for the billing cycle whose end date equals Plaid's `last_statement_issue_date` (±2 days), show "Bank: $1,240.10 vs calculated: $1,238.60 (−$1.50)" in the billing-cycle history, with **Use bank amount** (sets `actual_statement_balance`, `is_user_entered` style semantics: `balance_source = 'bank'`).
3. **Balance check:** the card detail view shows the bank's current balance next to the app's calculated balance, with the difference and "possible missing expenses" (unreviewed inbox rows on that card).
4. **Due date and minimum payment** feed the existing credit card payment reminders when no user-entered value exists.
5. Nothing is overwritten silently: bank values are shown alongside and applied only by the user (or by an explicit "Always use bank statement balance" per card).

**Design**
- New `plaid_liability_snapshots(plaid_account_id, fetched_at, current_balance, last_statement_balance, last_statement_issue_date, minimum_payment_amount, next_payment_due_date, last_payment_amount, last_payment_date, is_overdue)`, one row per fetch, keeping 13 months.
- `credit_card_billing_cycles` + `balance_source TEXT` (`manual|bank`), migration.
- Liabilities must be added to existing Items: call `/liabilities/get`; if the Item lacks consent, Plaid returns `PRODUCTS_NOT_SUPPORTED`/`ADDITIONAL_CONSENT_REQUIRED` → reuse 2.1's update mode with `additional_consented_products: ['liabilities']` (see Q7).

### 4.3 Investment values (Plaid Investments)

**Requirements**
1. Map Plaid investment accounts (`type = investment`, subtypes such as `tfsa`, `rrsp`) to existing `investments` rows (Connections tab, like payment-method mapping).
2. On the first sync of each month (and on demand), write last month's closing value into `investment_values` (year, month, value = account `balances.current`) **only if** no value exists; if one exists and differs, show it for review instead of overwriting.
3. The monthly "update investment values" reminder is satisfied automatically for mapped accounts.
4. Holdings detail (securities, cost basis) is **not** stored (out of scope).

**Design**
- `plaid_accounts.investment_id INTEGER → investments(id) ON DELETE SET NULL` (migration).
- Writes through the existing investment value service (validation, `investment_value_updated` event).
- Billing note: Investments is a subscription-priced product on paid plans (included in the Trial).

### Phase 4 tasks
- [ ] 4.1 loan payment from confirmation + duplicate guards + setting + tests
- [ ] 4.2 liabilities fetch + snapshots + reconciliation UI + reminders + tests
- [ ] 4.3 investment mapping + monthly value + reminder integration + tests
- [ ] Docs + full-suite validation

---

## Phase 5 (post-Phase 2, optional): webhooks

Only for installs that already have a public HTTPS hostname. The maintainer's install is behind a Cloudflare Tunnel with an existing public hostname and token-based access rules for other apps.

**Requirements**
1. Settings → Bank Import → **Webhooks**: off by default; "Public webhook URL" (e.g. `https://tracker.example.com/api/plaid/webhook/<random-path>`); **Generate path** creates the random segment; **Send test** uses `/sandbox/item/fire_webhook` in Sandbox.
2. When enabled, new and reconnected Items register the URL (`webhook` in `/link/token/create`); existing Items are updated with `/item/webhook/update`.
3. Handled webhooks:
   - `TRANSACTIONS: SYNC_UPDATES_AVAILABLE` → run the existing `syncItem` for that Item (debounced 30 s; same lock as the scheduler)
   - `ITEM: ERROR`, `PENDING_EXPIRATION`, `PENDING_DISCONNECT`, `LOGIN_REPAIRED`, `USER_PERMISSION_REVOKED` → update Item status (2.1)
   - `LIABILITIES: DEFAULT_UPDATE` (Phase 4.2) → refresh snapshot
   - anything else → logged at debug level and acknowledged
4. **Every webhook is verified** before use: the `Plaid-Verification` JWT (ES256) is checked against the key from `/webhook_verification_key/get` (cached by `kid`), `iat` within 5 minutes, and the SHA-256 of the raw body equals the JWT's `request_body_sha256`. Failures → `401`, logged with the source IP and no body.
5. The handler trusts only `webhook_type`, `webhook_code` and `item_id` (looked up locally; unknown Items ignored). It never reads transaction data from a webhook (none is sent) and never acts on Items from another environment.
6. Always responds within 10 seconds (`200` after enqueueing); sync runs asynchronously.
7. Scheduled sync (2.2) keeps running as the backup; status shows "Last synced 12:03 (webhook)".

**Exposure (Cloudflare Tunnel)**
- Plaid sends a plain `POST` and **cannot add headers**, so a Cloudflare Access policy that requires a service token (e.g. `CF-Access-Client-Id`/`Secret`) would block it.
- Use an Access **Bypass** policy (or no Access application) scoped to **only** `POST /api/plaid/webhook/*` on the existing hostname; everything else keeps the current protection.
- Optional defence in depth: the random path segment, and a WAF rule allowing that path only from Plaid's published webhook source IPs.
- The app route is mounted **before** `authMiddleware` (it has its own verification) and added to `PUBLIC_ENDPOINTS`, rate-limited separately (e.g. 60/min), with a raw-body parser (needed for the body hash).

**Design**
- `plaidWebhookService` (verification + dispatch), `webhookVerification.js` (pure: JWT/hash checks; unit-tested with generated ES256 keys).
- Settings: `plaid_webhook_enabled`, `plaid_webhook_url` (not secret; the path segment is not a credential, verification is).

**Tests:** valid/invalid signature, stale `iat`, body hash mismatch, unknown `kid` refresh, unknown Item ignored, debounce, auth bypass limited to the one route.

---

## Open questions

Decided (owner review): Q2, Q3, Q4, Q5, Q6, Q9, Q12. Still open: Q1 (after Phase 0), Q7, Q8, Q10, Q11 (defaults apply unless changed before that phase).

| # | Question | Decision / default |
|---|---|---|
| Q1 | After Phase 0: does your bank use OAuth, and did the desktop pop-up work? If not, we need a registered HTTPS `redirect_uri` (your public hostname would work) | Desktop pop-up only |
| Q2 | Sync schedule default? | **Decided:** every 30 minutes 06:00–23:00, none overnight, plus sync on open when older than 30 minutes (revised after the first real-bank connection) |
| Q3 | Card payments when **both** accounts are connected: record from the chequing side (debit) and link the card side automatically? | **Decided:** yes, chequing side records, card side links |
| Q4 | Classify existing staged rows (2.4)? Plaid doesn't resend old transactions, so old rows would need a one-off re-fetch (a full re-sync from an empty cursor, which also re-stages everything already reviewed, deduplicated by `transaction_id`) | **Decided:** new rows only |
| Q5 | Full refunds: delete the original expense (it never really cost anything), or keep it and ignore the refund? | **Decided:** ask each time |
| Q6 | Auto-add (3.3): build it at all, or keep everything manual with rules only pre-filling? | **Decided:** don't build; rules only pre-fill |
| Q7 | Liabilities/Investments need extra consent on existing Items (one update-mode Link per bank, no new Trial slot). OK to prompt for that when you turn the feature on? | Yes, prompt per bank |
| Q8 | Investment values: should bank values ever overwrite a value you entered by hand for the same month? | Never; show the difference for review |
| Q9 | Retention for ignored / not-expense rows? | **Decided:** 2 months |
| Q10 | Trial limit: if more than 10 bank logins are ever needed, move to Pay-as-you-go. Transactions and Liabilities are billed per connected account per month, and Investments is extra. Do you want a usage/cost estimate panel? | No panel; document the plan limits |
| Q11 | Webhooks (Phase 5): random path + signature verification + Cloudflare Bypass for that path only. Do you also want the Plaid IP allow-list rule? | Optional, documented |
| Q12 | Order inside Phase 2: 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 as separate PRs? | **Decided:** yes |

## Review checklist (from `.github/instructions/specs.instructions.md`)

1. Activity log events for every new mutation: `plaid_item_updated`, `plaid_transaction_updated`, `plaid_account_updated`, `plaid_sync_completed`, `plaid_rule_*`, card payment / loan payment / investment value events from the reused services. New entity types routed in `useDataSync`.
2. Cleanup opportunities noted per PR.
3. Docs per phase: `PLAID_INTEGRATION.md`, `API_DOCUMENTATION.md` (Endpoint Reference), `DATABASE_SCHEMA.md`, `DATABASE_MIGRATIONS.md`, `ACTIVITY_LOG.md`, `REAL_TIME_SYNC.md`, user guide.
4. Tests follow the testing rules (PBT for classification, rules precedence and matching windows; integration tests with a mocked Plaid client; no network in CI).
5. Full-suite validation per phase with `.\scripts\run-test-summary.ps1`.
