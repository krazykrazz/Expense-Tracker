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

Upload a PDF invoice for a medical expense.

**Endpoint:** `POST /invoices/upload`

**Content-Type:** `multipart/form-data`

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| expenseId | number | Yes | ID of the expense to attach invoice to |
| invoice | File | Yes | PDF file to upload (max 10MB) |

**Success Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "invoice": {
    "id": 1,
    "expenseId": 123,
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
  "error": "This expense already has an invoice attached"
}
```

**Example:**
```javascript
const formData = new FormData();
formData.append('expenseId', 123);
formData.append('invoice', pdfFile);

const response = await fetch('http://localhost:2424/api/invoices/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include'
});

const data = await response.json();
```

---

### 2. Get Invoice File

Retrieve the PDF file for an expense.

**Endpoint:** `GET /invoices/:expenseId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| expenseId | number | Yes | ID of the expense |

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
const response = await fetch(`http://localhost:2424/api/invoices/${expenseId}`, {
  credentials: 'include'
});

if (response.ok) {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  // Use url to display PDF
}
```

---

### 3. Get Invoice Metadata

Retrieve invoice information without downloading the file.

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
  "invoice": {
    "id": 1,
    "expenseId": 123,
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

**Example:**
```javascript
const response = await fetch(`http://localhost:2424/api/invoices/${expenseId}/metadata`, {
  credentials: 'include'
});

const data = await response.json();
console.log(`File size: ${data.invoice.fileSize} bytes`);
```

---

### 4. Delete Invoice

Remove an invoice attachment from an expense.

**Endpoint:** `DELETE /invoices/:expenseId`

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
const response = await fetch(`http://localhost:2424/api/invoices/${expenseId}`, {
  method: 'DELETE',
  credentials: 'include'
});

const data = await response.json();
if (data.success) {
  console.log('Invoice deleted');
}
```

---

## Enhanced Expense Endpoints

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
    "invoice": {
      "id": 1,
      "filename": "123_1704067200_receipt.pdf",
      "originalFilename": "receipt.pdf",
      "fileSize": 245760,
      "uploadDate": "2025-01-01T12:00:00Z"
    },
    "hasInvoice": true
  }
}
```

---

### Get Tax Deductible Expenses (Enhanced)

The tax deductible endpoint now includes invoice indicators.

**Endpoint:** `GET /expenses/tax-deductible`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| year | number | No | Filter by year (default: current year) |

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
      "hasInvoice": true
    },
    {
      "id": 124,
      "date": "2025-01-05",
      "place": "Pharmacy",
      "amount": 45.00,
      "type": "Tax - Medical",
      "people": [...],
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
| 409 | Conflict | Resource already exists |
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
     const response = await uploadInvoice(file);
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

2. **Authentication:**
   - Require valid session
   - Check on every request
   - Timeout inactive sessions

3. **Path Traversal Prevention:**
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
  --cookie "session=..."
```

**Download Test:**
```bash
curl -X GET http://localhost:2424/api/invoices/123 \
  --cookie "session=..." \
  -o downloaded.pdf
```

**Delete Test:**
```bash
curl -X DELETE http://localhost:2424/api/invoices/123 \
  --cookie "session=..."
```

### Automated Testing

See test files:
- `backend/controllers/invoiceController.integration.test.js`
- `backend/services/invoiceService.test.js`
- `backend/test/uploadIntegration.test.js`

---

## Changelog

### Version 4.12.0 (January 2026)
- Initial release of invoice attachment feature
- Added upload, download, delete endpoints
- Enhanced expense endpoints with invoice data
- Implemented file validation and security

---

**Last Updated:** January 15, 2026  
**API Version:** 1.0  
**Status:** Active
