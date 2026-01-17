# Troubleshooting Guide - Invoice Attachments

## Common Issues and Solutions

### Upload Issues

#### Issue: "File too large" Error

**Symptoms:**
- Error message: "File size exceeds 10MB limit"
- HTTP 413 Payload Too Large response
- Upload fails immediately

**Causes:**
- PDF file exceeds 10MB maximum size
- File includes high-resolution images
- Uncompressed PDF

**Solutions:**

1. **Compress the PDF:**
   ```bash
   # Using Ghostscript
   gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 \
      -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH \
      -sOutputFile=compressed.pdf input.pdf
   ```

2. **Use Online Compression:**
   - Adobe Acrobat online
   - SmallPDF.com
   - PDF Compressor

3. **Split Large Files:**
   - Split multi-page PDFs into separate files
   - Upload each page as separate invoice

4. **Reduce Image Quality:**
   - Re-scan at lower DPI (150-300 DPI sufficient)
   - Convert images to grayscale
   - Remove unnecessary pages

**Prevention:**
- Scan documents at 150-300 DPI
- Use "Optimize for web" when saving PDFs
- Remove unnecessary pages before uploading

---

#### Issue: "Invalid file type" Error

**Symptoms:**
- Error message: "Only PDF files are allowed"
- HTTP 400 Bad Request response
- File appears to be PDF but rejected

**Causes:**
- File is not actually a PDF (wrong extension)
- Corrupted PDF file
- PDF created with incompatible software
- File renamed from another format

**Solutions:**

1. **Verify File Type:**
   ```bash
   # Linux/Mac
   file receipt.pdf
   
   # Should show: PDF document, version X.X
   ```

2. **Convert to PDF:**
   - Use Adobe Acrobat
   - Use online converters (JPG to PDF, etc.)
   - Use print-to-PDF feature

3. **Re-save the PDF:**
   - Open in PDF reader
   - Save As → PDF
   - Try uploading again

4. **Check File Integrity:**
   - Open file in PDF reader
   - If it won't open, file is corrupted
   - Re-scan or re-download original

**Prevention:**
- Always save/export as PDF (not rename)
- Use reputable PDF creation tools
- Verify files open before uploading

---

#### Issue: Upload Fails with Network Error

**Symptoms:**
- Upload starts but fails partway through
- "Network error" or "Connection lost" message
- Progress bar stops moving

**Causes:**
- Unstable internet connection
- Server timeout
- Browser tab closed/refreshed during upload
- Firewall blocking upload

**Solutions:**

1. **Check Network Connection:**
   - Verify internet connectivity
   - Try accessing other websites
   - Check WiFi signal strength

2. **Retry Upload:**
   - Wait a moment and try again
   - Refresh the page
   - Clear browser cache

3. **Use Wired Connection:**
   - Switch from WiFi to ethernet
   - More stable for large uploads

4. **Check Firewall:**
   - Temporarily disable firewall
   - Add exception for application
   - Check corporate network restrictions

5. **Increase Timeout:**
   - For administrators: Adjust server timeout settings
   - Edit `backend/middleware/uploadMiddleware.js`

**Prevention:**
- Use stable network connection
- Don't close browser during upload
- Upload during off-peak hours

---

#### Issue: "Person not assigned to expense" Error (v4.13.0+)

**Symptoms:**
- Error message: "Person is not assigned to this expense"
- HTTP 400 Bad Request response
- Cannot link invoice to selected person

**Causes:**
- Selected person is not assigned to the expense
- Person was removed from expense after selection
- Stale UI data

**Solutions:**

1. **Verify Person Assignment:**
   - Edit the expense
   - Check the People section
   - Ensure the person is assigned to the expense

2. **Add Person to Expense First:**
   - Edit the expense
   - Add the person to the expense
   - Save the expense
   - Then upload the invoice with person link

3. **Refresh the Page:**
   - Reload the page to get fresh data
   - Try the upload again

4. **Upload Without Person Link:**
   - Upload the invoice without selecting a person
   - Link the person later using the PATCH endpoint

**Prevention:**
- Assign people to expenses before uploading invoices
- Verify person assignment before linking

---

### Viewing Issues

#### Issue: PDF Won't Display in Viewer

**Symptoms:**
- Blank viewer window
- "Failed to load PDF" error
- Infinite loading spinner

**Causes:**
- Corrupted PDF file
- Browser compatibility issue
- PDF uses unsupported features
- Network error loading file

**Solutions:**

1. **Download and View Locally:**
   - Click "Download" button
   - Open in Adobe Reader or browser
   - If opens locally, browser issue

2. **Try Different Browser:**
   - Test in Chrome, Firefox, Edge
   - Update browser to latest version
   - Clear browser cache

3. **Check PDF Integrity:**
   - Download the file
   - Try opening in PDF reader
   - If corrupted, re-upload

4. **Check Console Errors:**
   - Open browser developer tools (F12)
   - Check Console tab for errors
   - Report errors to administrator

**Prevention:**
- Use modern, updated browsers
- Test PDFs before uploading
- Ensure PDFs are not password-protected

---

#### Issue: PDF Loads Very Slowly

**Symptoms:**
- Long wait time before PDF displays
- Progress bar moves slowly
- Browser becomes unresponsive

**Causes:**
- Large PDF file size
- Slow network connection
- Many pages in PDF
- High-resolution images in PDF

**Solutions:**

1. **Wait Patiently:**
   - Large files take time to load
   - Don't refresh during loading
   - Check network speed

2. **Download Instead:**
   - Use "Download" button
   - View locally for better performance
   - Faster than in-browser viewing

3. **Compress PDF:**
   - Delete and re-upload compressed version
   - See "File too large" section for compression

4. **Check Network:**
   - Test internet speed
   - Close other bandwidth-heavy applications
   - Try during off-peak hours

**Prevention:**
- Upload compressed PDFs
- Keep PDFs under 5MB when possible
- Use lower resolution scans

---

#### Issue: Zoom Controls Don't Work

**Symptoms:**
- Zoom in/out buttons don't respond
- PDF doesn't resize
- Controls appear disabled

**Causes:**
- Browser compatibility issue
- PDF viewer library error
- JavaScript error on page

**Solutions:**

1. **Use Browser Zoom:**
   - Ctrl + Plus/Minus (Windows/Linux)
   - Cmd + Plus/Minus (Mac)
   - Browser zoom affects entire page

2. **Download and View:**
   - Download PDF
   - Use local PDF reader with zoom
   - Better zoom control

3. **Refresh Page:**
   - Reload the page
   - Try opening PDF again
   - Check if issue persists

4. **Check Browser Console:**
   - Open developer tools (F12)
   - Look for JavaScript errors
   - Report to administrator

**Prevention:**
- Keep browser updated
- Clear cache regularly
- Use supported browsers

---

### Management Issues

#### Issue: Cannot Delete Invoice

**Symptoms:**
- Delete button doesn't work
- Error message when deleting
- Invoice still appears after deletion

**Causes:**
- Permission issue
- File system error
- Database inconsistency
- Network error

**Solutions:**

1. **Verify Permissions:**
   - Ensure you own the expense
   - Check if logged in correctly
   - Try logging out and back in

2. **Retry Deletion:**
   - Refresh page
   - Try delete again
   - Check if actually deleted

3. **Delete Expense:**
   - Deleting expense removes all invoices
   - Last resort if invoice stuck
   - Re-create expense if needed

4. **Contact Administrator:**
   - If issue persists
   - May be file system issue
   - Administrator can manually remove

**Prevention:**
- Ensure stable connection when deleting
- Verify deletion completed
- Regular database maintenance

---

#### Issue: Invoice Indicator Not Showing

**Symptoms:**
- Uploaded invoice but no indicator
- Other expenses show indicators
- Invoice exists but not visible

**Causes:**
- UI not refreshed after upload
- Cache issue
- Database sync issue

**Solutions:**

1. **Refresh Page:**
   - Hard refresh (Ctrl+F5)
   - Clear browser cache
   - Check if indicator appears

2. **Verify Upload:**
   - Edit the expense
   - Check if invoice section shows file
   - Try viewing the invoice

3. **Check Expense Type:**
   - Indicators only show for medical expenses
   - Verify expense type is "Tax - Medical"
   - Change type if incorrect

4. **Re-upload Invoice:**
   - Delete and re-upload
   - Save expense
   - Refresh page

**Prevention:**
- Wait for upload confirmation
- Refresh after uploading
- Verify indicator appears

---

#### Issue: Invoice Count Not Updating (v4.13.0+)

**Symptoms:**
- Added multiple invoices but count shows wrong number
- Count badge not appearing for multiple invoices
- Tooltip shows wrong number of files

**Causes:**
- UI cache not refreshed
- Database query issue
- Component state not updated

**Solutions:**

1. **Refresh Page:**
   - Hard refresh (Ctrl+F5)
   - Clear browser cache
   - Check if count updates

2. **Verify in Database:**
   ```bash
   sqlite3 backend/config/database/expenses.db \
     "SELECT COUNT(*) FROM expense_invoices WHERE expense_id = YOUR_EXPENSE_ID;"
   ```

3. **Check API Response:**
   - Open browser developer tools (F12)
   - Check Network tab for invoice API calls
   - Verify response contains all invoices

**Prevention:**
- Wait for upload confirmation before adding more
- Refresh page after multiple uploads

---

#### Issue: Person Link Not Saving (v4.13.0+)

**Symptoms:**
- Selected person during upload but not linked
- Person dropdown shows selection but invoice has no link
- PATCH request fails

**Causes:**
- Person not assigned to expense
- Network error during save
- Validation failure

**Solutions:**

1. **Verify Person Assignment:**
   - Check expense has the person assigned
   - Add person to expense first if needed

2. **Use PATCH Endpoint:**
   - Update person link after upload
   - `PATCH /api/invoices/:invoiceId` with `{ "personId": X }`

3. **Check Error Response:**
   - Open browser developer tools
   - Check Network tab for error details
   - Address specific validation error

**Prevention:**
- Assign people to expenses before uploading
- Verify person selection before upload

---

### Storage Issues

#### Issue: "Insufficient storage" Error

**Symptoms:**
- Error message: "Insufficient storage space"
- HTTP 507 response
- Cannot upload new invoices

**Causes:**
- Storage volume full
- Too many invoices stored
- Large invoice files
- Disk quota exceeded

**Solutions:**

1. **Delete Old Invoices:**
   - Review old expenses
   - Delete unnecessary invoices
   - Archive old data

2. **Compress Existing Files:**
   - For administrators
   - Compress stored PDFs
   - Free up space

3. **Expand Storage:**
   - For administrators
   - Increase disk space
   - Adjust Docker volume size

4. **Archive Old Data:**
   - Export old expenses
   - Delete from system
   - Store externally

**Prevention:**
- Regular cleanup of old invoices
- Monitor storage usage
- Set up storage alerts
- Use compressed PDFs

---

### Docker-Specific Issues

#### Issue: Invoices Lost After Container Restart

**Symptoms:**
- Invoices disappear after restart
- Upload works but files don't persist
- Database shows invoice but file missing

**Causes:**
- Volume not mounted correctly
- Files stored in container, not volume
- Docker volume configuration issue

**Solutions:**

1. **Check Volume Mount:**
   ```bash
   docker-compose ps
   docker inspect <container_id>
   # Verify /config volume mounted
   ```

2. **Fix docker-compose.yml:**
   ```yaml
   volumes:
     - ./backend/config:/config
   ```

3. **Recreate Container:**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

4. **Verify Storage Location:**
   ```bash
   docker exec -it <container> ls -la /config/invoices
   ```

**Prevention:**
- Always use volume mounts
- Test persistence after setup
- Regular backups

---

#### Issue: Permission Denied Errors in Docker

**Symptoms:**
- Cannot upload invoices
- "Permission denied" errors in logs
- File system errors

**Causes:**
- Incorrect file permissions
- User/group mismatch
- Volume mount permissions

**Solutions:**

1. **Fix Permissions:**
   ```bash
   # On host
   chmod -R 755 backend/config/invoices
   chown -R 1000:1000 backend/config/invoices
   ```

2. **Check Container User:**
   ```bash
   docker exec -it <container> whoami
   docker exec -it <container> ls -la /config
   ```

3. **Update Dockerfile:**
   ```dockerfile
   RUN mkdir -p /config/invoices && \
       chmod 755 /config/invoices
   ```

4. **Restart Container:**
   ```bash
   docker-compose restart
   ```

**Prevention:**
- Set correct permissions in Dockerfile
- Use consistent user IDs
- Test file operations after deployment

---

## Error Messages Reference

### Client-Side Errors

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Only PDF files are allowed" | Wrong file type | Upload PDF files only |
| "File size exceeds 10MB limit" | File too large | Compress or split PDF |
| "Please select a file" | No file selected | Choose a file first |
| "Upload failed" | Network/server error | Check connection, retry |
| "Failed to load PDF" | Viewer error | Download and view locally |
| "Person is not assigned to this expense" | Invalid person link (v4.13.0+) | Assign person to expense first |

### Server-Side Errors

| Error Message | HTTP Code | Cause | Solution |
|---------------|-----------|-------|----------|
| "Expense not found" | 404 | Invalid expense ID | Verify expense exists |
| "Invoice not found" | 404 | No invoice with that ID | Check invoice ID |
| "You don't have permission" | 403 | Access denied | Check expense ownership |
| "Invalid or corrupted PDF" | 400 | Bad file | Re-scan or re-save PDF |
| "Insufficient storage" | 507 | Storage full | Free up space |
| "Person is not assigned to this expense" | 400 | Invalid person link (v4.13.0+) | Assign person first |
| "Invalid person ID" | 400 | Person doesn't exist (v4.13.0+) | Check person ID |

---

## Diagnostic Commands

### Check Storage Usage

```bash
# Docker
docker exec -it expense-tracker-backend du -sh /config/invoices

# Local
du -sh backend/config/invoices
```

### Count Invoice Files

```bash
# Docker
docker exec -it expense-tracker-backend find /config/invoices -type f -name "*.pdf" | wc -l

# Local
find backend/config/invoices -type f -name "*.pdf" | wc -l
```

### Check File Permissions

```bash
# Docker
docker exec -it expense-tracker-backend ls -la /config/invoices

# Local
ls -la backend/config/invoices
```

### View Recent Logs

```bash
# Docker
docker logs expense-tracker-backend --tail 100

# Local
tail -100 backend/logs/app.log
```

### Test File Upload

```bash
curl -X POST http://localhost:2424/api/invoices/upload \
  -F "expenseId=123" \
  -F "invoice=@test.pdf" \
  -F "personId=5" \
  --cookie "session=your_session_cookie"
```

### Check Invoice Count Per Expense (v4.13.0+)

```bash
sqlite3 backend/config/database/expenses.db \
  "SELECT expense_id, COUNT(*) as cnt FROM expense_invoices GROUP BY expense_id ORDER BY cnt DESC LIMIT 10;"
```

### Check Person-Linked Invoices (v4.13.0+)

```bash
sqlite3 backend/config/database/expenses.db \
  "SELECT i.id, i.expense_id, p.name 
   FROM expense_invoices i 
   LEFT JOIN people p ON i.person_id = p.id 
   WHERE i.person_id IS NOT NULL;"
```

---

## Getting Help

### Before Reporting Issues

1. **Check this guide** for common solutions
2. **Review error messages** carefully
3. **Check browser console** for errors (F12)
4. **Test in different browser** to isolate issue
5. **Verify network connection** is stable

### Information to Include

When reporting issues, include:

- **Error message** (exact text)
- **Steps to reproduce** the issue
- **Browser and version** (Chrome 120, Firefox 121, etc.)
- **File details** (size, how created)
- **Screenshots** if applicable
- **Console errors** from browser developer tools
- **Server logs** if available
- **Person selection** if using person linking (v4.13.0+)

### Where to Get Help

- **Documentation**: Check docs/features/MEDICAL_EXPENSE_INVOICES.md
- **GitHub Issues**: Report bugs and issues
- **Community Forums**: Ask questions
- **Administrator**: For server/storage issues

---

## Preventive Maintenance

### Regular Tasks

**Weekly:**
- Monitor storage usage
- Review error logs
- Test upload functionality

**Monthly:**
- Clean up orphaned files
- Verify backup integrity
- Review access logs

**Quarterly:**
- Audit storage requirements
- Update documentation
- Test disaster recovery

### Monitoring Commands

```bash
# Storage usage alert
USAGE=$(du -s /config/invoices | awk '{print $1}')
if [ $USAGE -gt 1000000 ]; then
  echo "Warning: Invoice storage exceeds 1GB"
fi

# Count orphaned files
node backend/scripts/findOrphanedInvoices.js

# Verify backup includes invoices
tar -tzf backup.tar.gz | grep invoices
```

---

**Last Updated:** January 17, 2026  
**Version:** 2.0 (Multi-Invoice Support)  
**Status:** Active
