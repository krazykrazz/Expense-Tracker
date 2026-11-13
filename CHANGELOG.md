# Changelog

## [1.27.0] - 2026-11-13

### Insurance reimbursements from the bank: apply an insurer deposit to one or more claims with per-person shares and undo; zero out-of-pocket for fully reimbursed expenses; Wealthsimple charges not yet in the card balance show as probably pending

## [1.26.0] - 2026-11-12

### Mortgage balances rebuilt from payments with interest per payment, mortgage editing, net worth includes the house, chart and projection fixes

## [1.25.4] - 2026-11-11

### Plaid 2.4 refactors R2 to R8: atomic add as expense, card balances always computed, shared helpers, smaller Plaid modules

## [1.25.3] - 2026-11-11

### Receipt indicator refreshes after upload, dependency updates (plaid 51 via legacy entry point)

## [1.25.2] - 2026-11-10

### Balance check explains recent WS charges that are probably still pending

## [1.25.1] - 2026-11-08

### Quieter server log for bank syncs that changed nothing, plus internal Plaid inbox refactor

## [1.25.0] - 2026-11-08

### Inbox count badge on the bank icon and bank balances for linked chequing accounts on the Financial page

## [1.24.7] - 2026-11-08

### Balance check explains pending charges that post later in the tracker

## [1.24.6] - 2026-11-08

### Activity log shows every bank sync that brought something, including balance changes and the sync after a login

## [1.24.5] - 2026-11-08

### Wealthsimple pending charges settle when the card balance matches exactly

## [1.24.4] - 2026-11-07

### Fix header and accent colours missing in production builds

## [1.24.3] - 2026-11-07

### Light mode readability: text and buttons meet WCAG AA contrast across the app

## [1.24.2] - 2026-11-07

### Posted date now follows Plaid after a bank file import, plus Plaid spot check fixes

## [1.24.1] - 2026-11-07

### Keep an entered posted date when the bank only sends the purchase date (Wealthsimple)

## [1.24.0] - 2026-11-07

### Posted date follows the bank for card expenses, statement check against the bank, pending turnover warning

## [1.23.0] - 2026-11-07

### Record credit card payments from the Import Inbox: a payment paid from a bank account and received on the card becomes one payment, with the paying debit linked. Also fixes payment reminders not clearing after a statement is paid, the payment form defaulting to tomorrow in the evening, and bank syncs colliding with payments

## [1.22.0] - 2026-11-07

### Log in again asks the bank for fresh data and opens the login only when the bank needs one; the summary hides inactive payment methods with no spending that month; bank transactions keep the Plaid category

## [1.21.4] - 2026-11-06

### Log in again for banks that only update after a login, plus fixes from the bank import audit

## [1.21.3] - 2026-11-06

### Wealthsimple pending charges settle automatically once the card balance shows they posted

## [1.21.2] - 2026-11-06

### Dark mode now covers settings, the place name tool, budgets, tax, annual summary and the other finance screens

## [1.21.1] - 2026-11-06

### Bank Import suggests known places for bank transactions, and the card balance check explains transactions only in a bank file

## [1.21.0] - 2026-11-05

### Bank file import: Wealthsimple and CIBC CSV exports go into the Bank Import inbox and merge with Plaid in either order, keeping the best information

## [1.20.0] - 2026-11-04

### Bank data freshness: flags a bank that Plaid has had no new data from for over 12 hours (amber dot, Not updating), and shows when Plaid last updated each bank and how Plaid rates it

## [1.19.2] - 2026-11-04

### Financial and credit card views: balance check coloured like the expense list pill and folded into the card view, dark theme fixes, statement amount shown once paid, negative amounts as -$, banner keyboard fix, more balance-check causes

## [1.19.1] - 2026-11-03

### Fix: refresh card balances after every bank sync, so the balance check works when a sync brings nothing new

## [1.19.0] - 2026-11-03

### Credit card balance check: bank vs tracker balance on the Financial page and card details, with likely causes of a difference (unrecorded refunds, typos, unreviewed charges) and the bank credit limit

## [1.18.0] - 2026-11-03

### Plaid: Reconnect for expired bank logins (no new Trial slot), connection-problem alerts (header dot, main-screen notification, status chips), and no duplicates when a disconnected bank is connected again

## [1.17.0] - 2026-11-02

### Bank import: pending transactions can be added the day you spend (yellow payment pill) and update automatically when they settle (green); dropped pending charges are flagged for review

## [1.16.0] - 2026-11-02

### Bank import: automatic sync (scheduled and on opening the app), bank badge on mapped payment methods, activity log for inbox decisions, mapping changes and sync failures, faster inbox loading

## [1.15.0] - 2026-11-02

### Bank import: confirm expected income with bank deposits (or add unplanned deposits as income); bank-confirmed payment methods are coloured green with bank details on hover

## [1.14.0] - 2026-11-02

### Bank import (Plaid): connect banks and review transactions in an Import Inbox (add, match, confirm fixed expenses, ignore), with in-app setup; charged-amount matching; fixed expenses linked to payment methods

## [1.13.1] - 2026-11-01

### Fix Total Debt Trend: include paid-off loans for the months they had balances, carry active loans forward when no monthly balance is entered, and correct the Active Loans count. Make vX.Y.Z image tags immutable in CI.

## [1.13.0] - 2026-10-31

### Monthly budget plan with planned savings and investments, shown in Cash Flow, Annual Summary and Budget History; budget alert and carry-forward fixes; wider activity log coverage; other tabs now refresh for loans, income, investments, credit cards and people

## [1.12.0] - 2026-10-16

### Refreshed look: new logo and header, clearer monthly summary, colour-coded expense list, smoother dialogs; dependency and security updates

## [1.11.0] - 2026-10-03

### Spending and Cash Flow analytics, date-grouped expense list with quick views, custom date range filter, month stepping

## [1.10.3] - 2026-09-14

### Show a recoverable error instead of a blank page when part of the app fails, and shut down cleanly on restart

## [1.10.2] - 2026-09-14

### Fix a regression where the health check could close the database connection after startup

## [1.10.1] - 2026-09-14

### Fix a database connection leak and verify backup archives are restorable before reporting success

## [1.10.0] - 2026-07-02

### Add ability to exclude fuzzy-matched names when standardizing place names; security dependency updates and removal of unused xlsx import.

## [1.9.7] - 2026-06-15

### Security updates and smarter posting of credit card expenses

## [1.9.6] - 2026-06-10

### Handle payments after balancing is anchored

## [1.9.5] - 2026-06-10

### Anchor credit-card current balance to latest billing cycle to prevent historical drift

## [1.9.4] - 2026-06-06

### Performance fixes

## [1.9.3] - 2026-06-06

### Mortgage form bug fixes, audit cleanup, performance optimizations

## [1.9.2] - 2026-06-01

### Optimizations to support historical data import

## [1.9.1] - 2026-05-31

### Fix loan historical-balance discrepancy and mortgage auto-payment balance drift

## [1.9.0] - 2026-05-31

### Phase 1 UX improvements, CI optimizations, event dedup fix, LOC payment tracking

## [1.8.0] - 2026-05-30

### UI/UX improvements: code splitting, accessible confirm dialogs, keyboard autocomplete

## [1.7.1] - 2026-05-07

### Add posted indicator icon on expense rows

## [1.7.0] - 2026-05-06

### Mortgage rate edit, rate history, projection payment fix

## [1.6.1] - 2026-05-02

### Fix LOC payment suppression, budget alert overflow, project cleanup

## [1.6.0] - 2026-04-18

### Mortgage detail view redesign: KPI strip and tabbed layout

## [1.5.1] - 2026-03-22

### Fix anomaly baseline to use monthly totals

## [1.5.0] - 2026-03-21

### Actionable anomaly alerts with enriched detection, suppression pipeline, alert prioritization, and redesigned UX

## [1.4.0] - 2026-03-14

### Frontend component domain grouping

## [1.3.3] - 2026-03-02

### Fix statement balance payment calculation

## [1.3.2] - 2026-03-01

### Fix loan/mortgage reminder balance status check

## [1.3.1] - 2026-02-28

### Fix budget copy-from-previous-month bugs

## [1.3.0] - 2026-02-28

### Mortgage balance interest tracking, UI refresh fix

## [1.2.4] - 2026-02-28

### Anchor-based balance calculation fix for loans and financial overview

## [1.2.3] - 2026-02-28

### Fix: use calculated balance as source of truth, fix PBT test cleanup

## [1.2.2] - 2026-02-27

### CI pipeline hardening, health check fixes, script cleanup

## [1.2.1] - 2026-02-27

### Fix version upgrade modal stale bundle deferral

## [1.2.0] - 2026-02-27

### Added
- Auth infrastructure: password gate, session tokens, authFetch wired into all frontend API calls
- User menu with logout button in header (greyed out when auth inactive)
- Fetch infrastructure consolidation: centralized fetchWithRetry with exponential backoff, retry logic, and tab ID tracking
- fetchProvider module (authAwareFetch) replacing raw fetch across all frontend services
- Raw fetch enforcement script to prevent regression

### Fixed
- Backup restore auth cache staleness: re-initialize auth state after restore to prevent lockout
- Backup WAL replay bug: flush WAL before restore file copy via closeDatabase()
- Billing cycle scheduler and activity log cleanup log noise reduced (debug level for no-op runs)
- Auth mode transition race conditions (enable/disable/refresh)
- Duplicate activity log entries when enabling password
- Graceful handling for deleted expense invoices

## [1.1.1] - 2026-02-26

### Fix backup SQLITE_MISUSE and posted date PBT race condition

## [1.1.0] - 2026-02-25

### Added
- Container update detection: open browser tabs automatically detect backend restarts/updates and display an update banner prompting users to refresh
- `startupId` field in `/api/version` response — unique per server process, enables restart detection without version bumps
- `UpdateBanner` component with refresh and dismiss controls, keyboard accessible with ARIA role="alert"
- `useContainerUpdateCheck` hook with debounce, dedup, and banner-visible suppression for resilient reconnect handling
- `onReconnect` callback prop on `useDataSync` hook — fires on SSE reconnections (not initial connect)
- Version upgrade tracking: automatic detection and activity logging of version changes on server startup
- `version_upgraded` activity log event type with `{old_version, new_version}` metadata
- Version upgrade changelog modal — appears on first page load after an upgrade, shows categorized changes
- `useVersionUpgradeCheck` hook for frontend upgrade detection via localStorage comparison
- Remote update availability checking via GitHub Releases API (`GET /api/version/check-update`)
- In-memory cache for update checks (24h TTL, configurable via `UPDATE_CHECK_INTERVAL_SECONDS`)
- Update availability banner in System Modal Updates tab
- Persistent header update indicator dot next to System button
- Centralized `changelog.js` module replacing duplicated changelog entries in SystemModal and BackupSettings

## [1.0.0] - 2026-02-23

### Changed
- Consolidated ~50 incremental database migrations into single declarative schema module
- Rebased application version from 5.17.5 to 1.0.0
- Removed ~1744 auto-migration backup files
- Removed backward-compatibility fallback patterns in billing cycle repository
- Updated all product documentation to reflect consolidated schema

---

For release history prior to 1.0.0 (formerly v1.0.0–v5.17.5), see [CHANGELOG.pre-1.0.md](CHANGELOG.pre-1.0.md).
