# Design Document: Multi-Invoice Support

## Overview

This design extends the existing medical expense invoice system to support multiple invoices per expense with optional person linking. The current system enforces a 1:1 relationship between expenses and invoices via a UNIQUE constraint. This design removes that constraint and adds a person_id foreign key to enable linking invoices to specific family members.

The implementation follows the existing layered architecture (Controller → Service → Repository → Database) and maintains backward compatibility with the current single-invoice workflow.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  InvoiceUpload.jsx  │  InvoiceIndicator.jsx  │  InvoiceList.jsx │
│  (multi-upload)     │  (count display)        │  (new component) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Layer (Express)                          │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/invoices/upload     (+ personId param)               │
│  GET  /api/invoices/:expenseId (returns array)                  │
│  GET  /api/invoices/:expenseId/:invoiceId                       │
│  DELETE /api/invoices/:invoiceId                                │
│  PATCH /api/invoices/:invoiceId (update person link)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Service Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│  invoiceService.js                                               │
│  - uploadInvoice(expenseId, file, personId?)                    │
│  - getInvoicesForExpense(expenseId)                             │
│  - deleteInvoice(invoiceId)                                     │
│  - updateInvoicePersonLink(invoiceId, personId)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Repository Layer                               │
├─────────────────────────────────────────────────────────────────┤
│  invoiceRepository.js                                            │
│  - create(invoiceData)                                          │
│  - findAllByExpenseId(expenseId)                                │
│  - findById(invoiceId)                                          │
│  - deleteById(invoiceId)                                        │
│  - updatePersonId(invoiceId, personId)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database (SQLite)                           │
├─────────────────────────────────────────────────────────────────┤
│  expense_invoices (modified)                                     │
│  - id, expense_id, person_id (new), filename, ...               │
│  - UNIQUE constraint removed from expense_id                     │
│  - FK to people table (ON DELETE SET NULL)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow for Multi-Invoice Upload

```
User selects file + optional person
         │
         ▼
┌─────────────────┐
│ InvoiceUpload   │ Validates file (PDF, <10MB)
│ Component       │ Shows person dropdown if people assigned
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ invoiceApi.js   │ POST /api/invoices/upload
│                 │ FormData: file, expenseId, personId?
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ invoiceController│ Validates expense exists
│                 │ Validates person belongs to expense (if provided)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ invoiceService  │ Stores file, creates DB record
│                 │ Returns invoice metadata
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ UI Updates      │ Adds invoice to list
│                 │ Updates indicator count
└─────────────────┘
```

## Components and Interfaces

### Backend Components

#### invoiceRepository.js (Modified)

```javascript
class InvoiceRepository {
  /**
   * Create a new invoice record
   * @param {Object} invoiceData - Invoice metadata including optional personId
   * @returns {Promise<Object>} Created invoice with ID
   */
  async create(invoiceData) {
    // INSERT with person_id column (nullable)
  }

  /**
   * Find all invoices for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Array>} Array of invoice records ordered by upload_date
   */
  async findAllByExpenseId(expenseId) {
    // SELECT with JOIN to people table for person name
  }

  /**
   * Find invoice by ID
   * @param {number} id - Invoice ID
   * @returns {Promise<Object|null>} Invoice record or null
   */
  async findById(id) {
    // Existing method, unchanged
  }

  /**
   * Delete invoice by ID
   * @param {number} id - Invoice ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteById(id) {
    // Existing method, unchanged
  }

  /**
   * Update person association for an invoice
   * @param {number} id - Invoice ID
   * @param {number|null} personId - Person ID or null to unlink
   * @returns {Promise<boolean>} True if updated
   */
  async updatePersonId(id, personId) {
    // UPDATE person_id WHERE id = ?
  }

  /**
   * Get invoice count for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<number>} Count of invoices
   */
  async getCountByExpenseId(expenseId) {
    // SELECT COUNT(*) WHERE expense_id = ?
  }

  /**
   * Clear person associations when person is removed from expense
   * @param {number} expenseId - Expense ID
   * @param {number} personId - Person ID being removed
   * @returns {Promise<number>} Number of invoices updated
   */
  async clearPersonIdForExpense(expenseId, personId) {
    // UPDATE SET person_id = NULL WHERE expense_id = ? AND person_id = ?
  }
}
```

#### invoiceService.js (Modified)

```javascript
class InvoiceService {
  /**
   * Upload invoice for an expense with optional person link
   * @param {number} expenseId - Expense ID
   * @param {Object} file - Multer file object
   * @param {number|null} personId - Optional person ID to link
   * @returns {Promise<Object>} Created invoice metadata
   */
  async uploadInvoice(expenseId, file, personId = null) {
    // Validate expense exists and is medical
    // Validate person belongs to expense (if personId provided)
    // Store file and create record
  }

  /**
   * Get all invoices for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Array>} Array of invoice metadata with person info
   */
  async getInvoicesForExpense(expenseId) {
    // Return all invoices with person names
  }

  /**
   * Delete a specific invoice
   * @param {number} invoiceId - Invoice ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteInvoiceById(invoiceId) {
    // Delete file and database record
  }

  /**
   * Update person link for an invoice
   * @param {number} invoiceId - Invoice ID
   * @param {number|null} personId - Person ID or null
   * @returns {Promise<Object>} Updated invoice
   */
  async updateInvoicePersonLink(invoiceId, personId) {
    // Validate person belongs to expense
    // Update person_id
  }
}
```

#### invoiceController.js (Modified)

```javascript
// POST /api/invoices/upload
// Body: FormData with invoice file, expenseId, optional personId
async uploadInvoice(req, res) {
  const { expenseId, personId } = req.body;
  // Validate and delegate to service
}

// GET /api/invoices/:expenseId
// Returns array of all invoices for expense
async getInvoicesForExpense(req, res) {
  const { expenseId } = req.params;
  // Return array instead of single object
}

// GET /api/invoices/:expenseId/:invoiceId
// Returns specific invoice file for viewing
async getInvoiceFile(req, res) {
  const { expenseId, invoiceId } = req.params;
  // Stream file to response
}

// DELETE /api/invoices/:invoiceId
// Deletes specific invoice by ID
async deleteInvoice(req, res) {
  const { invoiceId } = req.params;
  // Delete specific invoice
}

// PATCH /api/invoices/:invoiceId
// Updates person association
async updateInvoicePersonLink(req, res) {
  const { invoiceId } = req.params;
  const { personId } = req.body;
  // Update person link
}
```

### Frontend Components

#### InvoiceList.jsx (New Component)

```jsx
/**
 * Displays a list of invoices for an expense
 * Props:
 * - invoices: Array of invoice objects
 * - expenseId: Parent expense ID
 * - people: Array of people assigned to expense
 * - onInvoiceDeleted: Callback when invoice is deleted
 * - onPersonLinkUpdated: Callback when person link changes
 */
const InvoiceList = ({
  invoices,
  expenseId,
  people,
  onInvoiceDeleted,
  onPersonLinkUpdated
}) => {
  // Render scrollable list of invoices
  // Each item shows: filename, size, date, person (if linked)
  // Actions: View, Delete, Change Person
};
```

#### InvoiceUpload.jsx (Modified)

```jsx
/**
 * Modified to support:
 * - Optional person selection dropdown
 * - Adding to existing invoice collection
 * - Showing "Add Invoice" button when invoices exist
 */
const InvoiceUpload = ({
  expenseId,
  existingInvoices, // Changed from existingInvoice (single)
  people,           // New: people assigned to expense
  onInvoiceUploaded,
  onInvoiceDeleted,
  disabled
}) => {
  // Show InvoiceList if invoices exist
  // Show "Add Invoice" button
  // Person dropdown in upload form
};
```

#### InvoiceIndicator.jsx (Modified)

```jsx
/**
 * Modified to show invoice count
 * Props:
 * - invoiceCount: Number of invoices (new)
 * - invoices: Array of invoice info for tooltip
 */
const InvoiceIndicator = ({
  hasInvoice,
  invoiceCount,    // New
  invoices,        // New: for tooltip
  expenseId,
  onClick,
  size,
  showText
}) => {
  // Show count badge when > 1
  // Tooltip lists all filenames
};
```

### API Endpoints

| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| POST | /api/invoices/upload | Upload invoice | FormData: file, expenseId, personId? | `{ success, invoice }` |
| GET | /api/invoices/:expenseId | Get all invoices | - | `{ invoices: [...] }` |
| GET | /api/invoices/:expenseId/:invoiceId | Get invoice file | - | PDF stream |
| DELETE | /api/invoices/:invoiceId | Delete invoice | - | `{ success }` |
| PATCH | /api/invoices/:invoiceId | Update person link | `{ personId }` | `{ success, invoice }` |
| GET | /api/invoices/:expenseId/metadata | Get all metadata | - | `{ invoices: [...] }` |

## Data Models

### Database Schema Changes

#### Current Schema (expense_invoices)
```sql
CREATE TABLE expense_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    UNIQUE(expense_id)  -- This enforces 1:1 relationship
);
```

#### New Schema (expense_invoices)
```sql
CREATE TABLE expense_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    person_id INTEGER,                    -- NEW: optional link to person
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
    -- UNIQUE(expense_id) REMOVED to allow multiple invoices
);

-- Indexes
CREATE INDEX idx_expense_invoices_expense_id ON expense_invoices(expense_id);
CREATE INDEX idx_expense_invoices_person_id ON expense_invoices(person_id);
CREATE INDEX idx_expense_invoices_upload_date ON expense_invoices(upload_date);
```

### TypeScript Interfaces (for documentation)

```typescript
interface Invoice {
  id: number;
  expenseId: number;
  personId: number | null;
  personName: string | null;  // Joined from people table
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadDate: string;
}

interface InvoiceUploadRequest {
  expenseId: number;
  personId?: number;
  file: File;
}

interface InvoiceListResponse {
  invoices: Invoice[];
  count: number;
}
```

### Migration Strategy

The migration will:
1. Create a backup of the database
2. Create a new table with the updated schema
3. Copy all existing data (person_id will be NULL for existing records)
4. Drop the old table
5. Rename the new table
6. Recreate indexes

```javascript
async function migrateMultiInvoiceSupport(db) {
  const migrationName = 'multi_invoice_support_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) return;

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Create new table without UNIQUE constraint, with person_id
      db.run(`
        CREATE TABLE expense_invoices_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          expense_id INTEGER NOT NULL,
          person_id INTEGER,
          filename TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          mime_type TEXT NOT NULL DEFAULT 'application/pdf',
          upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
          FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
        )
      `);

      // Copy existing data
      db.run(`
        INSERT INTO expense_invoices_new 
        SELECT id, expense_id, NULL as person_id, filename, 
               original_filename, file_path, file_size, mime_type, upload_date
        FROM expense_invoices
      `);

      // Drop old table and rename
      db.run('DROP TABLE expense_invoices');
      db.run('ALTER TABLE expense_invoices_new RENAME TO expense_invoices');

      // Create indexes
      db.run('CREATE INDEX idx_expense_invoices_expense_id ON expense_invoices(expense_id)');
      db.run('CREATE INDEX idx_expense_invoices_person_id ON expense_invoices(person_id)');
      db.run('CREATE INDEX idx_expense_invoices_upload_date ON expense_invoices(upload_date)');

      // Mark migration complete
      markMigrationApplied(db, migrationName);
      
      db.run('COMMIT', (err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis of acceptance criteria, the following properties have been identified for property-based testing:

### Property 1: Multiple Invoice Addition Preserves Collection

*For any* expense with N existing invoices (where N >= 0), uploading a valid invoice SHALL result in the expense having exactly N+1 invoices, with the new invoice included in the collection.

**Validates: Requirements 1.1, 1.2**

### Property 2: Invoice Uniqueness Within Expense

*For any* expense with multiple invoices, all invoice IDs SHALL be unique, and all invoices SHALL have the same expense_id matching the parent expense.

**Validates: Requirements 1.2**

### Property 3: Cascade Delete Removes All Invoices

*For any* expense with N invoices (where N >= 1), deleting the expense SHALL result in all N associated invoices being removed from the database.

**Validates: Requirements 1.3**

### Property 4: Invoice Retrieval Ordering

*For any* expense with multiple invoices having different upload dates, retrieving invoices SHALL return them ordered by upload_date (ascending or descending consistently).

**Validates: Requirements 1.5**

### Property 5: Person ID Storage Consistency

*For any* invoice upload, the stored person_id SHALL match the provided value when a valid person_id is given, or SHALL be NULL when no person_id is provided.

**Validates: Requirements 2.2, 2.3**

### Property 6: Person Removal Sets Invoice Link to NULL

*For any* invoice linked to a person, when that person is removed from the expense, the invoice SHALL still exist with person_id set to NULL.

**Validates: Requirements 2.5**

### Property 7: Migration Data Preservation

*For any* database with existing invoices, running the migration SHALL preserve all invoice records with identical data (except person_id which becomes NULL).

**Validates: Requirements 3.3**

### Property 8: Invoice Display Contains Required Fields

*For any* invoice rendered in the UI, the display SHALL include the filename, file size, upload date, and person name (if linked).

**Validates: Requirements 4.2**

### Property 9: File Validation Consistency

*For any* file upload attempt, the validation rules (PDF format, 10MB maximum) SHALL be applied regardless of whether the expense already has invoices attached.

**Validates: Requirements 5.3, 9.3**

### Property 10: Upload Failure Isolation

*For any* expense with existing invoices, a failed upload attempt SHALL not modify or remove any existing invoices.

**Validates: Requirements 5.4**

### Property 11: Invoice Count Display Accuracy

*For any* expense with N invoices (where N > 1), the invoice indicator SHALL display the count N.

**Validates: Requirements 6.1**

### Property 12: Tax Report Invoice Count Accuracy

*For any* medical expense displayed in the tax report, the shown invoice count SHALL match the actual number of invoices attached to that expense.

**Validates: Requirements 7.1**

### Property 13: Invoice Filter Correctness

*For any* filter selection (with invoices, without invoices, all), the filtered results SHALL contain only expenses matching the filter criteria.

**Validates: Requirements 7.2**

### Property 14: GET Endpoint Returns All Invoices

*For any* expense with N invoices, the GET /api/invoices/:expenseId endpoint SHALL return an array containing exactly N invoice objects.

**Validates: Requirements 8.1**

### Property 15: DELETE by ID Removes Specific Invoice

*For any* invoice deleted by ID, only that specific invoice SHALL be removed; all other invoices for the same expense SHALL remain unchanged.

**Validates: Requirements 8.3**

### Property 16: PATCH Updates Person Association

*For any* invoice updated via PATCH with a new person_id, the invoice's person_id SHALL be updated to the new value while all other fields remain unchanged.

**Validates: Requirements 8.4**

### Property 17: Backward Compatible Single Upload

*For any* single invoice upload without person_id to an expense with no existing invoices, the system SHALL behave identically to the previous single-invoice implementation.

**Validates: Requirements 9.1**

## Error Handling

### Backend Error Handling

| Error Condition | HTTP Status | Error Message | Recovery Action |
|-----------------|-------------|---------------|-----------------|
| Expense not found | 404 | "Expense not found" | Return error, no state change |
| Expense not medical type | 400 | "Invoices can only be attached to medical expenses" | Return error, no state change |
| Person not assigned to expense | 400 | "Person is not assigned to this expense" | Return error, no state change |
| Invalid person_id | 400 | "Invalid person ID" | Return error, no state change |
| Invoice not found | 404 | "Invoice not found" | Return error, no state change |
| File validation failed | 400 | "File validation failed: {details}" | Return error, cleanup temp file |
| File storage failed | 500 | "Failed to store invoice file" | Return error, cleanup temp file |
| Database error | 500 | "Database operation failed" | Return error, cleanup stored file |
| Migration failure | N/A | Logged error | Rollback transaction, preserve original schema |

### Frontend Error Handling

| Error Condition | User Feedback | Recovery Action |
|-----------------|---------------|-----------------|
| Upload failed | Error message below upload area | Allow retry, preserve existing invoices |
| Delete failed | Error toast notification | Allow retry |
| Network error | "Network error. Please try again." | Allow retry |
| Invalid file type | "Only PDF files are allowed" | Clear file input, allow new selection |
| File too large | "File exceeds 10MB limit" | Clear file input, allow new selection |
| Person load failed | Hide person dropdown, allow upload without person | Log warning, continue |

### Transaction Safety

All multi-step operations use database transactions:

```javascript
// Example: Upload with person validation
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  
  try {
    // 1. Validate expense exists
    // 2. Validate person belongs to expense (if provided)
    // 3. Store file
    // 4. Create database record
    
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    // Cleanup stored file if exists
    throw error;
  }
});
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across randomly generated inputs

### Property-Based Testing Configuration

- **Library**: fast-check (already used in the project)
- **Minimum iterations**: 100 per property test
- **Tag format**: `Feature: multi-invoice-support, Property {number}: {property_text}`

### Test Categories

#### Repository Layer Tests (invoiceRepository.test.js)

**Unit Tests:**
- Create invoice with person_id
- Create invoice without person_id
- Find all invoices for expense (empty, single, multiple)
- Delete by ID (exists, not exists)
- Update person_id (valid, null, invalid)
- Clear person_id for expense

**Property Tests:**
- Property 2: Invoice uniqueness
- Property 4: Retrieval ordering
- Property 5: Person ID storage consistency
- Property 15: DELETE by ID specificity

#### Service Layer Tests (invoiceService.test.js)

**Unit Tests:**
- Upload with valid person_id
- Upload with invalid person_id (not assigned to expense)
- Upload without person_id
- Get invoices for expense
- Delete specific invoice
- Update person link

**Property Tests:**
- Property 1: Multiple invoice addition
- Property 3: Cascade delete
- Property 6: Person removal sets NULL
- Property 10: Upload failure isolation
- Property 17: Backward compatible single upload

#### Controller/API Tests (invoiceController.test.js)

**Unit Tests:**
- POST /api/invoices/upload with person_id
- GET /api/invoices/:expenseId returns array
- DELETE /api/invoices/:invoiceId
- PATCH /api/invoices/:invoiceId
- Error responses for invalid inputs

**Property Tests:**
- Property 14: GET returns all invoices
- Property 9: File validation consistency

#### Migration Tests (migrations.test.js)

**Unit Tests:**
- Migration creates person_id column
- Migration removes UNIQUE constraint
- Migration preserves existing data
- Migration rollback on failure
- Migration creates backup

**Property Tests:**
- Property 7: Migration data preservation

#### Frontend Component Tests

**InvoiceList.test.jsx:**
- Renders list of invoices
- Shows person names when linked
- Delete button for each invoice
- Click opens PDF viewer

**InvoiceUpload.test.jsx:**
- Shows person dropdown when people assigned
- Hides person dropdown when no people
- Add Invoice button when invoices exist
- Upload progress display

**InvoiceIndicator.test.jsx:**
- Shows count when multiple invoices
- No count badge for single invoice
- Tooltip shows filenames

**Property Tests:**
- Property 8: Display contains required fields
- Property 11: Count display accuracy

#### Integration Tests

**Tax Report Integration:**
- Invoice counts in report
- Filter by invoice status
- Person-grouped view with invoice info

**Property Tests:**
- Property 12: Tax report count accuracy
- Property 13: Filter correctness

### Test Data Generators

```javascript
// fast-check arbitraries for property tests
const invoiceArb = fc.record({
  filename: fc.string({ minLength: 1, maxLength: 50 }),
  originalFilename: fc.string({ minLength: 1, maxLength: 100 }),
  fileSize: fc.integer({ min: 1, max: 10 * 1024 * 1024 }),
  mimeType: fc.constant('application/pdf'),
  uploadDate: fc.date({ min: new Date('2020-01-01'), max: new Date() })
});

const personIdArb = fc.option(fc.integer({ min: 1, max: 100 }), { nil: null });

const invoiceListArb = fc.array(invoiceArb, { minLength: 0, maxLength: 10 });
```

### Coverage Requirements

- Repository layer: 90%+ line coverage
- Service layer: 85%+ line coverage
- Controller layer: 80%+ line coverage
- Frontend components: 75%+ line coverage
- All property tests must pass with 100 iterations
