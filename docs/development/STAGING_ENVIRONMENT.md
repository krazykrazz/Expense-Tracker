# Staging Environment Guide

## Overview

The staging environment allows you to test new Docker images with a copy of production data before deploying to production. This is especially important for:

- Database migrations
- Schema changes
- Major feature releases
- Any changes that modify existing data

## Quick Start

Run from an up-to-date `main` checkout after CI's `Build and Push to GHCR` job has succeeded for `HEAD` (see [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md)):

```powershell
# 1. Pull the CI-built image for HEAD, tag it :staging, and start expense-tracker-test
.\scripts\build-and-push.ps1 -Environment staging

# 2. Test at http://localhost:2627

# 3. If good, promote the same image to production
.\scripts\build-and-push.ps1 -Environment latest
```

## Architecture

```
Production (port 2424)          Staging (port 2627)
├── config/                     ├── staging-data/
│   ├── database/               │   ├── database/
│   │   └── expenses.db         │   │   └── expenses.db (COPY)
│   ├── invoices/               │   ├── invoices/   (COPY)
│   ├── statements/             │   ├── statements/ (COPY)
│   ├── backups/                │   ├── backups/
│   └── config/                 │   └── config/
```

Both containers use the same image (production `:latest`, staging `:staging`, both pointing at a CI-built SHA) but different data directories mounted at `/config`. The staging service, `expense-tracker-test` in `docker-compose.yml`, is in the `staging` compose profile and runs with `NODE_ENV=staging` and `LOG_LEVEL=debug`, which shows an orange "STAGING ENVIRONMENT" banner in the UI.

## Staging Data Setup

The simplest source is a recent backup archive. Backups are `expense-tracker-backup-*.tar.gz` files whose layout matches `/config` (`database/expenses.db`, `invoices/`, `statements/`, `config/backupConfig.json`), and the backup service checkpoints the SQLite WAL before archiving:

```powershell
# Stop staging first if it is running
docker compose --profile staging stop expense-tracker-test

# Extract a backup archive into staging-data/
New-Item -ItemType Directory -Force staging-data | Out-Null
tar -xzf "path\to\expense-tracker-backup-....tar.gz" -C staging-data
```

To copy the production directory directly instead, stop the production container first so the database file and its `-wal`/`-shm` files are consistent:

```powershell
docker compose stop expense-tracker
New-Item -ItemType Directory -Force staging-data\database, staging-data\invoices, staging-data\statements | Out-Null
Copy-Item config\database\expenses.db* staging-data\database\
Copy-Item config\invoices\* staging-data\invoices\ -Recurse
Copy-Item config\statements\* staging-data\statements\ -Recurse
docker compose up -d expense-tracker
```

## Testing Workflow

### Pre-Deployment Testing

1. **Promote the CI-built image to staging** (from `main`, after CI has built `HEAD`):
   ```powershell
   .\scripts\build-and-push.ps1 -Environment staging
   ```

2. **Check migration logs:**
   ```powershell
   docker logs expense-tracker-test
   ```
   Look for:
   - Migration success messages
   - No error messages
   - All tables created/updated correctly

3. **Test the application:**
   - Open http://localhost:2627
   - Verify all data is present
   - Test the new features
   - Check existing functionality still works

4. **If successful, promote to production:**
   ```powershell
   .\scripts\build-and-push.ps1 -Environment latest
   ```
   Add `-SkipDeploy` if production does not run from this repo's `docker-compose.yml`.

5. **Stop staging** (optional):
   ```powershell
   docker compose --profile staging stop expense-tracker-test
   ```
   Do not use `docker compose --profile staging down` here: it also stops and removes the production `expense-tracker` service defined in the same file.

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
| Promote CI image to staging | `.\scripts\build-and-push.ps1 -Environment staging` |
| Start staging | `docker compose --profile staging up -d expense-tracker-test` |
| Stop staging | `docker compose --profile staging stop expense-tracker-test` |
| View logs | `docker logs -f expense-tracker-test` |
| Shell into container | `docker exec -it expense-tracker-test sh` |
| Check health / DB connectivity | `curl http://localhost:2627/api/health` |
| Check running version | `curl http://localhost:2627/api/version` |

The image does not include the `sqlite3` CLI. To inspect the database, open `staging-data/database/expenses.db` on the host with a SQLite tool while staging is stopped.

## Troubleshooting

### Staging won't start

Check if port 2627 is in use:
```powershell
netstat -ano | findstr 2627
```

### Migration failed in staging

1. Check logs: `docker logs expense-tracker-test`
2. The staging data is isolated - production is safe
3. Fix the migration code and merge the fix to `main`
4. After CI builds the new commit, re-run `.\scripts\build-and-push.ps1 -Environment staging` (refresh `staging-data` first if the failed migration modified it)

### Data looks wrong in staging

The staging data is a copy - any changes in staging don't affect production. You can:
1. Stop staging and delete `staging-data/database/expenses.db*`
2. Re-copy from a backup or from `config/database/` (see [Staging Data Setup](#staging-data-setup))

## Best Practices

1. **Always test migrations in staging first** - especially for tables with foreign keys
2. **Use recent backups** - test with data that represents current production state
3. **Check logs thoroughly** - migration errors may not be immediately visible in the UI
4. **Test both new and existing features** - ensure nothing broke
5. **Keep staging data separate** - never point staging at production data directory
