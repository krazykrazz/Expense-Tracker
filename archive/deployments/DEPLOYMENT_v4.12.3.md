# Deployment v4.12.3

**Date:** January 16, 2026  
**Version:** 4.12.3  
**Type:** PATCH - Bug Fix  
**Git Commit:** b04e203

## Overview

Critical bug fix for invoice upload functionality in Docker environments. Resolves EXDEV (cross-device link) error that prevented invoice attachments from being saved.

## Changes

### Bug Fixes

#### Invoice Upload EXDEV Error
- **Issue**: Invoice uploads failing with "EXDEV: cross-device link not permitted" error
- **Root Cause**: Using `fs.rename()` to move files between different Docker volumes/filesystems
- **Solution**: 
  - Changed multer from `diskStorage` to `memoryStorage`
  - Files now stored in memory during upload, then written directly to final location
  - Eliminates cross-device move operation entirely
- **Files Modified**:
  - `backend/middleware/uploadMiddleware.js` - Changed to memoryStorage
  - `backend/services/invoiceService.js` - Write buffer directly instead of moving from temp
  - `backend/utils/fileValidation.js` - Added `validateFileBuffer()` method

## Technical Details

### Problem
When Docker volumes are mounted from different filesystems (e.g., `/config/invoices/temp` on host filesystem and `/app/config/invoices` in container), Node.js `fs.rename()` fails with EXDEV error because rename operations cannot cross filesystem boundaries.

### Solution
1. **Multer Configuration**: Changed from `diskStorage` to `memoryStorage`
   - Files are now held in memory (Buffer) during upload
   - No temporary file on disk needed
   - Avoids cross-device rename entirely

2. **File Writing**: Direct buffer-to-disk write
   - `fs.promises.writeFile()` writes buffer directly to final location
   - Works across any filesystem boundary
   - Single atomic operation

3. **Validation**: Added buffer validation
   - New `validateFileBuffer()` method validates PDF content from memory
   - Checks magic numbers, structure, size without disk I/O
   - Maintains same security checks as file-based validation

### Benefits
- Eliminates EXDEV errors completely
- Faster uploads (no disk I/O for temp file)
- Simpler code path (no temp file cleanup needed)
- Works in any Docker volume configuration

## Docker Image

**Image:** `localhost:5000/expense-tracker:latest`  
**Digest:** `sha256:7c3fd8ac4412e5fb2783c9fbe437188b00928801cadeba9e5f881edc3a30be6d`  
**Size:** ~856 bytes (manifest)

## Deployment Steps

1. **Pull the new image:**
   ```bash
   docker-compose pull
   ```

2. **Restart the container:**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

3. **Verify the deployment:**
   ```bash
   docker-compose logs -f
   ```

4. **Test invoice upload:**
   - Navigate to a medical expense
   - Attach a PDF invoice
   - Verify successful upload without EXDEV error

## Testing

### Manual Testing
- ✅ Invoice upload to medical expense
- ✅ Invoice viewing after upload
- ✅ Invoice deletion
- ✅ Multiple invoice operations in sequence
- ✅ Large file uploads (up to 10MB)

### Verification
- Check container logs for any EXDEV errors (should be none)
- Verify invoices are saved to correct directory structure
- Confirm PDF files are valid and viewable

## Rollback Plan

If issues occur, rollback to v4.12.2:

```bash
docker pull localhost:5000/expense-tracker:v4.12.2
docker-compose down
# Update docker-compose.yml to use v4.12.2
docker-compose up -d
```

## Notes

- This fix is critical for Docker deployments where volumes span different filesystems
- Memory usage slightly increased during uploads (max 10MB per upload)
- No database changes required
- No data migration needed
- Existing invoices remain accessible

## Related Issues

- EXDEV error: "cross-device link not permitted, rename"
- Invoice upload failures in production Docker environment
- Temp directory and final directory on different volumes

## Success Criteria

- ✅ Invoice uploads complete without EXDEV errors
- ✅ Files saved to correct directory structure
- ✅ PDF validation still works correctly
- ✅ No regression in other invoice features
- ✅ Container logs show no errors

---

**Status:** ✅ Deployed  
**Deployed By:** System  
**Deployment Time:** ~1 minute
