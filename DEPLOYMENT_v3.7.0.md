# Deployment Guide - Version 3.7.0

## Overview

Version 3.7.0 introduces the Budget Tracking & Alerts feature, which requires a database migration to add the new `budgets` table. This guide covers the complete deployment process including migration, testing, and rollback procedures.

## Release Information

- **Version**: 3.7.0
- **Release Date**: November 22, 2025
- **Type**: MINOR (New Feature)
- **Breaking Changes**: None
- **Database Migration**: Required

## New Features

### Budget Tracking & Alerts
- Set monthly budget limits for Food, Gas, and Other categories
- Real-time progress bars with color-coded status indicators
- Visual alerts at 80%, 90%, and 100% thresholds
- Automatic budget carry-forward from previous month
- Manual budget copy from any previous month
- Historical budget performance analysis (3, 6, or 12 months)
- Overall budget summary with total budgeted vs spent

## Pre-Deployment Checklist

### 1. Backup Current Database

**CRITICAL**: Always backup your database before any deployment.

```bash
# Manual backup
cd backend
node -e "const backup = require('./services/backupService'); backup.createBackup().then(console.log).catch(console.error)"

# Or use the UI
# Navigate to Settings > Backup > Create Backup Now
```

**Verify backup file exists**:
```bash
# Check backup directory
ls -la backend/backups/
# or
ls -la config/backups/  # if using Docker
```

### 2. Review Current Version

Verify you're running version 3.6.1 or compatible:

```bash
# Check package.json versions
cat frontend/package.json | grep version
cat backend/package.json | grep version

# Check running application
# Look at footer in UI or check /api/version endpoint
curl http://localhost:2424/api/version
```

### 3. Stop Running Services

**For Docker**:
```bash
docker-compose down
```

**For Development**:
```bash
# Stop backend (Ctrl+C in terminal)
# Stop frontend (Ctrl+C in terminal)
# Or use stop script
stop-servers.bat
```

### 4. Verify Database Schema

Check current database schema before migration:

```bash
cd backend
sqlite3 database/expenses.db ".schema"
# or
sqlite3 /config/database/expenses.db ".schema"  # Docker
```

Verify these tables exist:
- expenses
- income_sources
- fixed_expenses
- loans
- loan_balances
- recurring_expenses

## Deployment Steps

### Step 1: Update Code

```bash
# Pull latest code
git pull origin main

# Or if deploying from a specific tag
git checkout v3.7.0
```

### Step 2: Install Dependencies

```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

### Step 3: Run Database Migration

**IMPORTANT**: This creates the `budgets` table.

```bash
cd backend
node scripts/addBudgetsTable.js
```

**Expected Output**:
```
✓ Budgets table created successfully
✓ Indexes created
✓ Trigger created
✓ Migration complete
```

**Verify Migration**:
```bash
# Check that budgets table exists
sqlite3 database/expenses.db "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets';"

# Should output: budgets

# Check table structure
sqlite3 database/expenses.db ".schema budgets"
```

**Expected Schema**:
```sql
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  category TEXT NOT NULL,
  limit REAL NOT NULL CHECK(limit > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, month, category),
  CHECK(month >= 1 AND month <= 12),
  CHECK(category IN ('Food', 'Gas', 'Other'))
);
CREATE INDEX idx_budgets_period ON budgets(year, month);
CREATE INDEX idx_budgets_category ON budgets(category);
CREATE TRIGGER update_budgets_timestamp 
AFTER UPDATE ON budgets
BEGIN
  UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

### Step 4: Test Migration

Run the migration test script to verify constraints and triggers:

```bash
cd backend
node scripts/testBudgetsConstraints.js
```

**Expected Output**:
```
Testing budgets table constraints...
✓ Positive limit constraint works
✓ Valid category constraint works
✓ Month range constraint works
✓ Unique constraint works
✓ Timestamp trigger works
All tests passed!
```

### Step 5: Build Frontend

```bash
cd frontend
npm run build
```

**Verify Build**:
- Check that `frontend/dist/` directory exists
- Verify `index.html` and assets are present

### Step 6: Start Services

**For Docker**:

```bash
# Rebuild and start container
docker-compose build
docker-compose up -d

# Check logs
docker-compose logs -f
```

**For Development**:

```bash
# Start backend
cd backend
npm start

# In new terminal, start frontend
cd frontend
npm run dev
```

### Step 7: Verify Deployment

#### Check Application Health

```bash
# Health check endpoint
curl http://localhost:2424/api/health

# Expected response:
# {"status":"ok","database":"connected","timestamp":"..."}
```

#### Check Version

```bash
# Version endpoint
curl http://localhost:2424/api/version

# Expected response:
# {"version":"3.7.0","docker":{"tag":"latest","buildDate":"..."}}
```

#### Test Budget Endpoints

```bash
# Get budgets for current month (should return empty array initially)
curl "http://localhost:2424/api/budgets?year=2025&month=11"

# Expected response:
# {"budgets":[]}

# Create a test budget
curl -X POST http://localhost:2424/api/budgets \
  -H "Content-Type: application/json" \
  -d '{"year":2025,"month":11,"category":"Food","limit":500}'

# Expected response:
# {"id":1,"year":2025,"month":11,"category":"Food","limit":500,"created_at":"...","updated_at":"..."}

# Get budgets again (should return the created budget)
curl "http://localhost:2424/api/budgets?year=2025&month=11"

# Delete test budget
curl -X DELETE http://localhost:2424/api/budgets/1
```

#### Test UI

1. Open application in browser: http://localhost:2424
2. Verify version shows "v3.7.0" in footer
3. Click "💵 Manage Budgets" button in month selector
4. Create a test budget for Food category
5. Add an expense in Food category
6. Verify budget progress bar appears and updates
7. Click "📊 Budget History" to view historical analysis
8. Verify budget summary appears in summary panel

### Step 8: Test Backup Integration

Verify budgets are included in backups:

```bash
# Create a budget via UI or API
# Then create a backup
curl http://localhost:2424/api/backup --output test-backup.db

# Verify budget data is in backup
sqlite3 test-backup.db "SELECT * FROM budgets;"

# Clean up test backup
rm test-backup.db
```

## Post-Deployment Verification

### Functional Tests

- [ ] Budget creation works
- [ ] Budget update works
- [ ] Budget deletion works
- [ ] Budget progress calculates correctly
- [ ] Color coding displays correctly (green/yellow/orange/red)
- [ ] Automatic carry-forward works when accessing new month
- [ ] Manual budget copy works
- [ ] Historical analysis displays correctly
- [ ] Budget summary shows in summary panel
- [ ] Real-time updates work when adding/editing/deleting expenses
- [ ] Budgets included in backup files
- [ ] Budgets restored from backup files

### Performance Tests

- [ ] Budget queries respond quickly (< 100ms)
- [ ] Progress calculations don't slow down expense operations
- [ ] Historical analysis loads within 2 seconds
- [ ] UI remains responsive with multiple budgets

### Data Integrity Tests

- [ ] Cannot create duplicate budgets (same year/month/category)
- [ ] Cannot set negative budget limits
- [ ] Cannot set budgets for tax-deductible categories
- [ ] Budget progress updates correctly when expenses change
- [ ] Budget data persists across application restarts

## Rollback Procedure

If issues are encountered, follow this rollback procedure:

### Step 1: Stop Services

```bash
# Docker
docker-compose down

# Development
# Stop backend and frontend (Ctrl+C)
```

### Step 2: Restore Database Backup

```bash
# Locate your backup file
ls -la backend/backups/

# Restore backup (replace BACKUP_FILE with actual filename)
cp backend/backups/BACKUP_FILE backend/database/expenses.db

# Or for Docker
cp config/backups/BACKUP_FILE config/database/expenses.db
```

### Step 3: Remove Budgets Table (Optional)

If you want to completely remove the budgets feature:

```bash
cd backend
node scripts/removeBudgetsTable.js
```

**Expected Output**:
```
✓ Budgets table removed successfully
✓ Rollback complete
```

### Step 4: Revert Code

```bash
# Checkout previous version
git checkout v3.6.1

# Reinstall dependencies
cd backend && npm install
cd ../frontend && npm install

# Rebuild frontend
cd frontend && npm run build
```

### Step 5: Restart Services

```bash
# Docker
docker-compose up -d

# Development
cd backend && npm start
cd frontend && npm run dev
```

### Step 6: Verify Rollback

- Check version shows v3.6.1
- Verify application functions normally
- Confirm budget features are not present
- Test existing features (expenses, income, loans, etc.)

## Troubleshooting

### Migration Fails

**Problem**: `addBudgetsTable.js` script fails

**Solutions**:
1. Check database file exists and is writable
2. Verify no other process has database locked
3. Check disk space is available
4. Review error message for specific constraint violations
5. Restore from backup and try again

### Budgets Table Already Exists

**Problem**: Migration script reports table already exists

**Solutions**:
1. Check if migration already ran: `sqlite3 database/expenses.db ".schema budgets"`
2. If table exists but is incomplete, run: `node scripts/removeBudgetsTable.js` then re-run migration
3. If table is correct, skip migration and proceed to testing

### Budget Endpoints Return 500 Errors

**Problem**: API endpoints return internal server errors

**Solutions**:
1. Check backend logs for specific error messages
2. Verify database migration completed successfully
3. Verify budgets table schema matches expected structure
4. Check that budget service and repository are properly loaded
5. Restart backend service

### Budget Progress Not Updating

**Problem**: Adding expenses doesn't update budget progress

**Solutions**:
1. Verify expense is in a budgeted category (Food, Gas, Other)
2. Check expense date matches budget month
3. Verify expense was successfully saved
4. Check browser console for JavaScript errors
5. Refresh the page
6. Check backend logs for calculation errors

### Automatic Carry-Forward Not Working

**Problem**: Budgets don't automatically copy to new month

**Solutions**:
1. Verify previous month has budgets set
2. Check that current month doesn't already have budgets
3. Verify budget service carry-forward logic is enabled
4. Check backend logs for errors during budget retrieval
5. Try manual budget copy as alternative

### Docker Container Won't Start

**Problem**: Container fails to start after update

**Solutions**:
1. Check Docker logs: `docker-compose logs`
2. Verify database migration completed before building container
3. Check volume mounts are correct
4. Verify port 2424 is not already in use
5. Try rebuilding: `docker-compose build --no-cache`

## Migration Details

### Database Changes

**New Table**: `budgets`
- Stores monthly budget limits per category
- Enforces positive limits and valid categories
- Unique constraint prevents duplicate budgets
- Indexes optimize query performance
- Trigger maintains updated_at timestamp

**No Changes To**:
- expenses table
- income_sources table
- fixed_expenses table
- loans table
- loan_balances table
- recurring_expenses table

### API Changes

**New Endpoints**:
- `GET /api/budgets` - Get budgets with auto-carry-forward
- `POST /api/budgets` - Create budget
- `PUT /api/budgets/:id` - Update budget
- `DELETE /api/budgets/:id` - Delete budget
- `GET /api/budgets/summary` - Overall budget summary
- `GET /api/budgets/history` - Historical performance
- `POST /api/budgets/copy` - Manual budget copy

**No Changes To**: All existing endpoints remain unchanged

### Backward Compatibility

- All existing features continue to work unchanged
- No breaking changes to existing APIs
- Budget feature is purely additive
- Can be safely ignored if not needed
- Rollback is safe and straightforward

## Performance Impact

### Expected Performance

- Budget queries: < 100ms
- Progress calculations: < 50ms
- Historical analysis: < 2 seconds
- Real-time updates: < 100ms

### Database Size Impact

- Minimal: ~1KB per budget entry
- Typical usage: ~36 budgets per year (3 categories × 12 months)
- Annual storage: ~36KB
- Negligible impact on overall database size

### Memory Impact

- Backend: +5-10MB for budget service
- Frontend: +50-100KB for budget components
- Negligible impact on overall memory usage

## Support and Documentation

### Documentation

- **User Guide**: `docs/guides/BUDGET_MANAGEMENT_GUIDE.md`
- **README**: Updated with budget feature overview
- **CHANGELOG**: Complete v3.7.0 entry
- **API Docs**: Budget endpoints documented in README

### Getting Help

1. Check this deployment guide
2. Review user guide for feature usage
3. Check CHANGELOG for known issues
4. Review GitHub issues for similar problems
5. Create new issue with detailed error information

## Success Criteria

Deployment is successful when:

- [ ] Application starts without errors
- [ ] Version shows v3.7.0
- [ ] Database migration completed successfully
- [ ] All existing features work normally
- [ ] Budget management modal opens and functions
- [ ] Budgets can be created, updated, and deleted
- [ ] Budget progress displays correctly
- [ ] Automatic carry-forward works
- [ ] Historical analysis displays
- [ ] Backups include budget data
- [ ] No console errors in browser
- [ ] No errors in backend logs
- [ ] Performance is acceptable

## Deployment Checklist

Use this checklist during deployment:

### Pre-Deployment
- [ ] Backup current database
- [ ] Verify current version (3.6.1)
- [ ] Stop running services
- [ ] Review current database schema

### Deployment
- [ ] Update code (git pull or checkout tag)
- [ ] Install backend dependencies
- [ ] Install frontend dependencies
- [ ] Run database migration script
- [ ] Verify migration with test script
- [ ] Build frontend
- [ ] Start services (Docker or development)

### Verification
- [ ] Check application health endpoint
- [ ] Verify version endpoint shows 3.7.0
- [ ] Test budget API endpoints
- [ ] Test budget UI functionality
- [ ] Verify backup includes budgets
- [ ] Run functional tests
- [ ] Check performance
- [ ] Verify data integrity

### Post-Deployment
- [ ] Monitor logs for errors
- [ ] Test with real user workflows
- [ ] Verify all existing features work
- [ ] Document any issues encountered
- [ ] Update team on deployment status

## Conclusion

Version 3.7.0 is a significant feature release that adds comprehensive budget tracking capabilities. The deployment is straightforward with a single database migration and no breaking changes. Follow this guide carefully, always backup before deploying, and test thoroughly after deployment.

For questions or issues, refer to the documentation or create a GitHub issue.

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Environment**: _______________
**Status**: _______________
**Notes**: _______________
