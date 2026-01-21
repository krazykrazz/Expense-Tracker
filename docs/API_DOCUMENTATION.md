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

Currently, no rate limiting is implemented. Consider implementing rate limiting for production deployments to prevent abuse.

**Recommended Limits:**
- Upload: 10 requests per minute per user
- Download: 50 requests per minute per user
- Delete: 10 requests per minute per user

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
