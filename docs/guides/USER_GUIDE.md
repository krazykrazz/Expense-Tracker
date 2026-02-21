# User Guide

Complete guide to using the Expense Tracker application.

## Table of Contents

- [Getting Started](#getting-started)
- [Expense Management](#expense-management)
- [Payment Methods](#payment-methods)
- [Income & Fixed Expenses](#income--fixed-expenses)
- [Loans & Lines of Credit](#loans--lines-of-credit)
- [Investment Tracking](#investment-tracking)
- [Budget Tracking](#budget-tracking)
- [Medical Expenses](#medical-expenses)
- [Merchant Analytics](#merchant-analytics)
- [Data Management](#data-management)

## Getting Started

After deploying the application via Docker, access it at http://localhost:2424 in your browser.

### First-Time Setup

1. **Add Payment Methods** - Configure your payment methods (Cash, Debit, Credit Cards)
2. **Set Up Income Sources** - Add your monthly income sources
3. **Configure Fixed Expenses** - Add recurring monthly expenses
4. **Add Family Members** (Optional) - For medical expense tracking

## Expense Management

### Adding Expenses

1. Click the **"+ Add Expense"** button in the header
2. Enter the place name first - the system will suggest a category based on your history
3. The form remembers your last used payment method
4. For credit card expenses, optionally enter a "Posted Date" if different from transaction date

### Editing and Deleting

- **Edit**: Click the edit button (✏️) next to any expense
- **Delete**: Click the delete button (🗑️) next to any expense

### Global Filtering

Use the search bar filters to find expenses across all time periods:

- **Text Search**: Search by place or notes
- **Category Filter**: Filter by expense type (Groceries, Gas, etc.)
- **Payment Method Filter**: Filter by payment method (Credit Card, Cash, etc.)
- **Year Filter**: Scope search to a specific year (current year and past 10 years available)
- **Combine Filters**: Use multiple filters together for precise results
- **Clear Filters**: Click "Clear Filters" to return to monthly view

### Monthly Filtering

Use the dropdowns in the expense list to filter within the current month.

### Progressive Disclosure

The expense form uses collapsible sections to reduce clutter:

- **Advanced Options** - Future months, reimbursement tracking
- **Insurance** - Medical insurance claim tracking
- **People** - Family member assignment for medical expenses
- **Invoices** - PDF invoice attachments

### Contextual Help

Hover over the (?) icons to see tooltips explaining when and why to use each field.

### Reimbursement Tracking

Track expected reimbursements from employers, insurance, or other sources on any non-medical expense:

1. Create or edit an expense
2. Expand the **"Advanced Options"** section
3. Enter the total amount charged as the expense amount
4. Enter the expected reimbursement amount
5. The form shows the net out-of-pocket amount automatically

Expenses with reimbursements show a 💰 indicator in the expense list. Hover over it to see the breakdown of Charged, Reimbursed, and Net amounts.

**Note**: Medical expenses use the dedicated Insurance Tracking section instead (see [Medical Expenses](#medical-expenses)).

### Real-Time Multi-Device Sync

The application supports multi-device access with automatic data synchronization:

- **Automatic Updates**: When you add, edit, or delete data on one device, all other open tabs/devices refresh automatically
- **Visual Notification**: A brief toast notification appears when data is refreshed from another device
- **Background Optimization**: When a browser tab is hidden, the sync connection is paused to save CPU. Data refreshes automatically when you return to the tab
- **No Manual Refresh Needed**: All data stays current across devices connected to the same server

## Payment Methods

### Viewing Payment Methods

Click the **"💼 Financial"** button in the navigation, then select the **"Payment Methods"** tab to see all configured payment methods.

### Adding Payment Methods

1. Click **"+ Add Payment Method"**
2. Select the type: Cash, Cheque, Debit, or Credit Card
3. Enter the display name and full name
4. For credit cards, enter credit limit and billing cycle details

### Credit Card Features

For credit card payment methods:

- **View Balance**: See current balance and credit utilization
- **Record Payments**: Log payments to reduce balance
- **Payment History**: View all recorded payments with dates and notes
- **Upload Statements**: Attach PDF statements with billing period dates
- **Due Date Reminders**: Get alerts when payment is due within 7 days
- **Billing Cycle Tracking**: Track statement balances and transaction counts
- **Auto-Generated Billing Cycles**: The system automatically creates billing cycle records when a cycle ends (see below)

### Auto-Generated Billing Cycles

The system automatically detects when a credit card billing cycle has ended and creates a billing cycle record in the background. You don't need to open the credit card detail view for this to happen — it runs on a daily schedule.

**How it works:**

1. When a billing cycle ends, the system creates a record with a calculated balance based on your tracked expenses
2. A notification banner appears at the top of the page: **"Auto-generated billing cycle created for {card name}"**
3. The notification shows the card name, cycle end date, and the calculated balance

**Reviewing and entering the actual balance:**

1. Click the notification banner to navigate to the credit card's billing cycle list
2. Review the calculated balance — this is the sum of expenses you've tracked for that billing period
3. Compare it with the actual statement balance from your credit card statement
4. Enter the actual statement balance to update the record
5. Once you enter the actual balance, the notification disappears

This ensures your billing cycle records stay up to date even if you don't check the app regularly.

### Activate/Deactivate

Toggle payment methods active/inactive. Inactive methods are hidden from dropdowns but preserved for historical data.

### Deleting Payment Methods

Remove payment methods with zero associated expenses. Methods with expenses cannot be deleted to preserve data integrity.

## Income & Fixed Expenses

### Managing Income

1. Click the **"👁️ View/Edit"** button next to Monthly Gross Income
2. Add income sources with names, amounts, and categories (Salary, Government, Gifts, Other)
3. Income is tracked monthly and appears in summaries

### Managing Fixed Expenses

1. Click the **"👁️ View/Edit"** button next to Total Fixed Expenses
2. Add fixed expenses with names, amounts, categories, and payment types
3. Optionally link to loans for payment tracking
4. Set payment due days for reminder generation

### Carry Forward

Use the **"📋 Copy from Previous Month"** button to copy previous month's income or fixed expenses to the current month.

## Loans & Lines of Credit

### Viewing Loans

Click the **"💼 Financial"** button in the toolbar and select the **"Loans"** tab to see all loans.

### Adding Loans

1. Click **"+ Add New Loan"**
2. Select the loan type:
   - **Loan**: Traditional loans (car loans, student loans) with paydown progress tracking
   - **Line of Credit**: Revolving credit (HELOCs) with balance/rate visualization
   - **Mortgage**: Dedicated mortgage tracking with amortization, equity, and payment insights

### Recording Payments

1. Click on any loan to view details
2. Click **"Add Payment"** to record individual payments
3. Enter payment amount, date, and optional notes
4. Balance is automatically calculated from payment history

### Payment Suggestions

Click **"Use Suggested Amount"** to get smart payment amount suggestions based on loan type and history.

### Balance Migration

Convert existing balance entries to payment format using the migration tool in the loan detail view.

### Fixed Expense Loan Linkage

1. When editing a fixed expense, select a loan from the **"Linked Loan"** dropdown
2. Set the payment due day (1-31) for reminder generation
3. Loan payment reminders appear in the reminder banner when due dates approach
4. Click **"Log Payment"** on reminder banners to automatically create loan payment entries

## Investment Tracking

### Viewing Investments

Click the **"💼 Financial"** button in the toolbar and select the **"Investments"** tab to see all investments.

### Adding Investments

1. Click **"+ Add New Investment"**
2. Select the type: TFSA or RRSP
3. Enter the investment name and initial value

### Tracking Values

1. Click **"View"** on any investment to see details
2. Add monthly value entries to track performance over time
3. View line graphs showing investment value changes
4. See chronological list of all value entries with change indicators and percentages

### Portfolio Overview

View total portfolio value and net worth (investments minus outstanding debt) in the Financial Overview modal header, accessible via the **"💼 Financial"** button.

### Data Reminders

See reminder banners when investment values need updating for the current month.

## Budget Tracking

### Managing Budgets

1. Click the **"💵 Budgets"** button in the month selector
2. Set budget limits for Food, Gas, and Other categories
3. Budgets automatically carry forward from previous month

### Monitoring Progress

View real-time progress bars with color-coded status:

- **Green**: Under 80% of budget (safe)
- **Yellow**: 80-89% of budget (warning)
- **Orange**: 90-99% of budget (danger)
- **Red**: 100% or more (over budget)

### Budget Alert Notifications

Receive prominent banner alerts at the top of the interface when budgets need attention:

- **Warning Alerts (80-89%)**: Yellow banners with ⚡ icon when approaching budget limits
- **Danger Alerts (90-99%)**: Orange banners with ! icon when nearing budget limits
- **Critical Alerts (≥100%)**: Red banners with ⚠ icon when exceeding budget limits

### Dismissing Alerts

Click the × button to temporarily hide alert banners during your current session.

### Quick Budget Actions

Use alert banner buttons to:
- **Manage Budgets**: Open budget management modal directly from the alert
- **View Details**: Navigate to budget summary section for detailed analysis

### Budget History

Click the **"💵 Budgets"** button and select the **History** tab to analyze budget performance over time (3, 6, or 12 months).

## Medical Expenses

### Managing People

1. Click **"⚙️ Settings"** in the header
2. Click **"People"** tab
3. Add family members with names and optional dates of birth

### Assigning People to Expenses

1. When creating a medical expense (Tax - Medical), select one or more people
2. **Single Person**: Selecting one person automatically assigns the full amount
3. **Multiple People**: Selecting multiple people opens the allocation modal
4. Use **"Split Equally"** button to divide the expense evenly
5. Or enter specific amounts for each person (must sum to total)

### Insurance Tracking

1. Check **"Eligible for Insurance"** when creating/editing a medical expense
2. Enter the **Original Cost** (full expense amount before reimbursement)
3. The **Amount** field represents what you actually paid after reimbursement
4. Set **Claim Status**: Not Claimed, In Progress, Paid, or Denied
5. Click the status indicator in the expense list to quickly change status

### Invoice Attachments

1. When creating or editing a medical expense, scroll to **"Invoice Attachment"** section
2. Click **"Choose File"** or drag and drop a PDF file (max 10MB)
3. Optionally select a family member to link the invoice to
4. Click **"Add Invoice"** to attach additional invoices to the same expense
5. Click the 📄 icon next to medical expenses to open the PDF viewer

### Tax Reports

1. Navigate to the Tax Deductible view
2. Toggle **"Group by Person"** to see expenses organized by family member
3. View per-person subtotals by medical provider for tax preparation
4. Filter by claim status or invoice attachment status

## Merchant Analytics

### Viewing Merchant Analytics

1. Click the **"📈 Analytics"** button in the main navigation
2. Select the **"Merchants"** tab

### Analyzing Top Merchants

- View merchants ranked by total spending, visit frequency, or average spend per visit
- Use the period dropdown to analyze different time ranges (All Time, This Year, This Month, Last 3 Months)
- Toggle between sorting by total spend, number of visits, or average spend per visit

### Merchant Details

Click on any merchant to see:

- Detailed statistics (visit count, average spend, date ranges)
- Category and payment method breakdowns
- Monthly spending trend charts (last 12 months)
- Average days between visits
- Percentage of total expenses

### Including Fixed Expenses

Toggle the **"Include Fixed Expenses"** checkbox to combine variable and recurring expenses for comprehensive spending analysis.

### Drill-Down to Expenses

Click **"View All Expenses"** to see the complete list of expenses at any merchant.

## Data Management

### Manual Backup

Click the **"💾 Backup"** button to download your database.

### Automated Backups

Configure scheduled backups in Settings:

1. Click **"⚙️ Settings"** in the header
2. Click **"Backup Configuration"** tab
3. Enable automated backups
4. Set backup frequency and retention period

### Restoring from Backup

1. Click **"ℹ️ System Information"** in the header
2. Click **"Backup Information"** tab
3. Click **"Restore from Backup"**
4. Select your backup file
5. Confirm the restore operation

### Data Reminders

Receive visual reminders when monthly data needs updating:

- Investment values for the current month
- Loan balances for the current month
- Billing cycle statement balances
- Auto-generated billing cycles awaiting actual statement balance entry

### Activity Log

View a comprehensive history of all data changes in the application:

1. Click **"ℹ️ System Information"** in the header
2. Click **"Activity Log"** tab
3. View recent events with timestamps and details

**Features:**
- **Event Tracking**: See all creates, updates, and deletes across expenses, loans, investments, budgets, and more
- **Change Details**: Update events show exactly what changed (e.g., "amount: $30.00 → $45.00, category: health → medical")
- **Human-Readable Timestamps**: Events show as "2 hours ago", "Yesterday at 3:45 PM", etc.
- **Display Limit**: Choose to show 25, 50, 100, or 200 events (preference saved automatically)
- **Load More**: Load additional events with a running count ("Showing 50 of 234 events")
- **Automatic Cleanup**: Events are automatically cleaned up based on configurable retention settings

**Configuring Retention:**
1. Click **"⚙️ Settings"** in the header
2. Go to the **"General"** tab
3. Under **"Activity Log Retention Policy"**, set:
   - **Maximum Age**: How many days to keep events (7–365, default: 90)
   - **Maximum Count**: Maximum number of events to retain (100–10,000, default: 1,000)
4. Click **Save** to apply

**Use Cases:**
- Track when expenses were added or modified
- Review loan payment history
- Audit budget changes
- Monitor backup operations
- Investigate data discrepancies

## Tips and Best Practices

### Expense Entry

- Enter place names consistently for better category suggestions
- Use the posted date feature for credit card expenses to match statement dates
- Add notes to expenses for future reference

### Budget Management

- Review budget alerts regularly and adjust spending or limits as needed
- Use budget history to identify spending trends
- Set realistic budget limits based on historical spending

### Medical Expenses

- Attach invoices immediately when creating medical expenses
- Update insurance claim status as claims progress
- Review tax reports before tax season to ensure all expenses are properly categorized

### Financial Tracking

- Update investment values monthly for accurate net worth tracking
- Record loan payments promptly to maintain accurate balance calculations
- Link fixed expenses to loans for integrated payment tracking

### Data Maintenance

- Perform manual backups before major changes
- Review and dismiss anomaly alerts to improve future predictions
- Use merchant analytics to identify spending patterns and opportunities for savings
