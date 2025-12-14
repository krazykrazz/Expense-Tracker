# Enhancement: Reminder Highlighting

**Date:** December 6, 2025  
**Type:** User Experience Enhancement  
**Status:** ✅ Complete

---

## Overview

Enhanced the Monthly Data Reminders feature to highlight specific investments and loans that need updates when users click on reminder banners. This makes it immediately clear which items require attention.

---

## Problem

When users clicked on a reminder banner (e.g., "2 investments need values for December"), the modal would open but wouldn't indicate which specific investments needed updates. Users had to manually check each investment to find the ones missing data.

---

## Solution

### Backend (Already Available)
The reminder API already returns detailed information about which items need updates:
- `investments` array with `id`, `name`, `type`, and `hasValue` for each investment
- `loans` array with `id`, `name`, `loan_type`, and `hasBalance` for each loan

### Frontend Changes

#### 1. SummaryPanel.jsx
- Extract IDs of investments/loans that need updates from reminder status
- Pass `highlightIds` prop to InvestmentsModal and LoansModal

```javascript
const investmentsNeedingUpdate = reminderStatus.investments
  ? reminderStatus.investments.filter(inv => !inv.hasValue).map(inv => inv.id)
  : [];

const loansNeedingUpdate = reminderStatus.loans
  ? reminderStatus.loans.filter(loan => !loan.hasBalance).map(loan => loan.id)
  : [];
```

#### 2. InvestmentsModal.jsx
- Accept `highlightIds` prop (defaults to empty array)
- Check if each investment needs update
- Add visual indicators:
  - Orange border and background
  - "⚠️ Update Needed" badge
  - Pulsing animation to draw attention
  - Tooltip explaining what's needed

#### 3. LoansModal.jsx
- Same enhancements as InvestmentsModal
- Highlights loans missing balance data for current month

#### 4. CSS Styling
Added to both `InvestmentsModal.css` and `LoansModal.css`:
- `.needs-update` class for highlighted items
- Orange color scheme (#ff9800) for warning
- Subtle pulsing animation
- Enhanced hover states

---

## Visual Design

### Highlighted Item Appearance
- **Border:** Orange (#ff9800) with subtle shadow
- **Background:** Light orange (#fff3e0)
- **Badge:** "⚠️ Update Needed" with pulsing animation
- **Tooltip:** Explains what data is missing

### Normal Item Appearance
- Standard gray border
- Light gray background
- No special badges

---

## User Experience Flow

1. User sees reminder banner: "2 investments need values for December"
2. User clicks banner → InvestmentsModal opens
3. Items needing updates are immediately visible with:
   - Orange highlighting
   - Warning badge
   - Pulsing animation
4. User can quickly identify and update the correct items
5. After updating, reminder disappears on next page load

---

## Technical Details

### Files Modified
- `frontend/src/components/SummaryPanel.jsx` - Pass highlight IDs to modals
- `frontend/src/components/InvestmentsModal.jsx` - Accept and use highlight IDs
- `frontend/src/components/LoansModal.jsx` - Accept and use highlight IDs
- `frontend/src/components/InvestmentsModal.css` - Add highlighting styles
- `frontend/src/components/LoansModal.css` - Add highlighting styles

### Props Added
```javascript
// InvestmentsModal
highlightIds: number[] = [] // IDs of investments needing updates

// LoansModal
highlightIds: number[] = [] // IDs of loans needing updates
```

### CSS Classes Added
- `.needs-update` - Applied to items needing updates
- `.needs-update-badge` - Warning badge with animation
- `@keyframes pulse` - Subtle pulsing animation

---

## Benefits

1. **Immediate Clarity:** Users instantly see which items need attention
2. **Reduced Friction:** No need to check each item individually
3. **Visual Feedback:** Clear, non-intrusive highlighting
4. **Accessibility:** Tooltips explain what's needed
5. **Consistent UX:** Same pattern for both investments and loans

---

## Testing

### Manual Testing Steps
1. Create investments/loans without current month data
2. Navigate to current month
3. Verify reminder banners appear
4. Click investment reminder → verify highlighted items
5. Click loan reminder → verify highlighted items
6. Add missing data → verify highlighting disappears
7. Verify highlighting works with multiple items

### Edge Cases Handled
- Empty highlightIds array (no highlighting)
- All items need updates (all highlighted)
- No items need updates (no highlighting)
- Modal opened without clicking reminder (no highlighting)

---

## Future Enhancements

Potential improvements for future versions:
- Auto-scroll to first highlighted item
- Count badge showing "2 of 5 need updates"
- Quick-add button directly on highlighted items
- Bulk update feature for multiple items
- Reminder history/tracking

---

## Deployment

**Build Status:** ✅ Complete  
**Frontend Build:** 1.08s  
**Bundle Size:** 318.16 kB (83.26 kB gzipped)  
**CSS Size:** 115.98 kB (18.06 kB gzipped)

**To Deploy:**
```bash
# Frontend already built
# Just restart the application to see changes
docker-compose restart
```

---

## User Feedback

This enhancement directly addresses user feedback: "I think when I have a notification to update a loan or an investment it should show me which one needs the update when I click on the reminder."

**Status:** ✅ Implemented and ready for use

---

**Implemented by:** Kiro AI Assistant  
**Date:** December 6, 2025  
**Version:** 4.5.0 (post-release enhancement)
