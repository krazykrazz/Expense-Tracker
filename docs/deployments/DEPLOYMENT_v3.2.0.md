# Deployment Guide - Version 3.2.0

## Release Date
November 15, 2024

## Version Update
- Previous: v3.1.1
- New: v3.2.0

## Release Type
**MINOR** - New features added (loan types, line of credit support)

## What's New in v3.2.0

### Major Features

#### 1. Loan Type Differentiation
- Added support for two loan types: **Loan** and **Line of Credit**
- Traditional loans show paydown progress
- Lines of credit show balance/rate chart instead
- Different behavior for zero balances

#### 2. Dual-Axis Balance & Rate Chart
- Visual line graph for lines of credit
- Shows balance and interest rate over time on same chart
- Blue line for balance, red dashed line for rate
- Hover tooltips with exact values

#### 3. Bug Fixes
- Fixed future balance entries showing in current month
- Fixed zero-balance lines of credit being marked as paid off
- Fixed cascade delete for loan balance entries
- Fixed balance change calculations

## Pre-Deployment Checklist

### 1. Database Migration Required ✓
The loan_type column has already been added to your database.

To verify:
```bash
node backend/scripts/checkLoanTypes.js
```

### 2. Backup Database
```bash
# Backup is already created at:
# backend/database/expenses_backup_before_loan_type.db
```

### 3. Version Numbers Updated ✓
- frontend/package.json: 3.2.0
- backend/package.json: 3.2.0
- frontend/src/App.jsx: v3.2.0

## Deployment Steps

### Option 1: Docker Production Deployment

```bash
# Stop current containers
docker-compose -f docker-compose.prod.yml down

# Rebuild with new code
docker-compose -f docker-compose.prod.yml build

# Start updated containers
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
docker-compose -f docker-compose.prod.yml ps
```

### Option 2: Manual Deployment

```bash
# 1. Build frontend
cd frontend
npm run build

# 2. Restart backend
cd ../backend
npm start

# Or use PM2 if configured
pm2 restart expense-tracker
```

### Option 3: NPM Deploy Script

```bash
# From project root
npm run deploy
```

## Post-Deployment Verification

### 1. Check Application is Running
- Open browser to http://localhost:2424 (or your production URL)
- Verify version shows v3.2.0 in footer

### 2. Test Loan Features
- [ ] Open Loans modal from summary panel
- [ ] Create a new line of credit with $0 balance
- [ ] Verify it shows in Active tab (not Paid Off)
- [ ] View loan details - should show "Line of Credit" type
- [ ] Verify no paydown progress bar for lines of credit
- [ ] Add balance entries and verify chart appears

### 3. Test Existing Loans
- [ ] Verify existing loans still work
- [ ] Check that traditional loans show paydown progress
- [ ] Verify balance history displays correctly

### 4. Test Bug Fixes
- [ ] Add future balance entry - verify doesn't show in current month
- [ ] Delete a loan - verify balance entries are also deleted
- [ ] Check balance change calculations in history

## Rollback Plan

If issues occur:

### Quick Rollback
```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Restore database backup
cp backend/database/expenses_backup_before_loan_type.db backend/database/expenses.db

# Checkout previous version
git checkout v3.1.1

# Redeploy
docker-compose -f docker-compose.prod.yml up -d
```

## Database Changes

### New Column
- `loans.loan_type` - TEXT NOT NULL DEFAULT 'loan'
- CHECK constraint: IN ('loan', 'line_of_credit')

### Migration Status
- ✓ Column added
- ✓ Existing loans defaulted to 'loan'
- ✓ Backup created
- ✓ Foreign keys enabled

## Breaking Changes
**None** - Fully backward compatible

## Known Issues
**None**

## Support

If you encounter issues:
1. Check logs: `docker-compose -f docker-compose.prod.yml logs`
2. Verify database: `node backend/scripts/checkLoanTypes.js`
3. Review test results: `node backend/scripts/testLoansIntegration.js`

## Files Changed

### Backend (11 files)
- database/db.js
- services/loanService.js
- services/loanBalanceService.js
- repositories/loanRepository.js
- package.json

### Frontend (5 files)
- components/LoansModal.jsx
- components/LoansModal.css
- components/LoanDetailView.jsx
- components/LoanDetailView.css
- App.jsx
- package.json

### Documentation (5 files)
- LOAN_TYPE_IMPLEMENTATION_COMPLETE.md
- backend/scripts/LOAN_TYPE_FEATURE_SUMMARY.md
- backend/scripts/LINE_OF_CREDIT_ZERO_BALANCE_FIX.md
- backend/scripts/FUTURE_BALANCE_BUG_FIX.md
- backend/scripts/LOANS_INTEGRATION_TEST_RESULTS.md

## Next Steps After Deployment

1. Monitor application for any issues
2. Test with real data
3. Update user documentation if needed
4. Consider adding more loan types in future (e.g., "Credit Card")

---

**Deployment Status:** Ready for Production ✓
