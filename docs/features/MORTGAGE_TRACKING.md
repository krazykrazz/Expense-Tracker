# Mortgage Tracking Feature

**Version**: 4.18.0  
**Status**: Completed  
**Spec**: `.kiro/specs/mortgage-tracking/` and `.kiro/specs/mortgage-insights/`

## Overview

Enhanced loan tracking with dedicated mortgage support including amortization schedules, equity tracking, payment insights, and variable rate management. Mortgages are a specialized loan type with additional fields and analytics.

## Features

### Mortgage-Specific Fields
- **Amortization Period**: Total loan term (e.g., 25 years)
- **Term Length**: Current term until renewal (e.g., 5 years)
- **Renewal Date**: When the current term expires
- **Rate Type**: Fixed or Variable rate indicator
- **Payment Frequency**: Monthly, Bi-weekly, or Accelerated Bi-weekly
- **Estimated Property Value**: For equity calculations

### Amortization Schedule
- Full amortization schedule projection based on current rate and payment
- Principal vs interest breakdown per payment
- Remaining balance over time visualization
- Impact of different payment frequencies

### Equity Tracking
- Current equity calculation (Property Value - Remaining Balance)
- Equity percentage of property value
- Equity growth over time chart
- Historical equity data based on balance history

### Mortgage Insights Panel
Dedicated insights panel with collapsible sections:

1. **Current Status**
   - Current interest rate with fixed/variable badge
   - Daily, weekly, monthly, annual interest costs
   - Current payment vs minimum payment comparison
   - Current balance display
   - Quick rate update for variable mortgages

2. **Payoff Projections**
   - Estimated payoff date at current payment
   - Total interest remaining
   - Comparison with minimum payment scenario
   - Time and money saved with current payment

3. **What-If Scenarios**
   - Extra payment calculator
   - Impact on payoff date
   - Interest savings calculation
   - Side-by-side comparison

4. **Payment History**
   - Track payment amount changes over time
   - Add/edit/delete payment entries
   - Effective date tracking

### Variable Rate Support
- Rate type indicator (Fixed vs Variable)
- Quick rate update button for variable mortgages
- Rate history tracked via balance entries
- Rate change impact on projections

## Usage

### Creating a Mortgage
1. Open Loans modal from the main interface
2. Click "Add Loan"
3. Select "Mortgage" as the loan type
4. Fill in mortgage-specific fields:
   - Amortization period
   - Term length
   - Renewal date
   - Rate type (Fixed/Variable)
   - Payment frequency
   - Estimated property value (optional)
5. Save the mortgage

### Viewing Mortgage Details
1. Click on a mortgage in the Loans list
2. View the Mortgage Detail Section with:
   - Amortization chart
   - Equity chart (if property value set)
   - Mortgage Insights Panel

### Updating Variable Rate
1. Open mortgage details
2. In Current Status section, click "Update Rate"
3. Enter new interest rate
4. Save - creates/updates balance entry for current month

### Adding Balance Entries
Balance entries track the mortgage balance and rate over time:
1. Open mortgage details
2. Add balance entry with:
   - Year/Month
   - Remaining balance
   - Current interest rate

## API Endpoints

### Mortgage-Specific
- `GET /api/loans/:id/amortization` - Get amortization schedule
- `GET /api/loans/:id/equity-history` - Get equity history
- `PUT /api/loans/:id/property-value` - Update property value
- `PUT /api/loans/:id/rate` - Quick rate update (variable mortgages)

### Mortgage Insights
- `GET /api/loans/:id/insights` - Get mortgage insights
- `GET /api/loans/:id/payments` - Get payment history
- `POST /api/loans/:id/payments` - Create payment entry
- `PUT /api/loans/:id/payments/:paymentId` - Update payment entry
- `DELETE /api/loans/:id/payments/:paymentId` - Delete payment entry
- `POST /api/loans/:id/insights/scenario` - Calculate what-if scenario

## Database Schema

### Loans Table (Extended)
```sql
-- Mortgage-specific columns added to loans table
amortization_period INTEGER,  -- Total amortization in months
term_length INTEGER,          -- Current term in months
renewal_date TEXT,            -- YYYY-MM-DD format
rate_type TEXT,               -- 'fixed' or 'variable'
payment_frequency TEXT,       -- 'monthly', 'biweekly', 'accelerated_biweekly'
estimated_property_value REAL -- For equity calculations
```

### Mortgage Payments Table (New)
```sql
CREATE TABLE mortgage_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  payment_amount REAL NOT NULL,
  effective_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);
```

## Components

### Frontend
- `MortgageDetailSection.jsx` - Main mortgage detail view
- `AmortizationChart.jsx` - Amortization schedule visualization
- `EquityChart.jsx` - Equity growth chart
- `MortgageInsightsPanel.jsx` - Insights container
- `CurrentStatusInsights.jsx` - Current status section
- `PayoffProjectionInsights.jsx` - Payoff projections
- `ScenarioAnalysisInsights.jsx` - What-if calculator
- `PaymentTrackingHistory.jsx` - Payment history management

### Backend
- `mortgageService.js` - Amortization and equity calculations
- `mortgageInsightsService.js` - Insights calculations
- `mortgagePaymentService.js` - Payment tracking
- `mortgagePaymentRepository.js` - Payment data access

## Benefits

- **Better Visibility**: Understand mortgage progress with detailed analytics
- **Equity Tracking**: Monitor home equity growth over time
- **Rate Management**: Easy updates for variable rate mortgages
- **Payment Optimization**: See impact of extra payments
- **Financial Planning**: Project payoff dates and interest costs

---

**Last Updated**: January 2026
