# Changelog

All notable changes to the Expense Tracker application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.4.0] - 2025-11-19

### Added
- **Unified Docker Container**: Single container running both frontend and backend services
- **Health Check Endpoint**: `/api/health` endpoint with database connectivity verification
- **Configurable Logging**: LOG_LEVEL environment variable support (debug/info)
- **Timezone Configuration**: SERVICE_TZ environment variable for container timezone
- **Automated CI/CD**: GitHub Actions workflow for building and publishing to local registry
- **Multi-stage Docker Build**: Optimized build process with separate stages for frontend, backend deps, and runtime
- **Non-root User**: Container runs as uid 1000 for improved security
- **Configuration Modules**: Centralized path, logging, and timezone configuration

### Changed
- **Data Persistence**: All persistent data now stored in `/config` directory (database, backups, config)
- **Container Architecture**: Consolidated from separate frontend/backend containers to unified container
- **Port Exposure**: Single port 2424 for all traffic
- **Image Registry**: Images published to localhost:5000/expense-tracker with `latest` and `dev` tags
- **Docker Compose**: Simplified configuration with single service and volume mount

### Technical
- Created `backend/config/paths.js`, `logger.js`, and `timezone.js` modules
- Added `backend/routes/healthRoutes.js` with comprehensive health checks
- Updated `backend/database/db.js` and `backend/services/backupService.js` to use /config directory
- Created multi-stage `Dockerfile` with frontend-builder, backend-deps, and runtime stages
- Updated `.dockerignore` for optimized build context
- Created `.github/workflows/docker-publish.yml` for automated builds
- Final image size: < 300MB (node:18-alpine base)
- Archived old Docker configuration files (backend/Dockerfile, frontend/Dockerfile, docker-compose.prod.yml)

### Documentation
- Created comprehensive `DOCKER.md` with architecture and deployment guides
- Created `BUILD_AND_PUSH.md` with build script documentation
- Updated `README.md` with Docker quick start section

---

## [3.3.4] - 2025-11-18

### Fixed
- **Tax Deduction Summary**: All donation and medical bar graph entries now display their amounts (removed $50 threshold)
- **Monthly Summary Layout**: Improved readability with stacked label/value layout for weekly totals, payment methods, and types

### Changed
- Monthly summary sections now display labels on first line and amounts on second line for better visual hierarchy
- Increased value font size from 12px to 14px for better readability

---

## [3.3.3] - 2025-11-18

### Fixed
- **Date Input Timezone**: Fixed date inputs to use local timezone instead of UTC, preventing off-by-one day errors
- Date inputs now correctly default to today's date in the user's local timezone
- Added `getTodayLocalDate()`, `dateToLocalString()`, and `getCurrentYearMonth()` utility functions

---

## [3.3.2] - 2025-11-16

### Changed
- **Code Quality**: Created centralized formatters utility for consistent date/currency formatting
- **Code Quality**: Eliminated duplicate formatting functions across 7 components
- **Organization**: Archived 19 backend scripts into organized structure (`backend/scripts/archive/`)
- **Organization**: Moved 25+ documentation files into `docs/` directory with clear categorization
- **Organization**: Cleaned up root directory for better project navigation

### Technical
- Updated LoansModal, LoanDetailView, TotalDebtView, AnnualSummary, ExpenseList, RecurringExpensesManager, and BackupSettings components
- Created `frontend/src/utils/formatters.js` with 8 utility functions
- Bundle size slightly improved: 233.83 kB (64.40 kB gzipped)
- No user-facing changes

---

## [3.3.1] - 2025-11-15

### Added
- **Database Migration**: Moved database from `backend/database/` to `/data/` directory for better Docker volume management
- **Configuration**: Added centralized path configuration (`backend/config/paths.js`)
- **Logging**: Added structured logging utility (`backend/config/logger.js`)

### Changed
- Database location now configurable via environment variable
- Improved database initialization and error handling
- Updated Docker volume mounts for persistent data storage

### Fixed
- Database persistence issues in Docker containers
- Path resolution for database file

---

## [3.3.0] - 2025-11-14

### Added
- **Total Debt Overview**: New view showing aggregate debt across all active loans over time
- **Dual-axis charts**: Balance and interest rate trends on same chart for better visualization
- **Loan type differentiation**: Support for traditional loans vs lines of credit with different behaviors
- **Automatic estimated months calculation**: System automatically calculates loan payoff estimates

### Changed
- Enhanced loan detail view with improved charts and metrics
- Improved loan balance tracking with monthly history
- Better handling of zero balances for lines of credit

### Technical
- Added `TotalDebtView` component with Chart.js integration
- Enhanced `LoanDetailView` with dual-axis charting
- Added `loan_type` column to loans table
- Added `estimated_months_left` column to loans table
- Improved loan balance repository queries

---

## [3.2.0] - 2025-11-10

### Added
- **Fixed Monthly Expenses**: New feature to track recurring fixed expenses (rent, utilities, subscriptions)
- **Fixed Expenses Management**: Modal interface for adding, editing, and deleting fixed expenses
- **Carry Forward**: Ability to copy previous month's fixed expenses to current month
- **Monthly Income from Multiple Sources**: Track income from different sources separately
- **Income Management Modal**: Interface for managing multiple income sources per month

### Changed
- Summary panel now includes fixed expenses in calculations
- Monthly gross income replaced with multi-source income tracking
- Enhanced financial overview with fixed vs variable expense breakdown

### Technical
- Added `fixed_expenses` table with foreign key constraints
- Added `income_sources` table replacing `monthly_gross` table
- Created FixedExpensesModal and IncomeManagementModal components
- Added new API endpoints for fixed expenses and income sources
- Implemented CASCADE DELETE for referential integrity

### Deprecated
- `monthly_gross` table (replaced by `income_sources`)

---

## [3.1.2] - 2025-11-05

### Added
- **Tax Deductible View**: Collapsible lists for medical and donation expenses
- **Expense Filtering**: Filter by type and payment method in expense list
- **Search Enhancement**: Improved search functionality across all expenses

### Changed
- Annual summary now includes tax-deductible expense breakdown
- Improved UI for viewing and managing tax-deductible items

---

## [3.1.1] - 2025-11-02

### Added
- **Cheque Payment Method**: Added "Cheque" as a payment method option

### Fixed
- Minor UI tweaks and bug fixes
- Improved form validation

---

## [3.1.0] - 2025-10-28

### Added
- **Recurring Expenses**: Template system for recurring expenses
- **Automatic Generation**: Generate expenses from templates for specific months
- **Recurring Expense Manager**: Interface for managing recurring expense templates
- **Template Tracking**: Track which expenses were generated from templates

### Changed
- Expense form now supports creating recurring templates
- Enhanced expense list to show recurring expense indicators

### Technical
- Added `recurring_expenses` table
- Added `recurring_id` and `is_generated` columns to expenses table
- Created RecurringExpensesManager and RecurringExpenseForm components
- New API endpoints for recurring expense management

---

## [3.0.0] - 2025-10-20

### Added
- **Loans and Lines of Credit**: Complete loan tracking system
- **Monthly Balance History**: Track loan balances and interest rates over time
- **Loan Detail View**: Detailed charts and metrics for individual loans
- **Loan Management Modal**: Interface for adding, editing, and managing loans

### Changed
- **BREAKING**: Database schema changes requiring migration
- Summary panel now includes loan information
- Enhanced financial overview with debt tracking

### Technical
- Added `loans` and `loan_balances` tables
- Created LoansModal and LoanDetailView components
- Integrated Chart.js for loan visualizations
- New API endpoints for loan and balance management
- Foreign key constraints with CASCADE DELETE

---

## [2.5.0] - 2025-10-10

### Added
- **Automated Backups**: Configurable automatic database backups
- **Backup Management**: Interface for creating, restoring, and deleting backups
- **Backup History**: View and manage backup history
- **Manual Backup**: Create backups on demand

### Changed
- Settings modal now includes backup configuration
- Enhanced data safety with automated backup system

### Technical
- Added backup service and controller
- Created BackupSettings component
- New API endpoints for backup operations
- Backup files stored with timestamps

---

## [2.0.0] - 2025-09-25

### Added
- **CSV Import**: Bulk import expenses from CSV files
- **CSV Export**: Export expenses to CSV format
- **Annual Summary**: Comprehensive yearly expense overview
- **Weekly Breakdown**: Expenses organized by week within months

### Changed
- **BREAKING**: Enhanced expense data model
- Improved expense list with better filtering
- Enhanced summary calculations

### Technical
- Added multer for file uploads
- CSV parsing with csv-parser
- New annual summary component
- Week calculation based on date

---

## [1.5.0] - 2025-09-10

### Added
- **Monthly Summary Panel**: Real-time financial overview
- **Expense Categories**: Food, Gas, Other, Tax-Medical, Tax-Donation
- **Payment Methods**: Cash, Debit, Credit Cards (CIBC MC, PCF MC, WS VISA, VISA)
- **Search Functionality**: Search expenses by place or notes

### Changed
- Improved UI with better layout and styling
- Enhanced expense form with validation

---

## [1.0.0] - 2025-08-15

### Added
- **Initial Release**: Basic expense tracking functionality
- Add, edit, and delete expenses
- Monthly expense view
- Date, place, amount, type, and method tracking
- SQLite database for data persistence
- React frontend with Vite
- Express backend with REST API
- Docker support for containerization

### Technical
- React 18 with functional components and hooks
- Express.js backend with SQLite3
- RESTful API design
- Docker and Docker Compose configuration
- Layered architecture (Controller → Service → Repository → Database)

---

## Version History Summary

- **3.3.x**: Code quality and organization improvements
- **3.2.x**: Fixed expenses and multi-source income
- **3.1.x**: Recurring expenses and tax-deductible tracking
- **3.0.x**: Loans and lines of credit tracking
- **2.x.x**: CSV import/export and automated backups
- **1.x.x**: Core expense tracking functionality

---

## Upgrade Notes

### Upgrading to 3.3.2
- No database changes required
- No API changes
- Frontend rebuild required
- Fully backward compatible

### Upgrading to 3.3.1
- Database migration required (location change)
- Run migration script: `node backend/scripts/migrateDatabaseLocation.js`
- Update Docker volumes if using containers

### Upgrading to 3.2.0
- Database migration required
- New tables: `fixed_expenses`, `income_sources`
- Run migration scripts in order
- Backup database before upgrading

### Upgrading to 3.0.0
- **BREAKING CHANGE**: Database schema changes
- New tables: `loans`, `loan_balances`
- Backup database before upgrading
- Run migration scripts

---

## Links

- [Documentation](./docs/README.md)
- [Deployment Guides](./docs/deployments/)
- [Feature Documentation](./docs/features/)
- [User Guides](./docs/guides/)

---

## Contributing

When adding entries to this changelog:

1. Use the format: `[Version] - YYYY-MM-DD`
2. Group changes under: Added, Changed, Deprecated, Removed, Fixed, Security
3. Include technical details in a separate Technical section
4. Mark breaking changes with **BREAKING**
5. Update version history summary
6. Add upgrade notes for major/minor versions

---

**Note**: This changelog was created on 2025-11-16. Earlier version details were reconstructed from deployment documentation and may not be complete.
