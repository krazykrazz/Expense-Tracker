# Quick Deployment Summary - v4.4.3

**Version:** 4.4.3 (PATCH)  
**Date:** December 3, 2025  
**Status:** ✅ Deployed

## What Changed
Fixed expense list not automatically refreshing after adding a new expense in monthly view.

## Version Bump
4.4.2 → 4.4.3 (PATCH - bug fix only)

## Files Changed
- `frontend/src/App.jsx` - Fixed date parsing in handleExpenseAdded
- Version files updated (package.json, App.jsx, CHANGELOG.md, BackupSettings.jsx)

## Build Info
- **Image:** localhost:5000/expense-tracker:latest
- **Version:** 4.4.3
- **Commit:** 2c8ff72
- **Digest:** sha256:0ad959454c5ba29805c3cc8cf2703b9b268d502f1c275350dc92abbb1222f498

## Deploy Command
```bash
docker-compose pull
docker-compose up -d
```

## Verification
- [ ] Expense list refreshes immediately after adding expense
- [ ] Works in monthly view
- [ ] Works in global view
- [ ] Version shows v4.4.3

---
**Includes fixes from v4.4.2:** Trend indicators in monthly summary sections
