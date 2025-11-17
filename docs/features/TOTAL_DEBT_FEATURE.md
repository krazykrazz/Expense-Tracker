# Total Debt Over Time Feature

**Date**: November 16, 2025  
**Feature Type**: New Feature (MINOR version bump candidate)

## Overview

Added a new "Total Debt Trend" view to the Manage Loans page that shows the change in total outstanding debt over time across all active loans.

## Implementation

### Backend Changes

1. **Repository** (`backend/repositories/loanBalanceRepository.js`)
   - Added `getTotalDebtOverTime()` method
   - Aggregates loan balances by month across all active loans
   - Returns monthly totals with loan count

2. **Service** (`backend/services/loanBalanceService.js`)
   - Added `getTotalDebtOverTime()` method to expose repository function

3. **Controller** (`backend/controllers/loanBalanceController.js`)
   - Added `getTotalDebtOverTime()` endpoint handler
   - Returns JSON array of monthly debt totals

4. **Routes** (`backend/routes/loanBalanceRoutes.js`)
   - Added `GET /api/loan-balances/total/history` endpoint
   - Placed before `/:loanId` route to avoid path conflicts

### Frontend Changes

1. **API Service** (`frontend/src/services/loanBalanceApi.js`)
   - Added `getTotalDebtOverTime()` function to fetch total debt history

2. **New Component** (`frontend/src/components/TotalDebtView.jsx`)
   - Full-screen modal view for total debt visualization
   - Features:
     - Summary statistics (current debt, starting debt, total reduction, active loans)
     - SVG line chart showing debt trend over time
     - Monthly history table with change indicators
     - Responsive design

3. **Styling** (`frontend/src/components/TotalDebtView.css`)
   - Complete styling for the total debt view
   - Chart visualization styles
   - Responsive breakpoints for mobile

4. **LoansModal Integration** (`frontend/src/components/LoansModal.jsx`)
   - Added "📊 View Total Debt Trend" button
   - Integrated TotalDebtView component
   - Updated button layout to accommodate new button

5. **LoansModal Styling** (`frontend/src/components/LoansModal.css`)
   - Updated button section to use flexbox layout
   - Added styling for total debt button
   - Responsive button wrapping

## Features

### Summary Statistics
- **Current Total Debt**: Latest total across all active loans
- **Starting Total Debt**: First recorded total
- **Total Reduction**: Amount paid down since start
- **Active Loans**: Number of loans contributing to current total

### Visual Chart
- SVG-based line chart showing debt trend
- Grid lines for easy reading
- Data points for each month
- Auto-scaling based on data range

### Monthly History Table
- Chronological list of all months (newest first)
- Total debt for each month
- Change from previous month (amount and percentage)
- Visual indicators (▼ for decrease, ▲ for increase)
- Color coding (green for decrease, red for increase)
- Number of active loans per month

## API Endpoint

```
GET /api/loan-balances/total/history
```

**Response:**
```json
[
  {
    "year": 2024,
    "month": 12,
    "total_debt": 396088.45,
    "loan_count": 1
  },
  {
    "year": 2025,
    "month": 1,
    "total_debt": 413985.46,
    "loan_count": 3
  }
]
```

## User Flow

1. User opens "Manage Loans" modal
2. User clicks "📊 View Total Debt Trend" button
3. Total Debt View modal opens showing:
   - Summary statistics at top
   - Visual chart in middle
   - Detailed monthly history table at bottom
4. User can close to return to Manage Loans view

## Technical Notes

- Only includes active loans (excludes paid-off loans)
- Requires at least one balance entry to show data
- Chart auto-scales to data range with 10% padding
- Responsive design works on mobile and desktop
- No external charting libraries used (pure SVG)

## Testing

Tested with existing loan data:
- ✅ API endpoint returns correct aggregated data
- ✅ Chart renders correctly with multiple data points
- ✅ Summary statistics calculate correctly
- ✅ Monthly history table shows proper changes
- ✅ Responsive design works on different screen sizes
- ✅ Empty state handled gracefully

## Future Enhancements

Potential improvements:
- Add date range filter
- Export data to CSV
- Show average monthly paydown
- Projected payoff date based on trend
- Include paid-off loans toggle
- Comparison with income/expenses
