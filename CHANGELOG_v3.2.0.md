# Changelog - Version 3.2.0

## [3.2.0] - 2024-11-15

### Added

#### Loan Type Feature
- **Loan Types**: Added support for "Loan" and "Line of Credit" types
  - Traditional loans (mortgages, car loans, etc.)
  - Lines of credit (credit cards, HELOCs, etc.)
- **Type Selector**: Dropdown in loan form with helpful hints
- **Conditional Display**: Different UI based on loan type
  - Traditional loans show paydown progress bar
  - Lines of credit show balance/rate chart
- **Smart Behavior**: Lines of credit with $0 balance remain active (not paid off)

#### Visual Analytics
- **Dual-Axis Chart**: Line graph for lines of credit showing:
  - Balance over time (blue solid line, left Y-axis)
  - Interest rate over time (red dashed line, right Y-axis)
  - Shaded area under balance line
  - Hover tooltips with exact values
  - Color-coded legend
- **Responsive Design**: Chart scales to show trends clearly

### Changed

#### UI Improvements
- **Loan Detail View**: 
  - Added loan type display in summary
  - Hide "Total Paid Down" for lines of credit (not applicable)
  - Conditional progress indicators based on type
- **Loans Modal**:
  - Simplified active/paid off filtering
  - All non-paid-off loans show in active tab
- **Form Enhancements**:
  - Added loan type selector with descriptions
  - Hint text explaining difference between types

#### Backend Improvements
- **Auto-Mark Logic**: Only auto-marks traditional loans as paid off when balance reaches zero
- **Validation**: Added loan type validation
- **Database**: Added loan_type column with CHECK constraint

### Fixed

#### Critical Bugs
- **Future Balance Display**: Fixed issue where future balance entries were showing in current month summary
  - Updated SQL query to filter by date properly
  - Only shows balances up to selected month
- **Zero Balance Lines of Credit**: Fixed incorrect "paid off" status
  - Lines of credit with $0 balance now remain active
  - Only explicitly marked loans show as paid off
- **Cascade Delete**: Enabled foreign keys in SQLite
  - Deleting a loan now properly deletes all balance entries
  - Maintains referential integrity
- **Balance Change Calculation**: Fixed calculation for reverse chronological display
  - Correctly shows changes between consecutive months
  - Handles first entry (no previous) properly

#### Minor Fixes
- **markPaidOff Return Value**: Now returns updated loan object instead of boolean
- **Filter Logic**: Simplified loan filtering in modal
- **Display Fallback**: Added fallback for loans without loan_type field

### Database

#### Schema Changes
```sql
ALTER TABLE loans 
ADD COLUMN loan_type TEXT NOT NULL DEFAULT 'loan' 
CHECK(loan_type IN ('loan', 'line_of_credit'))
```

#### Migration
- Automatic migration script: `backend/scripts/addLoanTypeColumn.js`
- Backup created before migration
- Existing loans defaulted to 'loan' type
- Foreign keys enabled for referential integrity

### Testing

#### New Tests
- Loan type creation and validation (6 tests)
- Line of credit zero balance behavior (4 tests)
- Future balance filtering (3 tests)
- Integration test suite expanded (33 tests total)

#### Test Results
- ✓ All 33 integration tests passing
- ✓ Loan type tests passing
- ✓ Zero balance tests passing
- ✓ Future balance tests passing

### Documentation

#### New Documentation
- `LOAN_TYPE_IMPLEMENTATION_COMPLETE.md` - Feature overview
- `backend/scripts/LOAN_TYPE_FEATURE_SUMMARY.md` - Technical details
- `backend/scripts/LINE_OF_CREDIT_ZERO_BALANCE_FIX.md` - Bug fix details
- `backend/scripts/FUTURE_BALANCE_BUG_FIX.md` - Bug fix details
- `DEPLOYMENT_v3.2.0.md` - Deployment guide
- `CHANGELOG_v3.2.0.md` - This file

### Performance
- No performance impact
- Chart rendering is efficient with SVG
- Database queries optimized with proper indexing

### Security
- No security changes
- Maintains existing security model

### Compatibility
- **Backward Compatible**: Yes
- **Database Migration**: Required (automatic)
- **Breaking Changes**: None

### Upgrade Path
From v3.1.1 to v3.2.0:
1. Backup database (automatic)
2. Run migration script (automatic on first run)
3. Build frontend
4. Restart backend
5. Verify deployment

### Known Limitations
- Chart requires balance history to display
- Maximum recommended data points: ~20 for optimal display
- Chart is view-only (no interactive editing)

### Future Enhancements
Potential improvements for future versions:
- Additional loan types (Credit Card, Student Loan, etc.)
- Export chart as image
- Comparison view for multiple loans
- Predictive balance projections
- Rate change alerts

---

**Full Changelog**: v3.1.1...v3.2.0
