# Investment Tracking Feature

**Version**: 4.4.0  
**Completed**: November 30, 2025  
**Spec**: `.kiro/specs/investment-tracking/`

## Overview

The Investment Tracking feature enables users to monitor their investment portfolio performance over time. Users can track multiple investments (TFSA and RRSP accounts), record monthly value updates, and view performance with visual indicators and charts.

## Key Features

### Investment Management
- **Create Investments**: Add TFSA or RRSP investment accounts with initial values
- **Edit Investments**: Update investment names and types
- **Delete Investments**: Remove investments (automatically deletes all value entries)
- **View All Investments**: See complete portfolio with current values

### Value Tracking
- **Monthly Values**: Record investment values at the end of each month
- **Historical Tracking**: Maintain complete value history for each investment
- **Upsert Logic**: Adding a value for an existing month updates the existing entry
- **Value Changes**: Automatic calculation of month-over-month changes
- **Percentage Changes**: Display percentage change from previous month

### Visual Indicators
- **Arrow Indicators**: 
  - ▲ Green arrow for value increases
  - ▼ Red arrow for value decreases
  - — Neutral indicator for no change
- **Color Coding**:
  - Green for positive changes
  - Red for negative changes
  - Neutral for no change
- **Line Graphs**: Visual charts showing investment performance over time

### Portfolio Overview
- **Total Portfolio Value**: Sum of all investment current values
- **Summary Integration**: Investments displayed in monthly summary panel
- **Current Values**: Most recent value entry shown as current value
- **Initial Value Fallback**: Shows initial value when no value entries exist

## User Interface

### Investments Modal
Access from the monthly summary panel by clicking the "📈 Investments" button.

**Features**:
- List of all investments with current values
- Add new investment button
- Edit and delete buttons for each investment
- View button to open investment detail view

### Investment Detail View
Detailed view for individual investments showing:

**Summary Card**:
- Investment name and type
- Initial value
- Current value
- Total change (current - initial)
- Percentage change

**Line Graph**:
- Visual chart showing value changes over time
- X-axis: Month/Year
- Y-axis: Value

**Value History Timeline**:
- Chronological list of all value entries (most recent first)
- Columns: Month/Year, Value, Change, % Change, Actions
- Arrow indicators and color coding for changes
- Edit and delete buttons for each entry

**Add Value Form**:
- Month/year picker
- Value input
- Validation (month 1-12, value >= 0)
- Upsert behavior (updates existing entry if month exists)

## Technical Implementation

### Database Schema

**investments table**:
```sql
CREATE TABLE investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
  initial_value REAL NOT NULL CHECK(initial_value >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**investment_values table**:
```sql
CREATE TABLE investment_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investment_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  value REAL NOT NULL CHECK(value >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
  UNIQUE(investment_id, year, month)
);
```

**Indexes**:
- `idx_investments_type` on investments(type)
- `idx_investment_values_investment_id` on investment_values(investment_id)
- `idx_investment_values_year_month` on investment_values(year, month)

### API Endpoints

**Investment Management**:
- `GET /api/investments` - Get all investments with current values
- `POST /api/investments` - Create a new investment
- `PUT /api/investments/:id` - Update investment details
- `DELETE /api/investments/:id` - Delete investment (cascades to values)

**Value Management**:
- `GET /api/investment-values/:investmentId` - Get value history
- `GET /api/investment-values/:investmentId/:year/:month` - Get specific value
- `POST /api/investment-values` - Create or update value (upsert)
- `PUT /api/investment-values/:id` - Update value entry
- `DELETE /api/investment-values/:id` - Delete value entry

**Summary Integration**:
- `GET /api/summary?year=X&month=Y` - Enhanced to include investment data

### Architecture

Follows the standard layered architecture:
- **Controllers**: HTTP request handling and validation
- **Services**: Business logic and calculations
- **Repositories**: Data access layer
- **Database**: SQLite with foreign key constraints

### Data Validation

**Investment Validation**:
- Name: Required, non-empty string
- Type: Must be 'TFSA' or 'RRSP' (enforced by CHECK constraint)
- Initial Value: Must be >= 0 (enforced by CHECK constraint)

**Value Entry Validation**:
- Investment ID: Must reference existing investment (foreign key)
- Year: Required integer
- Month: Required integer (application validates 1-12)
- Value: Must be >= 0 (enforced by CHECK constraint)
- Uniqueness: One value per investment per month (UNIQUE constraint)

## Testing

### Integration Testing
Comprehensive integration test suite with 100% success rate (24/24 tests):

**Test Coverage**:
1. Complete flow (create → add values → view)
2. Type validation (TFSA/RRSP only)
3. Cascade delete (investment deletion removes values)
4. Upsert logic (duplicate month/year updates existing)
5. Edge cases (no investments, no values, negative values, zero values)
6. Arrow indicators and color coding
7. Data integrity and foreign key constraints

**Test Script**: `backend/scripts/testInvestmentIntegration.js`

### Property-Based Testing
19 correctness properties validated using fast-check:

**Key Properties**:
- Investment creation and persistence
- Type validation
- Value entry uniqueness
- Chronological sorting
- Change calculations
- Currency formatting
- Referential integrity

**Test Files**:
- `backend/repositories/investmentRepository.pbt.test.js`
- `backend/repositories/investmentValueRepository.pbt.test.js`
- `backend/services/investmentService.pbt.test.js`
- `backend/services/investmentValueService.pbt.test.js`
- `frontend/src/components/InvestmentDetailView.pbt.test.jsx`

### Unit Testing
Component and service-level tests:
- `frontend/src/components/InvestmentsModal.test.jsx`
- `frontend/src/utils/formatters.pbt.test.js`

## Data Integrity

### Foreign Key Constraints
- **CASCADE DELETE**: Deleting an investment automatically removes all associated value entries
- **Foreign Keys Enabled**: `PRAGMA foreign_keys = ON` ensures referential integrity

### Unique Constraints
- **One Value Per Month**: UNIQUE constraint on (investment_id, year, month)
- **Upsert Behavior**: Application handles updates when duplicate month detected

### CHECK Constraints
- **Type Validation**: Only 'TFSA' and 'RRSP' allowed
- **Non-Negative Values**: initial_value and value must be >= 0

## Backup Integration

Investment data is automatically included in database backups:
- **Automated Backups**: investments and investment_values tables backed up
- **Manual Backups**: Full database export includes investment data
- **Restore**: Investment data restored with database

**Verification**: `backend/scripts/testInvestmentBackup.js`

## Performance Considerations

### Indexes
Three indexes optimize query performance:
1. `idx_investments_type` - Fast filtering by investment type
2. `idx_investment_values_investment_id` - Fast value lookups by investment
3. `idx_investment_values_year_month` - Fast monthly queries

### Caching
- Frontend caches investment data in component state
- Refreshes on create/update/delete operations

### Query Optimization
- Eager loading of current values when fetching investments
- Efficient sorting using database indexes

## Future Enhancements

Potential improvements for future versions:

1. **Additional Investment Types**: FHSA, Non-Registered accounts
2. **Contribution Tracking**: Separate contributions from value changes
3. **Return on Investment**: Calculate ROI and annualized returns
4. **Investment Allocation**: Pie charts showing portfolio distribution
5. **Export Functionality**: Export investment data to CSV
6. **Investment Goals**: Set and track investment targets
7. **Comparison Tools**: Compare TFSA vs RRSP performance
8. **Dividend Tracking**: Record dividend/interest income
9. **Expense Integration**: Link contributions to expense entries
10. **Multi-Currency**: Support for foreign investments

## Migration

### Database Migration
Investment tables are created automatically on application startup via `backend/database/db.js`.

**Migration Script**: `backend/database/migrations.js` includes investment table creation.

### Existing Data
No migration required for existing users - investment tracking is a new feature with no impact on existing data.

## Documentation

### Specification Documents
- **Requirements**: `.kiro/specs/investment-tracking/requirements.md`
- **Design**: `.kiro/specs/investment-tracking/design.md`
- **Tasks**: `.kiro/specs/investment-tracking/tasks.md`

### Test Documentation
- **Integration Test Summary**: `.kiro/specs/investment-tracking/INTEGRATION_TEST_SUMMARY.md`
- **Task Summaries**: Multiple TASK_*_IMPLEMENTATION_SUMMARY.md files

### Code Documentation
- Repository layer: `backend/repositories/investmentRepository.js`, `investmentValueRepository.js`
- Service layer: `backend/services/investmentService.js`, `investmentValueService.js`
- Controller layer: `backend/controllers/investmentController.js`, `investmentValueController.js`
- Frontend components: `frontend/src/components/InvestmentsModal.jsx`, `InvestmentDetailView.jsx`
- API services: `frontend/src/services/investmentApi.js`, `investmentValueApi.js`

## Conclusion

The Investment Tracking feature is production-ready with:
- ✅ All requirements validated
- ✅ 100% integration test success rate
- ✅ Comprehensive property-based testing
- ✅ Full database integrity constraints
- ✅ Backup integration verified
- ✅ Performance optimized with indexes
- ✅ Clean architecture following project patterns

The feature successfully integrates with the existing expense tracker application and provides users with powerful investment portfolio monitoring capabilities.

---

**Status**: ✅ PRODUCTION READY  
**Version**: 4.4.0  
**Date**: November 30, 2025
