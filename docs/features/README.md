# Feature Documentation Index

This directory documents implemented product features.

## Scope

- Each file describes behavior, user flows, key implementation notes, and relevant API/model context for one feature area.
- Canonical planning and in-progress work lives in `specs/`.
- Release history lives in `CHANGELOG.md`.

## Versioning Note

Some feature documents still mention labels like `v4.x` or `v5.x`. Those are pre-1.0 versions from before the version was rebased to 1.0.0 (see `CHANGELOG.pre-1.0.md`); treat them as historical context.

## Index

### Expenses
- [Expense List](EXPENSE_LIST_UX_IMPROVEMENTS.md) - Date-grouped list, local filters, quick views, pagination
- [Global Expense Filtering](GLOBAL_EXPENSE_FILTERING.md) - All-time search, category/method/year filters, date range and presets
- [Smart Expense Entry](CATEGORY_SUGGESTION.md) - Category suggestions and payment method memory
- [Place Name Standardization](PLACE_NAME_STANDARDIZATION.md) - Cleanup tool for inconsistent place names
- [Generic Expense Reimbursement](GENERIC_EXPENSE_REIMBURSEMENT.md) - Original cost vs out-of-pocket for non-medical expenses
- [Sticky Summary Scrolling](STICKY_SUMMARY_SCROLLING.md) - Main page layout and sticky summary column

### Payment Methods and Credit Cards
- [Configurable Payment Methods](CONFIGURABLE_PAYMENT_METHODS.md) - Payment methods table, credit card balances
- [Credit Card Billing Cycles](CREDIT_CARD_BILLING_CYCLES.md) - Cycle history, statement balances, trends
- [Credit Card Statement Balance](CREDIT_CARD_STATEMENT_BALANCE.md) - Amount due and payment alerts
- [Credit Card Posted Date](CREDIT_CARD_POSTED_DATE.md) - Transaction date vs posted date

### Income, Fixed Expenses and Budgets
- [Income Source Categories](INCOME_SOURCE_CATEGORIES.md) - Salary, Government, Gifts, Other
- [Enhanced Fixed Expenses](ENHANCED_FIXED_EXPENSES.md) - Category and payment type for recurring costs
- [Fixed Expense Loan Linkage](FIXED_EXPENSE_LOAN_LINKAGE.md) - Linking fixed expenses to loans, auto-logged payments
- [Budget Alert Notifications](BUDGET_ALERT_NOTIFICATIONS.md) - 80% / 90% / 100% budget banners
- [Budget Suggestions](BUDGET_SUGGESTIONS.md) - Suggested budgets from spending history

### Loans, Mortgages and Investments
- [Loan Payment Tracking](LOAN_PAYMENT_TRACKING.md) - Payment-based balances for loans and mortgages
- [Mortgage Tracking](MORTGAGE_TRACKING.md) - Amortization, equity, rate history, detail view
- [Fixed Interest Rate Loans](FIXED_INTEREST_RATE_LOANS.md) - Locked-in rates for traditional loans
- [Estimated Months Left](ESTIMATED_MONTHS_LEFT_FEATURE.md) - Remaining-term field for loans
- [Total Debt Over Time](TOTAL_DEBT_FEATURE.md) - Total outstanding debt trend
- [Investment Tracking](INVESTMENT_TRACKING.md) - TFSA/RRSP value history

### Medical and Tax
- [Medical Expense People Tracking](MEDICAL_EXPENSE_PEOPLE_TRACKING.md) - Assign medical expenses to family members
- [Medical Insurance Tracking](MEDICAL_INSURANCE_TRACKING.md) - Eligibility and claim status
- [Insurance Claim Reminders](INSURANCE_CLAIM_REMINDERS.md) - Reminders for in-progress claims
- [Tax-Deductible Invoices](TAX_DEDUCTIBLE_INVOICES.md) - PDF invoice attachments
- [Tax-Deductible Analytics](TAX_DEDUCTIBLE_ANALYTICS.md) - Year-over-year comparison and tax credit calculator

### Analytics and Insights
- [Analytics Hub](ANALYTICS_HUB.md) - Monthly summary, Spending, Cash Flow, merchants, activity, trends
- [Enhanced Annual Summary](ENHANCED_ANNUAL_SUMMARY.md) - Yearly overview
- [Merchant Analytics](MERCHANT_ANALYTICS.md) - Spending by merchant
- [Anomaly Detection](ANOMALY_DETECTION.md) - Actionable unusual-spending alerts

### Data and System
- [Activity Log](ACTIVITY_LOG.md) - Event tracking and retention
- [Monthly Data Reminders](MONTHLY_DATA_REMINDERS.md) - Prompts to update investments and loans
- [Real-Time Sync](REAL_TIME_SYNC.md) - Cross-device refresh via SSE

## Maintenance Guidance

When updating a feature doc:

1. Keep behavior descriptions aligned with current code.
2. Preserve historical version notes only if they provide useful migration context.
3. Add the new file to the index above.
4. Prefer linking to `specs/` for planned changes instead of duplicating roadmap content here.
