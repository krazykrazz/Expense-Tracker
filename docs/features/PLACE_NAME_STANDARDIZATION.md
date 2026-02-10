# Place Name Standardization

**Feature Version:** 4.11.0  
**Last Updated:** February 9, 2026  
**Status:** Active

## Overview

The Place Name Standardization feature provides a data cleanup tool for standardizing place names in expense records. Users often enter the same location with slight variations (e.g., "Walmart", "walmart", "Wal-Mart", "Wal Mart"), which can lead to inconsistent reporting and analysis. This tool identifies similar place names and allows users to standardize them to a consistent canonical name, improving data quality and accuracy.

## Problem Statement

Inconsistent place name entry causes several issues:
- **Fragmented analytics**: Same merchant appears as multiple entries in reports
- **Inaccurate merchant analytics**: Visit counts and spending totals are split across variations
- **Poor autocomplete**: Multiple variations clutter place name suggestions
- **Difficult searching**: Users must remember exact spelling to find expenses

**Example Issues:**
- "Walmart", "walmart", "Wal-Mart", "Wal Mart" appear as 4 separate merchants
- Spending totals are divided across variations
- Merchant analytics show incorrect visit frequency

## Solution

The system provides a data cleanup tool that:
1. Analyzes all expense place names
2. Identifies similar variations using fuzzy matching
3. Groups similar names into similarity groups
4. Allows users to select a canonical name for each group
5. Bulk updates all matching expenses to use the canonical name

## Key Features

### 1. Fuzzy Matching Algorithm

Identifies similar place names by considering:
- **Case insensitivity**: "Walmart" = "walmart"
- **Whitespace variations**: "Wal Mart" = "Walmart"
- **Punctuation differences**: "Wal-Mart" = "Wal Mart"
- **Common typos**: "Walmat" ≈ "Walmart"
- **Abbreviations**: "WM" ≈ "Walmart" (configurable)

### 2. Similarity Grouping

Groups place names that are likely the same location:
- Sorted by frequency (most common variations first)
- Shows expense count for each variation
- Highlights suggested canonical name (most frequent)
- Displays total affected expenses

### 3. Canonical Name Selection

Users can:
- Select any existing variation as canonical name
- Enter a custom canonical name
- Configure multiple groups before applying
- Preview changes before committing

### 4. Bulk Update

Applies standardization changes:
- Updates all matching expenses in single transaction
- Maintains data integrity
- Shows progress indicator
- Provides success/failure feedback

## User Interface

### Access Point

**System Modal → Misc Section:**
1. Open System Information (ℹ️ icon in header)
2. Click "Misc" tab
3. Click "Standardize Place Names" button

### Standardization Interface

**Step 1: Analysis**
```
Analyzing place names...
Found 15 similarity groups affecting 234 expenses
```

**Step 2: Review Groups**
```
Similarity Group 1 (45 expenses)
┌─────────────────────────────────────┐
│ ✓ Walmart (30 expenses) [Suggested] │
│   walmart (10 expenses)              │
│   Wal-Mart (3 expenses)              │
│   Wal Mart (2 expenses)              │
└─────────────────────────────────────┘
Canonical Name: [Walmart ▼] or [Custom...]

Similarity Group 2 (28 expenses)
┌─────────────────────────────────────┐
│ ✓ Costco (20 expenses) [Suggested]  │
│   costco (5 expenses)                │
│   COSTCO (3 expenses)                │
└─────────────────────────────────────┘
Canonical Name: [Costco ▼] or [Custom...]

[Preview Changes] [Cancel]
```

**Step 3: Preview**
```
Preview Changes

The following updates will be made:

Group 1: Walmart
  walmart → Walmart (10 expenses)
  Wal-Mart → Walmart (3 expenses)
  Wal Mart → Walmart (2 expenses)
  Total: 15 expenses

Group 2: Costco
  costco → Costco (5 expenses)
  COSTCO → Costco (3 expenses)
  Total: 8 expenses

Total Expenses to Update: 23

[Apply Changes] [Back] [Cancel]
```

**Step 4: Apply**
```
Applying changes...
Updated 23 expenses successfully ✓

[Close]
```

## Database Schema

### place_names Table (Optional)

```sql
CREATE TABLE IF NOT EXISTS place_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(original_name)
);

CREATE INDEX idx_place_names_original ON place_names(original_name);
CREATE INDEX idx_place_names_canonical ON place_names(canonical_name);
```

**Purpose:**
- Stores standardization mappings for future reference
- Enables automatic standardization of new expenses
- Provides audit trail of changes

**Note:** This table is optional. The tool can work by directly updating expenses without maintaining a mapping table.

## API Endpoints

### Analyze Place Names

**Endpoint:** `POST /api/place-names/analyze`

**Response:**
```json
{
  "similarityGroups": [
    {
      "groupId": 1,
      "variations": [
        {
          "name": "Walmart",
          "count": 30,
          "isSuggested": true
        },
        {
          "name": "walmart",
          "count": 10,
          "isSuggested": false
        },
        {
          "name": "Wal-Mart",
          "count": 3,
          "isSuggested": false
        }
      ],
      "totalExpenses": 43,
      "suggestedCanonical": "Walmart"
    }
  ],
  "totalGroups": 15,
  "totalAffectedExpenses": 234
}
```

### Preview Standardization

**Endpoint:** `POST /api/place-names/preview`

**Request:**
```json
{
  "standardizations": [
    {
      "groupId": 1,
      "canonicalName": "Walmart",
      "variations": ["walmart", "Wal-Mart", "Wal Mart"]
    },
    {
      "groupId": 2,
      "canonicalName": "Costco",
      "variations": ["costco", "COSTCO"]
    }
  ]
}
```

**Response:**
```json
{
  "preview": [
    {
      "groupId": 1,
      "canonicalName": "Walmart",
      "updates": [
        { "from": "walmart", "to": "Walmart", "count": 10 },
        { "from": "Wal-Mart", "to": "Walmart", "count": 3 },
        { "from": "Wal Mart", "to": "Walmart", "count": 2 }
      ],
      "totalUpdates": 15
    }
  ],
  "totalExpensesToUpdate": 23
}
```

### Apply Standardization

**Endpoint:** `POST /api/place-names/standardize`

**Request:**
```json
{
  "standardizations": [
    {
      "groupId": 1,
      "canonicalName": "Walmart",
      "variations": ["walmart", "Wal-Mart", "Wal Mart"]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "updatedExpenses": 23,
  "groups": [
    {
      "groupId": 1,
      "canonicalName": "Walmart",
      "updatedCount": 15
    }
  ]
}
```

## Technical Implementation

### Fuzzy Matching Algorithm

**placeNameService.js:**

```javascript
findSimilarNames(places) {
  const groups = [];
  const processed = new Set();
  
  places.forEach(place => {
    if (processed.has(place.name)) return;
    
    const similar = places.filter(p => 
      !processed.has(p.name) && 
      this.isSimilar(place.name, p.name)
    );
    
    if (similar.length > 1) {
      groups.push({
        variations: similar,
        suggestedCanonical: this.getMostFrequent(similar),
        totalExpenses: similar.reduce((sum, s) => sum + s.count, 0)
      });
      
      similar.forEach(s => processed.add(s.name));
    }
  });
  
  return groups.sort((a, b) => b.totalExpenses - a.totalExpenses);
}

isSimilar(name1, name2) {
  // Normalize for comparison
  const n1 = this.normalize(name1);
  const n2 = this.normalize(name2);
  
  // Exact match after normalization
  if (n1 === n2) return true;
  
  // Levenshtein distance for typos
  const distance = this.levenshteinDistance(n1, n2);
  const maxLength = Math.max(n1.length, n2.length);
  const similarity = 1 - (distance / maxLength);
  
  // Consider similar if 85% or more similar
  return similarity >= 0.85;
}

normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}
```

### Bulk Update Service

**placeNameService.js:**

```javascript
async standardizePlaceNames(standardizations) {
  return db.transaction(async () => {
    let totalUpdated = 0;
    
    for (const std of standardizations) {
      const result = await db.run(`
        UPDATE expenses 
        SET place = ? 
        WHERE place IN (${std.variations.map(() => '?').join(',')})
      `, [std.canonicalName, ...std.variations]);
      
      totalUpdated += result.changes;
    }
    
    return { success: true, updatedExpenses: totalUpdated };
  });
}
```

## Use Cases

### Use Case 1: Standardize Walmart Variations

**Scenario:** User has entered Walmart in multiple ways.

**Steps:**
1. Open Settings → Misc → Standardize Place Names
2. System finds group: "Walmart" (30), "walmart" (10), "Wal-Mart" (3)
3. User selects "Walmart" as canonical name
4. Preview shows 13 expenses will be updated
5. User applies changes

**Result:**
- All variations updated to "Walmart"
- Merchant analytics now show single entry with 43 total expenses
- Autocomplete shows only "Walmart"

### Use Case 2: Custom Canonical Name

**Scenario:** User wants to use a different name than any variation.

**Steps:**
1. System finds group: "Sobeys" (20), "sobeys" (10)
2. User enters custom name: "Sobeys Grocery"
3. Preview shows 10 expenses will be updated to "Sobeys Grocery"
4. User applies changes

**Result:**
- All variations updated to "Sobeys Grocery"
- Custom name used consistently

### Use Case 3: Multiple Groups

**Scenario:** User wants to standardize multiple merchants at once.

**Steps:**
1. System finds 15 similarity groups
2. User configures canonical names for 5 groups
3. Preview shows 87 total expenses will be updated
4. User applies all changes in single transaction

**Result:**
- All 5 groups standardized simultaneously
- Single transaction ensures data integrity
- Progress indicator shows completion

## Performance Considerations

### Analysis Performance

**Optimization Strategies:**
1. **Limit comparisons**: Only compare names within reasonable similarity threshold
2. **Cache normalized names**: Avoid repeated normalization
3. **Batch processing**: Process in chunks for large datasets
4. **Index usage**: Use database indexes for place name queries

**Performance Targets:**
- Analysis: < 5 seconds for 10,000 expenses
- Update: < 10 seconds for 1,000 affected expenses
- Loading indicator: Show after 2 seconds

### Database Optimization

```sql
-- Index for efficient place name queries
CREATE INDEX idx_expenses_place ON expenses(place);

-- Analyze query for grouping
SELECT place, COUNT(*) as count
FROM expenses
WHERE place IS NOT NULL AND place != ''
GROUP BY place
ORDER BY count DESC;
```

## Testing

### Property-Based Tests

**placeNameService.similarity.pbt.test.js:**
- Fuzzy matching correctness
- Normalization properties
- Similarity threshold validation

**placeNameService.grouping.pbt.test.js:**
- Group formation correctness
- Suggested canonical selection
- Frequency sorting

**placeNameService.standardization.pbt.test.js:**
- Bulk update correctness
- Transaction atomicity
- Rollback on failure

### Integration Tests

**placeNameStandardization.integration.test.js:**
- End-to-end workflow
- UI interaction
- Data integrity verification

## Best Practices

### For Users

1. **Review carefully**: Check each group before applying changes
2. **Use preview**: Always preview changes before applying
3. **Start small**: Test with a few groups first
4. **Backup first**: Create database backup before bulk changes
5. **Consistent naming**: Choose clear, consistent canonical names

### For Developers

1. **Transaction safety**: Always use transactions for bulk updates
2. **Validate input**: Validate canonical names are not empty
3. **Handle errors**: Provide clear error messages on failure
4. **Progress feedback**: Show progress for long operations
5. **Audit trail**: Consider logging standardization changes

## Related Features

- [Merchant Analytics](./MERCHANT_ANALYTICS.md) - Benefits from standardized names
- [Smart Expense Entry](./CATEGORY_SUGGESTION.md) - Improved autocomplete
- [Global Expense Filtering](./GLOBAL_EXPENSE_FILTERING.md) - Better filtering

## Future Enhancements

- Automatic standardization for new expenses
- Machine learning for better similarity detection
- Undo/revert standardization changes
- Scheduled automatic cleanup
- Import standardization rules from file
- Export standardization history

---

**Documentation Version:** 1.0  
**Feature Status:** Production Ready  
**Spec Location:** `archive/specs/place-name-standardization/`
