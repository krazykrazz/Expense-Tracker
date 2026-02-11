# API Documentation - Invoice Endpoints

## Invoice Management API

### Base URL
```
http://localhost:2424/api
```

### Authentication
All invoice endpoints require a valid session. Include session cookie in requests.

---

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

## Error Handling

### Standard Error Response Format

All errors follow this format:

```json
{
  "error": "Error message description"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid input or validation error |
| 403 | Forbidden | Access denied (ownership check failed) |
| 404 | Not Found | Resource not found |
| 413 | Payload Too Large | File size exceeds limit |
| 500 | Internal Server Error | Server error occurred |
| 507 | Insufficient Storage | Storage space full |

### Common Error Scenarios

**File Validation Errors:**
- Invalid file type (not PDF)
- File too large (>10MB)
- Corrupted PDF file
- Invalid PDF structure

**Access Control Errors:**
- Expense not found
- User doesn't own the expense
- Invoice not found
- Permission denied
- Person not assigned to expense

**Storage Errors:**
- Insufficient storage space
- File system error
- Permission denied (file system)

---

## Rate Limiting

Rate limiting is implemented to prevent abuse and ensure fair usage:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| General API | 200 requests | 1 minute |
| File Uploads | 10 requests | 15 minutes |
| Backup/Restore | 5 requests | 1 hour |

**Response when rate limited:**
```json
{
  "error": "Too many requests, please try again later"
}
```

**Headers returned:**
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining in window
- `RateLimit-Reset`: Time when the rate limit resets (Unix timestamp)

---

## File Upload Best Practices

### Client-Side

1. **Validate Before Upload:**
   ```javascript
   function validateFile(file) {
     if (file.type !== 'application/pdf') {
       throw new Error('Only PDF files are allowed');
     }
     if (file.size > 10 * 1024 * 1024) {
       throw new Error('File size must be less than 10MB');
     }
   }
   ```

2. **Show Progress:**
   ```javascript
   const xhr = new XMLHttpRequest();
   xhr.upload.addEventListener('progress', (e) => {
     if (e.lengthComputable) {
       const percentComplete = (e.loaded / e.total) * 100;
       updateProgressBar(percentComplete);
     }
   });
   ```

3. **Handle Errors:**
   ```javascript
   try {
     const response = await uploadInvoice(file, expenseId, personId);
     showSuccess('Invoice uploaded successfully');
   } catch (error) {
     showError(error.message);
   }
   ```

### Server-Side

1. **Validate File Type:**
   - Check magic number (file signature)
   - Don't rely on file extension alone
   - Validate PDF structure

2. **Sanitize Filenames:**
   - Remove special characters
   - Prevent path traversal
   - Generate unique names

3. **Atomic Operations:**
   - Upload file first
   - Create database record
   - Rollback on failure

4. **Person Validation:**
   - Verify person is assigned to expense
   - Return clear error if not assigned

---

## Security Considerations

### File Upload Security

1. **File Type Validation:**
   - Magic number checking
   - PDF structure validation
   - Reject non-PDF files

2. **Size Limits:**
   - 10MB maximum per file
   - Prevent DoS attacks
   - Monitor storage usage

3. **Filename Sanitization:**
   - Remove dangerous characters
   - Prevent path traversal
   - Generate unique names

### Access Control

1. **Expense Ownership:**
   - Verify user owns expense
   - Check before all operations
   - Log access attempts

2. **Person Validation:**
   - Verify person is assigned to expense
   - Prevent linking to unrelated people
   - Clear error messages

3. **Authentication:**
   - Require valid session
   - Check on every request
   - Timeout inactive sessions

4. **Path Traversal Prevention:**
   - Sanitize all paths
   - Use absolute paths
   - Validate file locations

---

## Performance Optimization

### Upload Optimization

1. **Streaming:**
   - Use streaming for large files
   - Reduce memory usage
   - Improve responsiveness

2. **Progress Tracking:**
   - Provide feedback to users
   - Show upload progress
   - Estimate time remaining

3. **Concurrent Uploads:**
   - Support multiple uploads
   - Queue management
   - Resource limits

### Download Optimization

1. **Caching:**
   - Cache frequently accessed files
   - Set appropriate cache headers
   - Reduce server load

2. **Range Requests:**
   - Support partial content
   - Enable resume downloads
   - Improve large file handling

3. **Compression:**
   - Consider gzip for metadata
   - Don't compress PDFs (already compressed)
   - Reduce bandwidth usage

---

## Testing

### Manual Testing

**Upload Test:**
```bash
curl -X POST http://localhost:2424/api/invoices/upload \
  -F "expenseId=123" \
  -F "invoice=@receipt.pdf" \
  -F "personId=5" \
  --cookie "session=..."
```

**Get All Invoices Test:**
```bash
curl -X GET http://localhost:2424/api/invoices/123 \
  --cookie "session=..."
```

**Get Specific Invoice Test:**
```bash
curl -X GET http://localhost:2424/api/invoices/123/1 \
  --cookie "session=..." \
  -o downloaded.pdf
```

**Delete Specific Invoice Test:**
```bash
curl -X DELETE http://localhost:2424/api/invoices/1 \
  --cookie "session=..."
```

**Update Person Link Test:**
```bash
curl -X PATCH http://localhost:2424/api/invoices/1 \
  -H "Content-Type: application/json" \
  -d '{"personId": 5}' \
  --cookie "session=..."
```

### Automated Testing

See test files:
- `backend/controllers/invoiceController.integration.test.js`
- `backend/controllers/invoiceController.pbt.test.js`
- `backend/services/invoiceService.test.js`
- `backend/services/invoiceService.multiInvoice.pbt.test.js`
- `backend/services/invoiceService.crudOperations.pbt.test.js`
- `backend/repositories/invoiceRepository.pbt.test.js`
- `backend/test/uploadIntegration.test.js`

---

## Changelog

### Version 4.14.0 (January 2026)
- Added medical insurance tracking feature
- Added `PATCH /expenses/:id/insurance-status` endpoint for quick claim status updates
- Extended expense endpoints with insurance fields (insurance_eligible, claim_status, original_cost)
- Added insurance summary to tax deductible endpoint
- Added claim status filtering to tax deductible endpoint

### Version 4.13.0 (January 2026)
- Added multi-invoice support (multiple invoices per expense)
- Added person-invoice linking (optional personId parameter)
- Added `GET /invoices/:expenseId/:invoiceId` endpoint for specific invoice retrieval
- Added `PATCH /invoices/:invoiceId` endpoint for updating person association
- Modified `DELETE /invoices/:invoiceId` to delete specific invoice by ID
- Added `DELETE /invoices/expense/:expenseId` for deleting all invoices (legacy)
- Updated response format to return arrays of invoices
- Added invoice count to expense and tax report endpoints
- Added invoice status filtering to tax deductible endpoint

### Version 4.12.0 (January 2026)
- Initial release of invoice attachment feature
- Added upload, download, delete endpoints
- Enhanced expense endpoints with invoice data
- Implemented file validation and security

---

**Last Updated:** January 21, 2026  
**API Version:** 1.2  
**Status:** Active


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

## Migration and Backward Compatibility

### Automatic Migration

When the application starts with existing expense data, the migration service automatically:

1. Creates the `payment_methods` table with default payment methods
2. Adds `payment_method_id` column to `expenses` and `fixed_expenses` tables
3. Populates `payment_method_id` for all existing records based on the method string

### Migration Mapping

| Old Value | New Display Name | Full Name | Type | ID |
|-----------|------------------|-----------|------|-----|
| Cash | Cash | Cash | cash | 1 |
| Debit | Debit | Debit | debit | 2 |
| Cheque | Cheque | Cheque | cheque | 3 |
| CIBC MC | CIBC MC | CIBC Mastercard | credit_card | 4 |
| PCF MC | PCF MC | PCF Mastercard | credit_card | 5 |
| WS VISA | WS VISA | WealthSimple VISA | credit_card | 6 |
| VISA | RBC VISA | RBC VISA | credit_card | 7 |

### Backward Compatibility

The expense API accepts both:
- `payment_method_id` (preferred) - Direct reference to payment method
- `method` (string) - Legacy string-based lookup for backward compatibility

**Example with payment_method_id (preferred):**
```json
{
  "date": "2026-01-15",
  "place": "Grocery Store",
  "amount": 50.00,
  "type": "Groceries",
  "payment_method_id": 4
}
```

**Example with method string (backward compatible):**
```json
{
  "date": "2026-01-15",
  "place": "Grocery Store",
  "amount": 50.00,
  "type": "Groceries",
  "method": "CIBC MC"
}
```

---

## Credit Card Balance Tracking

### Automatic Balance Updates

- **Expense Creation:** When an expense is created with a credit card payment method, the card's `current_balance` is automatically increased by the expense amount.
- **Expense Deletion:** When an expense is deleted, the card's balance is automatically decreased.
- **Payment Recording:** When a payment is recorded, the balance is decreased by the payment amount.

### Utilization Calculation

For credit cards with a `credit_limit` set:
- `utilization_percentage = (current_balance / credit_limit) * 100`
- Warning indicator shown when utilization > 30%
- Danger indicator shown when utilization > 70%

### Due Date Tracking

For credit cards with `payment_due_day` set:
- `days_until_due` is calculated based on the current date
- Reminders appear in the monthly reminders system when payment is due within 7 days

---

## Testing

### Manual Testing

**Create Payment Method:**
```bash
curl -X POST http://localhost:2424/api/payment-methods \
  -H "Content-Type: application/json" \
  -d '{"type": "credit_card", "display_name": "Test Card", "full_name": "Test Credit Card"}'
```

**Get All Payment Methods:**
```bash
curl -X GET http://localhost:2424/api/payment-methods
```

**Record Payment:**
```bash
curl -X POST http://localhost:2424/api/payment-methods/4/payments \
  -H "Content-Type: application/json" \
  -d '{"amount": 500.00, "payment_date": "2026-01-15", "notes": "Test payment"}'
```

### Automated Testing

See test files:
- `backend/repositories/paymentMethodRepository.pbt.test.js`
- `backend/repositories/creditCardPaymentRepository.pbt.test.js`
- `backend/services/paymentMethodService.validation.pbt.test.js`
- `backend/services/paymentMethodService.uniqueness.pbt.test.js`
- `backend/services/paymentMethodService.utilization.pbt.test.js`
- `backend/services/creditCardPaymentService.pbt.test.js`
- `backend/database/migrations.paymentMethods.pbt.test.js`

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

## Billing Cycle History Endpoints (v5.4.0)

### Overview

The billing cycle history feature provides comprehensive tracking of credit card billing cycles with automatic cycle generation, statement balance entry, trend analysis, and transaction counting.

### 1. Get Unified Billing Cycles

Retrieve all billing cycles (actual and auto-generated) for a credit card.

**Endpoint:** `GET /api/billing-cycles/:paymentMethodId/unified`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| paymentMethodId | number | Yes | Credit card payment method ID |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "cycles": [
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
      "due_date": "2026-03-01",
      "notes": "Statement received via email",
      "statement_pdf_path": "/statements/2026-02.pdf"
    },
    {
      "id": null,
      "payment_method_id": 4,
      "cycle_start_date": "2025-12-16",
      "cycle_end_date": "2026-01-15",
      "actual_statement_balance": null,
      "calculated_statement_balance": 1089.23,
      "effective_balance": 1089.23,
      "balance_type": "calculated",
      "transaction_count": 18,
      "trend_indicator": {
        "type": "lower",
        "icon": "↓",
        "amount": 210.77,
        "cssClass": "trend-lower"
      },
      "minimum_payment": null,
      "due_date": null,
      "notes": null,
      "statement_pdf_path": null
    }
  ]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | number/null | Database ID (null for auto-generated cycles) |
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

### 2. Create/Update Billing Cycle

Create or update a billing cycle record (upsert by payment_method_id + cycle_end_date).

**Endpoint:** `POST /api/billing-cycles`

**Request Body:**
```json
{
  "payment_method_id": 4,
  "cycle_start_date": "2026-01-16",
  "cycle_end_date": "2026-02-15",
  "actual_statement_balance": 1234.56,
  "minimum_payment": 25.00,
  "due_date": "2026-03-01",
  "notes": "Statement received via email"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| payment_method_id | number | Yes | Credit card payment method ID |
| cycle_start_date | string | Yes | Cycle start date (YYYY-MM-DD) |
| cycle_end_date | string | Yes | Cycle end date (YYYY-MM-DD) |
| actual_statement_balance | number | No | User-entered statement balance |
| minimum_payment | number | No | Minimum payment due |
| due_date | string | No | Payment due date (YYYY-MM-DD) |
| notes | string | No | User notes |

**Success Response:**
```json
HTTP/1.1 201 Created
Content-Type: application/json

{
  "billingCycle": {
    "id": 1,
    "payment_method_id": 4,
    "cycle_start_date": "2026-01-16",
    "cycle_end_date": "2026-02-15",
    "actual_statement_balance": 1234.56,
    "calculated_statement_balance": 1189.23,
    "minimum_payment": 25.00,
    "due_date": "2026-03-01",
    "notes": "Statement received via email"
  }
}
```

---

### 3. Update Billing Cycle

Update an existing billing cycle record.

**Endpoint:** `PUT /api/billing-cycles/:id`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Billing cycle ID |

**Request Body:** Same as POST endpoint

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "billingCycle": {
    "id": 1,
    "payment_method_id": 4,
    "cycle_start_date": "2026-01-16",
    "cycle_end_date": "2026-02-15",
    "actual_statement_balance": 1234.56,
    "minimum_payment": 25.00,
    "due_date": "2026-03-01",
    "notes": "Updated notes"
  }
}
```

---

### 4. Delete Billing Cycle

Delete a billing cycle record.

**Endpoint:** `DELETE /api/billing-cycles/:id`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Billing cycle ID |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Billing cycle deleted successfully"
}
```

---

### 5. Upload Billing Cycle Statement PDF

Upload a PDF statement for a billing cycle.

**Endpoint:** `POST /api/billing-cycles/:id/statement`

**Content-Type:** `multipart/form-data`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Billing cycle ID |

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| statement | File | Yes | PDF file (max 10MB) |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "statement_pdf_path": "/statements/4_2026-02-15_statement.pdf"
}
```

---

### 6. Get Billing Cycle Statement PDF

Download the statement PDF for a billing cycle.

**Endpoint:** `GET /api/billing-cycles/:id/statement`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Billing cycle ID |

**Success Response:**
```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: inline; filename="statement.pdf"

[PDF file binary data]
```

---

### 7. Delete Billing Cycle Statement PDF

Delete the statement PDF for a billing cycle.

**Endpoint:** `DELETE /api/billing-cycles/:id/statement`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Billing cycle ID |

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

## Credit Card Statement Balance (v4.21.0)

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

**Endpoint:** `GET /api/reminders`

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

### Database Schema Update

The `payment_methods` table now includes:

| Column | Type | Description |
|--------|------|-------------|
| billing_cycle_day | INTEGER | Day of month statement closes (1-31), CHECK constraint |

Migration automatically copies `billing_cycle_end` to `billing_cycle_day` for existing credit cards.

---

## Changelog - Payment Methods

### Version 5.4.0 (February 2026)
- Added billing cycle history feature with unified cycle list
- Added automatic billing cycle generation based on transaction history
- Added trend indicators comparing cycles to previous periods
- Added transaction counting per billing cycle
- Added `billing_cycle_history` table for storing cycle records
- Added unified billing cycles endpoint (`GET /api/billing-cycles/:id/unified`)
- Added billing cycle CRUD endpoints (POST, PUT, DELETE)
- Added billing cycle statement PDF upload/download endpoints
- Added effective balance logic (actual vs calculated)
- Added balance type indicator ("Actual" vs "Calculated")

### Version 5.4.1 (February 2026)
- Fixed zero statement balance not being recognized as valid
- Fixed UI consistency for action buttons (pencil/trash for all cycles)
- Cleaned up unused refresh button code

### Version 4.21.0 (February 2026)
- Added `billing_cycle_day` column to payment_methods table
- Added StatementBalanceService for automatic statement balance calculation
- Added statement balance fields to reminder API response
- Added smart payment alert suppression when statement is paid
- Added required field validation for billing_cycle_day and payment_due_day
- Added "Statement Paid" indicator in credit card detail view
- Added billing cycle date display in credit card detail view
- Migration automatically copies billing_cycle_end to billing_cycle_day

### Version 4.20.0 (January 2026)
- Added `posted_date` column to expenses table
- Added posted date validation (must be >= transaction date)
- Updated balance calculations to use COALESCE(posted_date, date)
- Added posted date field to ExpenseForm (shown only for credit card expenses)

### Version 4.15.0 (January 2026)
- Added configurable payment methods feature
- Added `payment_methods` table with type-specific attributes
- Added `credit_card_payments` table for payment history
- Added `credit_card_statements` table for statement storage
- Added automatic migration from hardcoded payment methods
- Added credit card balance tracking (auto-updates on expense/payment)
- Added credit utilization calculation and indicators
- Added payment due date tracking with reminders
- Added statement upload and management
- Deprecated hardcoded `PAYMENT_METHODS` constant
- Added backward compatibility for string-based payment method submission

---

# Loan Payment Tracking API (v4.19.0)

## Overview

Payment-based tracking system for loans and mortgages. Records individual payments and calculates balance dynamically. Lines of credit continue to use balance-based tracking.

## Loan Payment Endpoints

### 1. Create Payment

Record a new loan payment.

**Endpoint:** `POST /api/loans/:loanId/payments`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| loanId | number | Yes | Loan ID (must be loan or mortgage type) |

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
| payment_date | string | Yes | Payment date (YYYY-MM-DD, not future) |
| notes | string | No | Optional notes |

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

**Endpoint:** `GET /api/loans/:loanId/payments`

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

**Endpoint:** `PUT /api/loans/:loanId/payments/:id`

**Request Body:**
```json
{
  "amount": 550.00,
  "payment_date": "2026-01-15",
  "notes": "Updated payment"
}
```

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

**Endpoint:** `DELETE /api/loans/:loanId/payments/:id`

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

Get the dynamically calculated balance for a loan.

**Endpoint:** `GET /api/loans/:loanId/calculated-balance`

**Success Response:**
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

The reminder status endpoint now includes loan payment reminders.

**Endpoint:** `GET /api/reminders/status/:year/:month`

**Enhanced Response:**
```json
HTTP/1.1 200 OK
{
  "investments": { ... },
  "loans": { ... },
  "creditCards": { ... },
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

---

## Changelog - Loan Payment Tracking

### Version 4.19.0 (February 2026)
- Added `loan_payments` table for payment-based tracking
- Added loan payment CRUD endpoints
- Added calculated balance endpoint
- Added payment suggestion endpoint
- Added balance-to-payment migration endpoint
- Added `payment_due_day` and `linked_loan_id` columns to fixed_expenses
- Added loan payment reminders to reminder status API
- Added auto-log payment endpoint
- Added LoanPaymentReminderBanner component
- Added AutoLogPrompt component

---

**Last Updated:** February 4, 2026  
**API Version:** 1.7  
**Status:** Active


---

# Activity Log API

## Overview

The Activity Log API provides comprehensive tracking of all data changes in the application. Events are automatically logged by the backend services using a fire-and-forget pattern to ensure logging failures don't impact main functionality.

### Event Types

| Entity Type | Actions Tracked | Metadata Captured |
|-------------|----------------|-------------------|
| expense | create, update, delete | amount, type, place, method |
| fixed_expense | create, update, delete | name, amount, category |
| loan | create, update, delete | name, loan_type, initial_balance |
| investment | create, update, delete | name, type, initial_value |
| budget | create, update, delete | category, limit, year, month |
| payment_method | create, update, delete | display_name, type, credit_limit |
| loan_payment | create, delete | amount, payment_date |
| backup | create, restore | filename, size |

### Retention Policy

- Activity logs are automatically cleaned up based on configurable retention settings
- Cleanup runs daily at **2:00 AM** via scheduled job
- Default: 90 days max age, 1000 max events
- Retention settings are managed via the Settings API endpoints (see below)

---

## Endpoints

### 1. Get Activity Logs

Retrieve paginated activity logs with optional filtering.

**Endpoint:** `GET /api/activity-logs`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 50, max: 200) |
| entityType | string | No | Filter by entity type |
| action | string | No | Filter by action (create, update, delete) |
| startDate | string | No | Filter start date (YYYY-MM-DD) |
| endDate | string | No | Filter end date (YYYY-MM-DD) |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "logs": [
    {
      "id": 1234,
      "entity_type": "expense",
      "entity_id": 567,
      "action": "create",
      "metadata": {
        "amount": 150.00,
        "type": "Groceries",
        "place": "Supermarket",
        "method": "Credit Card"
      },
      "timestamp": "2026-02-10T14:30:00.000Z"
    },
    {
      "id": 1233,
      "entity_type": "loan_payment",
      "entity_id": 89,
      "action": "create",
      "metadata": {
        "amount": 500.00,
        "payment_date": "2026-02-10",
        "loan_name": "Car Loan"
      },
      "timestamp": "2026-02-10T10:15:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 234,
    "itemsPerPage": 50,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Error Responses:**

```json
HTTP/1.1 400 Bad Request
{
  "error": "Invalid page number"
}
```

```json
HTTP/1.1 400 Bad Request
{
  "error": "Limit must be between 1 and 200"
}
```

**Example:**
```javascript
// Get first page with default limit (50)
const response = await fetch('http://localhost:2424/api/activity-logs');

// Get specific page with custom limit
const response = await fetch('http://localhost:2424/api/activity-logs?page=2&limit=100');

// Filter by entity type
const response = await fetch('http://localhost:2424/api/activity-logs?entityType=expense');

// Filter by date range
const response = await fetch('http://localhost:2424/api/activity-logs?startDate=2026-02-01&endDate=2026-02-10');

// Combine filters
const response = await fetch('http://localhost:2424/api/activity-logs?entityType=loan&action=create&limit=25');
```

---

### 2. Get Activity Log Statistics

Retrieve summary statistics about activity logs.

**Endpoint:** `GET /api/activity-logs/stats`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| days | number | No | Number of days to include (default: 30) |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "totalEvents": 1234,
  "eventsByType": {
    "expense": 567,
    "fixed_expense": 123,
    "loan": 45,
    "investment": 34,
    "budget": 89,
    "payment_method": 12,
    "loan_payment": 234,
    "backup": 130
  },
  "eventsByAction": {
    "create": 789,
    "update": 345,
    "delete": 100
  },
  "oldestEvent": "2025-11-12T08:00:00.000Z",
  "newestEvent": "2026-02-10T14:30:00.000Z",
  "retentionDays": 90
}
```

**Example:**
```javascript
// Get stats for last 30 days (default)
const response = await fetch('http://localhost:2424/api/activity-logs/stats');

// Get stats for last 7 days
const response = await fetch('http://localhost:2424/api/activity-logs/stats?days=7');
```

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

## Event Metadata Structure

Each entity type captures specific metadata relevant to that entity:

### Expense Events
```json
{
  "amount": 150.00,
  "type": "Groceries",
  "place": "Supermarket",
  "method": "Credit Card",
  "date": "2026-02-10"
}
```

### Fixed Expense Events
```json
{
  "name": "Rent",
  "amount": 1500.00,
  "category": "Housing",
  "year": 2026,
  "month": 2
}
```

### Loan Events
```json
{
  "name": "Car Loan",
  "loan_type": "loan",
  "initial_balance": 25000.00
}
```

### Investment Events
```json
{
  "name": "TFSA",
  "type": "TFSA",
  "initial_value": 10000.00
}
```

### Budget Events
```json
{
  "category": "Food",
  "limit": 800.00,
  "year": 2026,
  "month": 2
}
```

### Payment Method Events
```json
{
  "display_name": "CIBC MC",
  "type": "credit_card",
  "credit_limit": 5000.00
}
```

### Loan Payment Events
```json
{
  "amount": 500.00,
  "payment_date": "2026-02-10",
  "loan_name": "Car Loan"
}
```

### Backup Events
```json
{
  "filename": "backup_20260210_143000.db",
  "size": 2048576,
  "operation": "create"
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow this format:

```json
{
  "error": "Error message description"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid parameters or validation error |
| 500 | Internal Server Error | Server error occurred |

---

## Performance Considerations

### Pagination

- Default page size: 50 items
- Maximum page size: 200 items
- Use pagination for large result sets to avoid performance issues

### Filtering

- Filtering by entity type and action uses indexed queries
- Date range filtering is optimized for common use cases
- Combine filters to narrow results and improve performance

### Automatic Cleanup

- Logs older than 90 days are automatically deleted
- Cleanup runs daily at 2:00 AM
- Prevents database bloat and maintains performance

---

## Fire-and-Forget Pattern

Activity logging uses a fire-and-forget pattern to ensure reliability:

1. **Non-blocking**: Logging operations don't block main functionality
2. **Error isolation**: Logging failures don't cause main operations to fail
3. **Async execution**: Logs are written asynchronously
4. **Graceful degradation**: If logging fails, the application continues normally

**Example from backend:**
```javascript
// Fire-and-forget - don't await, don't block
activityLogService.logEvent('expense', expenseId, 'create', metadata).catch(err => {
  logger.error('Failed to log activity:', err);
});
```

---

## Testing

### Manual Testing

**Get Activity Logs:**
```bash
curl -X GET http://localhost:2424/api/activity-logs \
  --cookie "session=..."
```

**Get Activity Logs with Filters:**
```bash
curl -X GET "http://localhost:2424/api/activity-logs?entityType=expense&limit=25" \
  --cookie "session=..."
```

**Get Statistics:**
```bash
curl -X GET http://localhost:2424/api/activity-logs/stats \
  --cookie "session=..."
```

### Automated Testing

See test files:
- `backend/services/activityLogService.validation.pbt.test.js`
- `backend/services/activityLogService.timestamp.pbt.test.js`
- `backend/services/activityLogService.metadata.pbt.test.js`
- `backend/services/activityLogService.resilience.pbt.test.js`
- `backend/services/activityLogService.cleanup.test.js`
- `backend/controllers/activityLogController.pagination.pbt.test.js`
- `backend/services/*.activityLog.integration.test.js` (8 integration test suites)

---

## Configuration

Retention settings are managed via the API and UI rather than environment variables:

- **UI**: Settings → General tab → Activity Log Retention Policy
- **API**: `GET/PUT /api/activity-logs/settings`
- **Defaults**: maxAgeDays: 90, maxCount: 1000

Settings are stored in the `settings` database table and persist across restarts.

---

## Changelog - Activity Log

### Version 4.20.0 (February 2026)
- Added activity log feature with comprehensive event tracking
- Added `activity_logs` table with automatic cleanup
- Added activity log API endpoints (GET /activity-logs, GET /activity-logs/stats)
- Added fire-and-forget logging pattern for reliability
- Added scheduled cleanup job (daily at 2:00 AM)
- Added 90-day retention policy (configurable via Settings → General)
- Added retention settings API endpoints (GET/PUT /api/activity-logs/settings)
- Added settings table for persistent configuration
- Added integration with 8 entity types (expenses, fixed expenses, loans, investments, budgets, payment methods, loan payments, backups)
- Added ActivityLogView component in Settings→Misc tab
- Added human-readable timestamp formatting
- Added display limit selector (25, 50, 100, 200 events)
- Added Load More functionality with event count display

---

**Last Updated:** February 10, 2026  
**API Version:** 1.8  
**Status:** Active
