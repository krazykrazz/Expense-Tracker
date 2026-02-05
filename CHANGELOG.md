# Changelog

All notable changes to the Expense Tracker application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [5.5.0] - 2026-02-04

### Added
- **Activity Log Feature Specification**: Comprehensive event tracking framework for the application
  - Centralized event storage with dedicated database table (id, event_type, entity_type, entity_id, user_action, metadata, timestamp)
  - Expense event tracking (create, update, delete) with amount and category metadata
  - Fixed expense event tracking (create, update, delete) with name and amount metadata
  - Loan event tracking (create, update, delete) with loan name and type metadata
  - Investment event tracking (create, update, delete) with name and account type metadata
  - Insurance status change tracking for medical expenses (status transitions, amounts)
  - Budget event tracking (create, update, delete) with category and limit metadata
  - Payment method event tracking (create, update, deactivate) with method name and type
  - Loan payment event tracking (create, update, delete) with loan name and payment amount
  - Backup/restore operation tracking with filename metadata
  - Recent Activity view in Settings → Misc tab showing last 50 events
  - Configurable display limits (25, 50, 100, 200 events) with localStorage persistence
  - Retention policy support (default 90 days / 1000 events)
  - Fire-and-forget logging pattern for non-blocking event capture
  - 17 correctness properties with property-based testing

---

## [5.4.1] - 2026-02-03

### Fixed
- **Zero Statement Balance**: Fixed issue where saving a zero statement balance for unused credit cards was not recognized as a valid actual balance
  - Backend `calculateEffectiveBalance()` now properly distinguishes between auto-generated cycles (actual=0) and user-entered zero balances
  - Frontend now uses `balance_type` instead of checking `actual_statement_balance > 0` for action button display
  - Cycles with user-entered zero balance now show Edit/Delete buttons instead of "Enter Statement"

---

## [5.4.0] - 2026-02-03

### Added
- **Unified Billing Cycles**: Consolidated credit card billing cycle management
  - Merged "Billing Cycle History" and "Statements" into single "Billing Cycles" tab
  - Auto-generation of billing cycle entries based on historical expenses
  - Transaction count display per billing cycle
  - Effective balance calculation (actual if entered, otherwise calculated)
  - Trend indicators comparing cycle-to-cycle spending (↑ higher, ↓ lower, ✓ same)
  - "Enter Statement" action for auto-generated cycles
  - New unified API endpoint: GET /api/payment-methods/:id/billing-cycles/unified
- **Expense List UX Improvements**: Enhanced filter experience with smarter controls
  - Smart method filter combining payment type and specific method in a single grouped dropdown
  - Filter chips showing active filters with one-click removal (×)
  - Advanced filters section with collapsible Invoice and Insurance status filters
  - Filter count badge showing total number of active filters
  - Enhanced global view banner showing which filters triggered global view
  - "Return to Monthly View" button to clear global-triggering filters

### Changed
- Method and Method Type dropdowns replaced with single smart method filter
- Filter controls reorganized with advanced filters in collapsible section
- Statements tab renamed to "Billing Cycles" in credit card detail view
- Billing Cycle History section removed from Overview tab (consolidated into Billing Cycles tab)

---

## [5.3.1] - 2026-02-02

### Added
- **Credit Card Statement Balance**: Automatic statement balance calculation with smart alerts
  - Statement balance calculation based on billing cycle dates and expenses
  - Billing cycle day field for credit cards (1-31) specifying when statement closes
  - Smart payment alerts showing required payment amount (statement balance)
  - Alert suppression when statement balance is zero or negative
  - Statement period display in credit card detail view
  - "Statement Paid" indicator when statement is paid in full
  - Backward compatibility for cards without billing_cycle_day configured

### Database
- Added `billing_cycle_day` column to payment_methods table

---

## [5.3.0] - 2026-02-02

### Added
- **Generic Expense Reimbursement**: Track reimbursements for any expense type (not just medical)
  - New `reimbursement_eligible` field to mark expenses as reimbursable
  - Reimbursement status workflow: pending → submitted → approved → paid/denied
  - `expected_reimbursement` field to track expected reimbursement amount
  - `reimbursement_source` field to identify who will reimburse (employer, insurance, etc.)
  - Visual ReimbursementIndicator component showing status and amounts
  - Out-of-pocket calculation (amount - expected_reimbursement when paid)
  - Backward compatible: existing expenses unaffected

### Changed
- ExpenseForm now includes reimbursement fields for all expense types
- ExpenseList displays reimbursement indicators for eligible expenses

---

## [5.1.0] - 2026-02-01

### Added
- **Fixed Interest Rate Loans**: Support for locking in interest rates on traditional loans
  - New `fixed_interest_rate` field for loans to store locked-in rates
  - Rate lock indicator (🔒) displayed in loan detail view when rate is fixed
  - Fixed rate loans automatically use locked rate for balance history entries
  - Balance history form hides rate field for fixed-rate loans
  - Backward compatible: existing loans continue to work with variable rates

### Changed
- Loan update validation now only validates editable fields (name, notes, fixed_interest_rate)
- Immutable loan fields (loan_type, initial_balance, start_date) cannot be changed after creation

### Fixed
- Fixed "Initial balance is required" error when updating existing loans with zero interest rate
- Loan update now uses partial update pattern instead of full replacement

---

## [5.0.4] - 2026-02-01

### Changed
- Moved Payment Methods button from header to main toolbar (right-justified)
  - Better accessibility alongside other navigation controls
  - Consistent placement with month navigation and analytics buttons

---

## [5.0.3] - 2026-01-31

### Fixed
- Credit card balance calculation now uses `original_cost` for medical expenses with insurance
  - When a medical expense has insurance tracking, the full original cost (before insurance) is used for credit card balance
  - This correctly reflects the actual charge to the credit card
  - Insurance reimbursements can be recorded as credit card payments

---

## [5.0.2] - 2026-01-31

### Fixed
- Credit card utilization percentage always showing 0.0% in payment methods list
- Copy/paste not working in credit card payment form (currency symbols and commas now stripped)
- Statement period not auto-calculating when statement date changes
- Statement period showing blank in statements list (property name mismatch)

---

## [5.0.1] - 2026-01-31

### Added
- **Database Statistics**: Added payment methods, credit card statements, and credit card payments counts to Settings → About

### Fixed
- Payment method deactivation bug (frontend was sending wrong field name)

---

## [5.0.0] - 2026-01-31

### Added
- **Configurable Payment Methods**: Database-driven payment method management
  - Four payment types: Cash, Cheque, Debit, Credit Card with type-specific fields
  - Create, edit, activate/deactivate, and delete payment methods
  - Credit card balance tracking with automatic updates on expense/payment
  - Credit utilization indicators (color-coded: green < 30%, yellow 30-70%, red > 70%)
  - Payment recording with automatic balance reduction
  - Payment history viewing with dates and notes
  - Statement uploads with billing period dates
  - Due date reminders when payment due within 7 days
  - Backward compatibility with existing expenses
- **Credit Card Posted Date**: Optional posted date field for credit card expenses
  - Distinguishes transaction date from posting date
  - Affects balance calculations (uses posted date if set, otherwise transaction date)
  - Validation ensures posted date >= transaction date
  - Field shown only for credit card payment methods

### Changed
- Payment methods now stored in database instead of hardcoded constants
- Expense form fetches payment methods from API
- Filter dropdowns use API-fetched payment methods
- Fixed expenses use configurable payment methods

### Database
- Added `payment_methods` table with type-specific attributes
- Added `credit_card_payments` table for payment history
- Added `credit_card_statements` table for statement storage
- Added `payment_method_id` column to expenses and fixed_expenses tables
- Added `posted_date` column to expenses table

---

## [4.19.0] - 2026-01-28

### Added
- **Mortgage Tracking**: Comprehensive mortgage analytics and insights
  - Amortization schedule visualization with principal vs interest breakdown
  - Equity tracking showing property value minus remaining balance over time
  - Mortgage insights panel with current status, payoff projections, and what-if scenarios
  - Payment history tracking with principal/interest breakdown per payment
  - Variable rate mortgage support with quick rate update capability
- **Environment Banner**: Visual indicator for staging and development environments
  - Orange banner for staging environment
  - Blue banner for development mode
  - No banner in production

### Fixed
- **Merchant Trend Generation**: Fixed bug where `getMerchantTrend` could return more months than requested due to date comparison edge case

---

## [4.18.2] - 2026-01-28

### Fixed
- **Invoice PDF Viewing**: Fixed "content is blocked" error when viewing invoice PDFs
  - Updated Content Security Policy (CSP) to allow blob URLs for `objectSrc` and `frameSrc` directives
  - PDF invoices now display correctly in the built-in viewer

---

## [4.18.1] - 2026-01-27

### Fixed
- **Use App Data Button**: Fixed "Use App Data" button in Tax Credit Calculator not populating income
  - Backend API now returns `total` field alongside category breakdown for annual income
  - Updated AnnualSummary component to use new response structure
  - Tax Credit Calculator now correctly pulls annual income from app data

---

## [4.18.0] - 2026-01-26

### Added
- **Tax Deductible Analytics**: Comprehensive analytics for tax-deductible expenses
  - Year-over-year comparison showing changes in medical and donation expenses
  - Tax credit calculator with federal and provincial estimates
  - Customizable tax settings (province selection, custom rates)
  - Settings persistence in localStorage
  - Property-based tests for tax calculations and YoY comparisons

### Fixed
- **Budget Alert Dismissal Persistence**: Fixed bug where dismissed budget alerts would reappear after page refresh
  - Added tracking of previous year/month to prevent clearing dismissals on initial mount
  - Dismissals now correctly persist within the same browser session

---

## [4.17.4] - 2026-01-26

### Fixed
- **Budget Alert Monthly Scoping**: Clicking "View Expenses" from a budget alert now correctly shows only the current month's expenses
  - Category filter alone no longer triggers global view mode
  - Budget alerts show expenses scoped to the month generating the alert
  - Updated PBT tests to reflect new isGlobalView logic

---

## [4.17.3] - 2026-01-26

### Fixed
- **Budget Alert View Expenses**: "View Expenses" button now correctly scopes to current month
  - Category filter alone no longer triggers global view mode
  - Clicking "View Expenses" shows only the current month's expenses for that category
  - Clears other filters (search, payment method, year) to ensure monthly view

---

## [4.17.2] - 2026-01-26

### Fixed
- **Budget Management Modal**: Fixed error when opening budget management where category was passed as object instead of string
  - Added defensive validation to ensure category is always a string before API calls
  - Prevents "[object Object]" being sent to budget suggestion API

---

## [4.17.1] - 2026-01-26

### Fixed
- **Budget Alerts**: Fixed "Budget data format is invalid" error by properly transforming API response format
  - BudgetAlertManager now correctly handles flat budget data structure from API
  - Calculates progress percentage from spent/limit values

---

## [4.17.0] - 2026-01-26

### Added
- **Analytics Hub**: Unified analytics dashboard accessible via "📊 Analytics Hub" button in navigation
  - **Spending Patterns Tab**: Day-of-week analysis, recurring patterns, and amount variance insights
  - **Predictions Tab**: Monthly spending forecasts with confidence intervals and budget integration
  - **Seasonal Analysis Tab**: Identify seasonal spending trends across categories
  - **Anomaly Detection Tab**: Unusual spending alerts with dismissal learning
  - **Merchants Tab**: Integrated merchant analytics (moved from standalone modal)
- **Backend Services**: New analytics services for spending patterns, predictions, and anomaly detection
  - `spendingPatternsService.js`: Day-of-week patterns, recurring expenses, seasonal trends
  - `predictionService.js`: Monthly forecasts with confidence intervals and early-month warnings
  - `anomalyDetectionService.js`: Amount anomalies, new merchant detection, gap exclusion
- **Property-Based Tests**: Comprehensive PBT coverage for all new analytics services
  - 15+ PBT test files covering spending patterns, predictions, and anomaly detection
  - Data sufficiency validation, confidence calculations, and edge case handling

### Changed
- Removed standalone "🏪 Merchant Analytics" button from MonthSelector (now in Analytics Hub)
- Analytics Hub provides unified access to all spending insights in one modal

### Fixed
- Fixed Express catch-all route compatibility with newer path-to-regexp (`'*'` → `'/{*splat}'`)
- Fixed API response handling in analyticsApi.js for wrapped responses
- Fixed budget alert warnings for non-array budget data

---

## [4.16.5] - 2026-01-24

### Added
- **GitHub Actions CI/CD**: Automated testing workflows for frontend and backend
  - Parallel test execution for Jest (backend) and Vitest (frontend)
  - Performance test exclusion in CI environment
  - Docker build workflow (manual trigger)

### Fixed
- **CI Test Reliability**: Comprehensive improvements for stable GitHub Actions tests
  - Created shared PBT arbitraries modules with safe date/amount/string generators
  - Added CI-specific timeouts (45s vs 30s local) for property-based tests
  - Fixed seeds (12345) for reproducible PBT runs in CI
  - Added retry logic (2 retries) for flaky tests in CI
  - Fixed ExpenseForm timeout cleanup on component unmount
  - Fixed date arbitrary edge cases in invoice CRUD tests
  - Fixed amount arbitrary NaN/Infinity issues in merchant ranking tests
  - Increased timeouts for visit frequency PBT tests

### Documentation
- Added `docs/development/CI_TEST_RELIABILITY.md` with CI testing best practices
- Added `docs/development/GITHUB_ACTIONS_CICD.md` with workflow documentation

---

## [4.16.4] - 2026-01-24

### Fixed
- **Income by Category Layout**: Fixed Income by Category section to display all 4 categories on one row
  - Changed from auto-fill grid (3+1 layout) to explicit 4-column grid
  - All income categories (Salary, Government, Gifts, Other) now display evenly

---

## [4.16.3] - 2026-01-24

### Added
- **Daily Spend Card**: New Annual Summary card showing average daily variable spending
  - For current year: calculates based on days elapsed so far
  - For past years: calculates based on 365 days
- **Tax Deductible Card**: New Annual Summary card showing combined Medical + Donation totals
  - Green-themed styling to match tax deductible section
  - Quick reference for tax planning

---

## [4.16.2] - 2026-01-24

### Fixed
- **YoY Comparison Layout**: Fixed squished Year-over-Year comparison cards in Annual Summary
  - Changed from 4-column to 2-column grid layout for better readability
  - Net Worth and other values no longer get cut off
  - Improved padding and spacing for comparison cards

---

## [4.16.1] - 2026-01-24

### Changed
- **YTD Comparison for Current Year**: Year-over-year comparison now uses Year-to-Date (YTD) logic
  - For current year: compares only months 1 through current month for both years
  - For past years: compares full 12 months (unchanged)
  - Header shows "YTD Comparison" with month range badge for current year
  - Prevents misleading comparisons when future income is pre-logged

---

## [4.16.0] - 2026-01-24

### Added
- **Year-over-Year Comparison**: New collapsible section in Annual Summary showing:
  - Income change (% and absolute difference)
  - Expenses change (% and absolute difference)
  - Savings rate change (percentage points)
  - Net worth change (absolute difference)
  - Visual indicators with green/red color coding for positive/negative changes
- **Savings Rate Card**: Shows percentage of income saved with color-coded display
- **Transaction Count Card**: Displays total variable expense transactions with average amount
- **Top Category Card**: Highlights #1 spending category with amount and percentage
- **Collapsible Sections**: "By Category" and "By Payment Method" sections are now collapsible

### Changed
- **Annual Summary Layout**: Cards now display 4 per row for better information density
- **Monthly Summary Layout**: Fixed to display 1 card per row (single column) as intended

---

## [4.15.5] - 2026-01-23

### Fixed
- **Invoice Upload Bug**: Fixed "Person is not assigned to this expense" error when uploading invoices
  - The `validatePersonBelongsToExpense` function was checking `p.personId` but repository returns `p.id`
  - Updated invoiceService.js to use correct property name
  - Fixed test mocks in invoiceService.test.js and expenseService.people.test.js to match actual repository return format
  - This was a regression from the personId→id refactor for frontend compatibility

---

## [4.15.4] - 2026-01-23

### Fixed
- **Frontend Test Suite**: Fixed 47 failing frontend tests
  - Improved async handling in integration tests
  - Better mock cleanup between test runs
  - Fixed timing issues in BudgetAlert and Invoice tests

### Changed
- **Expense Form Consolidation**: Edit modal now uses shared ExpenseForm component
  - Removed ~600 lines of duplicate code from ExpenseList.jsx
  - Added property-based tests for edit modal behavior
  - Created spec documentation for the consolidation

### Added
- **GitHub Actions CI/CD Spec**: Created specification for automated testing workflows
  - Parallel backend (Jest) and frontend (Vitest) test execution
  - Performance test exclusion for CI environments
  - Documentation for future Docker build integration

### Removed
- Deprecated CSV import utilities (xls_to_csv.py, validate_csv.py)
- Old integration test scripts
- Stale database backup files from config directory

---

## [4.15.3] - 2026-01-21

### Fixed
- **Allocation Display in Edit Modal**: Fixed allocation display when editing medical expenses with multiple people
  - The edit modal in ExpenseList now shows current allocation amounts for each person
  - Added "Edit" button to open PersonAllocationModal for modifying allocations
  - Passes insurance-related props (insuranceEligible, originalCost) to PersonAllocationModal
  - Fixed person ID handling to support both `id` and `personId` formats

---

## [4.15.2] - 2026-01-21

### Fixed
- **Insurance Indicator Display Bug**: Fixed "0" showing for non-insurance-eligible medical expenses
  - The issue was caused by JavaScript short-circuit evaluation rendering the number `0` as text
  - Changed condition from `expense.insurance_eligible &&` to `expense.insurance_eligible === 1 &&`
  - Affects migrated expenses where `insurance_eligible` defaults to `0`

---

## [4.15.1] - 2026-01-21

### Fixed
- **Allocation Display in Edit Mode**: When editing a medical expense with multiple people, allocations are now visible
  - Shows current allocation amounts for each person
  - Added "Edit" button to modify allocations
  - PersonAllocationModal now pre-populates with existing amounts instead of starting at zero
  - For insurance-eligible expenses, shows both original cost and out-of-pocket allocations

---

## [4.15.0] - 2026-01-21

### Added
- **Medical Insurance Tracking**: Track insurance eligibility, claim status, and reimbursements for medical expenses
  - Insurance eligibility checkbox on medical expense form
  - Original cost tracking with automatic out-of-pocket calculation
  - Claim status workflow: not_claimed → in_progress → paid/denied
  - Quick status update dropdown in expense list and tax deductible view
  - Visual status indicators with color coding
  - Insurance summary in Tax Deductible view with totals by status
  - Person-level insurance tracking with original cost and out-of-pocket amounts
  - Claim status filtering in expense list and tax deductible view
- **Database Migration**: Added insurance fields to expenses and expense_people tables
  - `insurance_eligible`, `claim_status`, `original_cost` columns on expenses
  - `original_amount` column on expense_people for per-person tracking
- **Property-Based Tests**: Comprehensive PBT coverage for insurance functionality

### Fixed
- Minor CSS improvements for insurance checkbox styling in expense form

---

## [4.14.10] - 2026-01-19

### Fixed
- **Floating Add Button Stacking Context**: Moved FloatingAddButton from ExpenseList to App.jsx
  - Button was trapped in `.content-left` stacking context due to `isolation: isolate`
  - Now renders outside content-layout, properly appearing above all page content

---

## [4.14.9] - 2026-01-19

### Fixed
- **Floating Add Button Z-Index**: Fixed floating add expense button appearing under the monthly summary panel
  - Changed z-index from `--z-dropdown` (100) to `--z-fixed` (300)
  - Button now correctly appears above the sticky summary panel

---

## [4.14.8] - 2026-01-19

### Added
- **Database Statistics in Settings**: Added database stats display in Settings → About tab
  - Shows total expense count, invoice count, database size
  - Shows invoice storage size and backup storage size
- **Condensed Changelog**: Replaced detailed changelog with major version summaries for better readability

---

## [4.14.7] - 2026-01-19

### Added
- **Backend Test Coverage Improvements**: Added 145 new tests covering critical gaps
  - `loanBalanceRepository.test.js` (20 tests) - CRUD, upsert, getBalanceHistory, getTotalDebtOverTime
  - `loanRepository.test.js` (17 tests) - CRUD, markPaidOff, getCurrentBalance, getAllWithCurrentBalances
  - `investmentRepository.test.js` (24 tests) - CRUD, getCurrentValue, getAllWithCurrentValues
  - `loanService.test.js` (32 tests) - validation, CRUD, calculateTotalOutstandingDebt
  - `investmentService.test.js` (29 tests) - validation, CRUD, calculateTotalInvestmentValue
  - `categorySuggestionService.test.js` (23 tests) - getSuggestedCategory, getCategoryBreakdown

### Fixed
- **Test Database Schema**: Fixed missing `estimated_months_left` column in test database loans table
- **Backup Service Tests**: Fixed `getDatabase()` to properly use test database when `SKIP_TEST_DB` is not set
  - Tests that set `SKIP_TEST_DB=true` now correctly use production database for file-based operations
  - Tests without `SKIP_TEST_DB` correctly use in-memory test database

---

## [4.14.6] - 2026-01-19

### Fixed
- **Single-Person Invoice Auto-Link**: Fixed invoice person dropdown for single-person medical expenses
  - When a medical expense has exactly one person assigned, invoices now auto-link to that person
  - Removed unnecessary "No person" dropdown option for single-person expenses
  - Shows static person name badge instead of dropdown for cleaner UX

### Added
- **Retroactive Invoice Migration**: Added database migration to link existing invoices
  - Automatically links unlinked invoices to the single assigned person on container startup
  - Applies to all existing medical expenses with exactly one person assigned

---

## [4.14.5] - 2026-01-18

### Fixed
- **Invoice PDF Viewer Portal**: Fixed invoice viewer appearing under monthly summary panel
  - Used React Portal (`createPortal`) to render modal at document body level
  - Modal now renders outside of any stacking context, ensuring it always appears on top
  - This is the proper solution for modals that need to escape parent stacking contexts

---

## [4.14.4] - 2026-01-18

### Fixed
- **Z-Index Standardization**: Standardized z-index values across all frontend CSS files
  - Added CSS variable fallbacks to all modal overlays (e.g., `var(--z-modal, 500)`)
  - Fixed hardcoded z-index values in FloatingAddButton, PeopleManagementModal, BackupSettings
  - Ensures consistent stacking behavior even if CSS variables fail to load
  - Updated 12 CSS files to use design system z-index scale with fallbacks

---

## [4.14.3] - 2026-01-18

### Fixed
- **Invoice PDF Viewer Stacking Context**: Fixed invoice viewer still appearing under summary panel
  - Removed competing stacking context from `.content-right` (summary panel container)
  - Invoice PDF viewer modal now properly overlays all page content

---

## [4.14.2] - 2026-01-18

### Fixed
- **Invoice PDF Viewer Z-Index**: Fixed invoice viewer modal appearing under sticky summary panel
  - Increased z-index for invoice PDF viewer overlay to use `--z-popover` (600)
  - Invoice viewer now properly appears above all page content including sticky elements

---

## [4.14.1] - 2026-01-18

### Fixed
- **Modal Z-Index Bleed-Through**: Fixed sticky table headers appearing above modal overlays
  - Added stacking context isolation to `.table-wrapper`, `.content-left`, and `.content-right`
  - Modal dialogs now properly cover all page content including sticky elements

### Changed
- **Project Cleanup**: Archived completed specs and outdated documentation
  - Moved 3 completed specs to archive (invoice-backup-enhancement, multi-invoice-support, ui-modernization)
  - Archived older deployment docs (pre-v4.10.0)
  - Cleaned up one-time backend scripts to archive subfolder

---

## [4.14.0] - 2026-01-18

### Added
- **UI Modernization**: Comprehensive design system overhaul with modern styling
  - New CSS variables-based design system in `frontend/src/styles/variables.css`
  - Consistent color palette, typography, spacing, and shadows across all components
  - Enhanced responsive breakpoints for mobile, tablet, and desktop
  - Improved accessibility with `prefers-reduced-motion` support throughout
  - Modern card-based layouts with subtle shadows and hover effects
  - Compact expense table rows for better data density
  - Bold text styling for tax-deductible expenses (medical and donation) for improved readability
  - Wider filter dropdowns to prevent text truncation
  - Property-based tests for CSS consistency validation

### Changed
- Migrated all component styles to use CSS custom properties (variables)
- Improved visual hierarchy with consistent heading sizes and spacing
- Enhanced button and form input styling with focus states
- Updated modal and overlay styling for better UX

---

## [4.13.2] - 2026-01-17

### Added
- **Donation Invoice Support**: Extended invoice attachment functionality to donation expenses
  - Tax - Donation expenses can now have PDF invoices attached (receipts, tax letters)
  - Invoice upload available when creating or editing donation expenses
  - Donation invoices displayed in Tax Deductible view with same filtering options as medical
  - Invoice indicators shown for both medical and donation expenses in expense lists

### Changed
- **Documentation Renamed**: `MEDICAL_EXPENSE_INVOICES.md` → `TAX_DEDUCTIBLE_INVOICES.md`
  - Updated all documentation to reflect support for both medical and donation invoices
  - Updated API documentation with new error messages
  - Updated spec files to reference tax-deductible expenses instead of medical-only

---

## [4.13.1] - 2026-01-17

### Added
- **Donation Invoice Support**: Extended invoice attachment functionality to donation expenses
  - Tax - Donation expenses can now have PDF invoices attached (receipts, tax letters)
  - Invoice upload available when creating or editing donation expenses
  - Donation invoices displayed in Tax Deductible view with same filtering options as medical

### Fixed
- **Merchant Analytics Chart Order**: Fixed chart to display time from oldest to newest (left to right)
  - Previously showed newest to oldest which was counterintuitive

### Changed
- **Invoice Backup Enhancement**: Backups now include invoice files in tar.gz archives
  - Full backup includes all invoice PDFs alongside database
  - Restore process handles invoice files automatically

---

## [4.13.0] - 2026-01-17

### Added
- **Improved Multi-Invoice Upload UX**: Enhanced invoice management for medical expenses
  - **Multi-file upload during expense creation**: Select multiple invoice files at once when creating a new medical expense
  - **Person selection per invoice**: Each uploaded invoice can be linked to a specific person during expense creation
  - **Person dropdown in invoice list**: Change person links on existing invoices directly from the invoice list
  - **Streamlined workflow**: Create expense → assign people → add invoices with person selection → save all at once
  - **Visual improvements**: Inline person dropdowns with clear styling for invoice-person associations

---

## [4.12.11] - 2026-01-17

### Fixed
- **Logging Level Filtering**: Fixed DEBUG logs appearing when LOG_LEVEL is set to INFO
  - Logger now evaluates log level dynamically instead of caching at module load time
  - Resolves timing issues with environment variable availability during module initialization
- **Verbose Log Cleanup**: Changed verbose INFO logs to DEBUG level for cleaner production logs
  - Invoice upload request details (user agent, IP, content length) now DEBUG
  - Invoice API operation details (upload, delete, replace) now DEBUG
  - Storage initialization details now DEBUG
  - Operational logs (successful uploads, deletions) remain at INFO level

---

## [4.12.10] - 2026-01-17

### Fixed
- **Invoice Indicator Color**: Fixed invoice indicator icon not showing green when invoice is attached
  - Replaced emoji icons (📄/📋) with SVG icons that properly inherit CSS color
  - Invoice indicator now displays green when an invoice is attached
  - Tooltip with filename and metadata continues to work correctly

---

## [4.12.9] - 2026-01-17

### Fixed
- **Invoice Indicator**: Fixed invoice indicator not showing green after uploading an invoice
  - Removed duplicate `onExpenseAdded` call that was overwriting the `hasInvoice` flag
  - Added fallback to check `expense.hasInvoice` property in addition to metadata map
  - Invoice indicator now correctly shows green immediately after upload

---

## [4.12.8] - 2026-01-17

### Fixed
- **PDF Viewer**: Replaced react-pdf library with native browser iframe rendering for improved reliability
  - PDF viewing now uses browser's built-in PDF renderer instead of PDF.js
  - Eliminates PDF.js worker configuration issues and CDN dependencies
  - More consistent rendering across different browsers
  - Simplified codebase with fewer external dependencies
  - Zoom controls still available via CSS transform

---

## [4.12.7] - 2026-01-17

### Fixed
- **Invoice Storage Path Detection**: Fixed containerized environment detection for invoice storage
  - Added `/config/invoices` and `/config/invoices/temp` directories to Dockerfile initialization
  - Added path detection logging to help diagnose environment issues
  - Ensures invoice files are stored in the correct mounted volume location

---

## [4.12.6] - 2026-01-17

### Fixed
- **Invoice Download Filename**: Fixed double `.pdf` extension when downloading invoices
  - Download now correctly handles filenames that already have `.pdf` extension
- **PDF Viewer**: Improved PDF viewer error handling and reliability
  - Changed PDF.js worker CDN from unpkg to cdnjs for better reliability
  - Added more specific error messages for different PDF loading failures
  - Added validation for empty file responses
  - Better handling of server error responses

---

## [4.12.5] - 2026-01-17

### Fixed
- **Invoice Storage Path**: Fixed critical bug where invoice files were stored in wrong directory in Docker
  - Invoice files were being written to `/app/config/invoices` instead of `/config/invoices`
  - Files were not persisting because `/app/config` is not mounted as a Docker volume
  - Updated `fileStorage.js` to use centralized path configuration from `paths.js`
  - Updated `uploadMiddleware.js` to use centralized path configuration
  - Added `invoices` and `invoices/temp` directories to `ensureDirectories()` function
  - Added `getInvoicesPath()` helper function to `paths.js`
  - Invoice files now correctly persist in the mounted `/config/invoices` directory

---

## [4.12.4] - 2026-01-17

### Fixed
- **Invoice Upload**: Fixed invoice indicator not updating after upload
  - ExpenseForm now properly notifies parent component when invoice is uploaded
  - Invoice indicator color changes immediately from amber to green after successful upload
- **Invoice Viewing**: Fixed "Failed to load invoice" error after upload
  - Verified file path construction is correct
  - Invoice files are now properly accessible after upload
- **Logging**: Removed excessive debug logs from invoice system
  - Cleaned up debug logs from invoiceService, fileStorage, fileValidation, uploadMiddleware
  - Removed debug logs from invoice controller
  - Production logs are now clean with LOG_LEVEL=info

---

## [4.12.3] - 2026-01-16

### Fixed
- **Invoice Upload**: Fixed EXDEV cross-device link error in Docker environments
  - Replaced `fs.rename()` with `fs.copyFile()` + `fs.unlink()` in file storage utility
  - Handles cross-device moves between Docker volumes correctly
  - Added cleanup of partial copies on error
  - Resolves "cross-device link not permitted" error when uploading invoices

---

## [4.12.2] - 2026-01-16

### Fixed
- **Merchant Analytics**: Fixed "Previous Year" period validation error
  - Added 'previousYear' to valid period options in merchant analytics controller
  - Backend service already supported this period, only validation was missing
- **Logging Cleanup**: Removed verbose debug logging from invoice feature
  - Removed debug logs for "no invoice found" cases (normal behavior)
  - Removed debug logs for routine invoice operations
  - Cleaned up console.warn from invoice API retry logic
  - Cleaner production logs with LOG_LEVEL=info

---

## [4.12.1] - 2026-01-16

### Changed
- **Invoice Indicator Improvements**: Enhanced visual differentiation for medical expense invoice status
  - Changed "no invoice" icon from 📄 to 📋 for better distinction
  - Updated "no invoice" color scheme to amber/yellow (warning color) instead of gray
  - Removed grayscale filter on "no invoice" icon for improved visibility
  - Now immediately obvious which medical expenses have invoices attached

---

## [4.12.0] - 2026-01-16

### Added
- **Medical Expense Invoice Attachments**: Comprehensive invoice management for medical expenses
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

---

## [4.11.2] - 2025-12-31

### Fixed
- Fixed floating add button to remain visible when navigating to future months
- Button visibility now based on current month expense count, not selected month
- Improved user experience for month navigation with consistent floating button behavior

---

## [4.11.1] - 2025-12-31

### Fixed
- Fixed floating add button disappearing when switching between months
- Improved component re-rendering reliability for month navigation
- Fixed JSX syntax issue in changelog display

---

## [4.11.0] - 2025-12-31

### Added
- **Sticky Summary Scrolling**: Enhanced UI with independent summary panel scrolling for improved usability when working with long expense lists
  - **Independent Summary Panel**: Summary panel now scrolls separately from expense list, allowing users to reference totals while reviewing expenses
  - **Floating Add Button**: Appears when >10 expenses exist, providing quick access to add expenses without scrolling to header
  - **Responsive Design**: Optimized for desktop, tablet, and mobile with appropriate sizing and positioning
  - **Enhanced Accessibility**: ARIA labels, keyboard navigation support, and screen reader compatibility
  - **Performance Optimizations**: Smooth scrolling behavior, scroll event isolation, and 60fps performance
  - **Visual Enhancements**: Custom scrollbar styling, hover effects, and smooth animations

---

## [4.10.0] - 2025-12-23

### Added
- **Budget Alert Notifications**: Proactive notification banners that appear at the top of the interface when approaching or exceeding budget limits
  - **Smart Alert Thresholds**: Warning alerts at 80-89% (yellow with ⚡ icon), Danger alerts at 90-99% (orange with ! icon), Critical alerts at ≥100% (red with ⚠ icon)
  - **Dismissible Alerts**: Temporarily hide alerts during your session with × button - alerts reappear on page refresh if budget condition persists
  - **Real-time Updates**: Alerts appear, update, or disappear immediately as you add, edit, or delete expenses
  - **Quick Budget Management**: Direct access to budget settings via "Manage Budgets" button and navigation to budget details via "View Details" link
  - **Multiple Alert Handling**: When multiple categories trigger alerts, displays most severe alert with count of affected categories
  - **Session-based Dismissal**: Dismissed alerts stay hidden during current session but reappear after refresh if conditions persist
  - **Performance Optimized**: Reuses existing budget calculations, debounced updates (300ms), alert display limit (5 maximum)
  - **Seamless Integration**: Leverages existing budget tracking infrastructure without replacing current functionality
  - **Comprehensive Testing**: 10 correctness properties with property-based testing (100+ iterations each) plus full integration test coverage

### Technical
- **Frontend Components**: New `BudgetAlertBanner` and `BudgetAlertManager` components with React.memo optimization
- **Alert Calculation**: Smart threshold detection with severity-based sorting and message generation
- **Error Handling**: Error boundaries, graceful degradation, and fallback UI for alert failures
- **Memory Management**: Session-based dismissal storage with sessionStorage fallback
- **Integration**: Connected to existing budget refresh patterns and expense operation handlers
- **No Backend Changes**: Feature entirely frontend-based, leveraging existing budget API endpoints

---

## [4.9.1] - 2025-12-20

### Fixed
- **Fixed Expenses Integration Bug Fix**: Resolved critical calculation errors in merchant analytics when including fixed expenses
  - Fixed incorrect total spending calculations that were double-counting or miscalculating amounts
  - Fixed incorrect visit count calculations that were improperly aggregating data from different sources
  - Eliminated "total" entries appearing in merchant list due to empty/whitespace merchant names
  - Improved data filtering with proper TRIM() conditions to prevent invalid entries
  - Completely rewrote data combination logic to properly merge expenses and fixed expenses
  - Added missing `includeFixedExpenses` parameter to `getMerchantExpenses` API function
  - Enhanced error handling and data validation throughout the merchant analytics pipeline

### Technical Details
- Rewrote `getMerchantAnalytics` method in `expenseRepository.js` to use separate queries and JavaScript-based data combination
- Added new `getCombinedMerchantAnalytics` helper method for proper data merging
- Fixed SQL queries to handle different time granularities (daily expenses vs monthly fixed expenses)
- Improved merchant name validation to prevent empty/whitespace entries

---

## [4.9.0] - 2025-12-20

### Added
- **Fixed Expenses Integration in Merchant Analytics**: Enhanced merchant analytics to optionally include fixed expenses alongside variable expenses
  - Added "Include Fixed Expenses" checkbox in Merchant Analytics modal for comprehensive spending analysis
  - Fixed expenses (rent, utilities, subscriptions) can now be included in merchant rankings and detailed statistics
  - Combined view shows total spending across both variable and recurring expenses for complete financial insights
  - Maintains backward compatibility with existing analytics while providing enhanced visibility into total merchant spending

---

## [4.8.0] - 2025-12-19

### Changed
- **Improved Merchant Analytics Navigation**: Moved merchant analytics button from summary panel to top navigation menu
  - Enhanced accessibility and prominence of merchant analytics feature
  - Added distinctive pink/magenta styling for merchant analytics button
  - Better integration with other primary navigation options (Annual Summary, Income Tax, Manage Budgets, Budget History)
  - Improved user experience by making merchant analytics more discoverable

---

## [4.7.0] - 2025-12-16

### Added
- **Merchant Analytics**: Comprehensive spending analysis by merchant/place with detailed insights
  - Merchant Analytics modal accessible via "🏪 Merchant Analytics" button in main navigation
  - Top merchants ranking with three sort options: total spending, visit frequency, or average spend per visit
  - Time period filtering: All Time, This Year, This Month, Last 3 Months for flexible analysis
  - Detailed merchant statistics including total spend, visit count, average spend, and percentage of total expenses
  - Monthly spending trend charts showing 12-month patterns with month-over-month change percentages
  - Category breakdown analysis showing which expense types are most common at each merchant
  - Payment method analysis revealing preferred payment methods per merchant
  - Visit frequency insights with average days between visits calculation for shopping habit analysis
  - First and last visit date tracking providing complete shopping history timeline
  - Drill-down functionality to view complete expense list filtered by specific merchant
  - Backend API endpoints: `/api/analytics/merchants` with comprehensive query parameter support
  - Property-based testing with 10 correctness properties and 100+ test iterations each
  - Full integration test coverage ensuring reliable merchant analytics functionality

---

## [4.6.3] - 2025-12-15

### Fixed
- **Loan Reminders**: Fixed reminders to exclude loans that start in the future
  - Loans with a start_date after the current month no longer trigger balance update reminders
  - Only loans that have already started are included in reminder calculations

---

## [4.6.2] - 2025-12-15

### Fixed
- **Tax Deductible Edit Form**: Fixed "payment method is required" error when editing expenses
  - Added missing `method` and `week` fields to tax deductible expense query
  - Replaced quick assign dropdown with full edit modal supporting multiple person selection
  - Edit modal now matches ExpenseList functionality with all fields and person allocation
- **Person Grouping**: Fixed to only include medical expenses
  - Person grouping now correctly excludes donations from totals and lists
  - Unassigned section now only shows medical expenses without person assignments

---

## [4.6.1] - 2025-12-15

### Changed
- **Multi-Person Medical Expense Display**: Improved vertical stacking layout
  - Each person now displayed on separate line with name and allocation amount
  - Consistent font size and weight between single and multi-person displays
  - Better visual hierarchy with left border indicator for person list

---

## [4.6.0] - 2025-12-14

### Added
- **Medical Expense People Tracking**: Associate medical expenses with specific family members for detailed tax reporting
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

### Technical
- **Database Schema**: Added `people` and `expense_people` tables
  - `people` table stores family member information (name, date of birth)
  - `expense_people` junction table links expenses to people with amounts
  - CASCADE DELETE ensures data integrity when people or expenses are removed
  - UNIQUE constraint on (expense_id, person_id) prevents duplicate associations
- **API Endpoints**: New people management endpoints
  - `GET /api/people` - Get all people
  - `POST /api/people` - Create a new person
  - `PUT /api/people/:id` - Update a person
  - `DELETE /api/people/:id` - Delete a person (cascades to associations)
- **Enhanced Expense Endpoints**: Support for people associations
  - Expense creation/update accepts optional `people` array with allocations
  - Tax deductible endpoint supports person grouping
- **Property-Based Testing**: 13 correctness properties with 100+ iterations each
  - Person data round-trip, deletion cascade, amount allocation validation
  - Person-grouped aggregation, backward compatibility, assignment workflow
- **Frontend Components**: New and enhanced components
  - `PeopleManagementModal` for managing family members
  - `PersonAllocationModal` for splitting expenses across people
  - Enhanced `ExpenseForm` with people selection for medical expenses
  - Enhanced `TaxDeductible` with person-grouped view
  - Visual indicators in `ExpenseList` for people assignments

### Documentation
- Added comprehensive feature documentation in `docs/features/MEDICAL_EXPENSE_PEOPLE_TRACKING.md`
- Updated README.md with feature overview and usage instructions
- Added database schema documentation for new tables
- Added API endpoint documentation for people management

---

## [4.5.1] - 2025-12-06

### Added
- **Reminder Item Highlighting**: Enhanced Monthly Data Reminders to highlight specific items needing updates
  - Orange highlighting with warning badge for investments/loans missing data
  - "⚠️ Update Needed" badge with pulsing animation draws attention to items
  - Clicking reminder banner opens modal with highlighted items
  - Clear visual distinction between items with complete vs missing data
  - Consistent highlighting pattern for both investments and loans
  - Tooltips explain what data is missing
  - Highlighting automatically disappears after data is added

### Changed
- InvestmentsModal now accepts `highlightIds` prop to highlight specific investments
- LoansModal now accepts `highlightIds` prop to highlight specific loans
- SummaryPanel extracts IDs of items needing updates from reminder status
- Enhanced user experience: users can immediately see which items need attention

### Technical
- Added `.needs-update` CSS class with orange color scheme (#ff9800)
- Added `.needs-update-badge` with pulsing animation
- Enhanced SummaryPanel to pass highlight IDs to modals
- No backend changes required (API already returned necessary data)
- No database changes required

---

## [4.5.0] - 2025-12-06

### Added
- **Monthly Data Reminders**: Visual notification banners to prompt users to update investment values and loan balances
  - Investment value reminder when data is missing for current month
  - Loan balance reminder when data is missing for current month
  - Shows count of items needing updates
  - Includes current month name in reminder message
  - Clickable banners open relevant modals (Investments or Loans)
  - Dismissible reminders (session-based, reappear on refresh if data still missing)
  - Subtle visual design with warning colors and clear icons (💡 for investments, 💳 for loans)
  - Multiple reminders stack vertically when both types are needed
  - Backend API endpoint: `GET /api/reminders/status/:year/:month`
  - Comprehensive property-based testing (100+ iterations per property)
  - Full integration test coverage for reminder flow

### Technical
- Added `reminderService.js` with logic to detect missing investment values and loan balances
- Added `reminderController.js` with `/api/reminders/status/:year/:month` endpoint
- Created `DataReminderBanner` component with dismiss and click functionality
- Enhanced `SummaryPanel` to fetch and display reminders for current month
- Property-based tests validate reminder detection accuracy across all scenarios
- Integration tests confirm complete reminder workflow from API to UI

---

## [4.4.7] - 2025-12-06

### Added
- **Net Worth Tracking**: Display net worth (assets minus liabilities) in monthly and annual summaries
  - Net Worth card in Monthly Summary Panel showing current month position
  - Net Worth card in Annual Summary showing year-end position
  - Calculates as: Total Investment Value - Total Outstanding Debt
  - Color-coded display (green for positive, red for negative)
  - Assets and Liabilities breakdown with detailed values
  - Comprehensive property-based testing for calculation accuracy
  - Integration tests for UI rendering and data flow

### Fixed
- **Test Suite**: Fixed all test failures across frontend and backend
  - 299 frontend tests passing (26 test files)
  - All backend tests passing
  - Updated tests to match new UI structure for annual summary
  - Fixed loading state tests in SummaryPanel
  - Corrected invalid category names in backend integration tests

---

## [4.4.6] - 2025-12-03

### Improved
- **Monthly Summary Layout**: Reordered summary cards for better financial flow
  - New order: Monthly Income → Fixed Expenses → Variable Expenses → Balance
  - Follows natural income-to-expenses-to-balance progression
  - Makes financial overview more intuitive at a glance

---

## [4.4.5] - 2025-12-03

### Improved
- **Annual Summary Layout**: Reordered summary cards for better financial flow
  - New order: Total Income → Fixed Expenses → Variable Expenses → Balance
  - Follows natural income-to-expenses-to-balance progression
  - Makes financial overview more intuitive at a glance

---

## [4.4.4] - 2025-12-03

### Fixed
- **Weekly Breakdown Display**: Fixed weekly breakdown showing "Week week1" instead of "Week 1"
  - Updated SummaryPanel component to strip "week" prefix from display
  - Frontend rebuild required

---

## [4.4.3] - 2025-12-03

### Fixed
- **Expense List Refresh**: Fixed expense list not automatically updating after adding a new expense in monthly view
  - Improved date parsing to avoid timezone issues
  - Expense now appears immediately in the list after submission
  - Works correctly in both monthly and global view modes

### Technical
- Changed date parsing from `new Date()` to direct string splitting to avoid timezone shifts
- Frontend rebuild required

---

## [4.4.2] - 2025-12-03

### Fixed
- **Trend Indicators**: Fixed missing trend arrows in monthly summary collapsible sections
  - Trend arrows now appear in Weekly Breakdown section
  - Trend arrows now appear in Payment Methods section
  - Trend arrows now appear in Expense Types section
  - Arrows show month-over-month changes with percentage tooltips
  - Red up arrows (▲) for increases, green down arrows (▼) for decreases

### Technical
- Added TrendIndicator component import to SummaryPanel
- Connected previousSummary data to all three collapsible sections
- Frontend rebuild required

---

## [4.4.1] - 2025-12-03

### Fixed
- **Clear Filters Button**: Fixed "Clear Filters" button not appearing on first global search
  - SearchBar now accepts searchText as a prop from parent component
  - Both SearchBar instances (left and right) now sync search text state
  - Clear Filters button appears immediately when search text is entered
  - Improved user experience for global filtering

### Technical
- Updated SearchBar component to accept and sync external searchText prop
- Added useEffect to sync local state with external prop changes
- Both SearchBar instances in App.jsx now receive searchText prop

---

## [4.4.0] - 2025-12-03

### Added
- **Investment Tracking**: Track investment portfolio performance with TFSA and RRSP accounts
  - Create and manage multiple investments (TFSA and RRSP types)
  - Record monthly investment values with historical tracking
  - View investment performance with line graphs showing value changes over time
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

- **Income Source Categories**: Categorize income sources for better financial analysis
  - Added category field to income sources (Salary, Government, Gifts, Other)
  - Income Management Modal displays category badges with color coding
  - Monthly income breakdown by category in Income Management Modal
  - Annual Summary shows "Income by Category" section with totals and percentages
  - Category preserved when carrying forward income sources from previous month
  - New API endpoint: `GET /api/income/annual/:year/by-category` for annual category breakdown
  - Automatic database migration adds category column with default "Other"
  - Comprehensive test coverage (38 tests) for all income category functionality

### Changed
- **Logging Improvements**: Replaced all console statements in production code with centralized logger module
  - Updated `backend/services/budgetService.js` to use logger
  - Updated `backend/services/backupService.js` to use logger (9 statements)
  - Added configurable log levels via `LOG_LEVEL` environment variable (debug, info, warn, error)
  - Created logging best practices documentation in `.kiro/steering/logging-best-practices.md`
- Income sources now include category in all CRUD operations
- Income Management Modal enhanced with category selectors and breakdown display
- Annual Summary enhanced with income category visualization
- Backend validation ensures category is one of: Salary, Government, Gifts, Other

### Fixed
- Improved logging consistency across backend services
- Better production logging with appropriate log levels

### Documentation
- Added comprehensive codebase audit report (`CODEBASE_AUDIT_REPORT_2025-12-03.md`)
- Added logging improvements summary (`LOGGING_IMPROVEMENTS_COMPLETE.md`)
- Added comprehensive audit completion report (`COMPREHENSIVE_AUDIT_COMPLETE_2025-12-03.md`)
- Created logging best practices steering rule

### Technical
- **Database Migrations**: 
  - `migrateAddIncomeCategoryColumn()` adds category column to income_sources table
  - `migrateAddInvestmentTables()` adds investments and investment_values tables
- **API Updates**: 
  - Income endpoints now accept and return category field
  - New investment and investment value endpoints
- **Frontend Components**: 
  - Enhanced IncomeManagementModal and AnnualSummary with category support
  - New InvestmentsModal, InvestmentDetailView components
- **Validation**: Backend and frontend validation for income categories and investments
- **Test Coverage**: Comprehensive property-based and integration tests
- **Logging**: All production code now uses centralized logger module
- **Code Quality**: Codebase audit grade: A (production-ready)

---

## [4.3.2] - 2025-11-29

### Fixed
- **ExpenseList Filter Bug**: Fixed local filters incorrectly triggering global view mode
  - ExpenseList now uses independent local filter state (localFilterType, localFilterMethod)
  - Monthly expense filters work correctly without switching to global view
  - Filter tooltips clarify scope (current month vs global)
  - Added 8 comprehensive tests to prevent regression
- **SummaryPanel Crash**: Fixed application crash when methodTotals is undefined
  - Added optional chaining (?.methodTotals?.Cash || 0) to prevent crashes
  - Enhanced error handling in payment method summary display
  - Improved stability when viewing months with incomplete data

### Technical
- Created `frontend/src/components/ExpenseList.localFilters.test.jsx` with 8 test cases
- Updated ExpenseList component with local filter state management
- Enhanced SummaryPanel with defensive programming patterns
- Documentation: Created `EXPENSELIST_FILTER_FIX.md` with detailed fix analysis

---

## [4.3.1] - 2025-11-29

### Changed
- **UI Improvements**: Enhanced filter layout and alignment
  - Improved filter dropdown alignment with monthly summary panel
  - Reduced gap between filter dropdowns from 8px to 5px for tighter spacing
  - Filters now expand to fill available width for better visual balance
  - Search bar and filters now have consistent vertical sizing

### Technical
- Updated SearchBar.css with optimized spacing and sizing
- No functional changes, purely visual improvements

---

## [4.3.0] - 2025-11-29

### Added
- **Global Expense Filtering**: Search and filter expenses across all time periods
  - Added category filter dropdown in SearchBar (filters across all 17 expense categories)
  - Added payment method filter dropdown in SearchBar (filters across all 7 payment methods)
  - Combined text search with category and payment method filters using AND logic
  - Automatic switch to global view when any filter is active
  - Clear all filters button to reset and return to monthly view
  - Filter state preservation across view transitions
  - Synchronized filters between SearchBar and ExpenseList components
  - Performance optimizations with memoization and debouncing
  - Full accessibility support with ARIA labels and keyboard navigation
  - Comprehensive test coverage (property-based, integration, accessibility, performance tests)

### Technical
- **No Database Changes**: Feature uses existing data structures
- **No API Changes**: Uses existing expense endpoints with query parameters
- **Frontend Updates**: Enhanced SearchBar and App components with filter logic
- **Test Coverage**: 12 test files covering all aspects of filtering functionality
- **Documentation**: Created comprehensive feature documentation in `docs/features/GLOBAL_EXPENSE_FILTERING.md`

---

## [4.2.3] - 2025-11-27

### Fixed
- **Category Field Flashing on Autocomplete**: Fixed issue where category field flashed when selecting a place from autocomplete dropdown
  - Added `justSelectedFromDropdownRef` to track dropdown selections
  - Prevented blur handler from running after dropdown selection
  - Eliminated race condition between dropdown click and blur event
  - Category now stays stable when selecting from autocomplete suggestions

### Technical
- No database changes required
- No API changes
- Frontend rebuild required
- Fully backward compatible

---

## [4.2.2] - 2025-11-27

### Fixed
- **Category Field Flashing**: Fixed issue where category field briefly flashed suggested value before reverting to "Other" when adding expenses
  - Added `isSubmittingRef` to track form submission state
  - Prevented blur handler from executing during form submission
  - Eliminated race condition between form reset and category suggestion

### Technical
- No database changes required
- No API changes
- Frontend rebuild required
- Fully backward compatible

---

## [4.2.1] - 2025-11-27

### Changed
- **Code Quality**: Centralized API endpoint configuration across frontend
  - Added 11 new endpoints to `frontend/src/config.js` (Income, Backup, Import, Version APIs)
  - Updated `incomeApi.js`, `BackupSettings.jsx`, and `App.jsx` to use centralized `API_ENDPOINTS`
  - Eliminated hardcoded API paths for better maintainability
- **Code Quality**: Eliminated code duplication in SummaryPanel component
  - Created reusable `fetchSummaryData` and `processSummaryData` functions
  - Reduced ~120 lines of duplicated fetch logic to ~30 lines
  - Improved performance with proper React memoization

### Technical
- No database changes required
- No API changes
- Frontend rebuild required
- Fully backward compatible
- See `CODE_AUDIT_REPORT_2025-11-27.md` for detailed analysis

---

## [4.2.0] - 2025-11-25

### Added
- **Enhanced Fixed Expenses**: Category and payment type tracking for fixed monthly expenses
  - Added category field to fixed expenses (Housing, Utilities, Subscriptions, Insurance, etc.)
  - Added payment_type field (Credit Card, Debit Card, Cash, Cheque, E-Transfer)
  - Improved UI with dropdown selectors for better organization
  - Automatic database migration with backward compatibility
  - Existing fixed expenses get default values (category: "Other", payment_type: "Credit Card")
  - Comprehensive test coverage with unit, property-based, and integration tests

### Technical
- **Database Migration**: `migrateEnhanceFixedExpenses()` adds category and payment_type columns
- **API Updates**: Fixed expense endpoints now accept and return category and payment_type
- **Validation**: Backend and frontend validation for category and payment type fields
- **Documentation**: Created comprehensive feature documentation in `docs/features/ENHANCED_FIXED_EXPENSES.md`
- **Test Coverage**: 7 test files covering repository, service, and integration layers

---

## [4.1.0] - 2025-11-24

### Added
- **Personal Care Category**: New expense category for personal grooming and hygiene
  - Added "Personal Care" to expense categories (haircuts, cosmetics, toiletries, spa services)
  - Personal Care is budgetable and appears in all summaries and reports
  - Automatic database migration updates constraints on startup
  - CSV import/export fully supports Personal Care expenses
  - Comprehensive property-based tests validate all functionality
  - Integration tests confirm feature works across all application layers

### Technical
- **Database Migration**: `migrateAddPersonalCareCategory()` updates expenses and budgets tables
- **Category Validation**: Updated category arrays in `backend/utils/categories.js`
- **CSV Scripts**: Updated `validate_csv.py` and `xls_to_csv.py` to accept Personal Care
- **Test Coverage**: 7 property-based tests + 9 integration tests (100% pass rate)

---

## [4.0.3] - 2025-11-24

### Fixed
- **Database Migrations**: Added automatic migration to fix category constraints
  - New migration ensures "Gifts" category is included in database CHECK constraints
  - Migration runs automatically on container startup
  - Detects and fixes databases with incomplete category constraints
  - Creates automatic backup before applying fixes

### Added
- **Migration Documentation**: Created comprehensive database migration guide
  - Documents automatic migration system
  - Explains how migrations run on container startup
  - Provides troubleshooting steps for migration issues
- **Test Scripts**: Added verification scripts for database schema and migrations
  - `testGiftsCategory.js` - Validates Gifts category functionality
  - `simulateContainerStartup.js` - Shows migration flow
  - `checkSchema.js` - Verifies database constraints

---

## [4.0.2] - 2025-11-24

### Changed
- **Project Cleanup**: Archived historical documentation and test scripts
  - Moved 20 completion reports to archive/completion-reports/
  - Moved 15 test scripts to archive/test-scripts/
  - Moved 6 migration scripts to archive/migration-scripts/
  - Moved 4 spec summaries to archive/spec-summaries/
  - Removed 2 empty folders (uploads/, backups/)
  - Created comprehensive archive documentation
  - Total: 45 files archived for better project organization

---

## [4.0.1] - 2025-11-24

### Fixed
- **Annual Summary Charts**: Fixed white space issues in bar graphs
  - Converted mixed vertical/horizontal layout to consistent horizontal bars
  - Reduced bar segment min-height for better space utilization
  - Added conditional rendering to eliminate unnecessary white space

### Changed
- **Database Cleanup**: Standardized 58 expense categories based on place names
  - Automatically updated "Other" expenses to correct categories when place had established category
  - Improved data consistency across gas stations, medical expenses, and food places

---

## [4.0.0] - 2025-11-24

### Removed (BREAKING CHANGE)
- **Recurring Expenses Feature**: Removed recurring expense templates and automatic generation
  - Dropped `recurring_expenses` table from database
  - Removed `recurring_id` and `is_generated` columns from expenses table
  - Deleted all recurring expense UI components and forms
  - Removed recurring expense API endpoints
  - All previously generated expenses converted to regular expenses (no data loss)

### Migration
- Run `node backend/scripts/removeRecurringExpenses.js` to migrate existing databases
- Automatic backup created before migration
- All expense data preserved

### Recommendation
- Use **Fixed Expenses** feature for predictable monthly costs instead

---

## [3.8.1] - 2025-11-24

### Changed
- Updated product documentation to reflect 14 expense categories
- Updated expense trend indicators design document with current category structure
- Improved product overview with comprehensive category listing

---

## [3.8.0] - 2025-11-23

### Added
- **Place Name Standardization**: Data cleanup tool for inconsistent place names
  - Fuzzy matching algorithm identifies similar place name variations (e.g., "Walmart", "walmart", "Wal-Mart")
  - Intelligent grouping using Levenshtein distance and string normalization
  - Bulk update tool with preview before applying changes
  - Transaction-safe updates ensure data integrity (all-or-nothing updates)
  - Performance optimized for large datasets (10,000+ expense records)
  - Accessible from Settings → Misc tab
- **Similarity Analysis**: Comprehensive place name analysis
  - Groups similar names with variation counts
  - Suggests most frequent variation as canonical name
  - Allows custom canonical name entry
  - Shows total affected expense count per group
  - Sorts groups by frequency for prioritization
- **Preview & Confirmation Workflow**: Safe standardization process
  - Preview all changes before applying
  - Shows which variations will be updated to which canonical names
  - Displays total number of records to be modified
  - Cancel option at any stage without data changes
  - Success confirmation with update count

### Changed
- Settings modal now includes "Misc" tab for miscellaneous data management tools
- Expense lists automatically refresh after place name standardization
- Enhanced error handling for database operations

### Technical
- Added place name repository with transaction support
- Implemented fuzzy matching service with configurable similarity threshold (default 0.8)
- Created comprehensive test suite (63 tests) covering:
  - Levenshtein distance calculation
  - String normalization and similarity scoring
  - Grouping logic and edge cases
  - Transaction rollback on failure
  - Integration tests with real data
- Performance tested with 10,000+ records (analysis < 5s, updates < 10s)

---

## [3.7.0] - 2025-11-22

### Added
- **Budget Tracking & Alerts**: Comprehensive monthly budget management system
  - Set monthly budget limits for Food, Gas, and Other expense categories
  - Real-time progress bars with color-coded status indicators (green/yellow/orange/red)
  - Visual alerts at 80%, 90%, and 100% budget thresholds
  - Automatic budget carry-forward from previous month for seamless continuity
  - Manual budget copy from any previous month for flexibility
  - Overall budget summary showing total budgeted vs total spent
  - Budget status tracking (budgets on track vs total budgets)
- **Historical Budget Analysis**: Compare budget performance over time
  - View budget vs actual spending for 3, 6, or 12 month periods
  - Success rate calculation (percentage of months budget was met)
  - Average spending per category over selected period
  - Month-by-month breakdown with variance analysis
- **Real-Time Budget Updates**: Budgets automatically recalculate when:
  - Adding new expenses
  - Editing expense amounts or categories
  - Deleting expenses
  - Changing expense dates between months
- **Budget Management Interface**: User-friendly modal for budget configuration
  - Create, update, and delete budget limits
  - Copy budgets from previous months
  - Input validation (positive amounts only, budgetable categories only)
  - Confirmation messages and error handling

### Changed
- Summary panel now includes budget summary section with overall progress
- Month selector enhanced with "Manage Budgets" and "Budget History" buttons
- Expense operations now trigger budget recalculation for affected categories
- Backup system now includes budget data in all backups and restores

### Technical
- Added `budgets` table with constraints and indexes
  - UNIQUE constraint on (year, month, category)
  - CHECK constraints for positive limits and valid categories
  - Composite index on (year, month) for performance
  - Category index for category-specific queries
  - Automatic timestamp trigger for updated_at field
- Created comprehensive budget service layer:
  - `budgetService.js` with CRUD operations and progress calculations
  - Automatic carry-forward logic when accessing months without budgets
  - Manual budget copy with overwrite protection
  - Historical analysis with aggregation and success rate calculations
- Added budget API endpoints:
  - `GET /api/budgets` - Get budgets with auto-carry-forward
  - `POST /api/budgets` - Create budget
  - `PUT /api/budgets/:id` - Update budget
  - `DELETE /api/budgets/:id` - Delete budget
  - `GET /api/budgets/summary` - Overall budget summary
  - `GET /api/budgets/history` - Historical performance
  - `POST /api/budgets/copy` - Manual budget copy
- Created frontend components:
  - `BudgetManagementModal` - Budget configuration interface
  - `BudgetProgressBar` - Visual progress indicator with color coding
  - `BudgetCard` - Individual category budget display
  - `BudgetSummaryPanel` - Overall budget overview
  - `BudgetHistoryView` - Historical analysis interface
- Integrated budget recalculation hooks into expense service
- Property-based testing with fast-check library (100+ iterations per property):
  - 19 correctness properties covering all budget operations
  - Round-trip testing for storage, backup, and copy operations
  - Progress calculation accuracy verification
  - Automatic carry-forward validation
  - Real-time update verification
- Comprehensive unit and integration test coverage:
  - Repository layer tests for database operations
  - Service layer tests for business logic
  - Controller tests for API endpoints
  - Component tests for UI functionality
  - End-to-end integration tests for complete workflows

### Documentation
- Updated README.md with budget feature overview and usage instructions
- Created comprehensive Budget Management User Guide (`docs/guides/BUDGET_MANAGEMENT_GUIDE.md`)
- Added budget API endpoints to API documentation
- Updated database schema documentation with budgets table

### Breaking Changes
- None - This is a purely additive feature with no breaking changes

---

## [3.6.1] - 2025-11-19

### Fixed
- **Critical Bug**: Fixed application crash when viewing Annual Summary for years without expense or income data
  - Added proper empty state handling with user-friendly message
  - Fixed React Hooks Order violation that caused blank screens
  - Enhanced null checking throughout chart rendering logic
  - Added safety checks for empty arrays and undefined data

### Changed
- **Code Optimization**: Eliminated ~200 lines of duplicate CSS code
  - Created shared `charts.css` for common chart styling
  - Extracted duplicate styles from AnnualSummary and TaxDeductible components
  - Migrated to CSS variables for consistent theming
- **Performance Improvements**: Added memoization for expensive chart calculations
  - Implemented `useMemo` in AnnualSummary.jsx for chart data calculations
  - Implemented `useMemo` in TaxDeductible.jsx for chart data calculations
  - Reduced unnecessary re-renders and CPU usage

### Removed
- **GitHub Actions Workflow**: Removed unnecessary CI/CD workflow
  - Not needed for local Docker registry builds
  - PowerShell script (`build-and-push.ps1`) handles all build needs
  - Eliminates unwanted workflow triggers on git push

### Technical
- Created centralized chart styling system in `frontend/src/styles/charts.css`
- Improved component performance with React memoization hooks
- Better code maintainability with reduced duplication
- Simplified build process to use local tooling only

---

## [3.6.0] - 2025-11-19

### Added
- **Enhanced Annual Summary**: Comprehensive financial overview with income tracking
  - Total Income card showing income from all sources
  - Net Income card with color-coded surplus/deficit display
  - Fixed vs Variable expense breakdown in Total Expenses card
  - Horizontal stacked bar chart for monthly expense visualization
  - Legend showing Fixed (blue) and Variable (purple) expenses
  - Property-based testing for financial calculations (100+ test iterations)
  
### Changed
- Backend annual summary endpoint now includes:
  - `totalFixedExpenses` and `totalVariableExpenses` fields
  - `totalIncome` and `netIncome` calculations
  - Enhanced monthly breakdown with `fixedExpenses`, `variableExpenses`, and `income` per month
- Monthly breakdown chart changed from vertical bars to horizontal stacked bars matching tax deductible chart style

### Technical
- Added property-based tests using fast-check library
- Comprehensive test coverage for expense calculations and net income logic
- Integration tests for complete data flow from API to UI

---

## [3.5.0] - 2025-11-19

### Added
- **Expense Trend Indicators**: Visual month-over-month trend indicators on summary panel
  - Red upward arrows (▲) for increases
  - Green downward arrows (▼) for decreases
  - Tooltips showing percentage change on hover
  - 1% threshold filtering to reduce noise
  - Trend indicators for weekly totals, expense types, and payment methods
- **Place Autocomplete**: Smart autocomplete for the "Place" field in expense form
  - Fetches unique place names from existing expenses
  - Real-time filtering as you type
  - Click to select from dropdown suggestions
  - Case-insensitive matching

### Changed
- Enhanced backend summary endpoint to include previous month data for trend calculations
- Updated SummaryPanel to display trend indicators alongside all totals

### Technical
- Added `TrendIndicator` component with hover effects
- Added `trendCalculator` utility for percentage change calculations
- Added property-based tests using fast-check library
- Added `/api/expenses/places` endpoint for autocomplete data
- Enhanced CSS specificity for trend indicator colors

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

- **3.7.x**: Budget tracking and alerts with historical analysis
- **3.6.x**: Enhanced annual summary and expense trend indicators
- **3.5.x**: Expense trend indicators and place autocomplete
- **3.4.x**: Unified Docker container and containerization optimization
- **3.3.x**: Code quality and organization improvements
- **3.2.x**: Fixed expenses and multi-source income
- **3.1.x**: Recurring expenses and tax-deductible tracking
- **3.0.x**: Loans and lines of credit tracking
- **2.x.x**: CSV import/export and automated backups
- **1.x.x**: Core expense tracking functionality

---

## Upgrade Notes

### Upgrading to 3.7.0
- Database migration required
- New table: `budgets`
- Run migration script: `node backend/scripts/addBudgetsTable.js`
- Backup database before upgrading
- No breaking changes - fully backward compatible
- Budget data automatically included in backups

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
