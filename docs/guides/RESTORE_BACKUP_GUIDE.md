# Database Backup Restore Guide

## What's Included in Backups

All database backups include:
- **Expenses**: All expense records with categories, payment methods, and notes
- **Income Sources**: Monthly income from multiple sources with categories
- **Fixed Expenses**: Monthly fixed expenses with categories
- **Loans**: Loan and line of credit records with balance history
- **Budgets**: Budget limits and tracking data
- **Investments**: Investment accounts (TFSA, RRSP) with monthly value history
- **Configuration**: Recurring expenses and other settings

## Quick Start - Easiest Method

Use the automated script:

```bash
restore-backup.bat "path\to\your\backup.db"
```

**Examples:**
```bash
# From backend/database folder
restore-backup.bat "backend\database\expenses.db"

# From backend/backups folder
restore-backup.bat "backend\backups\expense-tracker-backup-2025-11-19.db"

# From any location
restore-backup.bat "C:\Users\YourName\Downloads\expenses.db"
```

The script will:
1. Stop the Docker container
2. Create the config directory structure
3. Copy your backup to `config/database/expenses.db`
4. Restart the Docker container
5. Verify the container is healthy

---

## Manual Method

If you prefer to do it manually:

### Step 1: Stop the Docker container
```bash
docker-compose down
```

### Step 2: Create config directory (if it doesn't exist)
```bash
mkdir config\database
mkdir config\backups
mkdir config\config
```

### Step 3: Copy your backup file
```bash
# Copy your backup as the main database
copy "backend\database\expenses.db" "config\database\expenses.db"

# Or from backups folder
copy "backend\backups\expense-tracker-backup-2025-11-19.db" "config\database\expenses.db"
```

### Step 4: Start the Docker container
```bash
docker-compose up -d
```

### Step 5: Verify it's working
```bash
docker ps
# Should show expense-tracker as healthy

# Or check logs
docker logs expense-tracker
```

---

## Where to Find Your Backups

### Old Location (Non-Docker)
- **Database**: `backend/database/expenses.db`
- **Backups**: `backend/backups/expense-tracker-backup-*.db`
- **Config backups**: `backend/config/backups/`

### New Location (Docker)
- **Database**: `config/database/expenses.db`
- **Backups**: `config/backups/expense-tracker-backup-*.db`
- **Config**: `config/config/backupConfig.json`

---

## Troubleshooting

### Container won't start after restore
```bash
# Check logs
docker logs expense-tracker

# Common issue: file permissions
# Solution: Restart the container
docker-compose restart
```

### Database file is locked
```bash
# Make sure no other processes are using the database
# Stop any local Node.js servers
stop-servers.bat

# Then try again
docker-compose down
# Copy backup file
docker-compose up -d
```

### Want to keep a backup before restoring
```bash
# Backup current Docker database first
copy "config\database\expenses.db" "config\backups\pre-restore-backup.db"

# Then restore your backup
restore-backup.bat "path\to\backup.db"
```

---

## Using the Restore Feature in the App

You can also restore backups through the web interface:

1. Open http://localhost:2424
2. Click "⚙️ Settings" button
3. Go to "Backup & Restore" tab
4. Click "Choose File" under "Restore from Backup"
5. Select your backup file
6. Click "Restore Backup"

**Note**: This method uploads the file through the web interface, which may be slower for large databases.

---

## Migration from Old Setup

If you're migrating from the old non-Docker setup:

```bash
# 1. Stop old servers
stop-servers.bat

# 2. Use the restore script with your current database
restore-backup.bat "backend\database\expenses.db"

# 3. Done! Access at http://localhost:2424
```

---

## Date: 2025-11-19
