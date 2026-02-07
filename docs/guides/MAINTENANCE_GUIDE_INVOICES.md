# Maintenance Guide - Invoice Attachments

## Overview

This guide provides maintenance procedures for the Medical Expense Invoice Attachments feature, including monitoring, cleanup, optimization, and troubleshooting tasks.

**Target Audience:** System administrators, DevOps engineers, and technical maintainers

**Version:** 4.13.0 (Multi-Invoice Support)

---

## Regular Maintenance Tasks

### Daily Tasks

#### 1. Monitor Storage Usage

Check invoice storage to ensure adequate space:

```bash
# Docker
docker exec expense-tracker-backend du -sh /config/invoices

# Local
du -sh backend/config/invoices
```

**Alert Thresholds:**
- Warning: >500MB
- Critical: >800MB
- Maximum: 1GB (adjust based on your needs)

**Action Items:**
- If approaching limits, review and archive old invoices
- Consider expanding storage capacity
- Implement storage quotas if needed

#### 2. Check Error Logs

Review logs for invoice-related errors:

```bash
# Docker
docker logs expense-tracker-backend --tail 100 | grep -i invoice

# Local
tail -100 backend/logs/app.log | grep -i invoice
```

**Common Errors to Watch:**
- Upload failures
- File not found errors
- Permission denied errors
- Storage full errors
- Person validation errors (v4.13.0+)

---

### Weekly Tasks

#### 1. Verify Backup Integrity

Ensure invoices are included in backups:

```bash
# Check backup includes invoices
tar -tzf config-backup-latest.tar.gz | grep invoices | head -10

# Verify backup size (should include invoice files)
ls -lh config-backup-*.tar.gz
```

**Verification Steps:**
1. List backup contents
2. Verify invoice directory present
3. Check backup file size is reasonable
4. Test restore on non-production system

#### 2. Review Upload Statistics

Check upload success rates:

```bash
# Count total invoices
sqlite3 backend/config/database/expenses.db \
  "SELECT COUNT(*) FROM expense_invoices;"

# Count invoices by month
sqlite3 backend/config/database/expenses.db \
  "SELECT strftime('%Y-%m', upload_date) as month, COUNT(*) 
   FROM expense_invoices 
   GROUP BY month 
   ORDER BY month DESC 
   LIMIT 6;"

# Count invoices per expense (v4.13.0+)
sqlite3 backend/config/database/expenses.db \
  "SELECT expense_id, COUNT(*) as invoice_count 
   FROM expense_invoices 
   GROUP BY expense_id 
   HAVING invoice_count > 1
   ORDER BY invoice_count DESC
   LIMIT 10;"

# Count invoices linked to people (v4.13.0+)
sqlite3 backend/config/database/expenses.db \
  "SELECT 
     COUNT(*) as total,
     SUM(CASE WHEN person_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
     SUM(CASE WHEN person_id IS NULL THEN 1 ELSE 0 END) as unlinked
   FROM expense_invoices;"
```

**Metrics to Track:**
- Total invoice count
- Uploads per month
- Average file size
- Storage growth rate
- Invoices per expense distribution (v4.13.0+)
- Person-linked invoice ratio (v4.13.0+)

#### 3. Check for Orphaned Files

Identify files without database records:

```bash
# Run orphaned file check
node backend/scripts/findOrphanedInvoices.js

# Expected output: List of orphaned files (if any)
```

**If Orphaned Files Found:**
1. Review the list
2. Verify they're truly orphaned
3. Move to archive directory
4. Delete after verification period

---

### Monthly Tasks

#### 1. Storage Cleanup

Remove orphaned files and optimize storage:

```bash
# Find and remove orphaned files
node backend/scripts/cleanupOrphanedInvoices.js

# Compress old invoices (optional)
node backend/scripts/compressOldInvoices.js --older-than 12
```

**Cleanup Checklist:**
- [ ] Run orphaned file detection
- [ ] Review files to be deleted
- [ ] Backup before deletion
- [ ] Execute cleanup
- [ ] Verify database consistency

#### 2. Performance Analysis

Analyze invoice system performance:

```bash
# Average file size
sqlite3 backend/config/database/expenses.db \
  "SELECT AVG(file_size) / 1024 / 1024 as avg_mb 
   FROM expense_invoices;"

# Largest files
sqlite3 backend/config/database/expenses.db \
  "SELECT expense_id, original_filename, file_size / 1024 / 1024 as size_mb 
   FROM expense_invoices 
   ORDER BY file_size DESC 
   LIMIT 10;"

# Storage by year
find backend/config/invoices -type d -name "20*" -exec du -sh {} \;

# Expenses with most invoices (v4.13.0+)
sqlite3 backend/config/database/expenses.db \
  "SELECT e.id, e.place, e.date, COUNT(i.id) as invoice_count
   FROM expenses e
   JOIN expense_invoices i ON e.id = i.expense_id
   GROUP BY e.id
   ORDER BY invoice_count DESC
   LIMIT 10;"

# Person invoice distribution (v4.13.0+)
sqlite3 backend/config/database/expenses.db \
  "SELECT p.name, COUNT(i.id) as invoice_count
   FROM people p
   LEFT JOIN expense_invoices i ON p.id = i.person_id
   GROUP BY p.id
   ORDER BY invoice_count DESC;"
```

**Performance Metrics:**
- Average upload time
- Average file size
- Storage growth rate
- API response times
- Multi-invoice expense count (v4.13.0+)

#### 3. Security Audit

Review access logs and security:

```bash
# Check file permissions
find backend/config/invoices -type f -not -perm 644

# Check directory permissions
find backend/config/invoices -type d -not -perm 755

# Review access logs for suspicious activity
grep "invoice" backend/logs/access.log | grep -E "(40[13]|50[0-9])"
```

**Security Checklist:**
- [ ] Verify file permissions (644 for files, 755 for directories)
- [ ] Review failed access attempts
- [ ] Check for unusual upload patterns
- [ ] Verify access control working correctly
- [ ] Verify person validation working (v4.13.0+)

---

### Quarterly Tasks

#### 1. Archive Old Invoices

Archive invoices older than retention period:

```bash
# Archive invoices older than 2 years
node backend/scripts/archiveOldInvoices.js --years 2 --destination /archive/invoices

# Verify archive
ls -lh /archive/invoices
```

**Archival Process:**
1. Identify invoices to archive
2. Create archive directory
3. Copy files to archive
4. Verify archive integrity
5. Update database records
6. Remove from active storage

#### 2. Capacity Planning

Review storage trends and plan capacity:

```bash
# Storage growth over last 6 months
for i in {0..5}; do
  month=$(date -d "$i months ago" +%Y-%m)
  size=$(du -sh backend/config/invoices/$month 2>/dev/null | cut -f1)
  echo "$month: $size"
done
```

**Planning Considerations:**
- Current storage usage
- Growth rate per month
- Projected usage in 6-12 months
- Budget for storage expansion
- Archival strategy
- Multi-invoice growth impact (v4.13.0+)

#### 3. Disaster Recovery Test

Test backup and restore procedures:

```bash
# Create test backup
tar -czf test-backup.tar.gz backend/config/

# Restore to test environment
mkdir test-restore
tar -xzf test-backup.tar.gz -C test-restore

# Verify invoice files
ls -la test-restore/backend/config/invoices/

# Test application with restored data
# (Start test instance and verify invoice access)
```

**DR Test Checklist:**
- [ ] Create full backup
- [ ] Restore to test environment
- [ ] Verify database integrity
- [ ] Verify invoice files accessible
- [ ] Test invoice upload/download
- [ ] Test multi-invoice functionality (v4.13.0+)
- [ ] Test person-linked invoices (v4.13.0+)
- [ ] Document any issues
- [ ] Update DR procedures

---

## Monitoring and Alerts

### Key Metrics to Monitor

#### Storage Metrics
- **Total Storage Used**: Current invoice storage size
- **Storage Growth Rate**: MB/day or GB/month
- **Available Space**: Remaining storage capacity
- **File Count**: Total number of invoice files
- **Invoices Per Expense**: Average and max (v4.13.0+)

#### Performance Metrics
- **Upload Success Rate**: Percentage of successful uploads
- **Average Upload Time**: Time to complete upload
- **Download Response Time**: Time to serve invoice files
- **API Error Rate**: Percentage of failed API requests

#### Usage Metrics
- **Uploads per Day**: Number of invoices uploaded
- **Downloads per Day**: Number of invoice views
- **Active Users**: Users uploading/viewing invoices
- **Average File Size**: Mean size of uploaded invoices
- **Multi-Invoice Expenses**: Count of expenses with >1 invoice (v4.13.0+)
- **Person-Linked Invoices**: Percentage linked to people (v4.13.0+)

### Setting Up Alerts

#### Storage Alerts

```bash
# Add to cron for daily storage check
0 8 * * * /path/to/check-invoice-storage.sh

# check-invoice-storage.sh
#!/bin/bash
USAGE=$(du -s /config/invoices | awk '{print $1}')
THRESHOLD=800000  # 800MB in KB

if [ $USAGE -gt $THRESHOLD ]; then
  echo "Warning: Invoice storage exceeds threshold" | mail -s "Storage Alert" admin@example.com
fi
```

#### Error Rate Alerts

```bash
# Check error rate hourly
0 * * * * /path/to/check-invoice-errors.sh

# check-invoice-errors.sh
#!/bin/bash
ERRORS=$(grep -c "invoice.*error" /var/log/app.log)
if [ $ERRORS -gt 10 ]; then
  echo "High error rate detected: $ERRORS errors" | mail -s "Error Alert" admin@example.com
fi
```

---

## Optimization Procedures

### 1. Database Optimization

Optimize invoice-related database tables:

```bash
# Analyze tables
sqlite3 backend/config/database/expenses.db "ANALYZE expense_invoices;"

# Vacuum database
sqlite3 backend/config/database/expenses.db "VACUUM;"

# Rebuild indexes (v4.13.0+ has additional indexes)
sqlite3 backend/config/database/expenses.db "REINDEX idx_expense_invoices_expense_id;"
sqlite3 backend/config/database/expenses.db "REINDEX idx_expense_invoices_person_id;"
sqlite3 backend/config/database/expenses.db "REINDEX idx_expense_invoices_upload_date;"
```

**When to Run:**
- After large deletions
- Monthly maintenance
- Performance degradation
- Database size concerns

### 2. File System Optimization

Optimize invoice file storage:

```bash
# Compress old PDFs (if not already compressed)
find backend/config/invoices -name "*.pdf" -mtime +365 -exec \
  gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 \
     -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH \
     -sOutputFile={}.compressed {} \; -exec mv {}.compressed {} \;

# Defragment storage (if applicable)
# This depends on your file system
```

**Compression Benefits:**
- Reduced storage usage
- Faster backups
- Lower bandwidth for downloads
- Cost savings on storage

### 3. Caching Optimization

Implement caching for frequently accessed invoices:

```javascript
// In backend/services/invoiceService.js
const cache = new Map();

async function getInvoiceWithCache(expenseId) {
  if (cache.has(expenseId)) {
    return cache.get(expenseId);
  }
  
  const invoices = await getInvoicesForExpense(expenseId);
  cache.set(expenseId, invoices);
  
  // Expire after 1 hour
  setTimeout(() => cache.delete(expenseId), 3600000);
  
  return invoices;
}
```

---

## Troubleshooting Common Issues

### Issue: High Storage Usage

**Diagnosis:**
```bash
# Find largest files
find backend/config/invoices -type f -exec ls -lh {} \; | sort -k5 -hr | head -20

# Check for duplicate files
find backend/config/invoices -type f -exec md5sum {} \; | sort | uniq -w32 -dD

# Find expenses with many invoices (v4.13.0+)
sqlite3 backend/config/database/expenses.db \
  "SELECT expense_id, COUNT(*) as cnt FROM expense_invoices GROUP BY expense_id ORDER BY cnt DESC LIMIT 10;"
```

**Solutions:**
1. Compress large files
2. Remove duplicates
3. Archive old invoices
4. Implement file size limits

### Issue: Slow Upload Performance

**Diagnosis:**
```bash
# Check disk I/O
iostat -x 1 10

# Check network latency
ping -c 10 localhost

# Check server load
top -b -n 1 | head -20
```

**Solutions:**
1. Optimize disk I/O
2. Increase upload timeout
3. Implement upload queue
4. Use faster storage (SSD)

### Issue: Orphaned Files

**Diagnosis:**
```bash
# Find files without database records
node backend/scripts/findOrphanedInvoices.js --verbose
```

**Solutions:**
1. Review orphaned files
2. Attempt to match with expenses
3. Move to quarantine directory
4. Delete after verification period

### Issue: Permission Errors

**Diagnosis:**
```bash
# Check file permissions
ls -la backend/config/invoices/

# Check ownership
stat backend/config/invoices/
```

**Solutions:**
```bash
# Fix permissions
chmod -R 755 backend/config/invoices/
chown -R node:node backend/config/invoices/

# For Docker
docker exec expense-tracker-backend chmod -R 755 /config/invoices
```

### Issue: Person Link Validation Errors (v4.13.0+)

**Diagnosis:**
```bash
# Check for invoices with invalid person links
sqlite3 backend/config/database/expenses.db \
  "SELECT i.id, i.expense_id, i.person_id 
   FROM expense_invoices i 
   LEFT JOIN expense_people ep ON i.expense_id = ep.expense_id AND i.person_id = ep.person_id
   WHERE i.person_id IS NOT NULL AND ep.id IS NULL;"
```

**Solutions:**
1. Clear invalid person links
2. Re-assign invoices to valid people
3. Check expense_people table integrity

---

## Backup and Recovery

### Backup Procedures

#### Full Backup (Database + Invoices)

```bash
# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
tar -czf backup-full-$TIMESTAMP.tar.gz \
  backend/config/database/expenses.db \
  backend/config/invoices/

# Verify backup
tar -tzf backup-full-$TIMESTAMP.tar.gz | head -20
```

#### Incremental Backup (New Invoices Only)

```bash
# Backup invoices from last 7 days
find backend/config/invoices -type f -mtime -7 -print0 | \
  tar -czf backup-incremental-$(date +%Y%m%d).tar.gz --null -T -
```

### Recovery Procedures

#### Restore Full Backup

```bash
# Stop application
docker-compose down

# Restore backup
tar -xzf backup-full-20260115.tar.gz -C /

# Verify restoration
ls -la backend/config/invoices/
sqlite3 backend/config/database/expenses.db "SELECT COUNT(*) FROM expense_invoices;"

# Start application
docker-compose up -d
```

#### Restore Single Invoice

```bash
# Extract specific invoice from backup
tar -xzf backup-full-20260115.tar.gz \
  backend/config/invoices/2026/01/123_1704067200_receipt.pdf

# Verify file
ls -lh backend/config/invoices/2026/01/123_1704067200_receipt.pdf
```

---

## Performance Tuning

### Database Tuning

```sql
-- Indexes for common queries (v4.13.0+)
CREATE INDEX IF NOT EXISTS idx_expense_invoices_expense_id 
ON expense_invoices(expense_id);

CREATE INDEX IF NOT EXISTS idx_expense_invoices_person_id 
ON expense_invoices(person_id);

CREATE INDEX IF NOT EXISTS idx_expense_invoices_upload_date 
ON expense_invoices(upload_date);

-- Analyze query performance
EXPLAIN QUERY PLAN 
SELECT * FROM expense_invoices WHERE expense_id = 123;

-- Query with person join (v4.13.0+)
EXPLAIN QUERY PLAN 
SELECT i.*, p.name as person_name 
FROM expense_invoices i 
LEFT JOIN people p ON i.person_id = p.id 
WHERE i.expense_id = 123;
```

### File System Tuning

```bash
# Use faster storage for invoices
# Mount SSD volume for /config/invoices

# Enable file system caching
# Add to /etc/fstab:
# /dev/sdb1 /config/invoices ext4 defaults,noatime 0 2
```

### Application Tuning

```javascript
// Increase upload timeout
app.use('/api/invoices/upload', timeout('120s'));

// Enable compression
app.use(compression());

// Implement rate limiting
const rateLimit = require('express-rate-limit');
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10 // limit each IP to 10 uploads per windowMs
});
app.use('/api/invoices/upload', uploadLimiter);
```

---

## Security Maintenance

### Regular Security Tasks

#### 1. Access Log Review

```bash
# Review invoice access patterns
grep "GET /api/invoices" backend/logs/access.log | \
  awk '{print $1}' | sort | uniq -c | sort -rn | head -20

# Check for suspicious activity
grep "POST /api/invoices/upload" backend/logs/access.log | \
  grep -E "(40[13]|50[0-9])"

# Check person link update attempts (v4.13.0+)
grep "PATCH /api/invoices" backend/logs/access.log
```

#### 2. Permission Audit

```bash
# Verify correct permissions
find backend/config/invoices -type f ! -perm 644 -ls
find backend/config/invoices -type d ! -perm 755 -ls
```

#### 3. Vulnerability Scanning

```bash
# Scan for malicious PDFs (requires ClamAV)
clamscan -r backend/config/invoices/

# Check for suspicious file names
find backend/config/invoices -name "*[;<>|&]*"
```

---

## Documentation Updates

### When to Update Documentation

- New features added
- Procedures changed
- Issues discovered and resolved
- Performance optimizations implemented
- Security updates applied

### Documentation Checklist

- [ ] Update user guide
- [ ] Update API documentation
- [ ] Update troubleshooting guide
- [ ] Update deployment guide
- [ ] Update this maintenance guide
- [ ] Update changelog

---

## Contact and Escalation

### Support Levels

**Level 1: User Support**
- Basic troubleshooting
- User guidance
- Common issues

**Level 2: Technical Support**
- Advanced troubleshooting
- Performance issues
- Configuration problems

**Level 3: Engineering**
- Code bugs
- Architecture issues
- Security vulnerabilities

### Escalation Criteria

Escalate to Level 2 if:
- Issue persists after basic troubleshooting
- Performance degradation >20%
- Multiple users affected
- Security concern identified

Escalate to Level 3 if:
- Code bug confirmed
- Data corruption detected
- Security breach suspected
- System-wide outage

---

**Last Updated:** January 17, 2026  
**Version:** 2.0 (Multi-Invoice Support)  
**Maintainer:** System Administrator
