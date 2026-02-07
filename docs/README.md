# Documentation

This directory contains all project documentation organized by category.

## Directory Structure

### features/
Documentation for completed features and implementations:
- `ANALYTICS_HUB.md` - Spending patterns, predictions, anomaly detection, and merchant analytics
- `BUDGET_ALERT_NOTIFICATIONS.md` - Proactive budget alert notifications
- `BUDGET_SUGGESTIONS.md` - Budget suggestion algorithms
- `CATEGORY_SUGGESTION.md` - Smart expense entry with category suggestions
- `CONFIGURABLE_PAYMENT_METHODS.md` - Database-driven payment method management
- `CREDIT_CARD_BILLING_CYCLES.md` - Billing cycle history with statement balances
- `ENHANCED_ANNUAL_SUMMARY.md` - Year-over-year comparison, savings rate, and summary cards
- `ENHANCED_FIXED_EXPENSES.md` - Fixed expenses with category and payment type tracking
- `ESTIMATED_MONTHS_LEFT_FEATURE.md` - Estimated months left for loan payoff
- `EXPENSE_LIST_UX_IMPROVEMENTS.md` - Smart method filter, filter chips, advanced filters
- `FIXED_INTEREST_RATE_LOANS.md` - Fixed interest rate support for loans
- `GENERIC_EXPENSE_REIMBURSEMENT.md` - Reimbursement tracking for any expense type
- `GLOBAL_EXPENSE_FILTERING.md` - Global filtering by category and payment method
- `INCOME_SOURCE_CATEGORIES.md` - Income source categorization
- `INSURANCE_CLAIM_REMINDERS.md` - Automatic alerts for pending insurance claims
- `INVESTMENT_TRACKING.md` - Investment portfolio tracking (TFSA, RRSP)
- `LOAN_PAYMENT_TRACKING.md` - Payment-based loan tracking with auto-log and reminders
- `MEDICAL_EXPENSE_PEOPLE_TRACKING.md` - Associate medical expenses with family members
- `MEDICAL_INSURANCE_TRACKING.md` - Insurance eligibility and claim status tracking
- `MERCHANT_ANALYTICS.md` - Merchant spending analytics and insights
- `MONTHLY_DATA_REMINDERS.md` - Visual reminders to update investment values and loan balances
- `MORTGAGE_TRACKING.md` - Mortgage analytics with amortization and equity tracking
- `STICKY_SUMMARY_SCROLLING.md` - Enhanced UI with sticky summary scrolling
- `TAX_DEDUCTIBLE_ANALYTICS.md` - Year-over-year tax deductible comparison and tax credit calculator
- `TAX_DEDUCTIBLE_INVOICES.md` - PDF invoice attachments for tax-deductible expenses
- `TOTAL_DEBT_FEATURE.md` - Total debt tracking across all active loans

### deployments/
- `DEPLOYMENT.md` - General deployment guide

### development/
Developer guides and CI/CD documentation:
- `CI_TEST_RELIABILITY.md` - CI testing best practices and reliability improvements
- `FEATURE_BRANCH_WORKFLOW.md` - Feature branch workflow and PR-based promotion
- `GITHUB_ACTIONS_CICD.md` - GitHub Actions workflow documentation
- `STAGING_ENVIRONMENT.md` - Staging environment setup and usage

### guides/
User and developer guides:
- `BUDGET_MANAGEMENT_GUIDE.md` - Budget management procedures
- `DATABASE_MIGRATION_GUIDE.md` - Database migration procedures
- `DOCKER.md` - Complete Docker deployment guide
- `MAINTENANCE_GUIDE_INVOICES.md` - Invoice system maintenance
- `QUICK_BUILD_GUIDE.md` - Fast reference for Docker builds
- `README_SILENT_MODE.md` - Silent mode startup documentation
- `RESTORE_BACKUP_GUIDE.md` - Backup restore procedures
- `STARTUP_GUIDE.md` - How to start the application
- `TROUBLESHOOTING_INVOICES.md` - Invoice troubleshooting guide
- `VALIDATION_UTILITIES_GUIDE.md` - Validation utility documentation

## Main Documentation

See the root `README.md` for:
- Project overview and features
- Installation instructions
- API endpoints reference
- Database schema
- Development workflow

## Active Specs

Feature specifications in `.kiro/specs/`:
- `activity-log/` - Event tracking framework (planned)
- `mortgage-payment-date-tracking/` - Mortgage payment date tracking (planned)
- `windows-desktop-app/` - Windows desktop app wrapper (planned)

## Steering Rules

Project guidelines in `.kiro/steering/`:
- `product.md` - Product overview and features
- `structure.md` - Project structure and architecture
- `tech.md` - Technology stack and commands
- `versioning.md` - Version management rules
- `testing.md` - Testing conventions (Jest 30, Vitest)
- `api-integration.md` - API integration checklist
- `git-commits.md` - Git commit and branching rules
- `logging-best-practices.md` - Logging conventions
- `pre-deployment.md` - Pre-deployment checklist
- `docker-compose.md` - Docker Compose configuration
- `database-migrations.md` - Database migration guidance
