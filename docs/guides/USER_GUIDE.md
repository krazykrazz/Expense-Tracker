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
- [Analytics](#analytics)
- [Merchant Analytics](#merchant-analytics)
- [Spending Alerts](#spending-alerts)
- [Data Management](#data-management)
- [Security](#security)
- [Container Update Detection](#container-update-detection)
- [Version Upgrade Notifications](#version-upgrade-notifications)

## Getting Started

After deploying the application via Docker, access it at http://localhost:2424 in your browser.

### Screen Layout

- **Header**: light/dark theme toggle, **🖥️ System** (system information, backups, activity log, tools), **⚙️ Settings** (retention, backup configuration, people, security), and the user menu (logout, when a password is set)
- **Month selector**: **📊 Annual Summary**, **💰 Income Tax**, **💵 Budgets**, **📈 Analytics**, **💼 Financial**, plus previous/next month buttons, year and month dropdowns, and a jump-to-current-month button
- **Left column**: the expense list for the selected month (or the global filter results)
- **Right column**: global filters above the **Monthly Summary** panel (notifications, income, balance, fixed and variable expenses, weekly breakdown, payment methods, expense types)

### First-Time Setup

1. **Add Payment Methods** - **💼 Financial** → Payment Methods → **+ Add**
2. **Set Up Income Sources** - **Manage Income** on the Monthly Income card
3. **Configure Fixed Expenses** - **Manage Fixed** on the Fixed Expenses card
4. **Add Family Members** (Optional) - **⚙️ Settings** → **👥 People**, for medical expense tracking

## Expense Management

### Adding Expenses

1. Click **"+ Add Expense"** in the expense list header (or the floating **Add Expense** button)
2. Enter the place name first - the system will suggest a category based on your history
3. The form remembers your last used payment method
4. For credit card expenses, optionally enter a **Posted Date** (under **Advanced Options**) if different from the transaction date

### Editing and Deleting

- **Edit**: Click the edit button (✏️) next to any expense
- **Delete**: Click the delete button (🗑️) next to any expense

### Global Filtering

Use the filters above the summary panel to find expenses across all time periods:

- **Text Search**: Search by place or notes
- **Category Filter**: Filter by expense type (Groceries, Gas, etc.)
- **Payment Method Filter**: Filter by payment method
- **Year Filter**: Scope results to a year (2000 through next year)
- **Date Range**: Pick From / To dates (leave To empty for "through today"), or use the **7 days**, **30 days**, **This month** and **YTD** presets
- **Combine Filters**: Filters combine with AND logic
- **Clear Filters**: Click **Clear Filters** (or **Return to Monthly View** in the Global View banner) to go back to the monthly view

While any global filter is active, a "Global View" banner lists the active filters and the month selector is disabled.

### Expense List

- Expenses are grouped by date, with a daily total on each date header
- **Quick views**: **All**, **Needs review** (tax-deductible expenses missing an invoice, or medical expenses missing a person or with an open claim), **Tax-deductible**, **Recurring**
- **Local filters**: Type, Method, Invoice and Insurance dropdowns narrow the current list without leaving the monthly view
- **Pagination**: 25, 50 (default), 100 or All per page

### Expense Form Sections

The expense form uses collapsible sections to reduce clutter:

- **Reimbursement** - Original cost for non-medical expenses that were partly reimbursed
- **Insurance Tracking** - Medical insurance claim tracking
- **People Assignment** - Family member assignment for medical expenses
- **Invoice Attachments** - PDF invoices for tax-deductible expenses
- **Advanced Options** - Repeat the expense for future months, credit card posted date

### Contextual Help

Hover over the (?) icons to see tooltips explaining when and why to use each field.

### Reimbursement Tracking

Track reimbursements from employers or other sources on any non-medical expense:

1. Create or edit an expense
2. Enter what you paid out of pocket as the **Amount**
3. Expand **Reimbursement** and enter the **Original Cost** (the full amount charged)
4. The form previews Charged / Reimbursed / Net once both values are set

Expenses with reimbursements show a 💰 indicator in the expense list. Hover over it to see the Charged, Reimbursed and Net breakdown.

**Note**: Medical expenses use the dedicated Insurance Tracking section instead (see [Medical Expenses](#medical-expenses)).

### Real-Time Multi-Device Sync

The application supports multi-device access with automatic data synchronization:

- **Automatic Updates**: When you add, edit, or delete data on one device, all other open tabs/devices refresh automatically
- **Visual Notification**: A brief toast notification appears when data is refreshed from another device
- **Background Optimization**: When a browser tab is hidden, the sync connection is paused to save CPU. Data refreshes automatically when you return to the tab
- **No Manual Refresh Needed**: All data stays current across devices connected to the same server

## Payment Methods

### Viewing Payment Methods

Click **"💼 Financial"** in the month selector. The Financial Overview shows Payment Methods, Loans and Investments sections, with net worth in the header. Payment methods are split into **Active** and **Inactive** tabs.

### Adding Payment Methods

1. Click **"+ Add"** in the Payment Methods section
2. Select the type: Cash, Cheque, Debit, or Credit Card
3. Enter the display name and full name
4. For credit cards, enter the credit limit, payment due day and statement closing day (both required)

### Credit Card Features

Click **View** on a credit card to open its detail view:

- **View Balance**: Current balance (anchored to the latest billing cycle) and credit utilization
- **Log Payment**: Record payments that reduce the balance
- **Payment History**: View all recorded payments with dates and notes
- **Upload Statements**: Attach PDF statements
- **Due Date Reminders**: Get alerts when payment is due within 7 days and the statement isn't paid
- **Billing Cycle Tracking**: Enter actual statement balances (optionally with the statement PDF), and see calculated balances, transaction counts and trends
- **Auto-Generated Billing Cycles**: The system automatically creates billing cycle records when a cycle ends (see below)

### Auto-Generated Billing Cycles

The system automatically detects when a credit card billing cycle has ended and creates a billing cycle record in the background (checked hourly and at startup). You don't need to open the credit card detail view for this to happen.

**How it works:**

1. When a billing cycle ends, the system creates a record with a calculated balance based on your tracked expenses
2. A notification appears in the **Notifications** section of the Monthly Summary: **"Auto-generated billing cycle created for {card name}"**
3. The notification shows the card name, cycle end date, and the calculated balance

**Reviewing and entering the actual balance:**

1. Click the notification banner to navigate to the credit card's billing cycle list
2. Review the calculated balance — this is the sum of expenses you've tracked for that billing period
3. Compare it with the actual statement balance from your credit card statement
4. Enter the actual statement balance to update the record
5. Once you enter the actual balance, the notification disappears

This ensures your billing cycle records stay up to date even if you don't check the app regularly.

### Activate/Deactivate

Toggle payment methods active/inactive. Inactive methods are hidden from the expense form dropdown but preserved for historical data, and can be reactivated from the **Inactive** tab.

### Deleting Payment Methods

Only payment methods that no expenses use can be deleted; deactivate the others instead.

## Income & Fixed Expenses

### Managing Income

1. Click **Manage Income** on the Monthly Income card in the summary panel
2. Add income sources with names, amounts, and categories (Salary, Government, Gifts, Other)
3. Income is tracked monthly and appears in summaries

### Managing Fixed Expenses

1. Click **Manage Fixed** on the Fixed Expenses card in the summary panel
2. Add fixed expenses with names, amounts, categories, and payment types
3. Optionally link to loans for payment tracking
4. Set payment due days for reminder generation

### Carry Forward

Use **"📋 Copy from Previous Month"** in the income modal, or **"📋 Carry Forward from Previous Month"** in the fixed expenses modal, to copy the previous month's entries into the current month.

## Loans & Lines of Credit

### Viewing Loans

Click **"💼 Financial"** in the month selector. The Loans section has **Active Loans** and **Paid Off** tabs, and a **📊 View Total Debt Trend** button.

### Adding Loans

1. Click **"+ Add"** in the Loans section
2. Select the loan type:
   - **Loan**: Traditional loans (car loans, student loans) with paydown progress tracking
   - **Line of Credit**: Revolving credit (HELOCs) with balance/rate visualization
   - **Mortgage**: Dedicated mortgage tracking with amortization, equity, rate history, and payment insights

### Recording Payments

1. Click **View** on a loan to open its detail view (or **Log Payment** directly on the loan row)
2. Click **"Log Payment"** to record a payment
3. Enter payment amount, date, and optional notes. When a suggested amount is available, it is pre-filled and labelled
4. Balance is automatically calculated from payment history

### Balance Migration

Convert existing balance entries to payment format using the migration tool in the loan detail view.

### Fixed Expense Loan Linkage

1. When editing a fixed expense, select a loan in the **Linked Loan** dropdown
2. Set the payment due day (1-31) for reminder generation
3. Loan payment reminders appear in the Notifications section when due dates approach
4. Click **"Log Payment"** on the reminder to create the loan payment entry automatically

## Investment Tracking

### Viewing Investments

Click **"💼 Financial"** in the month selector and scroll to the Investments section.

### Adding Investments

1. Click **"+ Add"** in the Investments section
2. Select the type: TFSA or RRSP
3. Enter the investment name and initial value

### Tracking Values

1. Click **View** on any investment to see details
2. Add monthly value entries to track performance over time
3. View line graphs showing investment value changes
4. See chronological list of all value entries with change indicators and percentages

### Portfolio Overview

Net worth (investments minus outstanding debt) is shown in the Financial Overview header.

### Data Reminders

See reminder banners when investment values need updating for the current month.

## Budget Tracking

### Managing Budgets

1. Click **"💵 Budgets"** in the month selector
2. On the **📋 Manage** tab, set limits for any budgetable category. A suggested amount based on recent spending is shown where available
3. If a month has no budgets yet, the previous month's budgets are shown automatically; **📋 Copy from Previous Month** saves them for the current month

### Monitoring Progress

View real-time progress bars with color-coded status:

- **Green**: Under 80% of budget (safe)
- **Yellow**: 80-89% of budget (warning)
- **Orange**: 90-99% of budget (danger)
- **Red**: 100% or more (over budget)

### Budget Alert Notifications

Budget alerts appear in the **Notifications** section of the Monthly Summary:

- **Warning (80-89%)**: ⚡ icon
- **Danger (90-99%)**: ! icon
- **Critical (≥100%)**: ⚠ icon

Clicking an alert shows that category's expenses in the expense list. Dismissing hides the month's budget alerts for the rest of the browser session; changing month resets the dismissal.

### Budget History

Click **"💵 Budgets"** and select the **📊 History** tab to analyze budget performance over 3, 6, or 12 months, and export it to CSV.

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

1. Expand **Insurance Tracking** and check **"Eligible for Insurance Reimbursement"** on a medical expense
2. Enter the **Original Cost** (full expense amount before reimbursement)
3. The **Amount** field represents what you actually paid after reimbursement
4. Set **Claim Status**: Not Claimed, In Progress, Paid, or Denied
5. Click the status indicator in the expense list to quickly change status

### Invoice Attachments

1. When creating or editing a tax-deductible expense (medical or donation), expand **Invoice Attachments**
2. Drag & drop a PDF onto the drop zone or click it to choose a file (PDF only, max 10MB)
3. If several people are assigned, optionally select the family member to link the invoice to
4. Use **"Add Invoice"** to attach additional invoices to the same expense
5. Click the invoice indicator next to an expense to open the PDF viewer

### Tax Reports

1. Click **"💰 Income Tax"** in the month selector
2. Review totals (medical, donations), the **📊 Year-over-Year Comparison** and the **🧮 Tax Credit Calculator** (enter your annual net income)
3. Check **"Group Medical Expenses by Person"** to see medical expenses per family member, with per-provider subtotals
4. Filter by claim status or invoice attachment status

## Analytics

### Analytics Hub

Click **"📈 Analytics"** in the month selector. The hub has these tabs:

- **Monthly Summary** - Totals, month-over-month change, top categories and merchants, and budget summary for the selected month
- **Spending** - Spending over a period (Month, Year to date, Last 12 months, Full year; step with ‹ ›), with a category breakdown. Click a category to see its transactions for that period in the expense list
- **Cash Flow** - Income vs spending over the same period, savings rate, and a profit & loss table
- **Merchants**, **Activity Insights** and **Trends** - see below and [Analytics Hub](../features/ANALYTICS_HUB.md)

### Annual Summary

Click **"📊 Annual Summary"** in the month selector for a yearly overview with a year-over-year comparison.

## Merchant Analytics

### Viewing Merchant Analytics

1. Click **"📈 Analytics"** in the month selector
2. Select the **Merchants** tab

### Analyzing Top Merchants

- View merchants ranked by total spending, visit frequency, or average spend per visit
- Use the period dropdown to analyze different time ranges (All Time, This Year, Previous Year, This Month, Last 3 Months)
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

## Spending Alerts

Unusual-spending (anomaly) alerts appear in the **Notifications** section of the Monthly Summary, alongside budget alerts and data reminders.

### What Each Alert Shows

- The merchant (or category) and amount, a one-line summary and explanation, and the typical range where available
- Badges for the alert's classification and its **confidence** (Low, Medium, High — how much history the system had to work with)
- **▾ Details** expands the observed value, expected range, comparison period, deviation, how the purchase ranks historically, and the projected yearly impact

Clicking an alert scrolls to the associated expense in the expense list.

### Actions

- **✓ Got it** — Dismiss the alert after you've reviewed it
- **Mute alerts like this** — Dismiss it and create a suppression rule so similar spending isn't flagged again (e.g., an annual membership renewal)

See [Anomaly Detection](../features/ANOMALY_DETECTION.md) for how alerts are detected.

## Data Management

### Manual Backup

1. Click **"🖥️ System"** in the header
2. On the **Backup Information** tab, click **"💾 Create Backup Now"** (saved on the server) or **"📥 Download Backup"** (downloads a `.tar.gz` archive including invoice PDFs)

### Automated Backups

1. Click **"⚙️ Settings"** in the header
2. Open the **"💾 Backup Configuration"** tab
3. Check **Enable automatic backups**
4. Set the daily **Backup Time**, optional **Backup Location**, and **Keep Last N Backups** (default 7)

### Restoring from Backup

1. Click **"🖥️ System"** in the header
2. On the **Backup Information** tab, under **Restore from Backup**, click **"🔄 Choose Backup File"**
3. Select a `.tar.gz` archive (recommended, includes invoices) or a legacy `.db` file
4. Confirm the restore — it replaces **all** current data

See the [Restore Backup Guide](RESTORE_BACKUP_GUIDE.md) for details.

### Data Reminders

Receive visual reminders when monthly data needs updating:

- Investment values for the current month
- Loan balances for the current month
- Billing cycle statement balances
- Auto-generated billing cycles awaiting actual statement balance entry

### Activity Log

View a history of data changes in the application:

1. Click **"🖥️ System"** in the header
2. Open the **Activity Log** tab
3. View recent events with timestamps and details

**Features:**
- **Event Tracking**: Creates, updates, and deletes across expenses, loans, investments, budgets, payment methods, and more, plus system events such as backups and version upgrades
- **Display Limit**: Show 25, 50, 100, or 200 events
- **Load More**: Load additional events
- **Automatic Cleanup**: Events are cleaned up daily based on the retention settings

**Configuring Retention:**
1. Click **"⚙️ Settings"** in the header
2. Go to the **"⚙️ General"** tab
3. Under **"Activity Log Retention Policy"**, set:
   - **Maximum Age (days)**: 7–365, default 90
   - **Maximum Count**: 100–10,000, default 1,000
4. Save to apply

### Data Cleanup Tools

**🖥️ System** → **Misc** → **🏷️ Standardize Place Names** finds and merges inconsistent place names (e.g., "Walmart", "walmart", "Wal-Mart"). See [Place Name Standardization](../features/PLACE_NAME_STANDARDIZATION.md).

## Security

Password protection is optional and off by default.

- **Enable**: **⚙️ Settings** → **🔒 Security** → set a password. After that, every browser must log in
- **Change or remove**: from the same tab; removing the password returns the app to open access
- **Log out**: from the user menu in the header (greyed out when no password is set)

## Container Update Detection

When the application's Docker container is updated and restarted, a banner appears at the top of the page.

### How It Works

- When the real-time sync connection reconnects (e.g. after the server restarts), the app compares the server's version and startup ID with the ones it loaded with
- If they differ, a banner appears: **"A new version (vX.Y.Z) is available. Refresh to get the latest updates."**

### Actions

- **Refresh Now**: Reload the page to pick up the new version
- **Dismiss** (×): Hide the banner

## Version Upgrade Notifications

After refreshing into a new version, the app shows you what changed.

### Changelog Modal

- When the app detects that the version has changed since your last visit, an **"🎉 Updated to vX.Y.Z"** modal appears with the changes for that release
- Close it to dismiss — you won't see it again until the next upgrade

### Update Availability

- **🖥️ System** → **Updates** checks GitHub Releases for a newer version (cached for 24 hours on the server) and shows a banner with the latest version if one is available
- The **Updates** tab also lists recent release notes

### Activity Log

- Each version upgrade is recorded in the Activity Log as a `version_upgraded` event
- This provides a history of when the application was updated

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
- Review anomaly alerts with **✓ Got it** to keep the Notifications section focused on what matters
- Use **Mute alerts like this** for spending that's normal for you to reduce future noise
- Use merchant analytics to identify spending patterns and opportunities for savings
