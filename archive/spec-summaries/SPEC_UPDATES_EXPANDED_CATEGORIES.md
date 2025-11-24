# Spec Updates for Expanded Expense Categories

## Summary

Updated multiple specification documents to reflect the expansion of expense categories from 5 to 14 categories, with "Food" renamed to "Dining Out".

## Changes Made

### 1. Main Expense Tracker Spec (`.kiro/specs/expense-tracker/`)

**Updated Files:**
- `requirements.md`
- `design.md`

**requirements.md Updates:**
- **Glossary - Type Definition**: Changed from "limited to Other, Food, Gas, Tax - Medical, or Tax - Donation" to listing all 14 categories
- **Requirement 3.1**: Changed from "exactly five Type options" to "fourteen Type options" with complete list
- **Requirement 9**: Generalized from "Gas and Food categories" to "all expense categories"
- **Requirement 11.1**: Updated from "five Type options" to "fourteen Type options"

**design.md Updates:**
- **ExpenseForm Component**: Updated type dropdown from 5 to 14 options with complete list
- **SummaryPanel Component**: Updated to reference "all 14 expense categories" instead of specific list
- **GET /api/expenses/summary**: Updated to reference "all 14 expense categories"
- **Expense Interface**: Updated type union to include all 14 categories
- **Database Schema**: Updated CHECK constraint to include all 14 categories
- **Summary Response typeTotals**: Updated to include all 14 categories
- **Annual Summary categoryTotals**: Updated to include all 14 categories
- **Validation Rules**: Updated to reference "fourteen valid options" with complete list

**Impact**: The main spec now accurately reflects the expanded category system implemented in the codebase.

### 2. Budget Tracking Spec (`.kiro/specs/budget-tracking-alerts/`)

**Updated Files:**
- `requirements.md`
- `design.md`
- `tasks.md`

**Updated Sections:**

**requirements.md:**
- **Glossary - Expense Category**: Updated to list all 14 categories
- **Glossary - Budgetable Category**: Updated to list all 12 budgetable categories (excluding tax-deductible)
- **Requirement 1.1**: Updated to list all budgetable categories instead of just "Food, Gas, Other"

**design.md:**
- **Database Schema**: Updated CHECK constraint to include all 12 budgetable categories
- **TypeScript Interface**: Updated Budget interface category type to include all budgetable categories
- **Error Messages**: Updated invalid category error message to list all valid budgetable categories
- **Property-Based Test Configuration**: Updated budgetArbitrary to generate all budgetable categories
- **Migration Script**: Updated SQL to include all budgetable categories in CHECK constraint

**tasks.md:**
- **Task 3.1**: Updated category validation description from "Food, Gas, Other only" to "all non-tax-deductible categories: 12 total"
- **Task 14.1**: Updated category list description from "Food, Gas, Other" to "all 12 non-tax-deductible categories"

**Impact**: Budget tracking now correctly supports all 12 budgetable categories (all except Tax - Medical and Tax - Donation).

### 3. Recurring Expenses Spec (`.kiro/specs/recurring-expenses/`)

**Updated Files:**
- `requirements.md`
- `design.md`

**requirements.md Updates:**
- **Introduction Note**: Added clarification that recurring expenses support all fourteen expense categories

**design.md Updates:**
- **RecurringExpense Interface**: Updated type union to include all 14 categories
- **Database Schema**: Updated CHECK constraint to include all 14 categories

**Impact**: Recurring expenses spec now accurately reflects support for all 14 categories.

### 4. Expense Trend Indicators Spec (`.kiro/specs/expense-trend-indicators/`)

**Updated Files:**
- `requirements.md`
- `design.md`

**requirements.md Updates:**
- **Requirement 2.1**: Changed from listing specific 5 categories to "all 14 expense categories"

**design.md Updates:**
- **Summary Data Interface**: Updated typeTotals from hardcoded categories to `{ [category: string]: number }` to support all 14 categories

**Impact**: Trend indicators now work with all 14 expense categories instead of just the original 5.

## Category Lists for Reference

### All 14 Categories:
1. Housing
2. Utilities
3. Groceries
4. Dining Out (formerly "Food")
5. Insurance
6. Gas
7. Vehicle Maintenance
8. Entertainment
9. Subscriptions
10. Recreation Activities
11. Pet Care
12. Tax - Medical
13. Tax - Donation
14. Other

### 12 Budgetable Categories (excludes tax-deductible):
1. Housing
2. Utilities
3. Groceries
4. Dining Out
5. Insurance
6. Gas
7. Vehicle Maintenance
8. Entertainment
9. Subscriptions
10. Recreation Activities
11. Pet Care
12. Other

### 2 Tax-Deductible Categories (not budgetable):
1. Tax - Medical
2. Tax - Donation

## Specs That Did NOT Require Updates

The following specs were reviewed and determined to be category-agnostic or already compatible:

- **Tax Deductible View**: Already correctly identifies tax-deductible categories by "Tax - " prefix
- **Fixed Expenses**: Not related to expense categories
- **Configurable Monthly Gross**: Not related to expense categories
- **Enhanced Annual Summary**: Already handles categories dynamically
- **Place Name Standardization**: Not related to expense categories
- **Monthly Loans Balance**: Not related to expense categories
- **Expense Trend Indicators**: Already handles categories dynamically

## Implementation Status

All spec updates are complete and aligned with the implemented code in:
- `backend/utils/categories.js` (source of truth for categories)
- Database schema (updated via `backend/scripts/expandCategories.js`)
- Frontend components (updated to use dynamic category lists)

## Summary of All Updates

### Requirements Documents Updated:
1. `.kiro/specs/expense-tracker/requirements.md` - 4 sections updated
2. `.kiro/specs/budget-tracking-alerts/requirements.md` - 3 sections updated
3. `.kiro/specs/recurring-expenses/requirements.md` - 1 section updated
4. `.kiro/specs/expense-trend-indicators/requirements.md` - 1 section updated

### Design Documents Updated:
1. `.kiro/specs/expense-tracker/design.md` - 8 sections updated
2. `.kiro/specs/budget-tracking-alerts/design.md` - 5 sections updated
3. `.kiro/specs/recurring-expenses/design.md` - 2 sections updated
4. `.kiro/specs/expense-trend-indicators/design.md` - 1 section updated

### Tasks Documents Updated:
1. `.kiro/specs/budget-tracking-alerts/tasks.md` - 2 sections updated

### Total Changes:
- **9 specification files updated**
- **27 individual sections modified**
- All references to old 5-category system replaced with 14-category system
- All database schemas updated to reflect expanded categories
- All TypeScript interfaces updated with new category types
- All validation rules updated to reference 14 categories

## Date

November 23, 2025
