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
2. `activityLogService` calls `sseService.broadcast(entityType, tabId)` after logging
3. `sseService` writes an SSE frame to every connected client
4. Each client's `useDataSync` hook receives the event, suppresses it if `tabId` matches the current tab, then debounces and triggers the appropriate context refresh

No database changes are required — SSE state is entirely in-memory.

## Entity Types

| Entity Type | Refresh Action |
|-------------|---------------|
| `expense` | `refreshExpenses()` via ExpenseContext |
| `budget` | `refreshBudgets()` via SharedDataContext |
| `people` | `refreshPeople()` via SharedDataContext |
| `payment_method` | `refreshPaymentMethods()` via SharedDataContext |
| `loan` | `window.dispatchEvent(new CustomEvent('syncEvent', ...))` |
| `income` | `window.dispatchEvent(new CustomEvent('syncEvent', ...))` |
| `investment` | `window.dispatchEvent(new CustomEvent('syncEvent', ...))` |
| `fixed_expense` | `window.dispatchEvent(new CustomEvent('syncEvent', ...))` |

## Self-Update Suppression

Each browser tab generates a stable `TAB_ID` via `crypto.randomUUID()` at module load time (`frontend/src/utils/tabId.js`). Every mutation request includes this ID in the `X-Tab-ID` request header. The backend passes it through to the SSE broadcast payload. When `useDataSync` receives an event whose `tabId` matches the current tab's `TAB_ID`, it silently discards the event — the tab that made the change already has up-to-date state.

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
| `frontend/src/hooks/useDataSync.js` | EventSource lifecycle, routing, debounce, backoff |
| `frontend/src/utils/tabId.js` | Stable per-tab ID, `fetchWithTabId` wrapper |
| `frontend/src/components/SyncToast.jsx` | Toast notification component |
| `frontend/src/components/SyncToast.css` | Toast styles with reduced-motion support |
