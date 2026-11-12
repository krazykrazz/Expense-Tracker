# Mortgage Tracking Feature

## Overview

Enhanced loan tracking with dedicated mortgage support including amortization schedules, equity tracking, payment insights, and variable rate management. Mortgages are a specialized loan type with additional fields and analytics.

## Features

### Mortgage-Specific Fields
- **Amortization Period**: Total loan term (e.g., 25 years)
- **Term Length**: Current term until renewal (e.g., 5 years)
- **Renewal Date**: When the current term expires
- **Rate Type**: Fixed or Variable rate indicator
- **Payment Frequency**: Monthly, Bi-weekly, or Accelerated Bi-weekly
- **Estimated Property Value**: For equity calculations; also counted in the Financial Overview net worth (see below)

### Net Worth (Financial Overview)
The Financial Overview modal header shows **Assets**, **Liabilities** and **Net Worth**. Assets = total investment value + estimated property value of active (not paid off) mortgages; Liabilities = remaining balance of all active loans, including mortgages. Net Worth = Assets − Liabilities. Hovering Assets shows the investments / property split.

### Interest and Balances
- Variable rates accrue monthly interest at the nominal rate (`rate / 12`). Fixed rates use Canadian semi-annual compounding: the monthly rate is `(1 + rate/2)^(1/6) − 1` (and `(1 + rate/2)^(2/26) − 1` per bi-weekly period). The same rate conversion is used by the balance engine, amortization schedule, minimum payment and projections
- The balance is rebuilt month by month from your payments and any balances you entered (see [Loan Payment Tracking](./LOAN_PAYMENT_TRACKING.md#rebuilding-balances-mortgages)). To pin the balance to a lender statement, log the payment with "Override Balance"

### Amortization Schedule
- Projected from the current (calculated) balance and rate over the **remaining** amortization: amortization period minus the months since the start date
- First payment on the next due date of the linked fixed expense (otherwise one period from today); later payments on the same day each month (or every 14 days for bi-weekly)
- Principal vs interest breakdown per payment, cumulative or per year

### Equity Tracking
- Current equity calculation (Property Value - Remaining Balance)
- Equity percentage of property value
- Equity growth over time chart (axis scaled to the data so monthly growth is visible)
- Historical equity uses the monthly balance snapshots and the current property value

### Mortgage Detail View
The KPI strip (balance, rate, daily interest, monthly payment and its source, next payment, equity, payoff date) sits above four tabs:

1. **Overview** — mortgage details, interest rate (with inline update for variable rates) and rate history, linked fixed expenses, payment summary, Edit Loan Details (name, notes, estimated property value, renewal date) and Mark Paid Off
2. **Charts** — equity, amortization schedule, balance over time (interest-aware balances; Paid Off % is measured against the original balance) and, for variable rates, a rate history step chart
3. **Projections** — payoff date, total interest and time/interest saved at your payment versus the minimum payment (which amortizes the balance over the remaining amortization), plus what-if extra payments. Your payment is the linked fixed expense for the latest month up to the current one; without a linked expense the calculated minimum is used and a note says so
4. **Payments** — log, edit and delete payments; each row shows the interest, principal and balance after the payment

After any payment or rate change every tab, the KPI strip and the loans list refresh.

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

### Editing a Mortgage
In Financial Overview → Loans, click Edit on a mortgage. Name, notes, renewal date and estimated property value can be changed; amortization period, term length, rate type and payment frequency are shown read-only. The renewal date is only sent when changed, so a mortgage whose renewal date has passed can still be edited.

### Viewing Mortgage Details
1. Click on a mortgage in the Loans list
2. The KPI strip and the Overview / Charts / Projections / Payments tabs open (see Mortgage Detail View above)

### Updating Variable Rate
1. Open mortgage details
2. On the Overview tab, click "✎ Update" next to the interest rate
3. Enter new interest rate
4. Save - sets the rate on the current month's balance entry (creating one at the calculated balance if needed) and rebuilds the balance from this month on

### Correcting the Balance
Log a payment with "Override Balance" set to the balance on your lender statement. It is stored as a user-entered (`manual`) balance for that month and every later month is rebuilt from it.

## API Endpoints

### Mortgage-Specific
- `GET /api/loans/:id/amortization` - Get amortization schedule
- `GET /api/loans/:id/equity-history` - Get equity history
- `PUT /api/loans/:id/property-value` - Update property value
- `PUT /api/loans/:id/rate` - Quick rate update (variable mortgages)

### Mortgage Insights
- `GET /api/loans/:id/insights` - Get mortgage insights (balance, rate, current and minimum payment, `remainingAmortizationMonths`, projections; `dataStatus.paymentSource` is `linked_fixed_expense` or `calculated`)
- `POST /api/loans/:id/insights/scenario` - Calculate what-if scenario

## Database Schema

### Loans Table (Extended)
```sql
-- Mortgage-specific columns added to loans table
amortization_period INTEGER,  -- Total amortization in years
term_length INTEGER,          -- Current term in years
renewal_date TEXT,            -- YYYY-MM-DD format
rate_type TEXT,               -- 'fixed' or 'variable'
payment_frequency TEXT,       -- 'monthly', 'biweekly', 'accelerated_biweekly'
estimated_property_value REAL -- For equity calculations
```

### Loan Balances
`loan_balances.source` marks each monthly snapshot as user-entered (`manual`) or generated by the balance engine (`auto`). See [Database Schema](../DATABASE_SCHEMA.md#loan_balances).

## Components

### Frontend
- `MortgageKpiStrip.jsx` - Always-visible key metrics
- `MortgageTabbedContent.jsx` - Overview / Charts / Projections / Payments tabs (incl. rate history chart)
- `MortgageDetailSection.jsx` - Mortgage details and renewal banner
- `MortgageEditForm.jsx` - Edit name, notes, property value and renewal date
- `AmortizationChart.jsx` - Amortization schedule visualization
- `EquityChart.jsx` - Equity growth chart
- `PaymentBalanceChart.jsx` - Balance over time
- `LoanPaymentHistory.jsx` - Payment table (interest / principal / balance after for mortgages)
- `PayoffProjectionInsights.jsx` - Payoff projections
- `ScenarioAnalysisInsights.jsx` - What-if calculator

### Backend
- `mortgageService.js` - Payment amount, amortization schedule, remaining amortization and equity calculations
- `mortgageInsightsService.js` - Insights calculations
- `balanceCalculationService.js` - Interest-aware balance, snapshot rebuild and payment balance history
- `utils/interestCalculation.js` - Periodic rate (incl. semi-annual compounding for fixed rates) and monthly interest

## Benefits

- **Better Visibility**: Understand mortgage progress with detailed analytics
- **Equity Tracking**: Monitor home equity growth over time
- **Rate Management**: Easy updates for variable rate mortgages
- **Payment Optimization**: See impact of extra payments
- **Financial Planning**: Project payoff dates and interest costs

---

**Last Updated**: November 2026


