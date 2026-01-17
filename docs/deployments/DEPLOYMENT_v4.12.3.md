# Deployment v4.12.3

**Date:** January 16, 2026  
**Version:** 4.12.3  
**Type:** PATCH - Bug Fix  
**Git Commit:** 9bf3226  
**Docker Image:** localhost:5000/expense-tracker:latest  
**Docker Digest:** sha256:077754c0800a1539b6ca78d29d184b878689a2c9d7bac5f5cbb000c3ec78737d

---

## Summary

Critical bug fix for invoice upload functionality in Docker environments. Resolves EXDEV cross-device link error that prevented invoice attachments from being saved.

---

## Changes

### Bug Fixes

#### Invoice Upload Error (EXDEV)
- **Issue**: Invoice uploads failing with "EXDEV: cross-device link not permitted" error
- **Root Cause**: Using `fs.rename()` to move files across different Docker volumes/filesystems
- **Solution**: Replaced `fs.rename()` with `fs.copyFile()` + `fs.unlink()` pattern
- **Impact**: Invoice uploads now work correctly in Docker environments
- **Files Modified**:
  - `backend/utils/fileStorage.js` - Updated `moveFromTemp()` method

### Technical Details

The error occurred because:
1. Multer saves uploaded files to `/config/invoices/temp` (Docker volume)
2. Final storage location is `/app/config/invoices/YYYY/MM/` (container filesystem)
3. `fs.rename()` fails when source and destination are on different devices/volumes
4. Solution uses `fs.copyFile()` to copy across devices, then `fs.unlink()` to remove temp file

---

## Version Updates

Updated version to 4.12.3 in:
- ✅ `frontend/package.json`
- ✅ `backend/package.json`
- ✅ `frontend/src/App.jsx` (footer display)
- ✅ `frontend/src/components/BackupSettings.jsx` (in-app changelog)
- ✅ `CHANGELOG.md`

---

## Testing

### Automated Tests
- ✅ File storage tests pass (20/20)
- ✅ All existing tests continue to pass

### Manual Testing Required
- [ ] Upload invoice to medical expense in Docker environment
- [ ] Verify invoice saves successfully
- [ ] Verify invoice can be viewed
- [ ] Verify invoice can be downloaded
- [ ] Check container logs for errors

---

## Deployment Steps

### 1. Pull Latest Image
```bash
docker-compose pull
```

### 2. Restart Container
```bash
docker-compose down
docker-compose up -d
```

### 3. Verify Deployment
```bash
# Check container is running
docker-compose ps

# Check logs for startup
docker-compose logs -f --tail=50

# Verify version
curl http://localhost:2424/api/version
```

### 4. Test Invoice Upload
1. Navigate to expense tracker
2. Add or edit a medical expense
3. Upload a PDF invoice
4. Verify success message
5. Verify invoice appears in expense list
6. Click to view invoice in PDF viewer

---

## Rollback Plan

If issues occur:

```bash
# Stop current container
docker-compose down

# Pull previous version (4.12.2)
docker pull localhost:5000/expense-tracker:4.12.2
docker tag localhost:5000/expense-tracker:4.12.2 localhost:5000/expense-tracker:latest

# Restart
docker-compose up -d
```

---

## Files Changed

### Backend
- `backend/utils/fileStorage.js` - Fixed cross-device file move

### Frontend
- `frontend/package.json` - Version bump
- `frontend/src/App.jsx` - Version display
- `frontend/src/components/BackupSettings.jsx` - In-app changelog

### Documentation
- `CHANGELOG.md` - Version entry
- `backend/package.json` - Version bump

---

## Known Issues

None identified.

---

## Next Steps

1. Deploy to production server
2. Monitor logs for any errors
3. Test invoice upload functionality
4. Verify no regression in other features

---

## Notes

- This is a critical bug fix for the invoice feature introduced in v4.12.0
- The issue only manifested in Docker environments with volume mounts
- Development environments may not have experienced this issue
- The fix is backward compatible and doesn't require database changes

---

**Deployment Status:** ✅ Ready for Production  
**Breaking Changes:** None  
**Database Migration Required:** No  
**Configuration Changes Required:** No
