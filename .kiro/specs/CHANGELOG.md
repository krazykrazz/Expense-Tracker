# Expense Tracker Changelog

## Version 3.1.1 (Current)

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
