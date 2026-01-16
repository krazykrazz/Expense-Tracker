# Deployment Guide - Version 4.12.0

## Medical Expense Invoice Attachments

**Release Date:** January 15, 2026  
**Version:** 4.12.0  
**Type:** MINOR (New Feature)

---

## Overview

Version 4.12.0 introduces the Medical Expense Invoice Attachments feature, enabling users to attach PDF invoices to medical expenses for better record keeping, tax preparation, and insurance claims.

### Key Changes

- ✅ New invoice attachment functionality for medical expenses
- ✅ PDF upload, viewing, and management capabilities
- ✅ Enhanced tax deductible reporting with invoice indicators
- ✅ Secure file storage with automatic cleanup
- ✅ Database schema migration for invoice tracking
- ✅ Mobile-friendly upload and viewing interface

### Breaking Changes

**None** - This release is fully backward compatible.

---

## Pre-Deployment Checklist

### 1. System Requirements

**Minimum Requirements:**
- Node.js 16.x or higher
- SQLite 3.x
- 500MB free disk space (for invoice storage)
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)

**Recommended:**
- Node.js 18.x or higher
- 2GB free disk space
- SSD storage for better performance

### 2. Backup Current System

**Critical: Always backup before deployment!**

```bash
# Stop the application
npm run stop

# Backup database
cp backend/config/database/expenses.db backend/config/database/expenses.db.backup

# Backup entire config directory
tar -czf config-backup-$(date +%Y%m%d).tar.gz backend/config/

# For Docker deployments
docker-compose down
docker run --rm -v expense-tracker_config:/config -v $(pwd):/backup alpine tar czf /backup/config-backup-$(date +%Y%m%d).tar.gz -C /config .
```

### 3. Review Changes

**Files Added:**
- `backend/controllers/invoiceController.js`
- `backend/services/invoiceService.js`
- `backend/repositories/invoiceRepository.js`
- `backend/routes/invoiceRoutes.js`
- `backend/middleware/uploadMiddleware.js`
- `backend/utils/fileStorage.js`
- `backend/utils/fileValidation.js`
- `backend/utils/filePermissions.js`
- `backend/utils/invoiceCleanup.js`
- `frontend/src/components/InvoiceUpload.jsx`
- `frontend/src/components/InvoicePDFViewer.jsx`
- `frontend/src/components/InvoiceIndicator.jsx`
- `frontend/src/services/invoiceApi.js`

**Files Modified:**
- `backend/database/migrations.js` (new migration)
- `backend/server.js` (new routes)
- `frontend/src/components/ExpenseForm.jsx` (invoice upload)
- `frontend/src/components/ExpenseList.jsx` (invoice indicators)
- `frontend/src/components/TaxDeductible.jsx` (invoice status)
- `frontend/src/App.jsx` (version update)
- `frontend/package.json` (version update)
- `backend/package.json` (version update)

### 4. Dependencies

**New Backend Dependencies:**
- `multer` (^1.4.5-lts.1) - File upload handling

**New Frontend Dependencies:**
- `react-pdf` (^7.5.1) - PDF viewing
- `pdfjs-dist` (^3.11.174) - PDF.js library

**Install dependencies:**
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

## Deployment Steps

### Option 1: Standard Deployment (Non-Docker)

#### Step 1: Stop Application

```bash
# Stop running servers
npm run stop
# or manually stop backend and frontend processes
```

#### Step 2: Pull Latest Code

```bash
git pull origin main
# or
git checkout v4.12.0
```

#### Step 3: Install Dependencies

```bash
# Install all dependencies
npm run install-all

# Or separately
cd backend && npm install
cd ../frontend && npm install
```

#### Step 4: Run Database Migration

The migration runs automatically on server start, but you can run it manually:

```bash
cd backend
node -e "require('./database/migrations').runMigrations()"
```

**Expected Output:**
```
Running migration: addExpenseInvoicesTable
Migration addExpenseInvoicesTable completed successfully
All migrations completed
```

#### Step 5: Initialize Invoice Storage

```bash
cd backend
node scripts/initializeInvoiceStorage.js
```

**Expected Output:**
```
Initializing invoice storage...
Created directory: /config/invoices
Created directory: /config/invoices/temp
Set permissions: 755
Invoice storage initialized successfully
```

#### Step 6: Build Frontend

```bash
cd frontend
npm run build
```

#### Step 7: Start Application

```bash
# From project root
npm run deploy

# Or start services separately
cd backend && npm start &
cd frontend && npm run preview
```

#### Step 8: Verify Deployment

1. **Check Server Status:**
   ```bash
   curl http://localhost:2424/api/expenses
   ```

2. **Check Frontend:**
   - Open http://localhost:5173 (dev) or http://localhost:4173 (production)
   - Create a test medical expense
   - Verify invoice upload section appears

3. **Test Invoice Upload:**
   - Upload a test PDF
   - Verify file appears in `/config/invoices/`
   - Check database for invoice record

---

### Option 2: Docker Deployment

#### Step 1: Stop Containers

```bash
docker-compose down
```

#### Step 2: Pull Latest Code

```bash
git pull origin main
# or
git checkout v4.12.0
```

#### Step 3: Build New Images

```bash
# Build and tag
docker-compose build

# Or use build script
./build-and-push.ps1 -Tag v4.12.0
```

#### Step 4: Update docker-compose.yml

Verify volume mounts include invoice storage:

```yaml
services:
  backend:
    volumes:
      - ./backend/config:/config
      # Invoice storage is in /config/invoices
```

#### Step 5: Start Containers

```bash
docker-compose up -d
```

#### Step 6: Verify Migration

```bash
# Check migration logs
docker logs expense-tracker-backend | grep migration

# Expected output:
# Running migration: addExpenseInvoicesTable
# Migration addExpenseInvoicesTable completed successfully
```

#### Step 7: Verify Storage Setup

```bash
# Check invoice directory exists
docker exec expense-tracker-backend ls -la /config/invoices

# Expected output:
# drwxr-xr-x 2 node node 4096 Jan 15 12:00 temp
```

#### Step 8: Test Functionality

1. **Access Application:**
   ```bash
   curl http://localhost:2424/api/expenses
   ```

2. **Test Upload:**
   - Open application in browser
   - Create medical expense
   - Upload test PDF
   - Verify success

3. **Check File Storage:**
   ```bash
   docker exec expense-tracker-backend ls -la /config/invoices/2026/01/
   ```

---

## Post-Deployment Verification

### 1. Database Schema Verification

```bash
# Check table exists
sqlite3 backend/config/database/expenses.db "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_invoices';"

# Expected output: expense_invoices

# Check table structure
sqlite3 backend/config/database/expenses.db ".schema expense_invoices"

# Expected output:
# CREATE TABLE expense_invoices (
#     id INTEGER PRIMARY KEY AUTOINCREMENT,
#     expense_id INTEGER NOT NULL,
#     filename TEXT NOT NULL,
#     ...
# );
```

### 2. File Storage Verification

```bash
# Check directory structure
ls -la backend/config/invoices/

# Expected output:
# drwxr-xr-x 2 user user 4096 Jan 15 12:00 temp
# drwxr-xr-x 2 user user 4096 Jan 15 12:00 2026

# Check permissions
stat backend/config/invoices/

# Expected: 755 (rwxr-xr-x)
```

### 3. API Endpoint Verification

```bash
# Test upload endpoint (requires valid session)
curl -X POST http://localhost:2424/api/invoices/upload \
  -F "expenseId=1" \
  -F "invoice=@test.pdf" \
  --cookie "session=..."

# Expected: 200 OK with invoice metadata
```

### 4. Frontend Verification

**Manual Testing:**
1. Open application in browser
2. Navigate to expense form
3. Create medical expense
4. Verify invoice upload section appears
5. Upload test PDF
6. Verify success message
7. Check expense list for invoice indicator
8. Click indicator to view PDF
9. Test zoom, download, print functions

### 5. Integration Verification

**Test Complete Workflow:**
1. Create medical expense with invoice
2. Edit expense and replace invoice
3. View invoice in PDF viewer
4. Check tax deductible report for indicator
5. Delete invoice
6. Delete expense (verify invoice cleanup)

---

## Rollback Procedure

If issues occur, follow these steps to rollback:

### Standard Deployment Rollback

```bash
# Stop application
npm run stop

# Restore database backup
cp backend/config/database/expenses.db.backup backend/config/database/expenses.db

# Checkout previous version
git checkout v4.11.2

# Reinstall dependencies
npm run install-all

# Rebuild frontend
cd frontend && npm run build

# Restart application
npm run deploy
```

### Docker Deployment Rollback

```bash
# Stop containers
docker-compose down

# Restore database backup
docker run --rm -v expense-tracker_config:/config -v $(pwd):/backup alpine sh -c "cp /backup/expenses.db.backup /config/database/expenses.db"

# Checkout previous version
git checkout v4.11.2

# Rebuild images
docker-compose build

# Start containers
docker-compose up -d
```

### Verify Rollback

```bash
# Check version
curl http://localhost:2424/api/expenses | grep version

# Verify application works
# Test basic expense operations
```

---

## Migration Details

### Database Migration: addExpenseInvoicesTable

**Migration ID:** `addExpenseInvoicesTable`  
**Run Date:** Automatic on first startup after v4.12.0

**Changes:**
1. Creates `expense_invoices` table
2. Adds foreign key to `expenses` table
3. Creates indexes for performance
4. Sets up CASCADE DELETE

**SQL:**
```sql
CREATE TABLE IF NOT EXISTS expense_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    UNIQUE(expense_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_invoices_expense_id 
ON expense_invoices(expense_id);

CREATE INDEX IF NOT EXISTS idx_expense_invoices_upload_date 
ON expense_invoices(upload_date);
```

**Rollback SQL:**
```sql
DROP TABLE IF EXISTS expense_invoices;
```

**Data Impact:**
- No existing data affected
- No data loss
- Backward compatible

---

## Configuration

### Environment Variables

**Optional Configuration:**

```bash
# Maximum upload file size (default: 10MB)
MAX_UPLOAD_SIZE=10485760

# Invoice storage path (default: /config/invoices)
INVOICE_STORAGE_PATH=/config/invoices

# Enable debug logging
LOG_LEVEL=debug
```

### Storage Configuration

**Default Paths:**
- Docker: `/config/invoices/`
- Local: `backend/config/invoices/`

**Directory Structure:**
```
invoices/
├── YYYY/
│   └── MM/
│       └── {expense_id}_{timestamp}_{filename}.pdf
└── temp/
```

**Permissions:**
- Directories: 755 (rwxr-xr-x)
- Files: 644 (rw-r--r--)

---

## Monitoring

### Health Checks

**Storage Usage:**
```bash
# Check invoice storage size
du -sh backend/config/invoices/

# Count invoice files
find backend/config/invoices/ -type f -name "*.pdf" | wc -l
```

**Database Health:**
```bash
# Check invoice records
sqlite3 backend/config/database/expenses.db "SELECT COUNT(*) FROM expense_invoices;"

# Check for orphaned records
node backend/scripts/findOrphanedInvoices.js
```

**Application Logs:**
```bash
# View recent logs
tail -100 backend/logs/app.log

# Search for invoice errors
grep -i "invoice" backend/logs/app.log | grep -i "error"
```

### Performance Metrics

**Monitor:**
- Upload success rate
- Average upload time
- Storage usage growth
- PDF viewer load times
- API response times

**Alerts:**
- Storage >80% full
- Upload failures >5%
- API errors >1%

---

## Backup Updates

### Include Invoices in Backups

**Update Backup Script:**

```bash
# Manual backup with invoices
tar -czf backup-$(date +%Y%m%d).tar.gz \
  backend/config/database/expenses.db \
  backend/config/invoices/

# Automated backup (add to cron)
0 2 * * * /path/to/backup-with-invoices.sh
```

**Docker Backup:**
```bash
# Backup entire config volume (includes invoices)
docker run --rm \
  -v expense-tracker_config:/config \
  -v $(pwd):/backup \
  alpine tar czf /backup/config-backup-$(date +%Y%m%d).tar.gz -C /config .
```

**Verify Backup:**
```bash
# Check backup includes invoices
tar -tzf backup.tar.gz | grep invoices

# Expected: List of invoice files
```

---

## Known Issues

### Issue 1: Large File Upload Timeout

**Description:** Uploads >5MB may timeout on slow connections

**Workaround:** 
- Compress PDFs before uploading
- Increase server timeout if needed

**Status:** Monitoring for v4.12.1

### Issue 2: PDF Viewer on Safari <14

**Description:** PDF viewer may not work on older Safari versions

**Workaround:**
- Update Safari to version 14+
- Use download function instead

**Status:** Won't fix (unsupported browser)

---

## Support

### Documentation

- User Guide: `docs/features/MEDICAL_EXPENSE_INVOICES.md`
- API Documentation: `docs/API_DOCUMENTATION.md`
- Troubleshooting: `docs/TROUBLESHOOTING_INVOICES.md`

### Getting Help

- GitHub Issues: Report bugs and issues
- Community Forums: Ask questions
- Email Support: For critical issues

---

## Next Steps

After successful deployment:

1. **Announce to Users:**
   - Send notification about new feature
   - Provide link to user guide
   - Offer training if needed

2. **Monitor Usage:**
   - Track upload success rates
   - Monitor storage usage
   - Review error logs

3. **Gather Feedback:**
   - Collect user feedback
   - Identify pain points
   - Plan improvements

4. **Plan Next Release:**
   - Review feature requests
   - Address any issues
   - Plan enhancements

---

## Changelog

### Version 4.12.0 (January 15, 2026)

**Added:**
- Medical expense invoice attachment functionality
- PDF upload, viewing, and management
- Invoice indicators in expense lists and tax reports
- Secure file storage with automatic cleanup
- Mobile-friendly upload interface
- PDF viewer with zoom, download, and print

**Changed:**
- Enhanced ExpenseForm with invoice upload section
- Enhanced ExpenseList with invoice indicators
- Enhanced TaxDeductible with invoice status
- Updated API endpoints to include invoice data

**Fixed:**
- None (new feature)

**Security:**
- File type validation with magic number checking
- File size limits (10MB maximum)
- Filename sanitization
- Access control based on expense ownership

---

**Deployment Date:** January 15, 2026  
**Deployed By:** [Your Name]  
**Status:** ✅ Successful  
**Rollback Required:** No
