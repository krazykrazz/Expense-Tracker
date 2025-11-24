# Design Document

## Overview

The Place Name Standardization feature provides a data cleanup tool integrated into the Settings modal. It uses fuzzy string matching algorithms to identify similar place names across all expense records, groups them into similarity clusters, and allows users to standardize variations to a canonical name through a guided workflow. The feature is designed to be non-destructive (requiring explicit user confirmation) and performant for large datasets.

## Architecture

The feature follows the existing layered architecture pattern:

**Frontend:**
- New "Misc" tab in BackupSettings component
- PlaceNameStandardization component for the main interface
- SimilarityGroup component for displaying each group of similar names
- API service layer for backend communication

**Backend:**
- Controller layer for HTTP request handling
- Service layer for business logic and fuzzy matching
- Repository layer for database operations
- Transactional updates for data integrity

## Components and Interfaces

### Frontend Components

#### 1. BackupSettings (Modified)
- Add new "Misc" tab to existing tab navigation
- Render PlaceNameStandardization component when Misc tab is active
- Maintain existing backup/import/restore functionality

#### 2. PlaceNameStandardization (New)
Main component for the standardization workflow.

**Props:**
- None (self-contained)

**State:**
```typescript
{
  loading: boolean,
  analyzing: boolean,
  applying: boolean,
  similarityGroups: SimilarityGroup[],
  selections: Map<string, string>, // groupId -> canonical name
  showPreview: boolean,
  previewData: PreviewData | null,
  error: string | null
}
```

**Key Methods:**
- `analyzePlaceNames()`: Fetch similarity groups from backend
- `handleCanonicalSelection(groupId, canonicalName)`: Update selection
- `showPreview()`: Generate preview of changes
- `applyStandardization()`: Execute bulk update
- `handleCancel()`: Reset state and close

#### 3. SimilarityGroup (New)
Component for displaying a single group of similar place names.

**Props:**
```typescript
{
  group: {
    id: string,
    variations: Array<{
      name: string,
      count: number
    }>,
    suggestedCanonical: string,
    totalCount: number
  },
  selectedCanonical: string | null,
  onSelectCanonical: (groupId: string, canonical: string) => void
}
```

**Features:**
- Radio buttons for selecting from variations
- Text input for custom canonical name
- Display expense counts for each variation
- Highlight suggested canonical name

### Backend API Endpoints

#### GET /api/expenses/place-names/analyze
Analyze all place names and return similarity groups.

**Response:**
```json
{
  "groups": [
    {
      "id": "group-uuid",
      "variations": [
        { "name": "Walmart", "count": 45 },
        { "name": "walmart", "count": 12 },
        { "name": "Wal-Mart", "count": 8 }
      ],
      "suggestedCanonical": "Walmart",
      "totalCount": 65
    }
  ],
  "totalGroups": 15,
  "totalExpenses": 1250
}
```

#### POST /api/expenses/place-names/standardize
Apply standardization changes.

**Request:**
```json
{
  "updates": [
    {
      "from": ["walmart", "Wal-Mart"],
      "to": "Walmart"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "updatedCount": 20,
  "message": "Successfully standardized 20 expense records"
}
```

### Backend Services

#### PlaceNameService
Handles business logic for place name analysis and standardization.

**Key Methods:**
```javascript
async analyzePlaceNames() {
  // 1. Fetch all unique place names with counts
  // 2. Apply fuzzy matching algorithm
  // 3. Group similar names
  // 4. Determine suggested canonical names
  // 5. Return similarity groups
}

async standardizePlaceNames(updates) {
  // 1. Validate updates
  // 2. Begin transaction
  // 3. Update expense records in bulk
  // 4. Commit transaction
  // 5. Return update count
}
```

**Fuzzy Matching Algorithm:**
- Use Levenshtein distance for similarity scoring
- Normalize strings (lowercase, trim whitespace)
- Consider strings similar if:
  - Levenshtein distance ≤ 2, OR
  - One string contains the other (after normalization), OR
  - Strings match after removing punctuation and extra spaces
- Group threshold: similarity score ≥ 0.8

### Database Operations

#### PlaceNameRepository

**Methods:**
```javascript
async getAllPlaceNames() {
  // SELECT DISTINCT place, COUNT(*) as count
  // FROM expenses
  // WHERE place IS NOT NULL AND place != ''
  // GROUP BY place
  // ORDER BY count DESC
}

async updatePlaceNames(fromNames, toName) {
  // UPDATE expenses
  // SET place = ?
  // WHERE place IN (?)
  // Returns: number of rows updated
}
```

## Data Models

### SimilarityGroup
```typescript
interface SimilarityGroup {
  id: string;                    // Unique identifier for the group
  variations: PlaceVariation[];  // All variations in this group
  suggestedCanonical: string;    // Most frequent variation
  totalCount: number;            // Total expenses across all variations
}

interface PlaceVariation {
  name: string;    // The place name variation
  count: number;   // Number of expenses with this variation
}
```

### StandardizationUpdate
```typescript
interface StandardizationUpdate {
  from: string[];  // Array of variations to update
  to: string;      // Canonical name to update to
}
```

### PreviewData
```typescript
interface PreviewData {
  updates: Array<{
    from: string[];
    to: string;
    affectedCount: number;
  }>;
  totalAffected: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Similarity grouping is transitive
*For any* three place names A, B, and C, if A is similar to B and B is similar to C, then A, B, and C should all be in the same similarity group.
**Validates: Requirements 2.2, 2.3**

### Property 2: Standardization preserves expense count
*For any* set of place name variations being standardized, the total number of expenses before standardization should equal the total number of expenses after standardization.
**Validates: Requirements 6.1, 6.2**

### Property 3: Canonical name selection is idempotent
*For any* similarity group, selecting a canonical name multiple times should result in the same selection state.
**Validates: Requirements 4.1, 4.2**

### Property 4: Empty or null place names are excluded
*For any* expense record with a null or empty place name, that record should not appear in any similarity group.
**Validates: Requirements 7.2**

### Property 5: Bulk update is atomic
*For any* standardization operation, either all expense records are updated successfully or none are updated (transaction rollback on failure).
**Validates: Requirements 6.2, 6.5**

### Property 6: Preview matches actual changes
*For any* standardization preview, the number of records shown as affected should exactly match the number of records actually updated when changes are applied.
**Validates: Requirements 5.3, 5.4**

## Error Handling

### Frontend Error Handling

1. **Network Errors**
   - Display user-friendly error message
   - Provide retry option
   - Log error details to console

2. **Validation Errors**
   - Prevent empty canonical names
   - Show inline validation messages
   - Disable apply button until valid

3. **Loading States**
   - Show spinner during analysis
   - Show progress indicator during updates
   - Disable actions while processing

### Backend Error Handling

1. **Database Errors**
   - Rollback transaction on failure
   - Return 500 status with error message
   - Log error details for debugging

2. **Invalid Input**
   - Validate request payload
   - Return 400 status with validation errors
   - Sanitize input to prevent SQL injection

3. **Transaction Failures**
   - Ensure atomic updates
   - Return detailed error information
   - Maintain data integrity

## Testing Strategy

### Unit Tests

1. **Fuzzy Matching Algorithm**
   - Test Levenshtein distance calculation
   - Test normalization logic
   - Test similarity threshold edge cases
   - Test grouping logic with known inputs

2. **Component Behavior**
   - Test canonical name selection
   - Test custom name input validation
   - Test preview generation
   - Test cancel/reset functionality

3. **Repository Operations**
   - Test place name fetching
   - Test bulk update queries
   - Test transaction handling

### Integration Tests

1. **End-to-End Workflow**
   - Test complete standardization flow
   - Test with various dataset sizes
   - Test transaction rollback on error
   - Test UI state management through workflow

2. **API Integration**
   - Test analyze endpoint with real data
   - Test standardize endpoint with various inputs
   - Test error responses

### Performance Tests

1. **Large Dataset Handling**
   - Test with 10,000+ expense records
   - Measure analysis time
   - Measure update time
   - Verify UI responsiveness

2. **Fuzzy Matching Performance**
   - Test algorithm efficiency
   - Optimize for common cases
   - Profile and identify bottlenecks

## UI/UX Design

### Misc Tab in Settings

- Add "Misc" as a new tab alongside "Backup", "Import", "Restore"
- Tab content shows list of miscellaneous tools
- "Standardize Place Names" button with icon (🏷️ or similar)
- Brief description: "Find and fix inconsistent place names in your expenses"

### Standardization Interface

**Step 1: Analysis**
- Loading spinner with "Analyzing place names..."
- Progress indication if possible

**Step 2: Review Groups**
- List of similarity groups
- Each group shows:
  - Variations with counts
  - Suggested canonical name (highlighted)
  - Radio buttons or dropdown for selection
  - Text input for custom name
- Summary at top: "Found X groups affecting Y expenses"
- "Preview Changes" button at bottom

**Step 3: Preview**
- Table showing:
  - From (variations)
  - To (canonical name)
  - Affected count
- Total affected count
- "Go Back" and "Apply Changes" buttons

**Step 4: Confirmation**
- Success message with count
- "Close" button to return to settings

### Visual Design

- Use existing app color scheme
- Match styling of other settings sections
- Clear visual hierarchy
- Responsive layout for different screen sizes
- Loading states with spinners
- Success/error messages with appropriate colors

## Security Considerations

1. **SQL Injection Prevention**
   - Use parameterized queries
   - Sanitize all user input
   - Validate canonical names

2. **Data Integrity**
   - Use transactions for bulk updates
   - Validate updates before applying
   - Provide rollback on failure

3. **Input Validation**
   - Limit canonical name length
   - Prevent special characters that could cause issues
   - Validate update payload structure

## Performance Optimization

1. **Fuzzy Matching**
   - Cache normalized strings
   - Use efficient string comparison algorithms
   - Limit comparisons using smart heuristics

2. **Database Queries**
   - Use indexed queries where possible
   - Batch updates for efficiency
   - Optimize GROUP BY queries

3. **Frontend Rendering**
   - Virtualize long lists if needed
   - Debounce custom name input
   - Lazy load similarity groups if many exist

## Future Enhancements

1. **Auto-Standardization**
   - Option to automatically apply suggested canonical names
   - Confidence threshold for auto-application

2. **Place Name Dictionary**
   - Maintain a dictionary of known place names
   - Suggest corrections based on dictionary

3. **Undo Functionality**
   - Allow reverting standardization changes
   - Store change history

4. **Batch Processing**
   - Process standardization in background
   - Email notification when complete
