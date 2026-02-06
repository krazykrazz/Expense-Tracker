# Product Overview

A full-stack personal expense tracking application for managing household finances. Built with React + Express + SQLite, deployed via Docker. Supports multi-device access over local network.

## Key Features

- Expense management with global search and filtering by category, payment method, and year
- Smart method filter combining payment type and specific method in a single grouped dropdown
- Filter chips with one-click removal and filter count badge
- Advanced filters section with collapsible Invoice and Insurance status filters
- Smart expense entry with intelligent category suggestions based on place history
- Configurable payment methods with database-driven management (Cash, Cheque, Debit, Credit Card types)
- Credit card balance tracking with utilization indicators, payment history, and statement uploads
- Credit card billing cycle history with automatic cycle generation, trend indicators, and transaction counting
- Credit card statement balance calculation with smart payment alert suppression
- Credit card posted date support for accurate balance calculations
- Payment method memory (remembers last used payment method)
- Enhanced UI with sticky summary scrolling and floating add button
- Monthly and annual financial summaries with weekly breakdowns
- Annual Summary with year-over-year comparison, savings rate, transaction count, top category, daily spend, tax deductible totals
- YTD comparison for current year to avoid misleading comparisons with incomplete data
- Income by Category visualization and Monthly Net Balance line graph
- Configurable monthly gross income from multiple sources with category tracking
- Fixed monthly expenses with category/payment type tracking, carry-forward, and optional loan linkage with due date reminders
- Budget tracking with proactive alert notifications (Warning 80-89%, Danger 90-99%, Critical ≥100%)
- Loans and lines of credit tracking with monthly balance history and payment-based balance calculation
- Loan payment reminders with auto-log payment suggestions
- Visual dual-axis charts showing balance and interest rate trends
- Total debt overview showing aggregate debt across all active loans
- Mortgage tracking with amortization schedules, equity tracking, payment insights, variable rate support
- Investment portfolio tracking (TFSA, RRSP) with value history and performance charts
- Net worth tracking showing assets minus liabilities
- Tax-deductible expense tracking (medical and donations) with insurance claim status tracking
- Medical expense people tracking with family member associations
- Multi-invoice PDF attachments with optional person linking
- Person-grouped tax reports with per-person subtotals by provider
- Merchant analytics with spending insights, visit frequency, trend analysis, and fixed expenses integration
- Insurance claim reminders for pending claims over 30 days
- Dedicated Notifications section grouping all reminder banners with collapsible UI and count badge
- Automated and manual database backups with restore functionality
- Analytics hub with spending predictions, anomaly detection, and seasonal analysis
