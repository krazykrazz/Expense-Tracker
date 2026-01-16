# Documentation

This directory contains all project documentation organized by category.

## Directory Structure

### features/
Documentation for completed features and implementations:
- `AUTOMATIC_ESTIMATED_MONTHS_COMPLETE.md` - Automatic loan payoff estimation
- `CATEGORY_SUGGESTION.md` - Smart expense entry with category suggestions
- `ESTIMATED_MONTHS_LEFT_FEATURE.md` - Estimated months left feature details
- `LOAN_TYPE_IMPLEMENTATION_COMPLETE.md` - Loan type differentiation
- `TOTAL_DEBT_FEATURE.md` - Total debt tracking feature
- `BACKUP_VERIFICATION_SUMMARY.md` - Backup system verification
- `FUTURE_BALANCE_BUG_FIX.md` - Future balance calculation fix
- `LINE_OF_CREDIT_ZERO_BALANCE_FIX.md` - Line of credit zero balance handling
- `LOAN_TYPE_FEATURE_SUMMARY.md` - Loan type feature summary
- `LOANS_INTEGRATION_TEST_RESULTS.md` - Loans integration testing
- `ENHANCED_FIXED_EXPENSES.md` - Enhanced fixed expenses with category and payment type tracking
- `GLOBAL_EXPENSE_FILTERING.md` - Global filtering by category and payment method across all time periods
- `INCOME_SOURCE_CATEGORIES.md` - Income source categorization for better financial analysis
- `INVESTMENT_TRACKING.md` - Investment portfolio tracking with TFSA and RRSP accounts
- `MONTHLY_DATA_REMINDERS.md` - Visual reminders to update investment values and loan balances
- `MEDICAL_EXPENSE_PEOPLE_TRACKING.md` - Associate medical expenses with family members for tax reporting
- `MEDICAL_EXPENSE_INVOICES.md` - Attach PDF invoices to medical expenses for record keeping
- `BUDGET_ALERT_NOTIFICATIONS.md` - Proactive budget alert notifications
- `STICKY_SUMMARY_SCROLLING.md` - Enhanced UI with sticky summary scrolling
- `MERCHANT_ANALYTICS.md` - Merchant spending analytics and insights
- `INVOICE_DOCUMENTATION_SUMMARY.md` - Complete index of invoice feature documentation

### deployments/
Deployment history and migration guides:
- `DEPLOYMENT_v3.2.0.md` - Version 3.2.0 deployment notes
- `DEPLOYMENT_v3.3.1.md` - Version 3.3.1 deployment notes
- `DATABASE_MIGRATION_COMPLETE.md` - Database migration documentation
- `CHANGELOG_v3.2.0.md` - Version 3.2.0 changelog

### optimizations/
Code optimization reports and analysis:
- `CODE_OPTIMIZATION_OPPORTUNITIES.md` - Identified optimization opportunities
- `OPTIMIZATION_REPORT.md` - Optimization analysis report
- `OPTIMIZATION_SUMMARY.md` - Summary of optimizations
- `OPTIMIZATION_TASKS.md` - Optimization task list
- `OPTIMIZATIONS_COMPLETED.md` - Completed optimizations
- `OPTIMIZATION_COMPLETE_SUMMARY.md` - Final optimization summary
- `QUICK_WINS.md` - Quick optimization wins
- `SPEC_REVIEW_SUMMARY.md` - Spec review findings

### guides/
User and developer guides:
- `STARTUP_GUIDE.md` - How to start the application
- `TRAY_ICON_GUIDE.md` - System tray icon setup
- `DATABASE_MIGRATION_GUIDE.md` - Database migration procedures

## Main Documentation

See the root `README.md` for:
- Project overview
- Installation instructions
- Technology stack
- Common commands
- Development workflow

## Specs

Feature specifications are located in `.kiro/specs/`:
- `expense-tracker/` - Main expense tracker spec
- `tax-deductible-view/` - Tax deductible view spec
- `configurable-monthly-gross/` - Income management spec
- `configurable-fixed-expenses/` - Fixed expenses spec
- `recurring-expenses/` - ⚠️ DEPRECATED (removed in v4.0.0) - Historical reference only
- `monthly-loans-balance/` - Loans and balances spec
- `containerization-optimization/` - Docker optimization spec
- `smart-expense-entry/` - Smart expense entry with category suggestions
- `global-expense-filtering/` - Global expense filtering by category and payment method
- `income-source-categories/` - Income source categorization feature
- `investment-tracking/` - Investment portfolio tracking with TFSA and RRSP accounts
- `monthly-data-reminders/` - Visual reminders to update investment values and loan balances
- `medical-expense-people-tracking/` - Associate medical expenses with family members
- `medical-expense-invoices/` - Attach PDF invoices to medical expenses
- `budget-alert-notifications/` - Proactive budget alert notifications
- `sticky-summary-scrolling/` - Enhanced UI with sticky summary scrolling
- `merchant-analytics/` - Merchant spending analytics and insights

## Steering Rules

Project guidelines are in `.kiro/steering/`:
- `product.md` - Product overview and features
- `structure.md` - Project structure and architecture
- `tech.md` - Technology stack and commands
- `versioning.md` - Version management rules
