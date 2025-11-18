# Deployment Summary - v3.3.4

**Release Date:** November 18, 2025  
**Version Type:** PATCH (Bug Fixes + UI Improvements)  
**Previous Version:** 3.3.2

## Changes in This Release

### Bug Fixes
- **Date Input Timezone Issue**: Fixed critical bug where date inputs were using UTC instead of local timezone
  - Previously, date inputs could show the wrong day (off by one) depending on user's timezone
  - Example: If it's 11 PM on Jan 15 in your timezone, UTC might be Jan 16, causing the date input to default to Jan 16
  - Now correctly uses local timezone for all date inputs
- **Tax Deduction Bar Labels**: Fixed missing amount labels on donation/medical bars in annual summary
  - Previously, amounts under $50 wouldn't show their labels
  - Now all bars display their amounts regardless of size

### UI Improvements
- **Monthly Summary Layout**: Improved readability with vertical stacking
  - Labels now appear on first line, amounts on second line
  - Applies to Weekly Totals, Payment Methods, and Types sections
  - Increased value font size from 12px to 14px for better visibility

### Technical Changes
- Added three new utility functions in `frontend/src/utils/formatters.js`:
  - `getTodayLocalDate()` - Returns today's date in YYYY-MM-DD format using local timezone
  - `dateToLocalString(date)` - Converts Date object to YYYY-MM-DD using local timezone
  - `getCurrentYearMonth()` - Returns current year-month in YYYY-MM format using local timezone
- Updated `ExpenseForm.jsx` to use `getTodayLocalDate()` instead of `new Date().toISOString().split('T')[0]`
- Removed conditional rendering threshold in `AnnualSummary.jsx` for tax deduction bar labels
- Updated `SummaryPanel.css` to use `flex-direction: column` for better label/value layout

## Files Modified
- `frontend/package.json` - Version bump to 3.3.4
- `backend/package.json` - Version bump to 3.3.4
- `frontend/src/App.jsx` - Version display updated to v3.3.4
- `frontend/src/utils/formatters.js` - Added new date utility functions
- `frontend/src/components/ExpenseForm.jsx` - Updated to use new date utilities
- `frontend/src/components/AnnualSummary.jsx` - Removed conditional threshold for bar labels
- `frontend/src/components/SummaryPanel.css` - Updated layout to vertical stacking
- `CHANGELOG.md` - Documented changes

## Build Information
- Frontend rebuilt successfully
- Bundle size: 233.90 kB (64.45 kB gzipped)
- Build time: 778ms
- No errors or warnings

## Deployment Steps

### Option 1: Standard Deployment (Current Setup)
```bash
# The frontend is already built in frontend/dist/
# Just restart the backend to serve the new frontend
cd backend
npm start
```

### Option 2: Docker Deployment (When Ready)
```bash
# Build the unified Docker image
docker build -t expense-tracker:3.3.4 .

# Or pull from local registry (once CI/CD is set up)
docker pull localhost:5000/expense-tracker:latest

# Run with docker-compose
docker-compose up -d
```

## Testing Checklist
- [ ] Verify date input shows today's date correctly in local timezone
- [ ] Add a new expense and confirm the date is correct
- [ ] Test in different timezones (if possible)
- [ ] Verify existing expenses still display correctly
- [ ] Check that the version number shows v3.3.4 in the footer
- [ ] Verify all donation/medical bars show amounts in annual summary
- [ ] Check monthly summary layout shows labels above values
- [ ] Confirm improved readability of weekly totals, payment methods, and types

## Rollback Plan
If issues occur, rollback to v3.3.2:
1. Restore previous version files from git: `git checkout v3.3.2`
2. Rebuild frontend: `cd frontend && npm run build`
3. Restart backend

## Notes
- This is a bug fix release with no breaking changes
- No database migrations required
- No configuration changes needed
- Users will see the fix immediately upon page refresh
