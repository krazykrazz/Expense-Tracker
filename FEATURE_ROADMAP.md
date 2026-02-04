# Expense Tracker - Feature Roadmap

**Last Updated**: February 4, 2026  
**Current Version**: 5.5.0

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

### 🟢 1. Spending Patterns & Predictions (Analytics Hub)
**Status**: Completed (v4.17.0)  
**Priority**: High  
**Effort**: High  
**Spec**: `.kiro/specs/spending-patterns-predictions/`  
**Description**: Comprehensive analytics hub analyzing spending patterns and predicting future expenses based on historical data.

**Features Delivered**:
- **Analytics Hub**: Unified modal with 5 tabs (Patterns, Predictions, Seasonal, Anomalies, Merchants)
- **Recurring Pattern Detection**: Identifies regular spending patterns with merchant, amount, and frequency
- **Month-End Predictions**: Predicts end-of-month totals with confidence intervals and budget integration
- **Seasonal Analysis**: Compares spending across months/quarters with year-over-year trends
- **Day-of-Week Patterns**: Shows spending distribution by day of week
- **Anomaly Detection**: Flags unusual spending with dismissible alerts
- **Data Sufficiency Checks**: Graceful handling when insufficient historical data
- **Merchant Analytics Integration**: Consolidated merchant analytics into the hub (removed standalone button)
- **Budget Alert Integration**: Predictions view shows current budget status

**Benefits**:
- Better financial planning with predictive insights
- Early warning of overspending through anomaly detection
- Data-driven insights for budgeting decisions
- Unified analytics experience

**Dependencies**: Requires 3+ months of historical data for full functionality

---

### ⚪ 2. Adaptive Anomaly Detection (Learning from Dismissals)
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Medium  
**Description**: Use dismissed anomaly history to improve detection accuracy over time.

**Key Features**:
- Analyze patterns in dismissed anomalies (merchant, category, amount ranges)
- Adjust detection thresholds based on user feedback
- Reduce false positives for merchants/categories frequently dismissed
- Learn user's spending patterns that appear anomalous but are normal for them
- Optional "reset learning" to start fresh

**Current State**:
- Dismissed anomalies are persisted to database (v4.17.6)
- Currently only used to filter anomalies from display
- No threshold adjustment based on dismissal patterns

**Benefits**:
- Fewer false positive alerts over time
- Personalized anomaly detection
- Better user experience with relevant alerts only

**Dependencies**: Extends existing anomaly detection service (v4.17.0)

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

### ⚪ 5. Advanced Expense Search
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

### ⚪ 6. Tags System
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

### ⚪ 7. Expense Templates
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

### 🟢 8. Tax-Deductible Invoice Attachments
**Status**: Completed (v4.12.0 - v4.13.2)  
**Priority**: Medium  
**Effort**: High  
**Description**: Upload and link PDF invoices/receipts to tax-deductible expenses (medical and donations).

**Features Delivered**:
- Upload PDF invoices to medical and donation expenses
- Multiple invoices per expense with person linking (medical)
- Built-in PDF viewer with zoom, download, and print
- Invoice indicators in expense lists and tax reports
- Secure file storage with automatic cleanup
- Backup integration for invoice files
- OCR not implemented (optional future enhancement)

**Note**: This feature covers the core use case of receipt attachments for tax-deductible expenses. General receipt attachments for all expense types could be a future enhancement.

---

### ⚪ 9. Multi-Currency Support
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

### ⚪ 10. Custom Reports
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

### ⚪ 11. Category Insights
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

### ⚪ 12. Expense Reminders
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

### ⚪ 13. Duplicate Detection
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

### ⚪ 14. Savings Rate Tracker
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

### ⚪ 15. Debt Payoff Planner
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

### 🟢 16. Mortgage Tracking
**Status**: Completed (v4.18.0)  
**Completed**: January 2026  
**Priority**: Medium  
**Effort**: Medium  
**Spec**: `.kiro/specs/mortgage-tracking/` and `.kiro/specs/mortgage-insights/`  
**Description**: Dedicated mortgage loan type with enhanced tracking for amortization, equity, variable rate support, and comprehensive insights panel.

**Features Delivered**:
- **Mortgage Loan Type**: New "mortgage" type alongside existing "loan" and "line_of_credit"
- **Mortgage-Specific Fields**: Amortization period, term length, renewal date, rate type (fixed/variable), payment frequency, estimated property value
- **Amortization Schedule**: Full projection with principal vs interest breakdown per payment
- **Equity Tracking**: Property value minus remaining balance with historical chart
- **Mortgage Insights Panel**: Collapsible sections for current status, payoff projections, what-if scenarios, and payment history
- **Variable Rate Support**: Quick rate update capability with rate history tracking
- **Payment Tracking**: Record and manage payment amount changes over time
- **What-If Calculator**: Extra payment impact analysis with interest savings calculation
- **Interest Cost Breakdown**: Daily, weekly, monthly, and annual interest calculations
- **Payoff Projections**: Estimated payoff date with comparison to minimum payment scenario

**Benefits**:
- Better visibility into mortgage progress
- Track equity growth over time
- Understand impact of rate changes on variable mortgages
- More accurate net worth calculations with property equity
- Plan extra payments with clear savings projections

**Dependencies**: Extends existing loans infrastructure, database migration for mortgage-specific fields

---

## 🎯 Quick Wins (Easy to Implement)

### ⚪ 17. Expense Notes Enhancement
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

### ⚪ 18. Dark Mode
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

### ⚪ 19. Keyboard Shortcuts
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

### ⚪ 21. ExpenseForm Simplification
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Medium  
**Description**: Reduce complexity of the 1600+ line ExpenseForm with collapsible sections and better feature discoverability.

**Key Features**:
- Collapsible "Advanced Options" section for less common fields (future months, posted date)
- Contextual help tooltips explaining when to use each field
- "Quick Add" mode for simple expenses vs "Full Form" for complex ones
- Progressive disclosure of features based on expense type

**Benefits**:
- Reduced cognitive load for simple expense entry
- Better feature discoverability
- Faster data entry for common cases

**Dependencies**: None

---

### ⚪ 22. Summary Panel Preferences
**Status**: Proposed  
**Priority**: Low  
**Effort**: Low  
**Description**: Remember user's collapse preferences and add expand/collapse all functionality.

**Key Features**:
- Remember user's collapse preferences in localStorage
- Add "Expand All / Collapse All" toggle
- Show top 3 expense types by default without requiring expansion
- Persist preferences across sessions

**Benefits**:
- Fewer clicks to access frequently viewed data
- Personalized dashboard experience
- Improved efficiency for power users

**Dependencies**: None

---

### ⚪ 23. Duplicate Expense Feature
**Status**: Proposed  
**Priority**: Medium  
**Effort**: Low  
**Description**: Quick action to duplicate an existing expense for recurring similar purchases.

**Key Features**:
- "Duplicate" action button in expense list
- Pre-fills form with all fields from original expense
- Updates date to current date by default
- Allows editing before saving

**Benefits**:
- Significant time savings for recurring purchases
- Reduces data entry errors
- Improves user efficiency

**Dependencies**: None

---

### ⚪ 24. Quick Edit for Amount
**Status**: Proposed  
**Priority**: Low  
**Effort**: Low  
**Description**: Allow amount-only changes directly in the expense list without opening full edit modal.

**Key Features**:
- Click on amount to edit inline
- Quick save with Enter key
- Cancel with Escape key
- Visual feedback during edit mode

**Benefits**:
- Faster corrections for amount typos
- Reduced modal fatigue
- Improved efficiency for common edits

**Dependencies**: None

---

### ⚪ 25. Modal Consolidation
**Status**: Proposed  
**Priority**: Low  
**Effort**: High  
**Description**: Reduce modal fatigue by grouping related features and considering sidebar navigation.

**Key Features**:
- Group related modals (e.g., "Financial Overview" combining Loans + Investments)
- Consider sidebar navigation for frequently accessed features
- Reduce number of separate modal entry points
- Unified settings/management interface

**Benefits**:
- Reduced cognitive load
- Faster access to related features
- More cohesive user experience

**Dependencies**: Significant UI restructuring

---

### ⚪ 20. Export Enhancements
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

### 🟢 Fixed Expense Loan Linkage (v5.5.0)
**Completed**: February 2026  
**Spec**: `.kiro/specs/fixed-expense-loan-linkage/` (archived)  
**Description**: Enhanced fixed expenses with loan payment tracking, due date reminders, and automatic payment logging for linked loan payments.

**Features Delivered**:
- **Loan Linkage**: Link fixed expenses to specific loans for payment tracking
- **Payment Due Dates**: Set payment due day (1-31) for fixed expenses
- **Loan Payment Reminders**: Visual reminder banners when loan payments are due soon or overdue
- **Auto-Log Prompts**: Automatic suggestions to log loan payments based on linked fixed expenses
- **Active Loan Filtering**: Dropdown shows only active (not paid off) loans for linking
- **Reminder Suppression**: Reminders automatically suppressed when payment already logged for the month
- **Backward Compatibility**: Existing fixed expenses work without due dates or loan links
- **Carry-Forward Support**: Due dates and loan links preserved when carrying forward to next month
- **Database Migration**: Automatic migration adds payment_due_day and linked_loan_id columns
- **Comprehensive Testing**: 13 property-based tests with 100+ iterations each, full integration coverage

**Benefits**:
- Never miss loan payment due dates with proactive reminders
- Streamlined payment logging with one-click auto-log from reminders
- Better financial planning with loan payment visibility in fixed expenses
- Reduced manual tracking effort for recurring loan payments

---

### 🟢 Loan Payment Tracking (v5.5.0)
**Completed**: February 2026  
**Spec**: `.kiro/specs/loan-payment-tracking/` (archived)  
**Description**: Converted loan and mortgage tracking from balance-based to payment-based system with payment history, balance calculations, and migration utilities.

**Features Delivered**:
- **Payment-Based Tracking**: Log individual payments for loans and mortgages instead of manual balance entries
- **Payment History**: View all payments in reverse chronological order with running balance calculations
- **Calculated Balance**: Automatic balance calculation from initial balance minus total payments
- **Payment Suggestions**: Smart payment amount suggestions (mortgage monthly payment or average of previous payments)
- **Payment Visualization**: Balance reduction chart showing payment impact over time
- **Migration Utility**: One-click migration from old balance entries to payment-based system
- **Line of Credit Support**: Lines of credit continue using balance-based tracking (unchanged)
- **Loan Type Differentiation**: UI automatically shows appropriate tracking method based on loan type
- **Payment Validation**: Prevents future-dated payments and negative amounts
- **Balance History**: Running balance display alongside each payment entry
- **Database Schema**: New loan_payments table with proper indexing and foreign keys
- **Comprehensive Testing**: 14 property-based tests, full integration coverage, API endpoint tests

**Benefits**:
- More intuitive payment logging workflow (record what you actually pay)
- Automatic balance calculations eliminate manual math
- Better payment history visibility for financial planning
- Clearer distinction between loans/mortgages (payment-based) and lines of credit (balance-based)
- Seamless migration from old system preserves all historical data

---

### 🟢 Expense List UX Improvements (v5.4.0)
**Completed**: February 2026  
**Spec**: `.kiro/specs/expense-list-ux-improvements/`  
**Description**: Frontend-only enhancements to the ExpenseList filter experience with smarter filtering, collapsible advanced filters, visual filter indicators, and improved global view navigation.

**Features Delivered**:
- **Smart Method Filter**: Combined Method and Method Type dropdowns into single grouped dropdown with type headers
- **Advanced Filters Section**: Collapsible section for Invoice and Insurance filters with active count badge
- **Filter Count Badge**: Visual indicator showing total number of active filters
- **Filter Chips**: Pill-shaped chips showing active filters with one-click removal (×)
- **Enhanced Global View Banner**: Shows which filters triggered global view with "Return to Monthly View" button
- **Enhanced Clear Filters Button**: Improved styling and visibility in global view mode
- **Property-Based Testing**: Comprehensive PBT coverage for all filter behaviors

**Benefits**:
- Cleaner filter UI with fewer controls
- Better visibility of active filter state
- Easier filter management with chip removal
- Improved navigation between global and monthly views

---

### 🟢 Credit Card Statement Balance (v5.3.1)
**Completed**: February 2026  
**Spec**: `.kiro/specs/credit-card-statement-balance/`  
**Description**: Automatic statement balance calculation based on billing cycles with smart payment alert suppression when statements are paid in full.

**Features Delivered**:
- **Statement Balance Calculation**: Automatic calculation based on billing cycle dates and expenses
- **Billing Cycle Day Field**: New required field for credit cards specifying when statement closes (1-31)
- **Smart Payment Alerts**: Reminders show required payment amount (statement balance)
- **Alert Suppression**: Payment reminders suppressed when statement balance is zero or negative
- **Statement Period Display**: Shows billing cycle dates in credit card detail view
- **"Statement Paid" Indicator**: Visual indicator when statement is paid in full
- **Backward Compatibility**: Cards without billing_cycle_day configured use current_balance for alerts
- **Database Migration**: Automatic migration adds billing_cycle_day column
- **Comprehensive Testing**: 47 backend tests, 46 frontend tests with property-based testing

---

### 🟢 Configurable Payment Methods (v4.20.0)
**Completed**: January 30, 2026  
**Spec**: `.kiro/specs/configurable-payment-methods/`  
**Description**: Database-driven payment method management with full credit card tracking including balance management, payment history, and statement uploads.

**Features Delivered**:
- **Payment Method Types**: Cash, Cheque, Debit, Credit Card with type-specific fields
- **Payment Method Management**: Create, edit, activate/deactivate, delete payment methods
- **Credit Card Balance Tracking**: Automatic balance updates when expenses are added/deleted
- **Credit Utilization**: Color-coded utilization indicators (green/yellow/red)
- **Payment Recording**: Log credit card payments with automatic balance reduction
- **Payment History**: View all recorded payments with dates and notes
- **Statement Uploads**: Attach PDF statements with billing period dates
- **Due Date Reminders**: Alerts when payment due within 7 days
- **Credit Card Posted Date**: Optional posted date field for accurate balance calculations
- **Backward Compatibility**: Existing expenses preserved, inactive methods shown in filters

---

### 🟢 UI Modernization (v4.14.0)
**Completed**: January 18, 2026  
**Spec**: `.kiro/specs/ui-modernization/` (archived)  
**Description**: Comprehensive design system overhaul with modern styling, improved accessibility, and consistent visual language across all components.

**Features Delivered**:
- **CSS Variables Design System**: Centralized design tokens in `frontend/src/styles/variables.css` for colors, typography, spacing, shadows, and z-index
- **Consistent Color Palette**: Semantic colors for primary, positive, negative, warning states with light/dark variants
- **Typography System**: Clear heading hierarchy, body text sizes, and tabular numerals for monetary values
- **Spacing Scale**: Modern 4px-based spacing system with section and element gap tokens
- **Shadow System**: Multi-level elevation system (xs through 2xl) for depth
- **Responsive Breakpoints**: Optimized for mobile (480px), tablet (768px), and desktop (1024px+)
- **Accessibility Improvements**: `prefers-reduced-motion` support throughout, focus states, ARIA labels
- **Modern Card Layouts**: Subtle shadows and hover effects replacing heavy borders
- **Compact Expense Table**: Better data density with reduced row padding
- **Tax-Deductible Styling**: Bold text for medical and donation expenses for improved readability
- **Wider Filter Dropdowns**: Prevents text truncation in category/payment method filters
- **Z-Index Scale**: Standardized stacking context management (dropdown, sticky, fixed, modal, popover, tooltip)

---

### 🟢 Spending Patterns & Predictions / Analytics Hub (v4.17.0)
**Completed**: January 26, 2026  
**Spec**: `archive/specs/spending-patterns-predictions/`  
**Documentation**: `docs/features/ANALYTICS_HUB.md`  
**Description**: Comprehensive analytics hub providing spending pattern analysis, predictions, seasonal trends, anomaly detection, and merchant analytics in a unified interface.

**Features Delivered**:
- **Analytics Hub Modal**: Unified 5-tab interface (Patterns, Predictions, Seasonal, Anomalies, Merchants)
- **Recurring Pattern Detection**: Identifies regular spending patterns with merchant, amount, frequency, and confidence scores
- **Month-End Predictions**: Predicts end-of-month totals with confidence intervals, pace indicators, and budget integration
- **Seasonal Analysis**: Year-over-year spending comparison with monthly and quarterly trends
- **Day-of-Week Patterns**: Spending distribution analysis by day of week with peak day identification
- **Anomaly Detection**: Flags unusual spending (amount anomalies, new merchants, daily spikes) with dismissible alerts
- **Data Sufficiency Messaging**: Graceful handling when insufficient historical data with clear user guidance
- **Merchant Analytics Consolidation**: Integrated existing merchant analytics as a tab (removed standalone button)
- **Budget Alert Integration**: Predictions view displays current budget status for affected categories
- **Backend Services**: SpendingPatternsService, PredictionService, AnomalyDetectionService with comprehensive API
- **Property-Based Testing**: 91 backend PBT tests across all analytics services
- **Frontend Components**: SpendingPatternsView, PredictionsView, SeasonalAnalysisView, AnomalyAlertsView, DataSufficiencyMessage

---

### 🟢 Multi-Invoice Support & Donation Invoices (v4.13.0 - v4.13.2)
**Completed**: January 17, 2026  
**Spec**: `.kiro/specs/multi-invoice-support/` (archived)  
**Description**: Enhanced invoice management with multi-file upload, person linking per invoice, and extended support for donation expenses.

**Features Delivered**:
- **Multi-file Upload**: Select multiple invoice files at once when creating medical expenses
- **Person Selection Per Invoice**: Each uploaded invoice can be linked to a specific person during expense creation
- **Person Dropdown in Invoice List**: Change person links on existing invoices directly from the invoice list
- **Streamlined Workflow**: Create expense → assign people → add invoices with person selection → save all at once
- **Donation Invoice Support**: Tax - Donation expenses can now have PDF invoices attached (receipts, tax letters)
- **Invoice Indicators**: Shown for both medical and donation expenses in expense lists and tax reports
- **Documentation Updates**: Renamed medical-specific docs to tax-deductible to reflect broader support

---

### 🟢 Medical Expense Invoice Attachments (v4.12.0)
**Completed**: January 15, 2026  
**Spec**: `.kiro/specs/medical-expense-invoices/`  
**Description**: Comprehensive invoice management for medical expenses, enabling users to attach PDF invoices for better record keeping, tax preparation, and insurance claims.

**Features Delivered**:
- **PDF Upload**: Attach PDF invoices to medical expenses during creation or editing (max 10MB)
- **Invoice Viewer**: Built-in PDF viewer with zoom, download, and print capabilities
- **Invoice Management**: Replace or delete invoice attachments with confirmation
- **Visual Indicators**: Clear 📄 icons showing which expenses have attached invoices
- **Tax Integration**: Invoice status visible in tax deductible reports with filtering options
- **Secure Storage**: Files stored securely with proper access control and automatic cleanup
- **Mobile Support**: Touch-friendly upload interface and responsive PDF viewer
- **File Validation**: Magic number checking, size limits, and PDF structure validation
- **Automatic Cleanup**: Invoices automatically deleted when expenses are removed
- **Backup Integration**: Invoice files included in automated backup procedures
- **Comprehensive Testing**: Property-based testing (100+ iterations) and full integration test coverage
- **Complete Documentation**: User guides, API docs, troubleshooting, deployment, and maintenance guides
- **Utility Scripts**: Orphaned file detection and cleanup scripts for maintenance

---

### 🟢 Sticky Summary Scrolling (v4.11.0)
**Completed**: December 31, 2025  
**Spec**: `.kiro/specs/sticky-summary-scrolling/`  
**Description**: Enhanced UI with independent summary panel scrolling and floating action button for improved usability when working with long expense lists.

**Features Delivered**:
- **Independent Summary Panel Scrolling**: Summary panel now scrolls separately from expense list, allowing users to reference totals while reviewing expenses
- **Floating Add Button**: Appears when >10 expenses exist, providing quick access to add expenses without scrolling to header
- **Responsive Design**: Optimized for desktop, tablet, and mobile with appropriate sizing and positioning
- **Enhanced Accessibility**: ARIA labels, keyboard navigation support, and screen reader compatibility
- **Performance Optimizations**: Smooth scrolling behavior, scroll event isolation, and 60fps performance
- **Visual Enhancements**: Custom scrollbar styling, hover effects, and smooth animations
- **Backward Compatibility**: Preserves existing functionality while adding new features
- **Comprehensive Testing**: 13 core tests passing with property-based testing (100+ iterations each)
- **Cross-browser Support**: Compatible with Chrome, Firefox, Safari, and Edge
- **Mobile Optimization**: Maintains existing mobile layout while adding touch-optimized floating button

---

### 🟢 Budget Alert Notifications (v4.10.0)
**Completed**: December 23, 2025  
**Spec**: `.kiro/specs/budget-alert-notifications/`  
**Description**: Proactive notification banners that appear at the top of the interface when users approach or exceed their budget limits, enhancing the existing Budget Tracking & Alerts system.

**Features Delivered**:
- **Smart Alert Thresholds**: Warning alerts at 80-89% (yellow with ⚡ icon), Danger alerts at 90-99% (orange with ! icon), Critical alerts at ≥100% (red with ⚠ icon)
- **Dismissible Alerts**: Temporarily hide alerts during current session with × button - alerts reappear on page refresh if budget condition persists
- **Real-time Updates**: Alerts appear, update, or disappear immediately as expenses are added, edited, or deleted
- **Quick Budget Management**: Direct access to budget settings via "Manage Budgets" button and navigation to budget details via "View Details" link
- **Multiple Alert Handling**: When multiple categories trigger alerts, displays most severe alert with count of affected categories
- **Session-based Dismissal**: Dismissed alerts stay hidden during current session but reappear after refresh if conditions persist
- **Performance Optimized**: Reuses existing budget calculations, debounced updates (300ms), alert display limit (5 maximum)
- **Seamless Integration**: Leverages existing budget tracking infrastructure without replacing current functionality
- **Comprehensive Testing**: 10 correctness properties with property-based testing (100+ iterations each) plus full integration test coverage
- **Frontend Components**: New `BudgetAlertBanner` and `BudgetAlertManager` components with React.memo optimization
- **Error Handling**: Error boundaries, graceful degradation, and fallback UI for alert failures
- **No Backend Changes**: Feature entirely frontend-based, leveraging existing budget API endpoints

---

### 🟢 Merchant Analytics (v4.7.0 - v4.9.0, consolidated in v4.17.0)
**Completed**: December 16, 2025 (v4.7.0), December 20, 2025 (v4.9.0), January 2026 (consolidated into Analytics Hub)  
**Spec**: `.kiro/specs/merchant-analytics/`  
**Description**: Comprehensive merchant spending analytics providing insights into spending patterns by location with detailed statistics and trend analysis. Enhanced in v4.9.0 with fixed expenses integration for complete spending analysis. **Consolidated into Analytics Hub in v4.17.0** - now accessed via "📈 Analytics" button → "Merchants" tab.

**Features Delivered**:
- Merchant Analytics modal accessible from main navigation with "🏪 Merchant Analytics" button
- Top merchants ranking by total spending, visit frequency, or average spend per visit
- Time period filtering (All Time, This Year, This Month, Last 3 Months) for flexible analysis
- Detailed merchant statistics including total spend, visit count, average spend, and percentage of total expenses
- Monthly spending trend charts showing 12-month spending patterns with month-over-month change percentages
- Category breakdown analysis showing expense types at each merchant
- Payment method analysis showing preferred payment methods per merchant
- Visit frequency insights with average days between visits calculation
- First and last visit date tracking for shopping history
- Drill-down functionality to view all expenses at any specific merchant
- **Fixed Expenses Integration (v4.9.0)**: Optional "Include Fixed Expenses" checkbox to combine variable and recurring expenses for comprehensive spending analysis
- **Complete Spending Analysis (v4.9.0)**: View total spending including both variable expenses and fixed costs (rent, utilities, subscriptions)
- **Enhanced Merchant Insights (v4.9.0)**: Understand full financial relationship with service providers and merchants
- Comprehensive property-based testing (10 properties, 100+ iterations each)
- Full integration test coverage with all merchant analytics tests passing

---

### 🟢 Medical Expense People Tracking (v4.6.0)
**Completed**: December 14, 2025  
**Spec**: `.kiro/specs/medical-expense-people-tracking/`  
**Description**: Associate medical expenses with specific family members for detailed tax reporting and expense tracking.

**Features Delivered**:
- People management in Settings → People tab for adding/editing family members
- Associate medical expenses (Tax - Medical) with one or more people
- Single person selection automatically assigns full expense amount
- Multiple person selection with custom amount allocation
- "Split Equally" button for convenient equal division among people
- Person-grouped view in Tax Deductible for tax preparation
- Per-person subtotals by medical provider
- "Unassigned" section for medical expenses without people associations
- Quick assign functionality to add people to existing expenses
- Visual indicators showing assigned people on expense list
- Backward compatible with existing medical expenses (no migration required)
- Comprehensive property-based testing (13 properties, 100+ iterations each)
- Full integration test coverage

---

### 🟢 Monthly Data Reminders (v4.5.0)
**Completed**: December 6, 2025  
**Spec**: `.kiro/specs/monthly-data-reminders/`  
**Description**: Visual reminder banners that prompt users to update investment values and loan balances for the current month.

**Features Delivered**:
- Investment value reminder banners when data is missing for current month
- Loan balance reminder banners when data is missing for current month
- Count display showing number of items needing updates
- Current month name included in reminder messages
- Clickable banners that open relevant modals (Investments or Loans)
- Dismissible reminders (session-based, reappear on refresh if data still missing)
- Subtle visual design with warning colors and clear icons (💡 for investments, 💳 for loans)
- Multiple reminders stack vertically when both types are needed
- Backend API endpoint for checking reminder status
- Comprehensive property-based testing (100+ iterations per property)
- Full integration test coverage for reminder flow

---

### 🟢 Net Worth Card (v4.5.0)
**Completed**: December 6, 2025  
**Spec**: `.kiro/specs/net-worth-card/`  
**Description**: Display net worth calculation on annual and monthly summaries showing total assets (investments) minus total liabilities (loans).

**Features Delivered**:
- Net Worth card on Annual Summary showing year-end financial position
- Net Worth card on Monthly Summary (SummaryPanel) showing current month position
- Automatic calculation: Total Assets (investments) - Total Liabilities (loans)
- Assets and liabilities breakdown display
- Color-coded net worth values (green for positive/zero, red for negative)
- Year-end value selection (prefers December, falls back to latest month)
- Handles missing data gracefully (displays $0 when no data available)
- Subtitle indicators ("Year-end position" vs "Current month position")
- Integration with existing annual summary endpoint
- Comprehensive property-based testing for calculation correctness
- Full integration test coverage (14/14 tests passed)

---

### 🟢 Investment Tracking (v4.4.0)
**Completed**: November 30, 2025  
**Spec**: `.kiro/specs/investment-tracking/`  
**Description**: Track investment portfolio performance with TFSA and RRSP accounts, monthly value tracking, and visual performance indicators.

**Features Delivered**:
- Create and manage multiple investments (TFSA and RRSP types)
- Record monthly investment values with historical tracking
- View investment performance with line graphs
- Color-coded value changes (green for increases, red for decreases)
- Arrow indicators showing month-over-month performance (▲ ▼ —)
- Total portfolio value calculation across all investments
- Value history timeline with change percentages
- Investment detail view with summary cards and charts
- Integration with monthly summary panel
- Cascade delete (removing investment deletes all value entries)
- Database backup integration
- Comprehensive property-based testing
- 100% integration test success rate (24/24 tests passed)

---

### 🟢 Income Source Categories (v4.3.1)
**Completed**: November 29, 2025  
**Spec**: `.kiro/specs/income-source-categories/`  
**Description**: Enhanced income tracking with categorization by type (Salary, Government, Gifts, Other).

**Features Delivered**:
- Category selection dropdown for all income sources
- Four predefined income categories: Salary, Government, Gifts, Other
- Category display and editing in Income Management Modal
- Category subtotals in monthly income view
- Income breakdown by category on Annual Summary
- Category preservation during carry-forward operations
- Automatic database migration with default "Other" category for existing sources
- Visual category indicators and grouping in income lists

---

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
**Enhanced**: v4.3.1 with category tracking  
**Description**: Track income from multiple sources per month.

**Features Delivered**:
- Income sources management
- Monthly income tracking
- Income vs expense comparison
- (v4.3.1) Category-based income classification and reporting

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
1. Expense Templates
2. Financial Goals Dashboard

### Medium Priority
1. Adaptive Anomaly Detection (Learning from Dismissals)
2. Advanced Expense Search
3. Custom Reports
4. Category Insights
5. Savings Rate Tracker
6. Debt Payoff Planner
7. Export Enhancements
8. ExpenseForm Simplification
9. Duplicate Expense Feature

### Low Priority
1. Tags System
2. Receipt Attachments
3. Multi-Currency Support
4. Expense Reminders
5. Duplicate Detection
6. Expense Notes Enhancement
7. Dark Mode
8. Keyboard Shortcuts
9. Summary Panel Preferences
10. Quick Edit for Amount
11. Modal Consolidation

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
- v2.6 (2026-02-04): Added Fixed Expense Loan Linkage (v5.5.0) and Loan Payment Tracking (v5.5.0) to completed features, updated current version to 5.5.0
- v2.5 (2026-02-02): Added Expense List UX Improvements (v5.4.0) and Credit Card Statement Balance (v5.3.1) to completed features, updated current version to 5.4.0
- v2.4 (2026-02-02): Added UX improvement proposals (#21-25): ExpenseForm Simplification, Summary Panel Preferences, Duplicate Expense Feature, Quick Edit for Amount, Modal Consolidation
- v2.3 (2026-01-30): Added Configurable Payment Methods (v4.20.0) and Credit Card Posted Date to completed features, updated current version to 4.20.0
- v2.2 (2026-01-26): Added Adaptive Anomaly Detection (Learning from Dismissals) as proposed feature #2 in Analytics & Insights section
- v2.1 (2026-01-26): Added Spending Patterns & Predictions / Analytics Hub (v4.17.0) to completed features, consolidated Merchant Analytics into Analytics Hub, updated current version to 4.17.0
- v2.0 (2026-01-19): Added UI Modernization (v4.14.0) and Multi-Invoice Support (v4.13.0-v4.13.2) to completed features, marked Receipt Attachments as completed (via tax-deductible invoices), updated current version to 4.14.5
- v1.8 (2026-01-15): Added Medical Expense Invoice Attachments (v4.12.0) to completed features, updated current version to 4.12.0
- v1.7 (2025-12-31): Added Sticky Summary Scrolling (v4.11.0) to completed features, updated current version to 4.11.0
- v1.6 (2025-12-23): Added Budget Alert Notifications (v4.10.0) to completed features, updated current version to 4.10.0
- v1.5 (2025-12-20): Updated Merchant Analytics with Fixed Expenses Integration (v4.9.0)
- v1.4 (2025-12-16): Added Merchant Analytics (v4.7.0) to completed features
- v1.3 (2025-12-14): Added Medical Expense People Tracking (v4.6.0) to completed features
- v1.2 (2025-11-29): Added Income Source Categories (v4.3.1) to completed features
- v1.1 (2025-11-27): Added Smart Expense Entry (v4.3.0) to completed features
- v1.0 (2025-11-19): Initial roadmap created with 18 proposed features
