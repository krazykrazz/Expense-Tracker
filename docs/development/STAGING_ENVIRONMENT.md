# Staging Environment Guide

## Overview

The staging environment allows you to test new Docker images with a copy of production data before deploying to production. This is especially important for:

- Database migrations
- Schema changes
- Major feature releases
- Any changes that modify existing data

## Quick Start

```powershell
# 1. Build new image
.\build-and-push.ps1 -Tag latest

# 2. Set up staging with production data copy
.\scripts\setup-staging.ps1 -Start

# 3. Test at http://localhost:2627

# 4. If good, deploy to production
docker-compose up -d expense-tracker
```

## Architecture

```
Production (port 2424)          Staging (port 2627)
├── config/                     ├── staging-data/
│   ├── database/               │   ├── database/
│   │   └── expenses.db         │   │   └── expenses.db (COPY)
│   └── invoices/               │   └── invoices/
│       └── *.pdf               │       └── *.pdf (COPY)
```

Both containers use the same Docker image but different data directories.

## Setup Options

### Option 1: Copy Current Production Data

```powershell
.\scripts\setup-staging.ps1 -Start
```

This copies the current `config/database/expenses.db` to `staging-data/database/`.

### Option 2: Restore from Backup

```powershell
.\scripts\setup-staging.ps1 -BackupFile "G:\My Drive\Documents\Financial\Expense Tracker Backups\backup-2026-01-28.zip" -Start
```

This extracts a backup zip and uses that data for staging.

### Option 3: Manual Setup

```powershell
# Create staging directory
mkdir staging-data\database
mkdir staging-data\invoices

# Copy production database
copy config\database\expenses.db staging-data\database\

# Start staging
docker-compose --profile staging up -d expense-tracker-staging
```

## Testing Workflow

### Pre-Deployment Testing

1. **Build the new image:**
   ```powershell
   .\build-and-push.ps1 -Tag latest
   ```

2. **Set up staging:**
   ```powershell
   .\scripts\setup-staging.ps1 -Start
   ```

3. **Check migration logs:**
   ```powershell
   docker logs expense-tracker-staging
   ```
   Look for:
   - Migration success messages
   - No error messages
   - All tables created/updated correctly

4. **Test the application:**
   - Open http://localhost:2627
   - Verify all data is present
   - Test the new features
   - Check existing functionality still works

5. **If successful, deploy to production:**
   ```powershell
   docker-compose up -d expense-tracker
   ```

6. **Clean up staging:**
   ```powershell
   docker-compose --profile staging down
   ```

### Migration Verification Checklist

When testing migrations, verify:

- [ ] Container starts without errors
- [ ] All existing data is preserved
- [ ] New columns/tables are created
- [ ] Foreign key relationships are intact
- [ ] No orphaned records
- [ ] Application loads correctly
- [ ] Can create new records
- [ ] Can edit existing records
- [ ] Can delete records (cascade works)

## Commands Reference

| Action | Command |
|--------|---------|
| Start staging | `docker-compose --profile staging up -d expense-tracker-staging` |
| Stop staging | `docker-compose --profile staging down` |
| View logs | `docker logs -f expense-tracker-staging` |
| Shell into container | `docker exec -it expense-tracker-staging sh` |
| Check database | `docker exec -it expense-tracker-staging sqlite3 /config/database/expenses.db ".tables"` |

## Troubleshooting

### Staging won't start

Check if port 2627 is in use:
```powershell
netstat -ano | findstr 2627
```

### Migration failed in staging

1. Check logs: `docker logs expense-tracker-staging`
2. The staging data is isolated - production is safe
3. Fix the migration code
4. Rebuild image and try again

### Data looks wrong in staging

The staging data is a copy - any changes in staging don't affect production. You can:
1. Delete `staging-data/database/expenses.db`
2. Re-run `.\scripts\setup-staging.ps1` to get a fresh copy

## Best Practices

1. **Always test migrations in staging first** - especially for tables with foreign keys
2. **Use recent backups** - test with data that represents current production state
3. **Check logs thoroughly** - migration errors may not be immediately visible in the UI
4. **Test both new and existing features** - ensure nothing broke
5. **Keep staging data separate** - never point staging at production data directory
