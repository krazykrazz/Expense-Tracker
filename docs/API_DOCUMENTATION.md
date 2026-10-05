# API Documentation

REST API served by the Express backend (`backend/server.js`, routes in `backend/routes/`). The frontend calls it through `API_ENDPOINTS` in `frontend/src/config.js`.

## General

### Base URL

```
http://<host>:2424/api     # Docker image (PORT=2424)
http://localhost:2626/api  # Local backend (default PORT); the Vite dev server proxies /api here
```

### Authentication

Authentication is optional (see [Authentication API](#authentication-api)).

- **Open mode** (no password set): every endpoint is accessible without credentials.
- **Password gate** (password set): every `/api` endpoint requires `Authorization: Bearer <accessToken>`, except `GET /api/health`, `GET /api/auth/status`, `POST /api/auth/login` and `POST /api/auth/refresh`. The access token comes from login/refresh; the refresh token is an HTTP-only cookie. The SSE stream (`/api/sync/events`) takes the token as a `?token=` query parameter.

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| All `/api` routes (except `GET /api/health` and `/api/sync`) | 1000 requests | 1 minute |
| `POST /api/invoices/upload`, `POST /api/payment-methods/:id/statements` | 30 requests | 15 minutes |
| `POST /api/backup/manual`, `/api/backup/restore`, `/api/backup/restore-archive` | 5 requests | 1 hour |

Rate-limited requests get `429` with `{ "error": "Too many requests, please try again later" }` (message varies by limiter) and standard `RateLimit-*` headers.

### Errors

Errors are JSON: `{ "error": "<message>" }`. Most controllers map validation errors to `400`, missing resources to `404`, conflicts to `409`, and unexpected errors to `500`.

### File Uploads

Invoices, statements and billing-cycle PDFs are `multipart/form-data`, PDF only, max 10 MB per file. Files are validated by content (PDF signature/structure), not just extension.

## Endpoint Reference

Complete list of mounted endpoints. Paths are relative to the server root. Detailed request/response documentation for selected areas follows below.

### Expenses — `expenseRoutes.js`, `placeNameRoutes.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/expenses` | List expenses. Filters: `year`, `month`, `startDate`/`endDate` (inclusive `YYYY-MM-DD`), `limit`/`offset` |
| POST | `/api/expenses` | Create an expense (optional `peopleAllocations`, `futureMonths`) |
| GET | `/api/expenses/:id` | Get an expense with its people allocations |
| PUT | `/api/expenses/:id` | Update an expense |
| DELETE | `/api/expenses/:id` | Delete an expense |
| PATCH | `/api/expenses/:id/insurance-status` | Quick insurance claim status update |
| GET | `/api/expenses/count` | Lightweight expense count |
| GET | `/api/expenses/places` | Distinct place names |
| GET | `/api/expenses/suggest-category` | Suggested category for a place |
| GET | `/api/expenses/summary` | Monthly summary data |
| GET | `/api/expenses/annual-summary` | Annual summary data |
| GET | `/api/expenses/tax-deductible` | Tax-deductible expenses summary |
| GET | `/api/expenses/tax-deductible/summary` | Lightweight tax-deductible summary (year-over-year) |
| GET | `/api/expenses/place-names/analyze` | Group similar place names |
| POST | `/api/expenses/place-names/standardize` | Apply place-name standardization |
| GET | `/api/monthly-gross` | Get monthly gross income |
| POST | `/api/monthly-gross` | Set monthly gross income |
| GET | `/api/categories` | Valid expense categories |

### Income, Fixed Expenses, Budgets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/income/:year/:month` | Income sources for a month |
| GET | `/api/income/annual/:year/by-category` | Annual income by category |
| POST | `/api/income` | Create an income source |
| POST | `/api/income/:year/:month/copy-previous` | Copy income sources from the previous month |
| PUT | `/api/income/:id` | Update an income source |
| DELETE | `/api/income/:id` | Delete an income source |
| GET | `/api/fixed-expenses/:year/:month` | Fixed expenses for a month |
| GET | `/api/fixed-expenses/by-loan/:loanId` | Fixed expenses linked to a loan |
| POST | `/api/fixed-expenses` | Create a fixed expense |
| POST | `/api/fixed-expenses/carry-forward` | Carry forward fixed expenses from the previous month |
| PUT | `/api/fixed-expenses/:id` | Update a fixed expense |
| DELETE | `/api/fixed-expenses/:id` | Delete a fixed expense |
| GET | `/api/budgets` | Budgets for a month |
| GET | `/api/budgets/summary` | Budget summary |
| GET | `/api/budgets/history` | Budget history |
| GET | `/api/budgets/suggest` | Budget suggestion from historical spending |
| POST | `/api/budgets` | Create a budget |
| POST | `/api/budgets/copy` | Copy budgets between months |
| PUT | `/api/budgets/:id` | Update a budget limit |
| DELETE | `/api/budgets/:id` | Delete a budget |

### Payment Methods, Credit Cards, Billing Cycles — `paymentMethodRoutes.js`, `billingCycleRoutes.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/payment-methods` | All payment methods |
| GET | `/api/payment-methods/active` | Active payment methods (dropdowns) |
| GET | `/api/payment-methods/display-names` | All display names |
| GET | `/api/payment-methods/:id` | One payment method |
| POST | `/api/payment-methods` | Create a payment method |
| PUT | `/api/payment-methods/:id` | Update a payment method |
| DELETE | `/api/payment-methods/:id` | Delete a payment method |
| PATCH | `/api/payment-methods/:id/active` | Activate/deactivate |
| POST | `/api/payment-methods/:id/recalculate-balance` | Recalculate credit card balance |
| GET | `/api/payment-methods/:id/statement-balance` | Calculated statement balance |
| GET | `/api/payment-methods/:id/credit-card-detail` | Unified credit card detail |
| GET | `/api/payment-methods/:id/payments` | Credit card payment history |
| GET | `/api/payment-methods/:id/payments/total` | Total payments in a date range |
| POST | `/api/payment-methods/:id/payments` | Record a credit card payment |
| DELETE | `/api/payment-methods/:id/payments/:paymentId` | Delete a payment |
| GET | `/api/payment-methods/:id/statements` | List uploaded statements |
| POST | `/api/payment-methods/:id/statements` | Upload a statement (multipart) |
| GET | `/api/payment-methods/:id/statements/:statementId` | Download a statement |
| DELETE | `/api/payment-methods/:id/statements/:statementId` | Delete a statement |
| GET | `/api/payment-methods/:id/billing-cycles` | Billing cycle history (payment method controller) |
| GET | `/api/payment-methods/:id/billing-cycles/unified` | Unified billing cycles, auto-generating missing cycles |
| GET | `/api/payment-methods/:id/billing-cycles/current` | Current cycle status |
| GET | `/api/payment-methods/:id/billing-cycles/history` | Billing cycle history |
| GET | `/api/payment-methods/:id/billing-cycles/recalculate` | Recalculate balance for a cycle period |
| POST | `/api/payment-methods/:id/billing-cycles` | Create a billing cycle record (optional PDF) |
| PUT | `/api/payment-methods/:id/billing-cycles/:cycleId` | Update a billing cycle record (optional PDF) |
| DELETE | `/api/payment-methods/:id/billing-cycles/:cycleId` | Delete a billing cycle record |
| GET | `/api/payment-methods/:id/billing-cycles/:cycleId/pdf` | Get a billing cycle statement PDF |
| POST | `/api/payment-methods/billing-cycles/dismiss-auto-generated` | Dismiss auto-generated cycle notifications |

### Loans, Mortgages, Investments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/loans` | All loans with current balances |
| POST | `/api/loans` | Create a loan |
| PUT | `/api/loans/:id` | Update a loan |
| DELETE | `/api/loans/:id` | Delete a loan |
| PUT | `/api/loans/:id/paid-off` | Mark paid off / reactivate |
| PUT | `/api/loans/:id/rate` | Update current rate (variable-rate mortgages) |
| PUT | `/api/loans/:id/property-value` | Update estimated property value (mortgage) |
| GET | `/api/loans/:id/amortization` | Amortization schedule (mortgage) |
| GET | `/api/loans/:id/equity-history` | Equity history (mortgage) |
| GET | `/api/loans/:id/insights` | Mortgage insights |
| POST | `/api/loans/:id/insights/scenario` | What-if scenario |
| GET | `/api/loans/:id/payments` | Mortgage payment history |
| POST | `/api/loans/:id/payments` | Create a mortgage payment entry |
| PUT | `/api/loans/:id/payments/:paymentId` | Update a mortgage payment entry |
| DELETE | `/api/loans/:id/payments/:paymentId` | Delete a mortgage payment entry |
| GET | `/api/loans/:loanId/loan-payments` | Loan payments |
| GET | `/api/loans/:loanId/loan-payments/:paymentId` | One loan payment |
| POST | `/api/loans/:loanId/loan-payments` | Create a loan payment |
| POST | `/api/loans/:loanId/loan-payments/auto-log` | Auto-log a payment from a linked fixed expense |
| PUT | `/api/loans/:loanId/loan-payments/:paymentId` | Update a loan payment |
| DELETE | `/api/loans/:loanId/loan-payments/:paymentId` | Delete a loan payment |
| GET | `/api/loans/:loanId/calculated-balance` | Calculated balance from payments |
| GET | `/api/loans/:loanId/payment-balance-history` | Balance history with running totals |
| GET | `/api/loans/:loanId/payment-suggestion` | Suggested payment amount |
| GET | `/api/loans/:loanId/migrate-balances/preview` | Preview balance-entry → payment migration |
| POST | `/api/loans/:loanId/migrate-balances` | Migrate balance entries to payments |
| GET | `/api/loan-balances/:loanId` | Balance entry history |
| GET | `/api/loan-balances/:loanId/:year/:month` | Balance entry for a month |
| GET | `/api/loan-balances/total/history` | Total debt over time |
| POST | `/api/loan-balances` | Create or update a balance entry |
| PUT | `/api/loan-balances/:id` | Update a balance entry |
| DELETE | `/api/loan-balances/:id` | Delete a balance entry |
| GET | `/api/investments` | All investments with current values |
| POST | `/api/investments` | Create an investment |
| PUT | `/api/investments/:id` | Update an investment |
| DELETE | `/api/investments/:id` | Delete an investment |
| GET | `/api/investment-values/:investmentId` | Value history |
| GET | `/api/investment-values/:investmentId/:year/:month` | Value for a month |
| POST | `/api/investment-values` | Create or update a value entry |
| PUT | `/api/investment-values/:id` | Update a value entry |
| DELETE | `/api/investment-values/:id` | Delete a value entry |

### People, Invoices, Reminders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/people` | All people |
| POST | `/api/people` | Create a person |
| PUT | `/api/people/:id` | Update a person |
| DELETE | `/api/people/:id` | Delete a person |
| POST | `/api/invoices/upload` | Upload an invoice (multipart; optional `personId`) |
| GET | `/api/invoices/:expenseId` | All invoices for an expense |
| GET | `/api/invoices/:expenseId/:invoiceId` | Download a specific invoice |
| GET | `/api/invoices/:expenseId/file` | Download the first invoice (legacy) |
| GET | `/api/invoices/:expenseId/metadata` | Invoice metadata |
| PUT | `/api/invoices/:expenseId` | Replace the existing invoice |
| PATCH | `/api/invoices/:invoiceId` | Update the invoice's person link |
| DELETE | `/api/invoices/:invoiceId` | Delete a specific invoice |
| DELETE | `/api/invoices/expense/:expenseId` | Delete all invoices for an expense (legacy) |
| GET | `/api/reminders/status/:year/:month` | Reminder status (investments, loans, credit cards, insurance) |
| GET | `/api/reminders/auto-log-suggestions/:year/:month` | Pending loan auto-log suggestions |

### Analytics — `analyticsRoutes.js`, `merchantAnalyticsRoutes.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/monthly-summary/:year/:month` | Monthly summary (Analytics Hub) |
| GET | `/api/analytics/trends/:year/:month` | Consolidated trends |
| GET | `/api/analytics/activity-insights/:year/:month` | Activity insights |
| GET | `/api/analytics/period-summary` | Income/spending breakdown over `start`..`end` (`YYYY-MM`) |
| GET | `/api/analytics/data-sufficiency` | Data availability for analytics |
| GET | `/api/analytics/patterns` | Recurring spending patterns |
| GET | `/api/analytics/patterns/day-of-week` | Day-of-week analysis |
| GET | `/api/analytics/seasonal` | Seasonal analysis |
| GET | `/api/analytics/predictions/:year/:month` | Month-end prediction |
| GET | `/api/analytics/predictions/:year/:month/comparison` | Historical comparison |
| GET | `/api/analytics/anomalies` | Detected anomalies |
| POST | `/api/analytics/anomalies/:expenseId/dismiss` | Dismiss an anomaly |
| POST | `/api/analytics/anomalies/:expenseId/mark-expected` | Mark an anomaly as expected (creates a suppression rule) |
| GET | `/api/analytics/anomaly-suppression-rules` | Suppression rules |
| DELETE | `/api/analytics/anomaly-suppression-rules/:id` | Delete a suppression rule |
| GET | `/api/analytics/merchants` | Top merchants |
| GET | `/api/analytics/merchants/:name` | Merchant details |
| GET | `/api/analytics/merchants/:name/trend` | Merchant monthly trend |
| GET | `/api/analytics/merchants/:name/expenses` | Merchant expenses |

### System — backup, activity log, settings, auth, health, sync

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/backup` | Download a backup (legacy) |
| GET | `/api/backup/list` | List backups |
| GET | `/api/backup/stats` | Backup storage statistics |
| GET | `/api/backup/config` | Backup configuration |
| PUT | `/api/backup/config` | Update backup configuration |
| POST | `/api/backup/manual` | Run a backup now |
| POST | `/api/backup/restore` | Restore from an uploaded backup file (multipart `backup`) |
| POST | `/api/backup/restore-archive` | Restore from an existing backup by filename |
| GET | `/api/activity-logs` | Recent activity events (paginated) |
| GET | `/api/activity-logs/stats` | Cleanup statistics |
| GET | `/api/activity-logs/settings` | Retention settings |
| PUT | `/api/activity-logs/settings` | Update retention settings |
| GET | `/api/settings/timezone` | Get timezone setting |
| PUT | `/api/settings/timezone` | Update timezone setting |
| GET | `/api/auth/status` | Auth mode and status (public) |
| POST | `/api/auth/login` | Log in (public) |
| POST | `/api/auth/refresh` | Refresh access token via cookie (public) |
| POST | `/api/auth/logout` | Log out |
| PUT | `/api/auth/password` | Set or change the password |
| DELETE | `/api/auth/password` | Remove the password (back to open mode) |
| GET | `/api/health` | Health check (public; 503 if the database is unreachable) |
| GET | `/api/version` | Version, commit, build date, `startupId` |
| GET | `/api/version/check-update` | Check GitHub Releases for a newer version |
| GET | `/api/sync/events` | Server-Sent Events stream for real-time sync |

---

# Invoice API

## Endpoints

### 1. Upload Invoice

Upload a PDF invoice for a tax-deductible expense (Tax - Medical or Tax - Donation). Supports multiple invoices per expense with optional person linking (medical expenses only).

**Endpoint:** `POST /invoices/upload`

**Content-Type:** `multipart/form-data`

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| expenseId | number | Yes | ID of the tax-deductible expense to attach invoice to |
| invoice | File | Yes | PDF file to upload (max 10MB) |
| personId | number | No | ID of person to link invoice to (v4.13.0+, medical expenses only) |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "invoice": {
    "id": 1,
    "expenseId": 123,
    "personId": 5,
    "personName": "John Doe",
    "filename": "123_1704067200_receipt.pdf",
    "originalFilename": "receipt.pdf",
    "fileSize": 245760,
    "uploadDate": "2025-01-01T12:00:00Z"
  }
}
```

**Error Responses:**

```json
HTTP/1.1 400 Bad Request
{
  "error": "Only PDF files are allowed"
}
```

```json
HTTP/1.1 400 Bad Request
{
  "error": "Person is not assigned to this expense"
}
```

```json
HTTP/1.1 413 Payload Too Large
{
  "error": "File size exceeds 10MB limit"
}
```

```json
HTTP/1.1 404 Not Found
{
  "error": "Expense not found"
}
```

```json
HTTP/1.1 409 Conflict
{
  "error": "Invoices can only be attached to tax-deductible expenses (Tax - Medical or Tax - Donation)"
}
```

**Example:**
```javascript
const formData = new FormData();
formData.append('expenseId', 123);
formData.append('invoice', pdfFile);
formData.append('personId', 5); // Optional: link to person (medical expenses only)

const response = await fetch('http://localhost:2424/api/invoices/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include'
});

const data = await response.json();
```

---

### 2. Get All Invoices for Expense

Retrieve all invoices attached to an expense.

**Endpoint:** `GET /invoices/:expenseId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| expenseId | number | Yes | ID of the expense |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "invoices": [
    {
      "id": 1,
      "expenseId": 123,
      "personId": 5,
      "personName": "John Doe",
      "filename": "123_1704067200_receipt.pdf",
      "originalFilename": "receipt.pdf",
      "fileSize": 245760,
      "uploadDate": "2025-01-01T12:00:00Z"
    },
    {
      "id": 2,
      "expenseId": 123,
      "personId": 6,
      "personName": "Jane Doe",
      "filename": "123_1704153600_medical_bill.pdf",
      "originalFilename": "medical_bill.pdf",
      "fileSize": 512000,
      "uploadDate": "2025-01-02T12:00:00Z"
    }
  ],
  "count": 2
}
```

**Error Responses:**

```json
HTTP/1.1 404 Not Found
{
  "error": "Expense not found"
}
```

**Example:**
```javascript
const response = await fetch(`http://localhost:2424/api/invoices/${expenseId}`, {
  credentials: 'include'
});

const data = await response.json();
console.log(`Found ${data.count} invoices`);
```

---

### 3. Get Specific Invoice File

Retrieve a specific PDF file by invoice ID.

**Endpoint:** `GET /invoices/:expenseId/:invoiceId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| expenseId | number | Yes | ID of the expense |
| invoiceId | number | Yes | ID of the specific invoice |

**Success Response:**
```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="receipt.pdf"
Content-Length: 245760

[PDF file binary data]
```

**Error Responses:**

```json
HTTP/1.1 404 Not Found
{
  "error": "Invoice not found"
}
```

```json
HTTP/1.1 403 Forbidden
{
  "error": "You don't have permission to access this invoice"
}
```

**Example:**
```javascript
const response = await fetch(`http://localhost:2424/api/invoices/${expenseId}/${invoiceId}`, {
  credentials: 'include'
});

if (response.ok) {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  // Use url to display PDF
}
```

---

### 4. Get Invoice Metadata

Retrieve invoice information for all invoices without downloading files.

**Endpoint:** `GET /invoices/:expenseId/metadata`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| expenseId | number | Yes | ID of the expense |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "invoices": [
    {
      "id": 1,
      "expenseId": 123,
      "personId": 5,
      "personName": "John Doe",
      "filename": "123_1704067200_receipt.pdf",
      "originalFilename": "receipt.pdf",
      "fileSize": 245760,
      "uploadDate": "2025-01-01T12:00:00Z"
    }
  ],
  "count": 1
}
```

**Error Responses:**

```json
HTTP/1.1 404 Not Found
{
  "error": "Expense not found"
}
```

**Example:**
```javascript
const response = await fetch(`http://localhost:2424/api/invoices/${expenseId}/metadata`, {
  credentials: 'include'
});

const data = await response.json();
console.log(`Total invoices: ${data.count}`);
```

---

### 5. Delete Specific Invoice

Remove a specific invoice by its ID.

**Endpoint:** `DELETE /invoices/:invoiceId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| invoiceId | number | Yes | ID of the invoice to delete |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Invoice deleted successfully"
}
```

**Error Responses:**

```json
HTTP/1.1 404 Not Found
{
  "error": "Invoice not found"
}
```

```json
HTTP/1.1 403 Forbidden
{
  "error": "You don't have permission to delete this invoice"
}
```

**Example:**
```javascript
const response = await fetch(`http://localhost:2424/api/invoices/${invoiceId}`, {
  method: 'DELETE',
  credentials: 'include'
});

const data = await response.json();
if (data.success) {
  console.log('Invoice deleted');
}
```

---

### 6. Update Invoice Person Link

Update the person association for an invoice.

**Endpoint:** `PATCH /invoices/:invoiceId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| invoiceId | number | Yes | ID of the invoice to update |

**Request Body:**
```json
{
  "personId": 5  // or null to unlink
}
```

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "invoice": {
    "id": 1,
    "expenseId": 123,
    "personId": 5,
    "personName": "John Doe",
    "filename": "123_1704067200_receipt.pdf",
    "originalFilename": "receipt.pdf",
    "fileSize": 245760,
    "uploadDate": "2025-01-01T12:00:00Z"
  }
}
```

**Error Responses:**

```json
HTTP/1.1 404 Not Found
{
  "error": "Invoice not found"
}
```

```json
HTTP/1.1 400 Bad Request
{
  "error": "Person is not assigned to this expense"
}
```

**Example:**
```javascript
const response = await fetch(`http://localhost:2424/api/invoices/${invoiceId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ personId: 5 }),
  credentials: 'include'
});

const data = await response.json();
if (data.success) {
  console.log(`Invoice linked to ${data.invoice.personName}`);
}
```

---

### 7. Delete Invoice by Expense ID (Legacy)

Remove all invoices for an expense. Maintained for backward compatibility.

**Endpoint:** `DELETE /invoices/expense/:expenseId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| expenseId | number | Yes | ID of the expense |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "All invoices deleted successfully",
  "deletedCount": 3
}
```

**Note:** This endpoint deletes ALL invoices for the expense. Use `DELETE /invoices/:invoiceId` to delete specific invoices.

---

## Enhanced Expense Endpoints

### Update Insurance Status (Quick)

Quickly update the insurance claim status for a medical expense without modifying other fields.

**Endpoint:** `PATCH /expenses/:id/insurance-status`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | ID of the medical expense |

**Request Body:**
```json
{
  "status": "in_progress"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | New claim status: 'not_claimed', 'in_progress', 'paid', 'denied' |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 123,
  "date": "2026-01-15",
  "place": "Medical Clinic",
  "amount": 50.00,
  "type": "Tax - Medical",
  "insurance_eligible": 1,
  "claim_status": "in_progress",
  "original_cost": 200.00
}
```

**Error Responses:**

```json
HTTP/1.1 400 Bad Request
{
  "error": "Claim status must be one of: not_claimed, in_progress, paid, denied"
}
```

```json
HTTP/1.1 400 Bad Request
{
  "error": "Insurance fields are only valid for Tax - Medical expenses"
}
```

```json
HTTP/1.1 404 Not Found
{
  "error": "Expense not found"
}
```

**Example:**
```javascript
const response = await fetch(`http://localhost:2424/api/expenses/${expenseId}/insurance-status`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'paid' }),
  credentials: 'include'
});

const updatedExpense = await response.json();
```

---

### Get Expense (Enhanced)

The existing expense endpoint now includes invoice information.

**Endpoint:** `GET /expenses/:id`

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "expense": {
    "id": 123,
    "date": "2025-01-01",
    "place": "Medical Clinic",
    "amount": 150.00,
    "type": "Tax - Medical",
    "method": "Credit Card",
    "week": 1,
    "people": [
      {
        "personId": 1,
        "name": "John Doe",
        "amount": 150.00
      }
    ],
    "invoices": [
      {
        "id": 1,
        "personId": 1,
        "personName": "John Doe",
        "filename": "123_1704067200_receipt.pdf",
        "originalFilename": "receipt.pdf",
        "fileSize": 245760,
        "uploadDate": "2025-01-01T12:00:00Z"
      }
    ],
    "invoiceCount": 1,
    "hasInvoice": true
  }
}
```

---

### Get Tax Deductible Expenses (Enhanced)

The tax deductible endpoint now includes invoice counts and supports filtering.

**Endpoint:** `GET /expenses/tax-deductible`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | number | No | Filter by year (default: current year) |
| invoiceStatus | string | No | Filter by invoice status: 'with', 'without', 'all' (default: 'all') |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "expenses": [
    {
      "id": 123,
      "date": "2025-01-01",
      "place": "Medical Clinic",
      "amount": 150.00,
      "type": "Tax - Medical",
      "people": [...],
      "invoiceCount": 2,
      "hasInvoice": true
    },
    {
      "id": 124,
      "date": "2025-01-05",
      "place": "Pharmacy",
      "amount": 45.00,
      "type": "Tax - Medical",
      "people": [...],
      "invoiceCount": 0,
      "hasInvoice": false
    }
  ]
}
```

---

# Payment Methods API

## Overview

The Payment Methods API provides endpoints for managing configurable payment methods. Payment methods are now stored in the database instead of being hardcoded, allowing users to create, update, and manage their own payment methods with type-specific attributes.

### Payment Method Types

| Type | Description | Required Fields | Optional Fields |
|------|-------------|-----------------|-----------------|
| `cash` | Cash payments | display_name | - |
| `cheque` | Cheque payments | display_name | account_details |
| `debit` | Debit card payments | display_name | account_details |
| `credit_card` | Credit card payments | display_name, full_name | credit_limit, payment_due_day, billing_cycle_start, billing_cycle_end |

---

## Payment Method Endpoints

### 1. Get All Payment Methods

Retrieve all payment methods with optional filtering.

**Endpoint:** `GET /payment-methods`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | string | No | Filter by type: 'cash', 'cheque', 'debit', 'credit_card' |
| activeOnly | boolean | No | If true, return only active payment methods (default: false) |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "paymentMethods": [
    {
      "id": 1,
      "type": "cash",
      "display_name": "Cash",
      "full_name": "Cash",
      "account_details": null,
      "credit_limit": null,
      "current_balance": 0,
      "payment_due_day": null,
      "billing_cycle_start": null,
      "billing_cycle_end": null,
      "is_active": 1,
      "expense_count": 45,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    {
      "id": 4,
      "type": "credit_card",
      "display_name": "CIBC MC",
      "full_name": "CIBC Mastercard",
      "account_details": null,
      "credit_limit": 5000.00,
      "current_balance": 1250.50,
      "payment_due_day": 15,
      "billing_cycle_start": 16,
      "billing_cycle_end": 15,
      "is_active": 1,
      "expense_count": 120,
      "utilization_percentage": 25.01,
      "days_until_due": 5,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-15T10:30:00Z"
    }
  ]
}
```

**Example:**
```javascript
// Get all payment methods
const response = await fetch('http://localhost:2424/api/payment-methods');

// Get only active credit cards
const response = await fetch('http://localhost:2424/api/payment-methods?type=credit_card&activeOnly=true');
```

---

### 2. Get Payment Method by ID

Retrieve a specific payment method with computed fields.

**Endpoint:** `GET /payment-methods/:id`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Payment method ID |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "paymentMethod": {
    "id": 4,
    "type": "credit_card",
    "display_name": "CIBC MC",
    "full_name": "CIBC Mastercard",
    "credit_limit": 5000.00,
    "current_balance": 1250.50,
    "payment_due_day": 15,
    "billing_cycle_start": 16,
    "billing_cycle_end": 15,
    "is_active": 1,
    "expense_count": 120,
    "utilization_percentage": 25.01,
    "days_until_due": 5,
    "current_cycle_spending": 450.00
  }
}
```

**Error Responses:**
```json
HTTP/1.1 404 Not Found
{
  "error": "Payment method not found"
}
```

---

### 3. Get Display Names

Retrieve all payment method display names (for validation and dropdowns).

**Endpoint:** `GET /payment-methods/display-names`

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "displayNames": ["Cash", "Debit", "Cheque", "CIBC MC", "PCF MC", "WS VISA", "RBC VISA"]
}
```

---

### 4. Create Payment Method

Create a new payment method.

**Endpoint:** `POST /payment-methods`

**Request Body:**
```json
{
  "type": "credit_card",
  "display_name": "Amex Gold",
  "full_name": "American Express Gold Card",
  "credit_limit": 10000.00,
  "payment_due_day": 20,
  "billing_cycle_start": 21,
  "billing_cycle_end": 20
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | Payment method type |
| display_name | string | Yes | Short name for dropdowns (must be unique) |
| full_name | string | Credit cards only | Full name of the card |
| account_details | string | No | Optional account reference (last 4 digits, etc.) |
| credit_limit | number | No | Credit limit (credit cards only) |
| payment_due_day | number | No | Day of month payment is due (1-31) |
| billing_cycle_start | number | No | Day billing cycle starts (1-31) |
| billing_cycle_end | number | No | Day billing cycle ends (1-31) |

**Success Response:**
```json
HTTP/1.1 201 Created
Content-Type: application/json

{
  "paymentMethod": {
    "id": 8,
    "type": "credit_card",
    "display_name": "Amex Gold",
    "full_name": "American Express Gold Card",
    "credit_limit": 10000.00,
    "current_balance": 0,
    "payment_due_day": 20,
    "is_active": 1
  }
}
```

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{
  "error": "Display name is required"
}
```

```json
HTTP/1.1 400 Bad Request
{
  "error": "A payment method with this display name already exists"
}
```

```json
HTTP/1.1 400 Bad Request
{
  "error": "Full name is required for credit cards"
}
```

---

### 5. Update Payment Method

Update an existing payment method.

**Endpoint:** `PUT /payment-methods/:id`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Payment method ID |

**Request Body:**
```json
{
  "display_name": "Amex Gold",
  "full_name": "American Express Gold Card",
  "credit_limit": 15000.00,
  "payment_due_day": 25
}
```

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "paymentMethod": {
    "id": 8,
    "type": "credit_card",
    "display_name": "Amex Gold",
    "full_name": "American Express Gold Card",
    "credit_limit": 15000.00,
    "current_balance": 500.00,
    "payment_due_day": 25,
    "is_active": 1
  }
}
```

**Error Responses:**
```json
HTTP/1.1 404 Not Found
{
  "error": "Payment method not found"
}
```

---

### 6. Delete Payment Method

Delete a payment method (only if no associated expenses).

**Endpoint:** `DELETE /payment-methods/:id`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Payment method ID |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Payment method deleted successfully"
}
```

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{
  "error": "Cannot delete payment method with associated expenses. Mark it as inactive instead"
}
```

```json
HTTP/1.1 404 Not Found
{
  "error": "Payment method not found"
}
```

---

### 7. Set Payment Method Active/Inactive

Toggle the active status of a payment method.

**Endpoint:** `PATCH /payment-methods/:id/active`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Payment method ID |

**Request Body:**
```json
{
  "isActive": false
}
```

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "paymentMethod": {
    "id": 8,
    "display_name": "Amex Gold",
    "is_active": 0
  }
}
```

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{
  "error": "Cannot deactivate the last active payment method"
}
```

---

## Credit Card Payment Endpoints

### 1. Record Credit Card Payment

Record a payment made to a credit card.

**Endpoint:** `POST /payment-methods/:id/payments`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Credit card payment method ID |

**Request Body:**
```json
{
  "amount": 500.00,
  "payment_date": "2026-01-15",
  "notes": "Monthly payment"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Payment amount (must be positive) |
| payment_date | string | Yes | Payment date (YYYY-MM-DD) |
| notes | string | No | Optional notes |

**Success Response:**
```json
HTTP/1.1 201 Created
Content-Type: application/json

{
  "payment": {
    "id": 1,
    "payment_method_id": 4,
    "amount": 500.00,
    "payment_date": "2026-01-15",
    "notes": "Monthly payment",
    "created_at": "2026-01-15T10:30:00Z"
  },
  "newBalance": 750.50
}
```

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{
  "error": "Payments can only be recorded for credit card payment methods"
}
```

```json
HTTP/1.1 400 Bad Request
{
  "error": "Payment amount must be greater than zero"
}
```

---

### 2. Get Payment History

Retrieve payment history for a credit card.

**Endpoint:** `GET /payment-methods/:id/payments`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Credit card payment method ID |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| startDate | string | No | Filter start date (YYYY-MM-DD) |
| endDate | string | No | Filter end date (YYYY-MM-DD) |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "payments": [
    {
      "id": 2,
      "payment_method_id": 4,
      "amount": 500.00,
      "payment_date": "2026-01-15",
      "notes": "Monthly payment",
      "created_at": "2026-01-15T10:30:00Z"
    },
    {
      "id": 1,
      "payment_method_id": 4,
      "amount": 300.00,
      "payment_date": "2025-12-15",
      "notes": "December payment",
      "created_at": "2025-12-15T09:00:00Z"
    }
  ],
  "totalPayments": 800.00
}
```

---

### 3. Delete Payment

Delete a credit card payment record.

**Endpoint:** `DELETE /payment-methods/:id/payments/:paymentId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Credit card payment method ID |
| paymentId | number | Yes | Payment record ID |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Payment deleted successfully",
  "newBalance": 1250.50
}
```

---

## Credit Card Statement Endpoints

### 1. Upload Statement

Upload a credit card statement PDF.

**Endpoint:** `POST /payment-methods/:id/statements`

**Content-Type:** `multipart/form-data`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Credit card payment method ID |

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| statement | File | Yes | PDF file (max 10MB) |
| statement_date | string | Yes | Statement date (YYYY-MM-DD) |
| statement_period_start | string | Yes | Period start date (YYYY-MM-DD) |
| statement_period_end | string | Yes | Period end date (YYYY-MM-DD) |

**Success Response:**
```json
HTTP/1.1 201 Created
Content-Type: application/json

{
  "statement": {
    "id": 1,
    "payment_method_id": 4,
    "statement_date": "2026-01-15",
    "statement_period_start": "2025-12-16",
    "statement_period_end": "2026-01-15",
    "filename": "4_1705312200_statement.pdf",
    "original_filename": "january_statement.pdf",
    "file_size": 245760,
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

---

### 2. Get Statements

Retrieve statement history for a credit card.

**Endpoint:** `GET /payment-methods/:id/statements`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Credit card payment method ID |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "statements": [
    {
      "id": 1,
      "payment_method_id": 4,
      "statement_date": "2026-01-15",
      "statement_period_start": "2025-12-16",
      "statement_period_end": "2026-01-15",
      "original_filename": "january_statement.pdf",
      "file_size": 245760,
      "created_at": "2026-01-15T10:30:00Z"
    }
  ]
}
```

---

### 3. Download Statement

Download a specific statement PDF.

**Endpoint:** `GET /payment-methods/:id/statements/:statementId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Credit card payment method ID |
| statementId | number | Yes | Statement ID |

**Success Response:**
```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="january_statement.pdf"

[PDF file binary data]
```

---

### 4. Delete Statement

Delete a statement record and file.

**Endpoint:** `DELETE /payment-methods/:id/statements/:statementId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Credit card payment method ID |
| statementId | number | Yes | Statement ID |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Statement deleted successfully"
}
```

---

## Expense Payment Method Fields

The expense API accepts either `payment_method_id` (preferred) or `method` (display name); the service resolves one from the other. The `method` column keeps the display name for UI display and filtering.

---

## Credit Card Balance Tracking

- **Current balance** is anchored to the latest billing cycle record: its effective balance (actual if entered, else calculated), plus expenses with effective date (`COALESCE(posted_date, date)`) after the cycle end up to today, minus payments in the same window. Without any billing cycle record it falls back to all expenses minus all payments up to today. Computed on read by `GET /api/payment-methods` and `/:id/credit-card-detail`; `POST /:id/recalculate-balance` stores the recomputed value.
- **Utilization**: `current_balance / credit_limit × 100`; warning at ≥ 30%, danger at ≥ 70%.
- **Due date**: `days_until_due` from `payment_due_day`; payment reminders appear when due within 7 days and the statement isn't paid.

See [Configurable Payment Methods](features/CONFIGURABLE_PAYMENT_METHODS.md#credit-card-balance-calculation) for details.

---

## Credit Card Posted Date

### Overview

For credit card expenses, an optional `posted_date` field allows distinguishing between the transaction date (when the purchase was made) and the posted date (when the charge appeared on the credit card statement).

### How It Works

- **Transaction Date (`date`)**: When the purchase was made
- **Posted Date (`posted_date`)**: When the charge posted to the credit card (optional)

Balance calculations use `COALESCE(posted_date, date)` - meaning the posted date is used if set, otherwise the transaction date is used.

### API Usage

When creating or updating an expense with a credit card payment method, include the optional `posted_date` field:

**Create Expense with Posted Date:**
```json
POST /api/expenses
{
  "date": "2026-01-25",
  "place": "Amazon",
  "amount": 50.00,
  "type": "Other",
  "payment_method_id": 4,
  "posted_date": "2026-01-28"
}
```

**Validation Rules:**
- `posted_date` must be in YYYY-MM-DD format or null
- `posted_date` must be >= `date` (transaction date)
- `posted_date` is only meaningful for credit card payment methods

**Response:**
```json
{
  "id": 123,
  "date": "2026-01-25",
  "place": "Amazon",
  "amount": 50.00,
  "type": "Other",
  "method": "CIBC MC",
  "payment_method_id": 4,
  "posted_date": "2026-01-28"
}
```

### Balance Calculation Impact

When calculating credit card balances for a specific date:
- Expenses with `posted_date` set: counted if `posted_date <= target_date`
- Expenses without `posted_date`: counted if `date <= target_date`

This allows pre-logging expenses that haven't posted yet without affecting the current balance.

---

## Billing Cycle History Endpoints

### Overview

The billing cycle history feature provides comprehensive tracking of credit card billing cycles with automatic cycle generation, statement balance entry, trend analysis, and transaction counting.

### 1. Get Unified Billing Cycles

Retrieve all billing cycles (actual and auto-generated) for a credit card.

**Endpoint:** `GET /api/payment-methods/:id/billing-cycles/unified`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Credit card payment method ID |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| limit | number | No | Maximum cycles to return (default 12) |
| include_auto_generate | boolean | No | `true`/`false`/`1`/`0`. Whether to auto-generate missing cycles on request (default `true`). Missing cycles are also generated by the background billing cycle scheduler |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "billingCycles": [
    {
      "id": 1,
      "payment_method_id": 4,
      "cycle_start_date": "2026-01-16",
      "cycle_end_date": "2026-02-15",
      "actual_statement_balance": 1234.56,
      "calculated_statement_balance": 1189.23,
      "effective_balance": 1234.56,
      "balance_type": "actual",
      "transaction_count": 23,
      "trend_indicator": {
        "type": "higher",
        "icon": "↑",
        "amount": 145.33,
        "cssClass": "trend-higher"
      },
      "minimum_payment": 25.00,
      "notes": "Statement received via email",
      "statement_pdf_path": "4_2026-02-15_statement.pdf"
    }
  ],
  "autoGeneratedCount": 0,
  "totalCount": 1
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| calculated_statement_balance | number | System-computed balance: `max(0, round(previousBalance + expenses − payments, 2))`. Includes carry-forward from the previous cycle's effective balance, expenses posted during the cycle, and credit card payments made during the cycle. Floored at zero. |
| effective_balance | number | Balance to display (actual if entered, otherwise calculated) |
| balance_type | string | "actual" or "calculated" |
| transaction_count | number | Number of expenses in the cycle |
| trend_indicator | object/null | Comparison to previous cycle |

**Trend Indicator Types:**
| Type | Icon | CSS Class | Meaning |
|------|------|-----------|---------|
| higher | ↑ | trend-higher | Higher than previous cycle |
| lower | ↓ | trend-lower | Lower than previous cycle |
| same | ✓ | trend-same | Same as previous cycle (within $0.01) |

---

### 2. Create Billing Cycle Record

Record the statement balance for the card's most recently closed cycle. The cycle dates are determined by the server from the card's billing cycle day.

**Endpoint:** `POST /api/payment-methods/:id/billing-cycles`

**Content-Type:** `application/json`, or `multipart/form-data` when attaching a PDF

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| actual_statement_balance | number | Yes | Statement balance (≥ 0) |
| minimum_payment | number | No | Minimum payment due (≥ 0) |
| notes | string | No | User notes |
| statement | File | No | Statement PDF (multipart only, max 10 MB) |

**Success Response:** `201 Created` with `{ "success": true, "billingCycle": { ... } }`

**Errors:** `400` validation, `404` payment method not found, `409` (`code: "DUPLICATE_ENTRY"`) a record already exists for that period.

---

### 3. Update Billing Cycle Record

**Endpoint:** `PUT /api/payment-methods/:id/billing-cycles/:cycleId`

Same fields as create, all optional. A new `statement` PDF replaces (and deletes) the previous file. Accepts JSON when no file is attached.

**Success Response:** `200 OK` with `{ "success": true, "billingCycle": { ... } }`

---

### 4. Delete Billing Cycle Record

**Endpoint:** `DELETE /api/payment-methods/:id/billing-cycles/:cycleId`

Deletes the record and its statement PDF, if any.

**Success Response:**
```json
{
  "success": true,
  "message": "Billing cycle record deleted successfully"
}
```

---

### 5. Get Billing Cycle Statement PDF

**Endpoint:** `GET /api/payment-methods/:id/billing-cycles/:cycleId/pdf`

Returns the PDF (`Content-Type: application/pdf`), or `404` if the cycle has no PDF or the file is missing.

---

### Other Billing Cycle Endpoints

- `GET /api/payment-methods/:id/billing-cycles/current` — current cycle status
- `GET /api/payment-methods/:id/billing-cycles/history` — history (`limit`, `startDate`, `endDate`)
- `GET /api/payment-methods/:id/billing-cycles/recalculate` — recalculate the balance for a cycle period
- `GET /api/payment-methods/:id/credit-card-detail` — unified detail: card, current cycle status, billing cycles, and an `errors` array for partial failures
- `POST /api/payment-methods/billing-cycles/dismiss-auto-generated` — dismiss auto-generated cycle notifications

---

## Credit Card Statement Balance

### Overview

The statement balance feature automatically calculates what amount is due from the previous billing cycle, enabling smart payment alert suppression when statements are paid in full.

### Key Concepts

- **Statement Balance**: The calculated amount due from the previous billing cycle (expenses in cycle minus payments made)
- **Billing Cycle Day**: The day of the month when the statement closes (1-31)
- **Current Balance**: The total outstanding balance including current cycle charges

### How Statement Balance is Calculated

1. **Determine Previous Billing Cycle**: Based on `billing_cycle_day` and current date
   - Example: If billing_cycle_day = 15 and today is Feb 2, previous cycle is Dec 16 - Jan 15
2. **Sum Expenses**: All expenses where `COALESCE(posted_date, date)` falls within the cycle
3. **Subtract Payments**: Payments made since the statement date
4. **Floor at Zero**: Negative balances (overpayments) are reported as zero

### Credit Card Reminder Response (Enhanced)

The reminder endpoint now includes statement balance information:

**Endpoint:** `GET /api/reminders/status/:year/:month`

**Enhanced Response Fields for Credit Cards:**
```json
{
  "creditCards": {
    "overdueCount": 0,
    "dueSoonCount": 1,
    "overdueCards": [],
    "dueSoonCards": [
      {
        "id": 4,
        "display_name": "CIBC MC",
        "current_balance": 1500.00,
        "statement_balance": 850.00,
        "required_payment": 850.00,
        "credit_limit": 5000.00,
        "payment_due_day": 20,
        "billing_cycle_day": 15,
        "days_until_due": 5,
        "is_statement_paid": false,
        "cycle_start_date": "2025-12-16",
        "cycle_end_date": "2026-01-15",
        "is_due_soon": true,
        "is_overdue": false
      }
    ],
    "allCreditCards": [...]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| statement_balance | number | Calculated statement balance (expenses - payments) |
| required_payment | number | Amount user needs to pay (same as statement_balance) |
| is_statement_paid | boolean | True if statement_balance <= 0 |
| cycle_start_date | string | Start date of the statement period (YYYY-MM-DD) |
| cycle_end_date | string | End date of the statement period (YYYY-MM-DD) |

### Alert Logic

- **Show Reminder**: When `statement_balance > 0` AND `days_until_due` is between 0 and 7
- **Suppress Reminder**: When `statement_balance <= 0` (statement paid in full)
- **Backward Compatibility**: Cards without `billing_cycle_day` use `current_balance` for alerts

### Required Fields for New Credit Cards

When creating a credit card, the following fields are now required:
- `billing_cycle_day` (1-31): Day the statement closes
- `payment_due_day` (1-31): Day payment is due

**Validation Errors:**
```json
HTTP/1.1 400 Bad Request
{
  "error": "Billing cycle day is required for credit cards"
}
```

```json
HTTP/1.1 400 Bad Request
{
  "error": "Billing cycle day must be between 1 and 31"
}
```

---

# Loan Payment Tracking API

## Overview

Payment-based tracking system for loans and mortgages. Records individual payments and calculates balance dynamically. Lines of credit continue to use balance-based tracking.

Note the two payment resources: `/api/loans/:loanId/loan-payments` (documented here) and the mortgage payment-amount history at `/api/loans/:id/payments` (see the [Endpoint Reference](#loans-mortgages-investments)).

## Loan Payment Endpoints

### 1. Create Payment

Record a new loan payment.

**Endpoint:** `POST /api/loans/:loanId/loan-payments`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| loanId | number | Yes | Loan ID (must be loan or mortgage type) |

**Request Body:**
```json
{
  "amount": 500.00,
  "payment_date": "2026-01-15",
  "notes": "Monthly payment",
  "balanceOverride": 192500.00
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Payment amount (must be positive) |
| payment_date | string | Yes | Payment date (YYYY-MM-DD, not future) |
| notes | string | No | Optional notes |
| balanceOverride | number | No | Actual remaining balance from mortgage statement (mortgages only, must be non-negative). Creates a balance snapshot to correct drift. Silently ignored for non-mortgage loans. |

**Side Effects (Mortgages):**
- If `balanceOverride` is provided: creates a balance snapshot at the payment date and logs a `balance_override_applied` activity event.
- If `balanceOverride` is **not** provided: the service auto-calculates the new balance and creates a snapshot to keep the anchor fresh. This is non-fatal — if it fails, the payment still succeeds. Only triggers when the mortgage is interest-aware.

**Success Response:**
```json
HTTP/1.1 201 Created
{
  "id": 1,
  "loan_id": 1,
  "amount": 500.00,
  "payment_date": "2026-01-15",
  "notes": "Monthly payment",
  "created_at": "2026-01-15T10:30:00Z"
}
```

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{ "error": "Payment amount must be a positive number" }
```

```json
HTTP/1.1 400 Bad Request
{ "error": "Payment tracking is only available for loans and mortgages" }
```

---

### 2. Get All Payments

Retrieve all payments for a loan.

**Endpoint:** `GET /api/loans/:loanId/loan-payments`

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "payments": [
    {
      "id": 2,
      "loan_id": 1,
      "amount": 500.00,
      "payment_date": "2026-01-15",
      "notes": "January payment",
      "running_balance": 9500.00
    },
    {
      "id": 1,
      "loan_id": 1,
      "amount": 500.00,
      "payment_date": "2025-12-15",
      "notes": "December payment",
      "running_balance": 10000.00
    }
  ],
  "totalPayments": 1000.00,
  "paymentCount": 2
}
```

---

### 3. Update Payment

Update an existing payment entry.

**Endpoint:** `PUT /api/loans/:loanId/loan-payments/:paymentId`

**Request Body:**
```json
{
  "amount": 550.00,
  "payment_date": "2026-01-15",
  "notes": "Updated payment",
  "balanceOverride": 192000.00
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Payment amount (must be positive) |
| payment_date | string | Yes | Payment date (YYYY-MM-DD, not future) |
| notes | string | No | Optional notes |
| balanceOverride | number | No | Same behavior as Create Payment (mortgages only) |

**Side Effects (Mortgages):** Same auto-snapshot behavior as Create Payment — override creates an explicit snapshot; no override triggers an auto-calculated snapshot.

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "id": 1,
  "loan_id": 1,
  "amount": 550.00,
  "payment_date": "2026-01-15",
  "notes": "Updated payment"
}
```

---

### 4. Delete Payment

Delete a payment entry.

**Endpoint:** `DELETE /api/loans/:loanId/loan-payments/:paymentId`

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "success": true,
  "message": "Payment deleted successfully"
}
```

---

### 5. Get Calculated Balance

Get the dynamically calculated balance for a loan. For mortgages with an interest rate, returns interest-aware balance using monthly accrual.

**Endpoint:** `GET /api/loans/:loanId/calculated-balance`

**Success Response (non-mortgage):**
```json
HTTP/1.1 200 OK
{
  "loanId": 1,
  "initialBalance": 10000.00,
  "totalPayments": 2500.00,
  "currentBalance": 7500.00,
  "paymentCount": 5,
  "lastPaymentDate": "2026-01-15"
}
```

**Success Response (mortgage with interest accrual):**
```json
HTTP/1.1 200 OK
{
  "loanId": 1,
  "initialBalance": 200000.00,
  "totalPayments": 15000.00,
  "currentBalance": 192500.00,
  "totalInterestAccrued": 7500.00,
  "interestAware": true,
  "paymentCount": 10,
  "lastPaymentDate": "2026-02-15"
}
```

| Field | Type | Description |
|-------|------|-------------|
| totalInterestAccrued | number | Sum of monthly interest applied (mortgages only) |
| interestAware | boolean | Whether interest accrual was used (`false` when no rate available) |

---

### 6. Get Payment Suggestion

Get a suggested payment amount based on loan type and history.

**Endpoint:** `GET /api/loans/:loanId/payment-suggestion`

**Success Response (Mortgage):**
```json
HTTP/1.1 200 OK
{
  "suggestedAmount": 1500.00,
  "source": "monthly_payment",
  "confidence": "high",
  "message": "Based on your monthly payment setting"
}
```

**Success Response (Loan with history):**
```json
HTTP/1.1 200 OK
{
  "suggestedAmount": 500.00,
  "source": "average_history",
  "confidence": "medium",
  "message": "Based on average of 5 previous payments"
}
```

**Success Response (No history):**
```json
HTTP/1.1 200 OK
{
  "suggestedAmount": null,
  "source": "none",
  "confidence": "low",
  "message": "No payment history available"
}
```

---

### 7. Migrate Balance Entries

Convert existing balance entries to payment entries.

**Endpoint:** `POST /api/loans/:loanId/migrate-balances`

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "loanId": 1,
  "converted": [
    { "balanceEntryId": 1, "paymentAmount": 500.00, "paymentDate": "2025-12-01" },
    { "balanceEntryId": 2, "paymentAmount": 500.00, "paymentDate": "2026-01-01" }
  ],
  "skipped": [
    { "balanceEntryId": 3, "reason": "Balance increased (line of credit usage)" }
  ],
  "summary": {
    "totalConverted": 2,
    "totalSkipped": 1,
    "totalPaymentAmount": 1000.00
  }
}
```

---

### 8. Auto-Log Payment

Create a loan payment from a linked fixed expense.

**Endpoint:** `POST /api/loans/:loanId/loan-payments/auto-log`

**Request Body:**
```json
{
  "fixedExpenseId": 5,
  "paymentDate": "2026-01-15"
}
```

**Success Response:**
```json
HTTP/1.1 201 Created
{
  "payment": {
    "id": 10,
    "loan_id": 1,
    "amount": 350.00,
    "payment_date": "2026-01-15",
    "notes": "Auto-logged from fixed expense: Car Payment"
  }
}
```

---

## Fixed Expense Loan Linkage

### Extended Fixed Expense Fields

When creating or updating fixed expenses, two new optional fields are available:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| payment_due_day | number | No | Day of month payment is due (1-31) |
| linked_loan_id | number | No | ID of loan to link (active loans only) |

**Example Request:**
```json
POST /api/fixed-expenses
{
  "name": "Car Payment",
  "amount": 350.00,
  "category": "Other",
  "payment_type": "Debit",
  "year": 2026,
  "month": 1,
  "payment_due_day": 15,
  "linked_loan_id": 2
}
```

---

## Loan Payment Reminders

### Extended Reminder Status

The reminder status endpoint now includes loan payment reminders and auto-generated billing cycle notifications.

**Endpoint:** `GET /api/reminders/status/:year/:month`

**Enhanced Response:**
```json
HTTP/1.1 200 OK
{
  "investments": { ... },
  "loans": { ... },
  "creditCards": { ... },
  "autoGeneratedCycleNotifications": {
    "count": 2,
    "cycles": [
      {
        "paymentMethodId": 4,
        "displayName": "Visa",
        "cycleEndDate": "2026-02-15",
        "calculatedBalance": 1234.56
      }
    ]
  },
  "loanPaymentReminders": {
    "overdueCount": 1,
    "dueSoonCount": 2,
    "overduePayments": [
      {
        "fixedExpenseId": 3,
        "fixedExpenseName": "Student Loan",
        "amount": 200.00,
        "paymentDueDay": 5,
        "daysUntilDue": -10,
        "loanId": 3,
        "loanName": "Student Loan",
        "loanType": "loan",
        "isOverdue": true,
        "isDueSoon": false,
        "hasPaymentThisMonth": false
      }
    ],
    "dueSoonPayments": [
      {
        "fixedExpenseId": 5,
        "fixedExpenseName": "Car Payment",
        "amount": 350.00,
        "paymentDueDay": 15,
        "daysUntilDue": 3,
        "loanId": 2,
        "loanName": "Car Loan",
        "loanType": "loan",
        "isOverdue": false,
        "isDueSoon": true,
        "hasPaymentThisMonth": false
      }
    ]
  }
}
```

**Auto-Generated Cycle Notification Fields:**

| Field | Type | Description |
|-------|------|-------------|
| count | number | Total number of unreviewed auto-generated billing cycles |
| cycles | array | List of auto-generated cycles pending user review |
| cycles[].paymentMethodId | number | Credit card payment method ID |
| cycles[].displayName | string | Credit card display name |
| cycles[].cycleEndDate | string | Cycle end date (YYYY-MM-DD) |
| cycles[].calculatedBalance | number | Sum of expenses in the cycle period |

Notifications appear for billing cycles auto-generated by the background scheduler where `is_user_entered = 0` and `actual_statement_balance = 0`. Once the user enters an actual statement balance, the notification is dismissed.

For mortgages, `POST`/`PUT` on loan payments also accept an optional `balanceOverride`; `calculated-balance` adds `totalInterestAccrued` and `interestAware`, and `payment-balance-history` adds `interestAccrued` and `principalPaid` per entry.

---

# Activity Log API

## Overview

The Activity Log API provides comprehensive tracking of all data changes in the application. Events are automatically logged by the backend services using a fire-and-forget pattern to ensure logging failures don't impact main functionality.

### Event Types

Each event has an `event_type`, an `entity_type`, an optional `entity_id`, a human-readable `user_action`, and optional JSON `metadata`. Event types follow `<entity>_<verb>`, for example:

| Entity Type | Example Event Types |
|-------------|---------------------|
| expense | `expense_added`, `expense_updated`, `expense_deleted`, `insurance_status_changed` |
| fixed_expense, income_source, budget, investment, person | `<entity>_added`, `_updated`, `_deleted` (plus `income_sources_copied`) |
| loan | `loan_added`, `loan_updated`, `loan_deleted`, `loan_paid_off`, `loan_reactivated`, `loan_rate_updated` |
| loan_payment, loan_balance, mortgage_payment | `loan_payment_added`/`_updated`/`_deleted`, `auto_payment_logged`, `balance_override_applied`, `mortgage_payment_set` |
| payment_method, credit_card_payment, credit_card_statement, billing_cycle | `payment_method_deactivated`, `credit_card_payment_recorded`, `credit_card_statement_uploaded`, `billing_cycle_created`, `billing_cycle_auto_generated` |
| invoice | `invoice_uploaded`, `invoice_deleted`, `invoice_person_link_updated` |
| auth, settings | `auth_login`, `auth_login_failed`, `auth_password_gate_enabled`, `settings_updated` |
| system | `backup_created`, `backup_restored`, `version_upgraded`, `billing_cycle_scheduler_run` |

### Retention Policy

- Activity logs are automatically cleaned up based on configurable retention settings
- Cleanup runs daily at **02:00 UTC** via a `node-cron` job in `server.js`
- Default: 90 days max age, 1000 max events
- Retention settings are managed via the Settings API endpoints (see below)

---

## Endpoints

### 1. Get Activity Logs

Retrieve recent activity events, newest first.

**Endpoint:** `GET /api/activity-logs`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| limit | number | No | Events to return (default: 50, 1–200) |
| offset | number | No | Events to skip (default: 0) |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "events": [
    {
      "id": 1234,
      "event_type": "expense_added",
      "entity_type": "expense",
      "entity_id": 567,
      "user_action": "Added expense: Supermarket - 150.00 (2026-02-10, CIBC MC)",
      "metadata": { "amount": 150.00, "category": "Groceries", "date": "2026-02-10", "place": "Supermarket", "method": "CIBC MC", "tabId": null },
      "timestamp": "2026-02-10T14:30:00.000Z",
      "created_at": "2026-02-10 14:30:00"
    }
  ],
  "total": 234,
  "limit": 50,
  "offset": 0
}
```

`metadata` is parsed from its stored JSON (or `null`).

**Error Responses:** `400` with `"Invalid limit parameter. Must be between 1 and 200."` or `"Invalid offset parameter. Must be non-negative."`

---

### 2. Get Activity Log Statistics

Retention settings and cleanup statistics.

**Endpoint:** `GET /api/activity-logs/stats`

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "retentionDays": 90,
  "maxEntries": 1000,
  "currentCount": 234,
  "oldestEventTimestamp": "2025-11-12T08:00:00.000Z",
  "lastCleanupRun": "2026-02-10T07:00:00.000Z",
  "lastCleanupDeletedCount": 0
}
```

`lastCleanupRun` / `lastCleanupDeletedCount` are kept in memory and are `null` until the cleanup job has run since startup.

---

### 3. Get Retention Settings

Retrieve current retention policy settings.

**Endpoint:** `GET /api/activity-logs/settings`

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "maxAgeDays": 90,
  "maxCount": 1000
}
```

---

### 4. Update Retention Settings

Update retention policy settings. Both fields are required.

**Endpoint:** `PUT /api/activity-logs/settings`

**Request Body:**
```json
{
  "maxAgeDays": 60,
  "maxCount": 500
}
```

**Validation Rules:**
| Field | Type | Range | Description |
|-------|------|-------|-------------|
| maxAgeDays | integer | 7–365 | Maximum age of events in days |
| maxCount | integer | 100–10,000 | Maximum number of events to retain |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "maxAgeDays": 60,
  "maxCount": 500,
  "message": "Retention settings updated successfully"
}
```

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{ "error": "Missing required field: maxAgeDays" }

HTTP/1.1 400 Bad Request
{ "error": "maxAgeDays must be an integer between 7 and 365" }
```

---

## Logging Events (Backend)

`activityLogService.logEvent(eventType, entityType, entityId, userAction, metadata)` validates the required fields, inserts the row (`timestamp` = ISO string), then broadcasts an SSE sync event for `entityType` (passing `metadata.tabId` so the originating tab can ignore it). It never throws: failures are logged and swallowed, so logging cannot break the calling operation. Metadata content is specific to each call site.

```javascript
await activityLogService.logEvent(
  'expense_added',
  'expense',
  createdExpense.id,
  `Added expense: ${expense.place || 'Unknown'} - ${expense.amount.toFixed(2)} (${expense.date}, ${method})`,
  { amount: expense.amount, category: expense.type, date: expense.date, place: expense.place, method, tabId }
);
```

---

## Configuration

Retention settings are managed via the API and UI rather than environment variables:

- **UI**: Settings → General tab → Activity Log Retention Policy
- **API**: `GET/PUT /api/activity-logs/settings`
- **Defaults**: maxAgeDays: 90, maxCount: 1000

Settings are stored in the `settings` database table and persist across restarts.

---

# Analytics Hub API

## Overview

The Analytics Hub API provides consolidated endpoints for the revamped analytics dashboard. Includes monthly spending summaries, trend analysis, activity insights, and anomaly management with smart suppression rules.

All analytics endpoints are prefixed with `/api/analytics`.

---

## Endpoints

### 1. Get Monthly Summary

Get a single-screen monthly spending report card with top categories, top merchants, month-over-month comparison, and budget status.

**Endpoint:** `GET /api/analytics/monthly-summary/:year/:month`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | number | Yes | Year (2000-2100) |
| month | number | Yes | Month (1-12) |

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "totalSpending": 2345.67,
  "topCategories": [
    { "category": "Groceries", "total": 567.89 },
    { "category": "Dining", "total": 234.56 },
    { "category": "Transport", "total": 189.00 },
    { "category": "Utilities", "total": 150.00 },
    { "category": "Entertainment", "total": 95.50 }
  ],
  "topMerchants": [
    { "merchant": "Costco", "total": 234.56 },
    { "merchant": "Metro", "total": 189.00 },
    { "merchant": "Shell", "total": 120.00 },
    { "merchant": "Netflix", "total": 15.99 },
    { "merchant": "Tim Hortons", "total": 12.50 }
  ],
  "monthOverMonth": {
    "previousTotal": 2100.00,
    "difference": 245.67,
    "percentageChange": 11.7
  },
  "budgetSummary": {
    "totalBudgeted": 3000.00,
    "totalSpent": 2345.67,
    "utilizationPercentage": 78.2
  }
}
```

**Notes:**
- `topCategories` and `topMerchants` are limited to 5 entries, sorted by total descending.
- `monthOverMonth` is `null` when the previous month has no expense data.
- `budgetSummary` is `null` when no budgets exist for the month.

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{ "error": "Invalid year. Must be between 2000 and 2100" }
```

```json
HTTP/1.1 400 Bad Request
{ "error": "Invalid month. Must be between 1 and 12" }
```

---

### 2. Get Consolidated Trends

Get combined prediction, spending history, and recurring pattern data for the Trends tab.

**Endpoint:** `GET /api/analytics/trends/:year/:month`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | number | Yes | Year (2000-2100) |
| month | number | Yes | Month (1-12) |

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "prediction": {
    "predictedTotal": 2500.00,
    "confidenceLevel": "medium",
    "currentSpent": 1800.00,
    "daysRemaining": 8
  },
  "monthlyHistory": [
    { "year": 2024, "month": 8, "total": 1950.00 },
    { "year": 2024, "month": 9, "total": 2100.00 },
    { "year": 2024, "month": 10, "total": 2345.67 },
    { "year": 2024, "month": 11, "total": 2200.00 },
    { "year": 2024, "month": 12, "total": 2050.00 },
    { "year": 2025, "month": 1, "total": 1800.00 }
  ],
  "recurringPatterns": [
    {
      "merchant": "Netflix",
      "frequency": "monthly",
      "averageAmount": 15.99,
      "occurrences": 6
    }
  ],
  "dataSufficiency": {
    "prediction": true,
    "monthlyHistory": true,
    "recurringPatterns": false
  },
  "dataQuality": {
    "score": 85,
    "monthsOfData": 10
  }
}
```

**Notes:**
- Sub-sections (`prediction`, `monthlyHistory`, `recurringPatterns`) are `null` when the corresponding `dataSufficiency` flag is `false`.
- `recurringPatterns` limited to top 10 by occurrence count.
- `dataQuality` is computed from completed months only (current in-progress month excluded).

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{ "error": "Invalid year. Must be between 2000 and 2100" }
```

---

### 3. Get Activity Insights

Get activity log analytics including entry velocity, entity breakdown, recent changes, and day-of-week patterns.

**Endpoint:** `GET /api/analytics/activity-insights/:year/:month`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | number | Yes | Year (2000-2100) |
| month | number | Yes | Month (1-12) |

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "entryVelocity": {
    "currentMonth": 45,
    "previousMonth": 38,
    "difference": 7
  },
  "entityBreakdown": [
    { "entityType": "expense", "count": 30 },
    { "entityType": "budget", "count": 8 },
    { "entityType": "loan", "count": 4 }
  ],
  "recentChanges": [
    {
      "id": 1234,
      "timestamp": "2025-01-27T14:30:00.000Z",
      "entityType": "expense",
      "userAction": "Added expense: Groceries - $45.67",
      "metadata": { "amount": 45.67 }
    }
  ],
  "dayOfWeekPatterns": [
    { "day": "Monday", "count": 12 },
    { "day": "Wednesday", "count": 10 },
    { "day": "Friday", "count": 8 }
  ]
}
```

**Notes:**
- `entityBreakdown` sorted by count descending.
- `recentChanges` limited to 10 most recent entries, sorted by timestamp descending.
- `dayOfWeekPatterns` only includes days with activity, sorted by count descending.

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{ "error": "Invalid year. Must be between 2000 and 2100" }
```

---

### 3a. Get Period Summary

Income and spending breakdown over an inclusive month range. Powers the Analytics Hub **Spending** and **Cash Flow** tabs. Spending = variable expenses + fixed expenses (same model as the annual summary).

**Endpoint:** `GET /api/analytics/period-summary?start=YYYY-MM&end=YYYY-MM`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| start | string | Yes | First month, `YYYY-MM` (2000-2100) |
| end | string | Yes | Last month (inclusive), `YYYY-MM`. Range may not exceed 120 months |

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "range": { "startYear": 2026, "startMonth": 1, "endYear": 2026, "endMonth": 9, "monthCount": 9 },
  "totals": {
    "income": 10000,
    "expenses": 7500,
    "variableExpenses": 4500,
    "fixedExpenses": 3000,
    "net": 2500,
    "savingsRate": 25,
    "averageMonthlyExpenses": 833.33,
    "transactionCount": 120
  },
  "incomeByCategory": [
    { "category": "Salary", "total": 9500, "percentOfIncome": 95 }
  ],
  "expensesByCategory": [
    {
      "category": "Housing",
      "total": 3000,
      "variable": 0,
      "fixed": 3000,
      "transactionCount": 0,
      "percentOfExpenses": 40,
      "percentOfIncome": 30
    }
  ]
}
```

**Notes:**
- Category lists are sorted by total descending; zero-total categories are omitted.
- `savingsRate` is `null` when no income is recorded in the range.
- `transactionCount` counts variable expenses only.

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{ "error": "start and end are required in YYYY-MM format (years 2000-2100)" }
```

---

### 4. Get Anomalies

Detect and return enriched spending anomalies for the current user. Each anomaly includes a classification, structured explanation, historical context, financial impact estimate, behavior pattern, confidence score, and optional cluster or budget suggestion data.

**Endpoint:** `GET /api/analytics/anomalies`

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "anomalies": [
    {
      "expenseId": 456,
      "date": "2025-01-15",
      "place": "Costco",
      "amount": 450.00,
      "category": "Groceries",
      "anomalyType": "amount",
      "severity": "high",
      "classification": "Large_Transaction",
      "explanation": {
        "typeLabel": "Large Transaction",
        "observedValue": 450.00,
        "expectedRange": {
          "min": 35.00,
          "max": 120.00
        },
        "deviationPercent": 275.0,
        "comparisonPeriod": "last 12 months"
      },
      "historicalContext": {
        "purchaseRank": 3,
        "purchaseRankTotal": 48,
        "percentile": null,
        "deviationFromAverage": 478.5,
        "frequency": "approximately once every 9 months"
      },
      "impactEstimate": {
        "annualizedChange": 3960.00,
        "savingsRateChange": -2.1,
        "budgetImpact": {
          "budgetLimit": 500.00,
          "currentSpent": 380.00,
          "projectedMonthEnd": 620.00,
          "projectedOverage": 120.00
        }
      },
      "behaviorPattern": "One_Time_Event",
      "confidence": "high",
      "cluster": null,
      "budgetSuggestion": null
    }
  ],
  "metadata": {
    "totalCount": 1,
    "dismissedCount": 0
  }
}
```

**Response Fields — Anomaly Object:**

| Field | Type | Description |
|-------|------|-------------|
| expenseId | number | ID of the flagged expense (null for drift/cluster alerts) |
| date | string | Date of the expense (`YYYY-MM-DD`) |
| place | string | Merchant or place name |
| amount | number | Transaction amount |
| category | string | Expense category |
| anomalyType | string | Legacy type: `amount`, `daily_total`, or `new_merchant` (preserved for backward compatibility) |
| severity | string | Alert severity: `low`, `medium`, or `high` |
| classification | string | Expanded classification (see below) |
| explanation | object | Structured explanation of the anomaly |
| historicalContext | object | Historical spending comparisons |
| impactEstimate | object | Projected financial impact |
| behaviorPattern | string | `One_Time_Event`, `Recurring_Change`, or `Emerging_Trend` |
| confidence | string | Data reliability indicator: `low`, `medium`, or `high` |
| cluster | object \| null | Cluster data when anomaly is part of a transaction cluster |
| budgetSuggestion | object \| null | Budget recommendation for drift alerts |

**Classification Values:**

| Value | Description |
|-------|-------------|
| `Large_Transaction` | Single expense exceeds 3 standard deviations above category average |
| `Category_Spending_Spike` | Monthly category total exceeds historical average by >50% |
| `New_Merchant` | First purchase at an unseen merchant with amount above threshold |
| `Frequency_Spike` | Monthly transaction count exceeds historical average by >100% |
| `Recurring_Expense_Increase` | Recurring expense amount increased >20% over last 3 occurrences |
| `Seasonal_Deviation` | Spending deviates >25% from same month prior year (requires 12+ months data) |
| `Emerging_Behavior_Trend` | Gradual spending drift detected across multiple months |

**Explanation Object:**

| Field | Type | Description |
|-------|------|-------------|
| typeLabel | string | Human-readable classification label |
| observedValue | number | The flagged value |
| expectedRange | object | `{ min: number, max: number }` — computed from mean ± stdDev |
| deviationPercent | number | Percentage above the expected range upper bound |
| comparisonPeriod | string | Time window used (e.g., `"last 12 months"`, `"all available data (8 months)"`) |

**Historical Context Object:**

| Field | Type | Description |
|-------|------|-------------|
| purchaseRank | number \| null | Rank among category purchases (e.g., 3 = 3rd largest). Null for category-level anomalies |
| purchaseRankTotal | number \| null | Total purchases in the ranking pool |
| percentile | number \| null | 0–100 percentile for category-level anomalies. Null for transaction-level anomalies |
| deviationFromAverage | number | Percentage deviation from historical average |
| frequency | string \| null | Average purchase interval (e.g., `"approximately once every 9 months"`). Null when fewer than 2 purchases |

**Impact Estimate Object:**

| Field | Type | Description |
|-------|------|-------------|
| annualizedChange | number | Projected yearly dollar change if behavior continues |
| savingsRateChange | number \| null | Projected savings rate percentage change. Null when no income data available |
| budgetImpact | object \| null | Budget projection when a budget exists for the category |

**Budget Impact Object** (within impactEstimate):

| Field | Type | Description |
|-------|------|-------------|
| budgetLimit | number | The category's budget limit |
| currentSpent | number | Amount spent so far this month |
| projectedMonthEnd | number | Projected total at current daily rate |
| projectedOverage | number | Projected amount over (positive) or under (negative) budget |

**Cluster Object** (non-null when anomaly is part of a transaction cluster):

| Field | Type | Description |
|-------|------|-------------|
| label | string | Cluster label: `Travel_Event`, `Moving_Event`, `Home_Renovation`, or `Holiday_Spending` |
| totalAmount | number | Sum of all clustered transaction amounts |
| transactionCount | number | Number of transactions in the cluster |
| dateRange | object | `{ start: string, end: string }` — date range in `YYYY-MM-DD` format |
| transactions | array | Constituent transactions: `[{ expenseId, place, amount, date }]` |

**Budget Suggestion Object** (non-null on drift alerts with budget recommendations):

| Field | Type | Description |
|-------|------|-------------|
| action | string | `create_budget` (no budget exists) or `adjust_budget` (budget exceeded) |
| category | string | The category for the budget suggestion |
| suggestedLimit | number | Recommended budget limit (recent 3-month avg rounded up to nearest $50) |
| currentLimit | number \| null | Current budget limit. Null for `create_budget` actions |

**Error Responses:**
```json
HTTP/1.1 500 Internal Server Error
{ "error": "Internal server error" }
```

---

### 5. Mark Anomaly as Expected

Dismiss an anomaly and create a suppression rule to prevent similar anomalies from being flagged in the future.

**Endpoint:** `POST /api/analytics/anomalies/:expenseId/mark-expected`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| expenseId | number | Yes | Expense ID of the anomaly |

**Request Body:**
```json
{
  "anomalyType": "amount",
  "expenseDetails": {
    "merchant_name": "Costco",
    "category": "Groceries",
    "amount": 450.00,
    "date": "2025-01-15"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| anomalyType | string | Yes | Type of anomaly: `amount`, `new_merchant`, or `daily_total` |
| expenseDetails | object | No | Expense details used to create the suppression rule |

**Suppression rule created by anomaly type:**
- `amount` → `merchant_amount` rule (merchant name + amount ±20%)
- `new_merchant` → `merchant_category` rule (merchant name + category)
- `daily_total` → `specific_date` rule (exact date)

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "success": true,
  "message": "Anomaly for expense 123 marked as expected",
  "suppressionRuleId": 5
}
```

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{ "error": "Expense ID is required" }
```

```json
HTTP/1.1 400 Bad Request
{ "error": "anomalyType is required" }
```

---

### 6. Get Suppression Rules

Get all active anomaly suppression rules.

**Endpoint:** `GET /api/analytics/anomaly-suppression-rules`

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "rules": [
    {
      "id": 1,
      "rule_type": "merchant_amount",
      "merchant_name": "Costco",
      "category": null,
      "amount_min": 360.00,
      "amount_max": 540.00,
      "specific_date": null,
      "created_at": "2025-01-15T10:30:00Z"
    },
    {
      "id": 2,
      "rule_type": "merchant_category",
      "merchant_name": "New Store",
      "category": "Groceries",
      "amount_min": null,
      "amount_max": null,
      "specific_date": null,
      "created_at": "2025-01-16T09:00:00Z"
    }
  ]
}
```

---

### 7. Delete Suppression Rule

Remove a suppression rule, re-enabling anomaly detection for that pattern.

**Endpoint:** `DELETE /api/analytics/anomaly-suppression-rules/:id`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Suppression rule ID |

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "success": true,
  "message": "Suppression rule 1 deleted"
}
```

**Error Responses:**
```json
HTTP/1.1 404 Not Found
{ "error": "Suppression rule not found" }
```

```json
HTTP/1.1 400 Bad Request
{ "error": "Invalid rule ID. Must be a positive number" }
```

---

### 8. Dismiss Anomaly (Updated)

Dismiss a specific anomaly. Now accepts an optional `anomalyType` in the request body for more precise tracking.

**Endpoint:** `POST /api/analytics/anomalies/:expenseId/dismiss`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| expenseId | number | Yes | Expense ID of the anomaly |

**Request Body (optional):**
```json
{
  "anomalyType": "amount"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| anomalyType | string | No | Type of anomaly: `amount`, `new_merchant`, or `daily_total` |

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "success": true,
  "message": "Anomaly for expense 123 dismissed successfully"
}
```

---

# Real-Time Sync API (SSE)

## Overview

The real-time sync endpoint provides a persistent Server-Sent Events (SSE) stream. Clients subscribe once and receive lightweight push notifications whenever data changes on the server. No polling required.

The SSE route bypasses the general rate limiter so connections are not subject to the 200 req/min limit.

---

## Endpoint

### Subscribe to Real-Time Events

**Endpoint:** `GET /api/sync/events`

**Headers (response):**

| Header | Value |
|--------|-------|
| `Content-Type` | `text/event-stream` |
| `Cache-Control` | `no-cache` |
| `Connection` | `keep-alive` |
| `X-Accel-Buffering` | `no` |

**Initial event (on connect):**
```
data: {"type":"connected","timestamp":"2026-02-19T12:00:00.000Z"}
```

**Keepalive (every 25 seconds):**
```
: keepalive
```

**Data change event:**
```
data: {"entityType":"expense","tabId":"550e8400-e29b-41d4-a716-446655440000"}
```

**Event payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `entityType` | string | Type of data that changed. One of: `expense`, `budget`, `people`, `payment_method`, `loan`, `income`, `investment`, `fixed_expense` |
| `tabId` | string \| null | The `X-Tab-ID` header value from the originating request, or `null` if not provided. Clients should ignore events where `tabId` matches their own tab ID. |

**Example (JavaScript):**
```javascript
const es = new EventSource('/api/sync/events');

es.onopen = () => console.log('Connected');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'connected') return; // initial handshake
  if (data.tabId === MY_TAB_ID) return;  // self-update suppression
  console.log('Data changed:', data.entityType);
};

es.onerror = () => {
  es.close();
  // implement exponential backoff before reconnecting
};
```

**Self-update suppression:**

Include the `X-Tab-ID` header on all mutation requests. The server echoes this value in the SSE broadcast payload. Clients that originated the change can compare `data.tabId` against their own tab ID and skip the refresh — they already have current state.

```javascript
fetch('/api/expenses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tab-ID': MY_TAB_ID
  },
  body: JSON.stringify(expense)
});
```

---

## Health Endpoint — SSE Connection Count

The existing health endpoint includes the current SSE connection count:

**Endpoint:** `GET /api/health`

**Response (excerpt):**
```json
{
  "status": "ok",
  "sseConnections": 3,
  ...
}
```

`sseConnections` is a non-negative integer representing the number of currently active SSE client connections. This value is also displayed in the System Information modal (About tab → Real-Time Sync).

---

## Version Endpoint

**Endpoint:** `GET /api/version`

Returns application version, startup identifier, and Docker image information.

**Response:**
```json
{
  "version": "1.0.0",
  "startupId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "environment": "production",
  "docker": {
    "tag": "sha-abc1234",
    "buildDate": "2026-02-25T10:30:00Z",
    "commit": "abc1234"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | String | Application version from package.json |
| `startupId` | String | Unique UUID generated on server startup. Changes on every process restart, enabling detection of container restarts even without version bumps. |
| `environment` | String | Runtime environment (production, development) |
| `docker` | Object\|null | Docker build metadata (null if not in container) |

---

## Update Check Endpoint

**Endpoint:** `GET /api/version/check-update`

Check if a newer version is available on GitHub Releases.

**Response (update available):**
```json
{
  "updateAvailable": true,
  "currentVersion": "1.0.0",
  "latestVersion": "1.1.0",
  "checkedAt": "2026-02-25T10:30:00.000Z"
}
```

**Response (no update / error):**
```json
{
  "updateAvailable": false,
  "currentVersion": "1.0.0",
  "latestVersion": "1.0.0",
  "checkedAt": "2026-02-25T10:30:00.000Z",
  "error": "GitHub API unreachable"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `updateAvailable` | Boolean | Whether a newer version exists on GitHub |
| `currentVersion` | String | Current running application version |
| `latestVersion` | String\|null | Latest release version from GitHub (null on error) |
| `checkedAt` | String | ISO timestamp of when the check was performed |
| `error` | String\|undefined | Error message, only present when GitHub API is unreachable |

Results are cached in memory for 24 hours (configurable via `UPDATE_CHECK_INTERVAL_SECONDS` env var). Cache resets on server restart.

---

# Authentication API

## Overview

The Authentication API provides optional password-based authentication for the Expense Tracker. The system operates in two modes:

- **Open_Mode** (default): No password set, all endpoints accessible without authentication
- **Password_Gate**: Password configured, JWT-based authentication required for all non-public endpoints

### Public Endpoints (always accessible)

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/auth/status` | Check if authentication is required |
| `POST /api/auth/login` | Authenticate with password |
| `POST /api/auth/refresh` | Refresh access token |

### Token Lifecycle

- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days and are delivered as HTTP-only, SameSite=Strict cookies
- On 401 with `"code": "TOKEN_EXPIRED"`, clients should attempt a silent refresh before retrying

---

## Auth Endpoints

### 1. Get Auth Status

Check whether authentication is required.

**Endpoint:** `GET /api/auth/status`

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "passwordRequired": true,
  "username": "admin"
}
```

| Field | Type | Description |
|-------|------|-------------|
| passwordRequired | boolean | Whether Password_Gate is active |
| username | string | The admin username |

---

### 2. Login

Authenticate with password to receive an access token.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "password": "your-password"
}
```

**Success Response:**
```json
HTTP/1.1 200 OK
Set-Cookie: refreshToken=<jwt>; HttpOnly; SameSite=Strict; Path=/

{
  "accessToken": "<jwt>"
}
```

**Error Response:**
```json
HTTP/1.1 401 Unauthorized
{
  "error": "Invalid credentials"
}
```

**Notes:**
- Uses constant-time bcrypt comparison to prevent timing attacks
- Logs `auth_login` or `auth_login_failed` event to activity_logs

---

### 3. Refresh Access Token

Obtain a new access token using the refresh token cookie.

**Endpoint:** `POST /api/auth/refresh`

**Request:** No body required. The refresh token is read from the HTTP-only cookie.

**Success Response:**
```json
HTTP/1.1 200 OK
Set-Cookie: refreshToken=<new-jwt>; HttpOnly; SameSite=Strict; Path=/

{
  "accessToken": "<new-jwt>"
}
```

**Error Response:**
```json
HTTP/1.1 401 Unauthorized
{
  "error": "Invalid refresh token"
}
```

---

### 4. Logout

Clear the refresh token cookie and end the session.

**Endpoint:** `POST /api/auth/logout`

**Success Response:**
```json
HTTP/1.1 200 OK
Set-Cookie: refreshToken=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0

{
  "message": "Logged out successfully"
}
```

**Notes:**
- Logs `auth_logout` event to activity_logs

---

### 5. Set or Change Password

Set a new password or change the existing password.

**Endpoint:** `PUT /api/auth/password`

**Request Body:**
```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| currentPassword | string | When Password_Gate active | Current password for verification |
| newPassword | string | Yes | New password (minimum 4 characters) |

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "message": "Password updated successfully"
}
```

**Error Responses:**
```json
HTTP/1.1 400 Bad Request
{
  "error": "Password must be at least 4 characters"
}
```

```json
HTTP/1.1 401 Unauthorized
{
  "error": "Current password is incorrect"
}
```

**Notes:**
- When transitioning from Open_Mode to Password_Gate, logs `auth_password_gate_enabled`
- Password is hashed with bcrypt (cost factor 10)

---

### 6. Remove Password

Remove the password and return to Open_Mode.

**Endpoint:** `DELETE /api/auth/password`

**Request Body:**
```json
{
  "currentPassword": "current-password"
}
```

**Success Response:**
```json
HTTP/1.1 200 OK
{
  "message": "Password removed successfully"
}
```

**Error Response:**
```json
HTTP/1.1 401 Unauthorized
{
  "error": "Current password is incorrect"
}
```

**Notes:**
- Logs `auth_password_gate_disabled` event to activity_logs
- After removal, all endpoints become accessible without authentication

---

## Authentication Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Missing or invalid token when Password_Gate is active |
| `TOKEN_EXPIRED` | 401 | Access token has expired (client should attempt refresh) |

**Example error response:**
```json
{
  "error": "Token expired",
  "code": "TOKEN_EXPIRED"
}
```

---

**Last Updated:** 2026-10-05
