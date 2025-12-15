# Expense Tracker Changelog

## Version 4.6.0 - December 2025

### Features
- **Medical Expense People Tracking**: Associate medical expenses with family members for better tax reporting
  - People management modal for adding/editing/deleting family members
  - Single-person and multi-person expense allocation
  - Person-grouped tax reporting with per-person subtotals by provider
  - "Unassigned" section for medical expenses without people associations
  - Backward compatibility with existing medical expenses
  - Visual indicators showing assigned people on expense list

### Database Changes
- Added `people` table (id, name, date_of_birth, timestamps)
- Added `expense_people` junction table (expense_id, person_id, amount)
- Foreign key constraints with CASCADE DELETE
- UNIQUE constraint on (expense_id, person_id)

### API Changes
- Added `GET /api/people` - Get all people
- Added `POST /api/people` - Create person
- Added `PUT /api/people/:id` - Update person
- Added `DELETE /api/people/:id` - Delete person
- Enhanced `POST /api/expenses` to accept people allocations
- Enhanced `PUT /api/expenses/:id` to handle people updates
- Enhanced `GET /api/expenses/tax-deductible` to support person grouping

### Spec Updates
- Added `.kiro/specs/medical-expense-people-tracking/` spec
- Updated `.kiro/specs/tax-deductible-view/` to reference people tracking extension
- Updated `.kiro/specs/expense-tracker/` to reference related specs
- Updated `.kiro/specs/SPEC_AUDIT_REPORT.md` with new spec

---

## Spec Audit - November 27, 2025

### Documentation Updates
- **Spec Audit Completed**: All 16 specs audited against actual code implementation
- Updated category counts from 14 to 17 across all specs (added Clothing, Gifts, Personal Care)
- Updated payment method counts from 6 to 7 across all specs (added Cheque)
- Updated budgetable category counts from 12 to 15
- Fixed task completion statuses in multiple specs
- Created `SPEC_AUDIT_REPORT.md` documenting all changes

### Files Updated
- `.kiro/specs/expense-tracker/requirements.md` - Categories and payment methods
- `.kiro/specs/expense-tracker/design.md` - Data models and validation
- `.kiro/specs/expense-tracker/tasks.md` - Task statuses
- `.kiro/specs/budget-tracking-alerts/requirements.md` - Budgetable categories
- `.kiro/specs/budget-tracking-alerts/tasks.md` - Category counts
- `.kiro/specs/smart-expense-entry/requirements.md` - Default payment method
- `.kiro/specs/monthly-loans-balance/tasks.md` - Task statuses
- `.kiro/specs/configurable-monthly-gross/tasks.md` - Task statuses
- `.kiro/specs/expanded-expense-categories/requirements.md` - Category list
- `.kiro/specs/expanded-expense-categories/tasks.md` - Category counts
- `.kiro/specs/expense-trend-indicators/requirements.md` - Category counts
- `.kiro/specs/expense-trend-indicators/design.md` - Category list

---

## Version 4.3.0 (Current)

### Features
- **Smart Expense Entry**: Intelligent expense entry with category suggestions and payment method memory
  - Place-first form field order with initial focus on Place field
  - Intelligent category suggestions based on place history
  - Visual indicator ("✨ suggested") for auto-suggested categories
  - Tie-breaker logic using most recent category when frequencies are equal
  - Payment method persistence (remembers last used method in localStorage)
  - Auto-focus to Amount field after place entry
  - Graceful degradation when suggestion API is unavailable

### API Changes
- Added `GET /api/expenses/suggest-category?place={placeName}` endpoint
  - Returns suggestion with category, confidence score, and count
  - Returns breakdown of all categories used at the place
  - Returns null suggestion for places with no history

### Technical Changes
- Added `CategorySuggestionService` for suggestion logic
- Added `getCategoryFrequencyByPlace()` to ExpenseRepository
- Added `categorySuggestionApi.js` frontend service
- Updated ExpenseForm with suggestion integration and payment method persistence
- Added property-based tests for suggestion algorithm

---

## Version 3.1.1

### Bug Fixes
- **Fixed expense editing navigation issue**: When editing an expense from a previous month, the view no longer jumps to the current month after saving. The app now maintains the selected month view by updating state instead of reloading the page.

### UI/UX Improvements
- **Tax Deductible Collapsible Sections**: Medical and donation expense lists in the Annual Summary now start collapsed, showing only the count and total. Click to expand and view full details.
- **Tax Deductible Color Differentiation**: Monthly breakdown bar chart now uses different colors:
  - Medical expenses: Blue (#3b82f6)
  - Donations: Orange (#f59e0b)
  - Added color legend for clarity

### Technical Changes
- Added `onExpenseUpdated` callback to ExpenseList component
- Replaced `window.location.reload()` with state management in App.jsx
- Added collapsible state management (`medicalExpanded`, `donationsExpanded`) to AnnualSummary component
- Enhanced CSS with collapsible header styles and color-coded bar charts

---

## Version 3.1.0

### Features
- **Cheque Payment Method**: Added "Cheque" as a new payment method option across the application
  - Updated frontend form dropdowns
  - Updated backend validation
  - Updated database schema constraints
  - Updated summary panel display

### Database Changes
- Modified `expenses` table CHECK constraint to include 'Cheque' in valid payment methods
- Migration script: `backend/scripts/addChequePaymentMethod.js`

---

## Version 3.0.0

### Major Features
- **Configurable Monthly Gross Income**: Multiple income sources per month with carry-forward functionality
- **Fixed Monthly Expenses**: Track recurring fixed costs separate from variable expenses
- **Recurring Expense Templates**: Automated generation of recurring expenses
- **Tax Deductible View**: Dedicated section in Annual Summary for medical and donation expenses
- **Backup & Restore**: Automated and manual database backup functionality

### Architecture
- Implemented full layered architecture (Controller → Service → Repository)
- Added income sources management
- Added fixed expenses management
- Enhanced annual summary with tax deductible reporting

---

## Version 2.0.0

### Features
- Annual Summary view with yearly analytics
- Monthly breakdown charts
- Category and payment method analysis
- CSV import/export functionality

---

## Version 1.0.0

### Initial Release
- Basic expense tracking (add, edit, delete)
- Monthly view with filtering
- Weekly totals calculation
- Payment method tracking
- Expense type categorization
- Search functionality
- SQLite database backend
- React frontend with Vite
