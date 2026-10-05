# Income Source Categories

## Overview

Income sources can be assigned one of four predefined categories: Salary, Government, Gifts, and Other. Category totals are shown in the Income Management Modal (monthly) and on the Annual Summary (yearly).

## Features

### Category Types

Income sources can be categorized into four types:

1. **Salary** 💼 - Employment income, wages, bonuses
2. **Government** 🏛️ - Government benefits, tax refunds, grants
3. **Gifts** 🎁 - Monetary gifts from family/friends
4. **Other** 💰 - Any other income sources

### Income Management Modal

`IncomeManagementModal` (`frontend/src/components/financial/`) provides:

- **Category Selector**: Dropdown to select category when adding new income sources
- **Category Badges**: Color-coded badges showing the category for each income source
- **Category Breakdown**: "By Category" section showing subtotals by category for the current month (only categories that have sources)
- **Edit Category**: Ability to change category when editing existing income sources

### Annual Summary

`AnnualSummary` includes:

- **Income by Category Section**: Total income by category for the year (shown only when the year has income)
- **Category Totals**: Total amount for each category
- **Percentage Breakdown**: Percentage of total income for each category
- **Visual Icons**: Category-specific icons for easy identification

### Carry Forward

When using "📋 Copy from Previous Month" (appends the previous month's sources to the current month):

- Categories are preserved automatically
- No need to recategorize sources each month
- Maintains consistency across months

## User Interface

### Adding Income with Category

1. Click "Manage Income" on the Monthly Income card in the Monthly Summary
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

The `income_sources` table (`backend/database/schema.js`):

```sql
CREATE TABLE IF NOT EXISTS income_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  category TEXT DEFAULT 'Salary',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

There is no database CHECK constraint on `category`; valid values are enforced in the service layer. The service and repository always supply a category (defaulting to `'Other'`), so the column default is not used by the app.

### API Endpoints

**Get Monthly Income with Category Breakdown**
```
GET /api/income/:year/:month
Response: {
  sources: [...],
  total: number,
  byCategory: { [category]: number }  // only categories with sources
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
  byCategory: { [category]: number },  // only categories with income
  total: number
}
```

`PUT /api/income/:id` accepts `category`; `POST /api/income/:year/:month/copy-previous` copies sources with their categories.

### Validation

**Backend Validation**:
- Category must be one of `INCOME_CATEGORIES` (`backend/utils/constants.js`): Salary, Government, Gifts, Other
- Category is optional on create and defaults to 'Other'
- Validation occurs in `incomeService.validateIncomeSource()`

**Frontend Validation**:
- Category selector only allows valid options (defaults to "Other")

## Benefits

1. **Better Income Analysis**: Understand income composition by source type
2. **Tax Planning**: Easily identify government income and gifts for tax purposes
3. **Financial Planning**: Track salary vs other income sources
4. **Annual Insights**: See income trends by category over the year
5. **Consistency**: Categories preserved when carrying forward to new months

## Related Features

- [Enhanced Annual Summary](ENHANCED_ANNUAL_SUMMARY.md)
- [Enhanced Fixed Expenses](ENHANCED_FIXED_EXPENSES.md) — similar categorization for fixed expenses

**Last Reviewed:** October 4, 2026

