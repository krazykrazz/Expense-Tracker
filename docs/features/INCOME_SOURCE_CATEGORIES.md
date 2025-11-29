# Income Source Categories

## Overview

The Income Source Categories feature allows users to categorize their income sources into four predefined categories: Salary, Government, Gifts, and Other. This enhancement provides better income analysis and reporting capabilities, particularly on the annual summary view.

**Version**: 4.4.0  
**Release Date**: November 29, 2025

## Features

### Category Types

Income sources can be categorized into four types:

1. **Salary** 💼 - Employment income, wages, bonuses
2. **Government** 🏛️ - Government benefits, tax refunds, grants
3. **Gifts** 🎁 - Monetary gifts from family/friends
4. **Other** 💰 - Any other income sources

### Income Management Modal

The Income Management Modal has been enhanced with:

- **Category Selector**: Dropdown to select category when adding new income sources
- **Category Badges**: Color-coded badges showing the category for each income source
- **Category Breakdown**: Section showing subtotals by category for the current month
- **Edit Category**: Ability to change category when editing existing income sources

### Annual Summary

The Annual Summary page now includes:

- **Income by Category Section**: New section showing total income by category for the year
- **Category Totals**: Total amount for each category
- **Percentage Breakdown**: Percentage of total income for each category
- **Visual Icons**: Category-specific icons for easy identification

### Carry Forward

When copying income sources from the previous month:

- Categories are preserved automatically
- No need to recategorize sources each month
- Maintains consistency across months

## User Interface

### Adding Income with Category

1. Click "👁️ View/Edit" next to Monthly Gross Income
2. Click "+ Add Income Source"
3. Enter income source name and amount
4. Select category from dropdown (defaults to "Other")
5. Click "Add"

### Viewing Category Breakdown

In the Income Management Modal:

- Each income source displays a color-coded category badge
- The "By Category" section shows subtotals for each category
- Icons help identify categories at a glance

### Annual Category Analysis

On the Annual Summary page:

- Scroll to the "Income by Category" section
- View total income for each category
- See percentage of total income per category
- Compare income composition across categories

## Technical Details

### Database Schema

The `income_sources` table includes:

```sql
CREATE TABLE income_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  category TEXT NOT NULL DEFAULT 'Other' 
    CHECK(category IN ('Salary', 'Government', 'Gifts', 'Other')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

### API Endpoints

**Get Monthly Income with Category Breakdown**
```
GET /api/income/:year/:month
Response: {
  sources: [...],
  total: number,
  byCategory: {
    Salary: number,
    Government: number,
    Gifts: number,
    Other: number
  }
}
```

**Create Income Source with Category**
```
POST /api/income
Body: {
  year: number,
  month: number,
  name: string,
  amount: number,
  category: 'Salary' | 'Government' | 'Gifts' | 'Other'
}
```

**Get Annual Income by Category**
```
GET /api/income/annual/:year/by-category
Response: {
  Salary: number,
  Government: number,
  Gifts: number,
  Other: number
}
```

### Migration

The feature includes an automatic database migration:

- Migration Name: `add_income_category_column_v1`
- Adds `category` column to `income_sources` table
- Sets default value to 'Other' for existing records
- Adds CHECK constraint for valid categories
- Runs automatically on container startup
- Creates backup before migration

### Validation

**Backend Validation**:
- Category must be one of: Salary, Government, Gifts, Other
- Category is required (defaults to 'Other' if not provided)
- Validation occurs in `incomeService.validateIncomeSource()`

**Frontend Validation**:
- Category selector only allows valid options
- Category is always set (cannot be empty)

## Testing

The feature includes comprehensive test coverage:

### Unit Tests

**incomeService.test.js** (10 tests):
- Category validation
- Create with category
- Update with category
- Invalid category rejection
- Default category handling

**incomeRepository.test.js** (28 tests):
- Category storage and retrieval
- Category breakdown queries
- Annual category aggregation
- Copy with category preservation

### Test Results

All 38 income-related tests pass successfully:
- ✅ Category validation working correctly
- ✅ Category breakdown by month working correctly
- ✅ Category breakdown by year working correctly
- ✅ All CRUD operations with categories functioning properly

## Backward Compatibility

The feature is fully backward compatible:

- Existing income sources automatically get category "Other"
- No breaking changes to existing API endpoints
- Migration is idempotent (safe to run multiple times)
- All existing functionality continues to work

## Benefits

1. **Better Income Analysis**: Understand income composition by source type
2. **Tax Planning**: Easily identify government income and gifts for tax purposes
3. **Financial Planning**: Track salary vs other income sources
4. **Annual Insights**: See income trends by category over the year
5. **Consistency**: Categories preserved when carrying forward to new months

## Future Enhancements

Potential future improvements:

- Custom income categories
- Income category trends over time
- Category-based income forecasting
- Export income by category
- Income category budgeting

## Related Features

- **Multi-Source Income**: Track income from multiple sources (v3.2.0)
- **Annual Summary**: Comprehensive yearly financial overview (v3.6.0)
- **Fixed Expenses Categories**: Similar categorization for fixed expenses (v4.2.0)

## Support

For issues or questions about income source categories:

1. Check the migration status: `node backend/scripts/checkIncomeSchema.js`
2. Review test results: `npm test -- incomeService.test.js incomeRepository.test.js`
3. Verify migration applied: Check `schema_migrations` table for `add_income_category_column_v1`

## Documentation

- [Requirements](.kiro/specs/income-source-categories/requirements.md)
- [Design](.kiro/specs/income-source-categories/design.md)
- [Tasks](.kiro/specs/income-source-categories/tasks.md)
- [Migration Implementation](.kiro/specs/income-source-categories/MIGRATION_IMPLEMENTATION_COMPLETE.md)
