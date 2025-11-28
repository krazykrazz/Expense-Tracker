# Expense Tracker - Feature Roadmap

**Last Updated**: November 27, 2025  
**Current Version**: 4.2.0

This document tracks potential features and enhancements for the Expense Tracker application. Features are categorized by priority and implementation status.

---

## Legend

- 🟢 **Completed** - Feature is implemented and deployed
- 🟡 **In Progress** - Feature is currently being developed
- 🔵 **Planned** - Feature is approved and scheduled
- ⚪ **Proposed** - Feature is suggested but not yet approved
- 🔴 **Blocked** - Feature is blocked by dependencies or issues

---

## 📊 Analytics & Insights

### 🟡 1. Budget Tracking & Alerts
**Status**: In Progress  
**Priority**: High  
**Effort**: Medium  
**Spec**: `.kiro/specs/budget-tracking-alerts/`  
**Description**: Set monthly budgets per category with visual progress bars and alerts when approaching or exceeding limits.

**Key Features**:
- Set budget limits per category (Food, Gas, Other, etc.)
- Visual progress bars showing budget usage percentage
- Alert notifications when reaching 80%, 90%, and 100% of budget
- Year-over-year budget comparison
- Budget vs actual spending reports

**Benefits**:
- Proactive spending management
- Prevents overspending
- Clear financial boundaries

**Dependencies**: None

---

### ⚪ 2. Spending Patterns & Predictions
**Status**: Proposed  
**Priority**: High  
**Effort**: High  
**Description**: Analyze spending patterns and predict future expenses based on historical data.

**Key Features**:
- Identify recurring spending patterns
- Predict end-of-month totals based on current trajectory
- Seasonal spending analysis (compare months/quarters)
- Day-of-week spending patterns
- Anomaly detection (unusual spending alerts)

**Benefits**:
- Better financial planning
- Early warning of overspending
- Data-driven insights

**Dependencies**: Requires sufficient historical data (3+ months)

---

### ⚪ 3. Financial Goals Dashboard
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Medium  
**Description**: Set and track progress toward financial goals with visual indicators.

**Key Features**:
- Create multiple savings goals with target amounts and dates
- Visual progress tracking (progress bars, charts)
- Impact analysis: how spending affects goal timeline
- "What-if" scenarios calculator
- Goal achievement notifications

**Benefits**:
- Motivates saving behavior
- Clear visualization of progress
- Helps prioritize spending decisions

**Dependencies**: None

---

## 🔍 Enhanced Search & Filtering

### ⚪ 4. Advanced Expense Search
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Low  
**Description**: Multi-criteria search with saved filters for quick access.

**Key Features**:
- Search by date range, category, payment method, amount range
- Combine multiple filters
- Save frequently used filter combinations
- Quick filters (Last 30 days, This quarter, Over $100, etc.)
- Search within notes/descriptions

**Benefits**:
- Faster expense lookup
- Better expense analysis
- Improved user experience

**Dependencies**: None

---

### ⚪ 5. Tags System
**Status**: Proposed  
**Priority**: Low  
**Effort**: Medium  
**Description**: Add custom tags to expenses for flexible categorization.

**Key Features**:
- Add multiple tags per expense (e.g., "vacation", "work-related", "gift")
- Filter and report by tags
- Tag-based budgets
- Auto-tagging based on patterns (place, amount, category)
- Tag management interface

**Benefits**:
- More flexible categorization than fixed categories
- Cross-category analysis
- Better expense organization

**Dependencies**: Database schema changes required

---

## 📱 User Experience

### ⚪ 6. Expense Templates
**Status**: Proposed  
**Priority**: High  
**Effort**: Low  
**Description**: Save frequently used expense combinations for one-click entry.

**Key Features**:
- Create templates with pre-filled fields
- One-click expense creation from template
- Template categories (Weekly Groceries, Gas Fill-up, etc.)
- Edit and delete templates
- Template usage statistics

**Benefits**:
- Significant time savings for recurring expenses
- Reduces data entry errors
- Improves user efficiency

**Dependencies**: None

---

### ⚪ 7. Receipt Attachments
**Status**: Proposed  
**Priority**: Medium  
**Effort**: High  
**Description**: Upload and link receipt images to expenses.

**Key Features**:
- Upload receipt photos/PDFs
- Link multiple receipts to one expense
- Receipt gallery view
- OCR to auto-fill expense details (optional enhancement)
- Receipt search and filtering

**Benefits**:
- Better record keeping
- Easier expense verification
- Tax documentation

**Dependencies**: File storage solution, image upload handling

---

### ⚪ 8. Multi-Currency Support
**Status**: Proposed  
**Priority**: Low  
**Effort**: High  
**Description**: Track expenses in different currencies with automatic conversion.

**Key Features**:
- Select currency per expense
- Automatic conversion to home currency
- Exchange rate history tracking
- Travel expense tracking
- Multi-currency reports

**Benefits**:
- Essential for international users
- Accurate travel expense tracking
- Proper financial reporting

**Dependencies**: Exchange rate API integration

---

## 📈 Reporting & Export

### ⚪ 9. Custom Reports
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Medium  
**Description**: Create custom reports with flexible date ranges and comparisons.

**Key Features**:
- Custom date range selection
- Compare multiple time periods side-by-side
- Export to PDF with charts
- Email scheduled reports
- Save report templates

**Benefits**:
- Flexible analysis
- Professional documentation
- Automated reporting

**Dependencies**: PDF generation library

---

### ⚪ 10. Category Insights
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Low  
**Description**: Deep dive into category-specific spending with trends and analytics.

**Key Features**:
- Category detail page with all expenses
- Category-specific trends and charts
- Identify unusual spending in categories
- Category comparison across time periods
- Top merchants per category

**Benefits**:
- Better understanding of spending habits
- Identify optimization opportunities
- Category-level insights

**Dependencies**: None

---

## 🔔 Smart Features

### ⚪ 11. Expense Reminders
**Status**: Proposed  
**Priority**: Low  
**Effort**: Low  
**Description**: Notifications to remind users to log expenses and track bills.

**Key Features**:
- Daily reminder to log expenses
- Upcoming recurring expense notifications
- Bill due date reminders
- Weekly spending summary
- Customizable notification preferences

**Benefits**:
- Ensures complete expense tracking
- Prevents missed bills
- Regular financial awareness

**Dependencies**: Notification system (browser notifications or email)

---

### ⚪ 12. Duplicate Detection
**Status**: Proposed  
**Priority**: Low  
**Effort**: Medium  
**Description**: Automatically detect and warn about potential duplicate entries.

**Key Features**:
- Smart matching based on amount, date, place
- Duplicate warning before saving
- Bulk duplicate review and management
- Configurable matching sensitivity
- Merge duplicate entries

**Benefits**:
- Prevents data entry errors
- Maintains data accuracy
- Saves time on cleanup

**Dependencies**: None

---

## 💰 Financial Health

### ⚪ 13. Savings Rate Tracker
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Low  
**Description**: Calculate and track savings rate over time.

**Key Features**:
- Automatic savings rate calculation: (income - expenses) / income
- Savings rate trends over time
- Compare to recommended rates (20%, 30%, etc.)
- Savings milestones and achievements
- Savings rate by month/quarter/year

**Benefits**:
- Clear financial health indicator
- Motivates saving behavior
- Easy to understand metric

**Dependencies**: Requires income tracking (already implemented)

---

### ⚪ 14. Debt Payoff Planner
**Status**: Proposed  
**Priority**: Medium  
**Effort**: High  
**Description**: Enhanced loan tracking with payoff strategies and calculators.

**Key Features**:
- Snowball vs avalanche method comparison
- Extra payment calculator
- Payoff timeline visualization
- Interest savings calculator
- Multiple payoff scenarios

**Benefits**:
- Optimizes debt repayment
- Shows impact of extra payments
- Motivates debt reduction

**Dependencies**: Extends existing loan tracking feature

---

## 🎯 Quick Wins (Easy to Implement)

### ⚪ 15. Expense Notes Enhancement
**Status**: Proposed  
**Priority**: Low  
**Effort**: Very Low  
**Description**: Make notes more prominent and searchable.

**Key Features**:
- Display notes in expense list (truncated)
- Search within notes
- Rich text formatting (optional)
- Notes field expansion
- Notes-only view

**Benefits**:
- Better expense documentation
- Easier to find specific expenses
- Improved context

**Dependencies**: None

---

### ⚪ 16. Dark Mode
**Status**: Proposed  
**Priority**: Low  
**Effort**: Low  
**Description**: Toggle between light and dark themes.

**Key Features**:
- Light/dark theme toggle
- Automatic based on system preference
- Separate color schemes optimized for each mode
- Persistent theme preference
- Smooth theme transitions

**Benefits**:
- Reduces eye strain
- Modern user experience
- Accessibility improvement

**Dependencies**: CSS theme system

---

### ⚪ 17. Keyboard Shortcuts
**Status**: Proposed  
**Priority**: Low  
**Effort**: Low  
**Description**: Add keyboard shortcuts for common actions.

**Key Features**:
- Quick add expense (Ctrl+N)
- Navigate months (Arrow keys)
- Quick search (Ctrl+F)
- Close modals (Esc)
- Keyboard shortcut help (?)

**Benefits**:
- Faster navigation
- Power user features
- Accessibility improvement

**Dependencies**: None

---

### ⚪ 18. Export Enhancements
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Low  
**Description**: Enhanced export capabilities with more formats and options.

**Key Features**:
- Export filtered results to CSV
- Export annual summary as PDF
- Export specific date ranges
- Include charts in exports
- Excel-compatible formatting

**Benefits**:
- Better data portability
- Professional reporting
- Integration with other tools

**Dependencies**: PDF generation library (for PDF exports)

---

## 🟢 Completed Features

### 🟢 Smart Expense Entry (v4.3.0)
**Completed**: November 27, 2025  
**Spec**: `.kiro/specs/smart-expense-entry/`  
**Description**: Intelligent expense entry with category suggestions and payment method memory.

**Features Delivered**:
- Place-first form field order with initial focus on Place field
- Intelligent category suggestions based on place history
- Visual indicator ("✨ suggested") for auto-suggested categories
- Tie-breaker logic using most recent category when frequencies are equal
- Payment method persistence (remembers last used method)
- Auto-focus to Amount field after place entry
- Graceful degradation when suggestion API is unavailable

---

### 🟢 Enhanced Annual Summary (v3.6.0)
**Completed**: November 19, 2025  
**Description**: Comprehensive annual financial overview with income tracking and expense breakdown.

**Features Delivered**:
- Total Income card showing income from all sources
- Net Income card with color-coded surplus/deficit
- Fixed vs Variable expense breakdown
- Horizontal stacked bar chart for monthly visualization
- Property-based testing for financial calculations

---

### 🟢 Expense Trend Indicators (v3.5.0)
**Completed**: November 19, 2025  
**Description**: Visual month-over-month trend indicators on summary panel.

**Features Delivered**:
- Red upward arrows (▲) for spending increases
- Green downward arrows (▼) for spending decreases
- Percentage change tooltips
- Trend indicators for weekly totals, expense types, and payment methods

---

### 🟢 Monthly Loans Balance Tracking (v3.3.0)
**Completed**: November 14, 2025  
**Description**: Track loan balances and interest rates over time.

**Features Delivered**:
- Monthly balance and interest rate tracking
- Dual-axis charts showing balance and rate trends
- Total debt overview with aggregate tracking
- Line of credit vs traditional loan differentiation

---

### 🟢 Configurable Fixed Expenses (v3.2.0)
**Completed**: November 10, 2025  
**Description**: Manage fixed monthly expenses separately from variable expenses.

**Features Delivered**:
- Fixed expenses management interface
- Automatic carry-forward to next month
- Integration with monthly and annual summaries

---

### 🟢 Multiple Income Sources (v3.2.0)
**Completed**: November 10, 2025  
**Description**: Track income from multiple sources per month.

**Features Delivered**:
- Income sources management
- Monthly income tracking
- Income vs expense comparison

---

### 🟢 Recurring Expenses (v3.1.0) - REMOVED IN v4.0.0
**Completed**: November 2025  
**Removed**: November 2025 (v4.0.0)  
**Description**: Create templates for recurring expenses with automatic generation.

**Features Delivered**:
- Recurring expense templates
- Automatic expense generation
- Template management interface

**Removal Reason**: Feature was replaced by the Fixed Expenses feature which better serves the use case of tracking predictable monthly costs. Recurring expenses added unnecessary complexity for generating actual expense entries. See `RECURRING_EXPENSES_REMOVAL.md` for migration details.

---

### 🟢 Tax Deductible Tracking (v3.0.0)
**Completed**: November 2025  
**Description**: Track and report tax-deductible expenses.

**Features Delivered**:
- Medical and donation expense tracking
- Annual tax deductible summary
- Collapsible expense lists
- Monthly breakdown charts

---

## Priority Matrix

### High Priority (Implement Next)
1. Budget Tracking & Alerts
2. Spending Patterns & Predictions
3. Expense Templates

### Medium Priority
1. Financial Goals Dashboard
2. Advanced Expense Search
3. Custom Reports
4. Category Insights
5. Savings Rate Tracker
6. Debt Payoff Planner
7. Export Enhancements

### Low Priority
1. Tags System
2. Receipt Attachments
3. Multi-Currency Support
4. Expense Reminders
5. Duplicate Detection
6. Expense Notes Enhancement
7. Dark Mode
8. Keyboard Shortcuts

---

## How to Use This Document

1. **Proposing a Feature**: Add it to the appropriate category with ⚪ status
2. **Starting Development**: Change status to 🟡 and create a spec in `.kiro/specs/`
3. **Completing a Feature**: Move to "Completed Features" section with 🟢 status and version number
4. **Blocking a Feature**: Change status to 🔴 and document the blocker

---

## Notes

- This roadmap is a living document and will be updated as features are implemented
- Priority and effort estimates may change based on user feedback and technical discoveries
- Features may be combined or split during implementation
- Community feedback is welcome - suggest new features or vote on priorities

---

**Version History**:
- v1.0 (2025-11-19): Initial roadmap created with 18 proposed features
