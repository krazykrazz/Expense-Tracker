# Real-Time Data Sync via SSE

Cross-session data synchronization using Server-Sent Events (SSE). When one browser tab or device modifies data, other connected sessions automatically refresh the affected data without polling.

## Architecture

```
Browser Tab A          Backend              Browser Tab B
    |                    |                       |
    |-- POST /expenses -->|                       |
    |                    |-- activityLogService   |
    |                    |   .logEvent()          |
    |                    |-- sseService           |
    |                    |   .broadcast('expense')|
    |                    |----------------------->|
    |                    |  SSE: {entityType,     |
    |                    |        tabId}          |
    |                    |                       |-- refreshExpenses()
```

**Data flow:**
1. A mutation controller handles a write request and calls `activityLogService.logEvent()`
2. `activityLogService` calls `sseService.broadcast(entityType, tabId)` after logging. `tabId` is `metadata.tabId` if the service passed one, otherwise the request's `X-Tab-ID` header (see [Self-Update Suppression](#self-update-suppression))
3. `sseService` writes an SSE frame to every connected client
4. Each client's `useDataSync` hook receives the event, maps the backend entity type to a routing key (see below), suppresses it if `tabId` matches the current tab, then debounces and triggers the appropriate refresh

No database changes are required — SSE state is entirely in-memory.

## Entity Types

The backend broadcasts the `entity_type` of each activity-log event. `useDataSync` first normalizes it with `ENTITY_TYPE_ALIASES` (`frontend/src/hooks/useDataSync.js`), then routes it. Types that are not listed (`settings`, `system`, `auth`, `anomaly`, `suppression_rule`) are ignored.

| Backend entity types | Routing key | Refresh action |
|----------------------|-------------|----------------|
| `expense` | `expense` | `refreshExpenses()` via ExpenseContext (also refreshes the Monthly Summary) |
| `budget` (budgets and planned-savings allocations) | `budget` | `refreshBudgets()` via SharedDataContext, plus a Monthly Summary refresh so planned savings and budget alerts update |
| `person` | `people` | `refreshPeople()` via SharedDataContext |
| `payment_method` | `payment_method` | `refreshPaymentMethods()` via SharedDataContext |
| `invoice` | `invoice` | `refreshExpenses()` (receipt badges) |
| `loan`, `loan_payment`, `loan_balance`, `mortgage_payment` | `loan` | window `syncEvent` |
| `income_source` | `income` | window `syncEvent` |
| `investment`, `investment_value` | `investment` | window `syncEvent` |
| `fixed_expense` | `fixed_expense` | window `syncEvent` |
| `credit_card_payment`, `credit_card_statement`, `billing_cycle` | `credit_card` | window `syncEvent` |

### Window `syncEvent` consumers

A window `syncEvent` does nothing by itself; components subscribe with `useSyncEvent(entityTypes, callback)` (`frontend/src/hooks/useSyncEvent.js`). Current consumers:

| Component | Reacts to | Refreshes |
|-----------|-----------|-----------|
| `SummaryPanel` | `income`, `fixed_expense`, `loan`, `investment`, `credit_card` | Monthly Summary, reminders, auto-log suggestions, anomalies |
| `FinancialOverviewModal` loans section | `loan`, `fixed_expense` | Loan list and linked fixed-expense counts |
| `FinancialOverviewModal` investments section | `investment` | Investment list and totals |
| `FinancialOverviewModal` payment methods / credit card summary | `credit_card` | Card balances and cycle status |

Not refreshed live (they load when opened): the loan, investment and credit card detail views, the Income and Fixed Expenses editors, Budgets modal tabs, Annual Summary, and the Analytics Hub.

Add a new `useSyncEvent` call to any component that holds server data for one of these entity types.

## Self-Update Suppression

Each browser tab generates a stable `TAB_ID` via `crypto.randomUUID()` at module load time (`frontend/src/utils/tabId.js`). Every mutation request includes this ID in the `X-Tab-ID` request header (added by `apiClient` and the credit card/invoice upload helpers). On the backend, `requestContextMiddleware` (`backend/utils/requestContext.js`, an `AsyncLocalStorage`) remembers the header for the rest of the request, and `activityLogService.logEvent` uses it as the broadcast `tabId` unless the caller passed `metadata.tabId`. Services therefore do not need to thread `tabId` through. Events logged outside a request (scheduler, startup) have no tab id and reach every tab. When `useDataSync` receives an event whose `tabId` matches the current tab's `TAB_ID`, it silently discards the event — the tab that made the change already has up-to-date state.

## Reconnection and Backoff

When the SSE connection drops, `useDataSync` schedules a reconnect with exponential backoff:

```
delay = min(3000 * 2^attempt, 30000)  // ms
```

- Attempt 0: 3s
- Attempt 1: 6s
- Attempt 2: 12s
- Attempt 3: 24s
- Attempt 4+: 30s (capped)

The `connectionStatus` state cycles through `'connecting'` → `'connected'` → `'disconnected'` and back to `'connecting'` on each reconnect attempt.

## Debouncing

Each entity type has an independent 500ms debounce timer. Rapid successive events for the same entity type (e.g., bulk expense imports) coalesce into a single refresh call. Different entity types debounce independently.

## Toast Notifications

After each debounced refresh fires, a brief toast appears in the bottom-right corner confirming the update. Toasts auto-dismiss after 2000ms. The `SyncToast` component respects `prefers-reduced-motion` — animations are disabled for users who have requested reduced motion.

| Entity Type | Toast Text |
|-------------|-----------|
| `expense` | ↻ Expenses updated |
| `budget` | ↻ Budget updated |
| `people` | ↻ People updated |
| `payment_method` | ↻ Payment methods updated |
| `loan` | ↻ Loans updated |
| `income` | ↻ Income updated |
| `investment` | ↻ Investments updated |
| `fixed_expense` | ↻ Fixed expenses updated |
| `credit_card` | ↻ Credit cards updated |
| `invoice` | ↻ Receipts updated |

## Visibility-Based Connection Lifecycle

The `useDataSync` hook integrates with the Page Visibility API to manage the SSE connection based on tab visibility. This eliminates idle CPU usage (~12-13% → near-zero) when the tab is in the background.

### onReconnect Callback

The hook accepts an optional `onReconnect` callback that fires when the SSE connection is re-established after a disconnection (not on the initial connect). This is used by `useContainerUpdateCheck` to detect container restarts by comparing the backend's version/startupId against the baseline captured at page load.

| Tab State | Action |
|-----------|--------|
| Hidden | Close EventSource, clear all debounce and reconnect timers, set status to `disconnected` |
| Visible (was disconnected) | Reset backoff counter, reconnect immediately, refresh all data on `onopen` |
| Visible (already connected) | No-op |

When the tab becomes visible after being hidden, the hook reconnects and triggers a full data refresh (all context refreshes + all window `syncEvent` dispatches) to catch up on any changes made while the tab was hidden. No toast notifications are shown for this bulk catch-up refresh.

The visibility handler is idempotent — repeated hidden/visible events in the same state are safely ignored.

## Keepalive Mechanism

The server sends a keepalive comment every 25 seconds:

```
: keepalive
```

This keeps the connection alive through proxies and load balancers. The 25s interval is well under Cloudflare Tunnel's 100s proxy timeout.

## Proxy and Cloudflare Compatibility

The SSE endpoint sets `X-Accel-Buffering: no` to disable nginx response buffering. Combined with the 25s keepalive, this ensures reliable delivery through Cloudflare Tunnel and other reverse proxies.

The SSE route is registered in `server.js` **before** the `generalLimiter` middleware so persistent SSE connections are not subject to the 200 req/min rate limit.

## Monitoring

The active SSE connection count is exposed via `GET /api/health` as `sseConnections` and displayed in the System Information modal under the About tab (System Information → About → Real-Time Sync).

Each broadcast to one or more connected clients is recorded in the activity log with `event_type: 'sync_broadcast'`.

## Key Files

| File | Purpose |
|------|---------|
| `backend/services/sseService.js` | Client registry, broadcast, connection count |
| `backend/controllers/syncController.js` | SSE HTTP endpoint handler |
| `backend/routes/syncRoutes.js` | Route: `GET /api/sync/events` |
| `frontend/src/hooks/useDataSync.js` | EventSource lifecycle, entity type aliases, routing, debounce, backoff |
| `frontend/src/hooks/useSyncEvent.js` | Subscribe a component to window `syncEvent`s for given entity types |
| `backend/utils/requestContext.js` | Request-scoped `X-Tab-ID` for activity-log broadcasts |
| `frontend/src/utils/tabId.js` | Stable per-tab ID, `fetchWithTabId` wrapper |
| `frontend/src/components/SyncToast.jsx` | Toast notification component |
| `frontend/src/components/SyncToast.css` | Toast styles with reduced-motion support |
| `frontend/src/hooks/useContainerUpdateCheck.js` | Hook that uses `onReconnect` to detect container restarts |
| `frontend/src/components/UpdateBanner.jsx` | Banner shown when container update is detected |


