# Deployment Guide - Version 4.1.0

## Release Information

**Version:** 4.1.0  
**Release Date:** November 24, 2025  
**Type:** MINOR (New Feature)  
**Docker Image:** `localhost:5000/expense-tracker:latest`  
**Git Commit:** a91e771  

## What's New

### Personal Care Category

This release adds a new expense category called "Personal Care" for tracking personal grooming and hygiene expenses.

**Features:**
- New "Personal Care" expense category
- Budgetable category with full budget tracking support
- Appears in all summaries, reports, and analytics
- CSV import/export fully supported
- Automatic database migration on startup

**Use Cases:**
- Haircuts and salon services
- Cosmetics and beauty products
- Toiletries and personal hygiene items
- Spa services and treatments
- Other personal care expenses

## Changes Summary

### Added
- Personal Care expense category
- Automatic database migration for category constraints
- Comprehensive test coverage (7 PBT + 9 integration tests)
- Updated CSV validation scripts

### Modified
- `backend/utils/categories.js` - Added Personal Care to category arrays
- `backend/database/migrations.js` - Added migration function
- `validate_csv.py` - Added Personal Care to valid categories
- `xls_to_csv.py` - Added Personal Care to valid categories
- `.kiro/steering/product.md` - Updated category list

### Technical Details
- Database migration: `migrateAddPersonalCareCategory()`
- Migration name: `add_personal_care_category_v1`
- Updates CHECK constraints on expenses and budgets tables
- Automatic backup created before migration

## Pre-Deployment Checklist

- ✅ All code changes committed
- ✅ All tests passing (100% pass rate)
- ✅ Version bumped to 4.1.0 in all locations
- ✅ CHANGELOG.md updated
- ✅ In-app changelog updated
- ✅ Frontend built successfully
- ✅ Docker image built and pushed
- ✅ Documentation updated

## Deployment Steps

### Option 1: Docker Compose (Recommended)

1. **Pull the new image:**
   ```bash
   docker-compose pull
   ```

2. **Stop the current containers:**
   ```bash
   docker-compose down
   ```

3. **Start with the new version:**
   ```bash
   docker-compose up -d
   ```

4. **Verify the deployment:**
   ```bash
   docker-compose logs -f
   ```
   
   Look for the migration success message:
   ```
   ✓ Migration 'add_personal_care_category_v1' applied successfully
   ```

### Option 2: Manual Docker

1. **Pull the new image:**
   ```bash
   docker pull localhost:5000/expense-tracker:latest
   ```

2. **Stop and remove the old container:**
   ```bash
   docker stop expense-tracker
   docker rm expense-tracker
   ```

3. **Run the new container:**
   ```bash
   docker run -d \
     --name expense-tracker \
     -p 2424:2424 \
     -v expense-tracker-data:/config \
     localhost:5000/expense-tracker:latest
   ```

4. **Check logs:**
   ```bash
   docker logs -f expense-tracker
   ```

### Option 3: Local Development

1. **Stop the current server** (if running)

2. **Pull latest code:**
   ```bash
   git pull origin main
   ```

3. **Install dependencies** (if needed):
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

4. **Build frontend:**
   ```bash
   cd frontend && npm run build
   ```

5. **Start the server:**
   ```bash
   cd backend && npm start
   ```

## Post-Deployment Verification

### 1. Check Migration Success

Look for this message in the logs:
```
✓ Migration 'add_personal_care_category_v1' applied successfully
```

### 2. Verify Database Backup

Check that a backup was created:
```bash
ls -la backend/config/backups/
```

Look for a file like: `expense-tracker-auto-migration-2025-11-24T*.db`

### 3. Test Personal Care Category

#### Via UI:
1. Open the application in your browser
2. Click "Add Expense"
3. Verify "Personal Care" appears in the category dropdown
4. Create a test expense with Personal Care category
5. Verify it appears in the expense list
6. Check monthly summary includes Personal Care
7. Open Budget Management
8. Verify you can create a budget for Personal Care

#### Via API:
Run the integration test script:
```bash
node backend/scripts/testPersonalCareAPI.js
```

Expected output:
```
✓ All API integration tests passed!
```

### 4. Verify Version

Check the footer of the application shows: **v4.1.0**

### 5. Check CSV Import

1. Create a CSV file with a Personal Care expense:
   ```csv
   date,place,notes,amount,type,week,method
   2025-11-24,Hair Salon,Haircut,45.00,Personal Care,4,Debit
   ```

2. Import via Settings → Import CSV
3. Verify the expense is created successfully

## Database Migration Details

### What the Migration Does

1. Creates automatic backup of database
2. Recreates expenses table with Personal Care in CHECK constraint
3. Copies all existing data (preserves everything)
4. Recreates budgets table with Personal Care in CHECK constraint
5. Recreates all indexes and triggers
6. Marks migration as applied in schema_migrations table

### Migration Safety

- **Automatic Backup:** Created before any changes
- **Transactional:** Rolls back on any error
- **Idempotent:** Safe to run multiple times
- **Data Preservation:** All existing data is preserved
- **Tested:** 100% test coverage with property-based tests

### Backup Location

Automatic backups are stored in:
- Docker: `/config/backups/`
- Local: `backend/config/backups/`

Backup filename format:
```
expense-tracker-auto-migration-YYYY-MM-DDTHH-MM-SS-mmmZ.db
```

## Rollback Plan

If issues arise after deployment:

### Option 1: Restore from Automatic Backup

1. **Stop the application**

2. **Locate the migration backup:**
   ```bash
   ls -la backend/config/backups/expense-tracker-auto-migration-*
   ```

3. **Restore the backup:**
   ```bash
   cp backend/config/backups/expense-tracker-auto-migration-[timestamp].db backend/database/expenses.db
   ```

4. **Restart the application**

### Option 2: Revert to Previous Version

1. **Pull previous Docker image:**
   ```bash
   docker pull localhost:5000/expense-tracker:4.0.3
   ```

2. **Update docker-compose.yml** to use version 4.0.3

3. **Restart containers:**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

## Known Issues

None at this time.

## Support

If you encounter any issues:

1. Check the application logs for error messages
2. Verify the migration completed successfully
3. Check that the backup was created
4. Review the integration test results
5. Consult the implementation documentation:
   - `.kiro/specs/personal-care-category/IMPLEMENTATION_COMPLETE.md`
   - `backend/scripts/PERSONAL_CARE_INTEGRATION_TEST_SUMMARY.md`

## Testing

### Automated Tests

All tests passing:
- ✅ 7 Property-Based Tests (100%)
- ✅ 9 Integration Tests (100%)
- ✅ Database migration tests
- ✅ CSV import/export tests

### Test Scripts

Run tests manually:
```bash
# Database integration tests
node backend/scripts/testPersonalCareIntegration.js

# API integration tests (requires server running)
node backend/scripts/testPersonalCareAPI.js

# Migration verification
node backend/scripts/testPersonalCareMigration.js
```

## Performance Impact

- Migration runs once on first startup: < 1 second
- No runtime performance impact
- Category validation remains O(n) where n=17 categories

## Security Considerations

- No new security concerns introduced
- Category validation prevents SQL injection
- Database constraints provide defense-in-depth
- No user input directly affects category list

## Next Steps

After successful deployment:

1. Monitor application logs for any issues
2. Verify users can create Personal Care expenses
3. Check that budgets work correctly for Personal Care
4. Confirm CSV import/export handles Personal Care
5. Review monthly and annual summaries

## Documentation

- **Specification:** `.kiro/specs/personal-care-category/`
- **Requirements:** `.kiro/specs/personal-care-category/requirements.md`
- **Design:** `.kiro/specs/personal-care-category/design.md`
- **Implementation:** `.kiro/specs/personal-care-category/IMPLEMENTATION_COMPLETE.md`
- **Test Summary:** `backend/scripts/PERSONAL_CARE_INTEGRATION_TEST_SUMMARY.md`

---

**Deployment Status:** ✅ Ready for Production  
**Deployed By:** Kiro AI Assistant  
**Deployment Date:** November 24, 2025
