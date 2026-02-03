# Expense Tracker

A full-stack expense tracking application built with React and Node.js.

## Features

### Expense Management
- 📝 Add, edit, and delete expenses
- 🔍 **Global expense filtering** - Filter by category, payment method, and year across all time periods
- 🔎 Search expenses by place or notes globally
- 📊 View monthly summaries with weekly breakdowns
- 📅 Filter expenses by month and year
- ✨ Smart category suggestions based on place history
- 💳 Payment method memory (remembers last used)
- 📱 **Sticky summary scrolling** - Summary panel scrolls independently from expense list for better usability
- ➕ **Floating add button** - Quick access to add expenses when viewing long lists (appears with >10 expenses)
- 🎯 **Smart method filter** - Combined payment type and method selection in a single grouped dropdown
- 🏷️ **Filter chips** - Visual display of active filters with one-click removal
- 📂 **Advanced filters** - Collapsible section for Invoice and Insurance status filters
- 🔢 **Filter count badge** - Shows total number of active filters at a glance
- 🔙 **Enhanced global view** - Shows which filters triggered global view with "Return to Monthly View" button

### Payment Methods
- 💳 **Configurable payment methods** - Database-driven payment method management
- 🏦 Four payment types: Cash, Cheque, Debit, Credit Card
- ➕ Create, edit, activate/deactivate, and delete payment methods
- 📊 **Credit card balance tracking** - Automatic balance updates when expenses are added/deleted
- 📈 **Credit utilization indicators** - Color-coded display (green < 30%, yellow 30-70%, red > 70%)
- 💵 **Payment recording** - Log credit card payments with automatic balance reduction
- 📋 **Payment history** - View all recorded payments with dates and notes
- 📄 **Statement uploads** - Attach PDF statements with billing period dates
- ⏰ **Due date reminders** - Alerts when payment due within 7 days
- 📅 **Posted date support** - Optional posted date for credit card expenses (affects balance calculations)

### Income & Fixed Expenses
- 💰 Track monthly gross income from multiple sources with categorization
- 🏷️ Categorize income sources (Salary, Government, Gifts, Other)
- 📊 View income breakdown by category on monthly and annual summaries
- 🏠 Manage fixed monthly expenses with category and payment type tracking
- 🏷️ Categorize fixed expenses (Housing, Utilities, Subscriptions, Insurance, etc.)
- 💳 Track payment methods for fixed expenses (Credit Card, Debit Card, Cash, Cheque, E-Transfer)
- 🔄 Carry forward income sources and fixed expenses from previous month (preserves categories)
- 📈 Calculate net balance including all income and expenses

### Loans & Lines of Credit
- 💳 Track loans and lines of credit with monthly balance history
- 📊 Support for two loan types:
  - **Loans**: Traditional loans (mortgages, car loans) with paydown progress tracking
  - **Lines of Credit**: Revolving credit (credit cards, HELOCs) with balance/rate visualization
- 📉 Visual dual-axis charts showing balance and interest rate trends over time
- 🎯 Automatic paid-off detection for traditional loans
- 📅 Start date filtering (loans only appear in months after they start)
- 🔗 Cascade delete (removing a loan deletes all balance entries)
- 💡 Smart reminders to update loan balances for the current month

### Investment Tracking
- 📈 Track investment portfolios (TFSA and RRSP accounts)
- 💰 Record monthly investment values with historical tracking
- 📊 View investment performance with line graphs showing value changes over time
- 🎨 Color-coded value changes (green for increases, red for decreases)
- ⬆️⬇️ Arrow indicators showing month-over-month performance
- 💵 Total portfolio value calculation across all investments
- 📉 Value history timeline with change percentages
- 🔄 Create, edit, and delete investments and value entries
- 📅 Monthly value snapshots for performance tracking
- 💡 Smart reminders to update investment values for the current month

### Net Worth Tracking
- 💎 Net Worth card on annual summary showing year-end financial position
- 💎 Net Worth card on monthly summary showing current month position
- 📊 Assets and liabilities breakdown display
- 🎨 Color-coded net worth (green for positive, red for negative)
- 💰 Automatic calculation from investment values and loan balances
- 📈 Year-end value selection (December preferred, fallback to latest month)

### Enhanced Annual Summary
- 📊 Comprehensive yearly financial overview with 13 summary cards (4 per row)
- 📈 **Year-over-Year Comparison**: Compare income, expenses, savings rate, and net worth vs previous year
- 📅 **YTD Comparison**: For current year, compares only months 1 through current month to avoid misleading comparisons
- 💰 **Savings Rate**: Percentage of income saved with color-coded display
- 🔢 **Transaction Count**: Total variable expense transactions with average amount
- 🏆 **Top Category**: Highlights #1 spending category with amount and percentage
- 📆 **Daily Spend**: Average daily variable spending (uses actual days for current year)
- 🧾 **Tax Deductible**: Combined Medical + Donation totals for quick tax reference
- 📊 **Income by Category**: Visual breakdown of income sources (Salary, Government, Gifts, Other)
- 📉 **Monthly Net Balance**: Line graph showing surplus/deficit trends throughout the year
- 🔽 **Collapsible Sections**: By Category and By Payment Method sections collapse to reduce clutter
- 📊 Monthly breakdown chart with stacked fixed/variable expenses and income bars

### Medical Expense People Tracking
- 👨‍👩‍👧‍👦 Associate medical expenses with specific family members
- 💊 Track which family member incurred each medical expense
- 💰 Split medical expenses across multiple people with custom allocations
- 📊 View tax-deductible medical expenses grouped by person
- 📋 Per-person subtotals by medical provider for tax preparation
- ⚡ Quick "Split Equally" option for multi-person expenses
- 🏷️ Visual indicators showing assigned people on expense list
- ⚠️ "Unassigned" indicators for medical expenses without people
- 🔄 Backward compatible with existing medical expenses
- 👤 People management in Settings for adding/editing family members

### Medical Insurance Tracking
- 🏥 Mark medical expenses as eligible or not eligible for insurance reimbursement
- 📋 Track claim status: Not Claimed, In Progress, Paid, or Denied
- 💵 Record original cost vs out-of-pocket amount after reimbursement
- 📊 Automatic reimbursement calculation (original cost - out-of-pocket)
- ⚡ Quick status update from expense list without opening edit form
- 🏷️ Visual status indicators (📋 Not Claimed, ⏳ In Progress, ✅ Paid, ❌ Denied)
- 📈 Insurance summary in Tax Deductible view with totals by status
- 🔍 Filter expenses by claim status
- 👨‍👩‍👧‍👦 Per-person original cost and out-of-pocket tracking for split expenses

### Medical Expense Invoice Attachments
- 📄 Attach multiple PDF invoices to medical expenses for record keeping
- 👤 Optionally link invoices to specific family members assigned to the expense
- 📤 Upload invoices during expense creation or editing
- 👁️ View invoices in built-in PDF viewer with zoom, download, and print
- 🔄 Replace or delete individual invoice attachments as needed
- 🏷️ Visual indicators showing invoice count for expenses with multiple invoices
- 📊 Invoice status and counts visible in tax deductible reports
- 🔍 Filter expenses by invoice attachment status
- 🔒 Secure file storage with access control
- 📱 Mobile-friendly upload and viewing interface
- 💾 Automatic cleanup when expenses are deleted

### Merchant Analytics
- 🏪 Analyze spending patterns by merchant (place) with comprehensive insights
- 📊 View top merchants ranked by total spending, visit frequency, or average spend
- 📈 Monthly spending trend charts for each merchant showing patterns over time
- 🔍 Filter merchant analytics by time period (All Time, This Year, This Month, Last 3 Months)
- 📋 Detailed merchant statistics including visit count, average spend, and date ranges
- 🏷️ Category and payment method breakdowns for each merchant
- 📅 Average days between visits calculation for shopping habit insights
- 💰 Percentage of total expenses per merchant for spending distribution
- 📊 Month-over-month change tracking with percentage indicators
- 🔗 Drill-down to view all expenses at any specific merchant
- 🏠 **Fixed Expenses Integration**: Optional "Include Fixed Expenses" toggle to combine variable and recurring expenses for complete spending analysis
- 📈 **Analytics Hub Integration**: Access via "📈 Analytics" button → "Merchants" tab (v4.17.0+)

### Budget Tracking & Alerts
- 💵 Set monthly budget limits for expense categories (Food, Gas, Other)
- 📊 Real-time progress bars with color-coded status indicators
- ⚠️ Visual alerts at 80%, 90%, and 100% thresholds
- 🚨 **Proactive alert notifications** - Prominent banner alerts at the top of the interface when approaching or exceeding budget limits
- 🎯 **Smart alert thresholds** - Warning (80-89%), Danger (90-99%), Critical (≥100%) with distinct visual styling
- 🔕 **Dismissible alerts** - Temporarily hide alerts during your session while keeping them active for future visits
- ⚡ **Real-time updates** - Alerts appear and update immediately as you add, edit, or delete expenses
- 🔗 **Quick budget management** - Direct access to budget settings and details from alert banners
- 🔄 Automatic budget carry-forward from previous month
- 📋 Manual budget copy from any previous month
- 📈 Historical budget performance analysis (3, 6, or 12 months)
- 📉 Budget vs actual spending comparisons
- 🎯 Overall budget summary with total budgeted vs spent

### Data Management
- 💾 Automated and manual database backups (includes all data)
- 🔄 Backup restore functionality
- 💡 Monthly data reminders for investments and loans
- 🌐 Access from any device on your local network

## Tech Stack

**Frontend:**
- React 18
- Vite
- CSS3

**Backend:**
- Node.js
- Express
- SQLite3

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm

### Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd expense-tracker
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

## Running the Application

### Docker Deployment (Recommended)

The easiest way to run the application is using Docker with the unified container. This single container includes both the backend and frontend, with all data stored in a single `/config` directory.

#### Quick Start with Docker Compose

1. **Create a docker-compose.yml file:**
```yaml
version: '3.8'

services:
  expense-tracker:
    image: localhost:5000/expense-tracker:latest
    container_name: expense-tracker
    ports:
      - "2424:2424"
    volumes:
      - ./config:/config
    environment:
      - LOG_LEVEL=info
      - SERVICE_TZ=Etc/UTC
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:2424/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

2. **Pull the image from your local registry:**
```bash
docker pull localhost:5000/expense-tracker:latest
```

3. **Start the container:**
```bash
docker-compose up -d
```

4. **Access the application:**
- Open http://localhost:2424 in your browser
- All data is stored in the `./config` directory

#### Environment Variables

Configure the container using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging verbosity: `debug` or `info` |
| `SERVICE_TZ` | `Etc/UTC` | Timezone (e.g., `America/New_York`, `Europe/London`) |
| `PORT` | `2424` | HTTP server port |
| `NODE_ENV` | `production` | Node environment mode |

**Example with custom timezone:**
```yaml
environment:
  - LOG_LEVEL=debug
  - SERVICE_TZ=America/New_York
```

#### Data Persistence

All persistent data is stored in the `/config` directory:

```
config/
├── database/
│   └── expenses.db              # SQLite database
├── backups/
│   └── expense-tracker-backup-*.db  # Automated backups
└── config/
    └── backupConfig.json        # Backup settings
```

**Important:** Always mount the `/config` directory as a volume to preserve your data across container restarts.

#### Fresh Installation vs. Restore from Backup

**Fresh Installation (Empty Database):**
```bash
# Create config directory
mkdir -p config/database config/backups config/config

# Start container (will create empty database)
docker-compose up -d
```

**Restore from Backup:**
```bash
# Create config directory
mkdir -p config/database config/backups config/config

# Copy your backup file as the main database
cp /path/to/backup.db config/database/expenses.db

# Start container
docker-compose up -d
```

#### Updating the Container

```bash
# Pull the latest image
docker-compose pull

# Restart with new image
docker-compose down
docker-compose up -d

# Verify the update
docker logs expense-tracker
```

#### Building and Publishing Images

For information on building and publishing Docker images to your local registry, see:
- **[Docker Deployment Guide](./DOCKER.md)** - Comprehensive Docker documentation
- **[Build and Push Documentation](./BUILD_AND_PUSH.md)** - Build and registry guide
- **[Quick Build Guide](./QUICK_BUILD_GUIDE.md)** - Fast reference for common build commands

### Development Mode

1. Start the backend server:
```bash
cd backend
npm start
```
The backend will run on http://localhost:2626

2. In a new terminal, start the frontend:
```bash
cd frontend
npm run dev
```
The frontend will run on http://localhost:5173

### Access from Other Devices

Both servers are configured to accept connections from your local network. Find your local IP address and use:
- Docker: http://YOUR_LOCAL_IP:2424
- Development Frontend: http://YOUR_LOCAL_IP:5173
- Development Backend: http://YOUR_LOCAL_IP:2626

### Stopping Servers

**For Docker:**
```bash
# Stop the Docker container
docker-compose down

# Or use the convenience script
stop-docker.bat
```

**For Development Mode:**
```bash
# Use Ctrl+C in each terminal, or run:
stop-servers.bat
```

**Important:** The `stop-servers.bat` script only stops local Node.js processes. It will NOT stop Docker containers. Use `docker-compose down` or `stop-docker.bat` to stop Docker containers.

## Usage

### Expense Management
1. **Add Expenses**: Click the "+ Add Expense" button in the header
   - Enter the place name first - the system will suggest a category based on your history
   - The form remembers your last used payment method
   - For credit card expenses, optionally enter a "Posted Date" if different from transaction date
2. **Edit Expenses**: Click the edit button (✏️) next to any expense
3. **Delete Expenses**: Click the delete button (🗑️) next to any expense
4. **Global Filtering**: Use the search bar filters to find expenses across all time periods
   - **Text Search**: Search by place or notes
   - **Category Filter**: Filter by expense type (Groceries, Gas, etc.)
   - **Payment Method Filter**: Filter by payment method (Credit Card, Cash, etc.)
   - **Year Filter**: Scope search to a specific year (current year and past 10 years available)
   - **Combine Filters**: Use multiple filters together for precise results
   - **Clear Filters**: Click "Clear Filters" to return to monthly view
5. **Monthly Filtering**: Use the dropdowns in the expense list to filter within the current month

### Payment Methods
6. **View Payment Methods**: Click the "💳 Payment Methods" button in the navigation
7. **Add Payment Method**: Click "+ Add Payment Method" and select the type (Cash, Cheque, Debit, or Credit Card)
8. **Credit Card Features**: For credit card payment methods:
   - View current balance and credit utilization
   - Record payments to reduce balance
   - View payment history
   - Upload statements with billing period dates
   - See due date reminders when payment is due within 7 days
9. **Activate/Deactivate**: Toggle payment methods active/inactive (inactive methods hidden from dropdowns but preserved for historical data)
10. **Delete**: Remove payment methods with zero associated expenses

### Income & Fixed Expenses
11. **Manage Income**: Click the "👁️ View/Edit" button next to Monthly Gross Income to add/edit income sources
12. **Manage Fixed Expenses**: Click the "👁️ View/Edit" button next to Total Fixed Expenses to manage predictable monthly costs
13. **Carry Forward**: Use the "📋 Copy from Previous Month" button to copy previous month's income or fixed expenses

### Loans & Lines of Credit
14. **View Loans**: Click the "💳 Loans" button in the summary panel to see all loans
15. **Add Loan**: Click "+ Add New Loan" and select the loan type:
    - **Loan**: For traditional loans (mortgages, car loans, student loans)
    - **Line of Credit**: For revolving credit (credit cards, HELOCs)
16. **Track Balances**: Click on any loan to view details and add monthly balance/rate entries
17. **View Charts**: Lines of credit display a dual-axis chart showing balance and interest rate trends
18. **Mark Paid Off**: Traditional loans auto-mark as paid off when balance reaches zero

### Investment Tracking
19. **View Investments**: Click the "📈 Investments" button in the summary panel to see all investments
20. **Add Investment**: Click "+ Add New Investment" and select the type (TFSA or RRSP)
21. **Track Values**: Click "View" on any investment to see details and add monthly value entries
22. **Monitor Performance**: View line graphs showing investment value changes over time
23. **Value History**: See chronological list of all value entries with change indicators and percentages
24. **Portfolio Overview**: View total portfolio value across all investments in the summary panel
25. **Data Reminders**: See reminder banners when investment values need updating for the current month

### Net Worth Tracking
26. **View Net Worth**: See your net worth automatically calculated on both annual and monthly summaries
27. **Annual Net Worth**: View year-end financial position on the Annual Summary page
28. **Monthly Net Worth**: Track current month position on the Summary Panel
29. **Assets & Liabilities**: See breakdown showing total investments (assets) minus total loans (liabilities)
30. **Color Indicators**: Green for positive net worth, red for negative net worth

### Budget Tracking & Alerts
31. **Manage Budgets**: Click the "💵 Manage Budgets" button in the month selector to set budget limits
32. **Set Budget Limits**: Enter budget amounts for Food, Gas, and Other categories
33. **Monitor Progress**: View real-time progress bars with color-coded status:
    - **Green**: Under 80% of budget (safe)
    - **Yellow**: 80-89% of budget (warning)
    - **Orange**: 90-99% of budget (danger)
    - **Red**: 100% or more (over budget)
34. **Budget Alert Notifications**: Receive prominent banner alerts at the top of the interface when budgets need attention:
    - **Warning Alerts (80-89%)**: Yellow banners with ⚡ icon when approaching budget limits
    - **Danger Alerts (90-99%)**: Orange banners with ! icon when nearing budget limits
    - **Critical Alerts (≥100%)**: Red banners with ⚠ icon when exceeding budget limits
35. **Dismiss Alerts**: Click the × button to temporarily hide alert banners during your current session
36. **Quick Budget Actions**: Use alert banner buttons to:
    - **Manage Budgets**: Open budget management modal directly from the alert
    - **View Details**: Navigate to budget summary section for detailed analysis
37. **Real-time Alert Updates**: Alerts automatically appear, update, or disappear as you modify expenses
38. **Copy Budgets**: Use "📋 Copy from Previous Month" to replicate budget limits
39. **View History**: Click "📊 Budget History" to analyze budget performance over time
40. **Automatic Carry-Forward**: Budgets automatically copy from previous month when accessing a new month
41. **Budget Summary**: View overall budget status in the summary panel showing total budgeted vs spent

### Medical Expense People Tracking
42. **Manage People**: Click "⚙️ Settings" → "People" tab to add family members
43. **Add Person**: Enter name and optional date of birth for each family member
44. **Assign to Expense**: When creating a medical expense (Tax - Medical), select one or more people
45. **Single Person**: Selecting one person automatically assigns the full amount
46. **Multiple People**: Selecting multiple people opens the allocation modal
47. **Split Equally**: Use the "Split Equally" button to divide the expense evenly
48. **Custom Allocation**: Enter specific amounts for each person (must sum to total)
49. **View by Person**: In Tax Deductible view, toggle "Group by Person" to see expenses organized by family member
50. **Quick Assign**: Assign people to unassigned medical expenses directly from the Tax Deductible view
51. **Tax Preparation**: Use person-grouped view to get per-person totals for tax forms

### Medical Insurance Tracking
52. **Mark Insurance Eligible**: When creating/editing a medical expense, check "Eligible for Insurance"
53. **Enter Original Cost**: Enter the full expense amount before any insurance reimbursement
54. **Track Out-of-Pocket**: The Amount field represents what you actually paid after reimbursement
55. **Set Claim Status**: Choose from Not Claimed, In Progress, Paid, or Denied
56. **Quick Status Update**: Click the status indicator in the expense list to quickly change status
57. **View Reimbursement**: See calculated reimbursement (Original Cost - Out-of-Pocket) in the form
58. **Insurance Summary**: View totals by claim status in the Tax Deductible view
59. **Filter by Status**: Filter expenses by claim status in Tax Deductible view

### Medical Expense Invoice Attachments
60. **Upload Invoice**: When creating or editing a medical expense, scroll to "Invoice Attachment" section
61. **Choose File**: Click "Choose File" or drag and drop a PDF file (max 10MB)
62. **Link to Person**: Optionally select a family member to link the invoice to
63. **Add Multiple Invoices**: Click "Add Invoice" to attach additional invoices to the same expense
64. **View Invoice**: Click the 📄 icon next to medical expenses to open the PDF viewer
65. **Invoice Count**: Expenses with multiple invoices show a count badge (e.g., "📄 3")
66. **PDF Viewer Controls**: Use zoom in/out, download, and print functions
67. **Delete Specific Invoice**: In the invoice list, click delete on individual invoices
68. **Change Person Link**: Update which family member an invoice is linked to
69. **Filter by Invoice**: In Tax Deductible view, filter expenses by invoice attachment status
70. **Invoice Indicators**: See invoice counts in expense lists and tax reports
71. **Automatic Cleanup**: Invoices are automatically deleted when expenses are deleted

### Merchant Analytics
72. **View Merchant Analytics**: Click the "📈 Analytics" button in the main navigation, then select the "Merchants" tab
73. **Analyze Top Merchants**: View merchants ranked by total spending, visit frequency, or average spend per visit
74. **Filter by Time Period**: Use the period dropdown to analyze different time ranges (All Time, This Year, This Month, Last 3 Months)
75. **Sort Options**: Toggle between sorting by total spend, number of visits, or average spend per visit
76. **View Merchant Details**: Click on any merchant to see detailed statistics, category breakdowns, and spending trends
77. **Monthly Trends**: View line charts showing spending patterns over the last 12 months for each merchant
78. **Category Analysis**: See which expense categories you spend on most at each merchant
79. **Payment Method Insights**: View which payment methods you use most frequently at each merchant
80. **Visit Patterns**: See average days between visits and identify your shopping frequency habits
81. **Include Fixed Expenses**: Toggle the "Include Fixed Expenses" checkbox to combine variable and recurring expenses for comprehensive spending analysis
82. **Drill-Down to Expenses**: Click "View All Expenses" to see the complete list of expenses at any merchant

### Data Management
83. **Backup**: Click the "💾 Backup" button to download your database
84. **Automated Backups**: Configure scheduled backups in Backup Settings
85. **Data Reminders**: Receive visual reminders when monthly data needs updating (investments and loans)

## Project Structure

```
expense-tracker/
├── backend/
│   ├── controllers/      # Request handlers
│   ├── database/         # Database setup and SQLite file
│   ├── repositories/     # Data access layer
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Helper functions
│   └── server.js        # Express server
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── App.jsx      # Main app component
│   │   └── config.js    # API configuration
│   └── index.html
├── utils/               # Utility scripts (CSV validation, XLS conversion)
└── README.md
```

## API Endpoints

### Expenses
- `POST /api/expenses` - Create a new expense
- `GET /api/expenses` - Get all expenses (with optional filters)
- `PUT /api/expenses/:id` - Update an expense
- `DELETE /api/expenses/:id` - Delete an expense
- `GET /api/expenses/summary` - Get monthly summary

### Income Sources
- `GET /api/income/:year/:month` - Get income sources for a month (includes category breakdown)
- `POST /api/income` - Create a new income source (with category)
- `PUT /api/income/:id` - Update an income source (with category)
- `DELETE /api/income/:id` - Delete an income source
- `POST /api/income/:year/:month/copy-previous` - Copy income sources from previous month (preserves categories)
- `GET /api/income/annual/:year/by-category` - Get annual income breakdown by category

### Fixed Expenses
- `GET /api/fixed-expenses/:year/:month` - Get fixed expenses for a month
- `POST /api/fixed-expenses` - Create a new fixed expense
- `PUT /api/fixed-expenses/:id` - Update a fixed expense
- `DELETE /api/fixed-expenses/:id` - Delete a fixed expense
- `POST /api/fixed-expenses/:year/:month/copy-previous` - Copy fixed expenses from previous month

### Loans
- `GET /api/loans` - Get all loans with current balances
- `GET /api/loans/:year/:month` - Get active loans for a specific month
- `POST /api/loans` - Create a new loan
- `PUT /api/loans/:id` - Update a loan
- `DELETE /api/loans/:id` - Delete a loan (cascades to balance entries)
- `PUT /api/loans/:id/paid-off` - Mark loan as paid off or reactivate

### Loan Balances
- `GET /api/loan-balances/:loanId` - Get balance history for a loan
- `POST /api/loan-balances` - Create or update a balance entry (upsert)
- `PUT /api/loan-balances/:id` - Update a balance entry
- `DELETE /api/loan-balances/:id` - Delete a balance entry

### Budgets
- `GET /api/budgets?year=YYYY&month=MM` - Get budgets for a month (with auto-carry-forward)
- `POST /api/budgets` - Create a new budget
- `PUT /api/budgets/:id` - Update a budget limit
- `DELETE /api/budgets/:id` - Delete a budget
- `GET /api/budgets/summary?year=YYYY&month=MM` - Get overall budget summary
- `GET /api/budgets/history?year=YYYY&month=MM&months=N` - Get historical budget performance
- `GET /api/budgets/suggest?year=YYYY&month=MM&category=CATEGORY` - Get budget suggestion based on historical spending
- `POST /api/budgets/copy` - Manually copy budgets between months

### Investments
- `GET /api/investments` - Get all investments with current values
- `POST /api/investments` - Create a new investment
- `PUT /api/investments/:id` - Update investment details
- `DELETE /api/investments/:id` - Delete an investment (cascades to value entries)

### Investment Values
- `GET /api/investment-values/:investmentId` - Get all value entries for an investment
- `GET /api/investment-values/:investmentId/:year/:month` - Get specific value entry
- `POST /api/investment-values` - Create or update a value entry (upsert)
- `PUT /api/investment-values/:id` - Update a value entry
- `DELETE /api/investment-values/:id` - Delete a value entry

### Reminders
- `GET /api/reminders/status/:year/:month` - Get reminder status for missing investment values and loan balances

### People (Medical Expense Tracking)
- `GET /api/people` - Get all people (family members)
- `POST /api/people` - Create a new person
- `PUT /api/people/:id` - Update a person
- `DELETE /api/people/:id` - Delete a person (cascades to expense associations)

### Insurance Status (Medical Expenses)
- `PATCH /api/expenses/:id/insurance-status` - Quick update claim status (body: `{ "status": "in_progress" }`)

### Invoices (Medical Expense Attachments)
- `POST /api/invoices/upload` - Upload a PDF invoice for an expense (with optional personId)
- `GET /api/invoices/:expenseId` - Get all invoices for an expense (returns array)
- `GET /api/invoices/:expenseId/:invoiceId` - Get specific invoice file
- `GET /api/invoices/:expenseId/metadata` - Get invoice metadata without files
- `DELETE /api/invoices/:invoiceId` - Delete a specific invoice by ID
- `PATCH /api/invoices/:invoiceId` - Update invoice person association

### Merchant Analytics
- `GET /api/analytics/merchants` - Get top merchants with analytics (query params: period, sortBy, includeFixedExpenses)
- `GET /api/analytics/merchants/:name` - Get detailed statistics for a specific merchant (query params: period, includeFixedExpenses)
- `GET /api/analytics/merchants/:name/trend` - Get monthly spending trend for a merchant (query params: months, includeFixedExpenses)
- `GET /api/analytics/merchants/:name/expenses` - Get all expenses for a specific merchant (query params: period, includeFixedExpenses)

### Payment Methods
- `GET /api/payment-methods` - Get all payment methods
- `GET /api/payment-methods/:id` - Get payment method by ID
- `POST /api/payment-methods` - Create a new payment method
- `PUT /api/payment-methods/:id` - Update a payment method
- `DELETE /api/payment-methods/:id` - Delete a payment method (only if no expenses)
- `GET /api/payment-methods/display-names` - Get active method names for dropdowns
- `PATCH /api/payment-methods/:id/active` - Toggle active status

### Credit Card Payments
- `GET /api/payment-methods/:id/payments` - Get payment history for a credit card
- `POST /api/payment-methods/:id/payments` - Record a credit card payment
- `DELETE /api/payment-methods/:id/payments/:paymentId` - Delete a payment record

### Credit Card Statements
- `GET /api/payment-methods/:id/statements` - Get statements list for a credit card
- `POST /api/payment-methods/:id/statements` - Upload a statement PDF
- `GET /api/payment-methods/:id/statements/:statementId` - Download a statement
- `DELETE /api/payment-methods/:id/statements/:statementId` - Delete a statement

### Backup
- `GET /api/backup` - Download database backup
- `POST /api/backup/restore` - Restore from backup file

## Database Schema

### Expenses Table
- id (INTEGER PRIMARY KEY)
- date (TEXT)
- place (TEXT)
- notes (TEXT)
- amount (REAL) - Out-of-pocket cost (or full amount if not insurance eligible)
- type (TEXT) - Categories include: Clothing, Dining Out, Entertainment, Gas, Gifts, Groceries, Housing, Insurance, Personal Care, Pet Care, Recreation Activities, Subscriptions, Utilities, Vehicle Maintenance, Other, Tax - Medical, Tax - Donation
- week (INTEGER) - 1-5
- method (TEXT) - Payment method display name
- payment_method_id (INTEGER) - Foreign key to payment_methods table
- posted_date (TEXT) - Optional posted date for credit card expenses
- insurance_eligible (INTEGER) - 0 or 1 (Tax - Medical only)
- claim_status (TEXT) - 'not_claimed', 'in_progress', 'paid', 'denied' (Tax - Medical only)
- original_cost (REAL) - Original cost before insurance reimbursement (Tax - Medical only)
- created_at (TEXT)

### Income Sources Table
- id (INTEGER PRIMARY KEY)
- year (INTEGER)
- month (INTEGER)
- name (TEXT) - Income source name
- amount (REAL)
- category (TEXT) - Income category (Salary, Government, Gifts, Other)
- created_at (TEXT)
- updated_at (TEXT)

### Fixed Expenses Table
- id (INTEGER PRIMARY KEY)
- year (INTEGER)
- month (INTEGER)
- name (TEXT) - Fixed expense name
- amount (REAL)
- category (TEXT) - Expense category (Housing, Utilities, Subscriptions, Insurance, etc.)
- payment_type (TEXT) - Payment method (Credit Card, Debit Card, Cash, Cheque, E-Transfer)
- created_at (TEXT)
- updated_at (TEXT)

### Loans Table
- id (INTEGER PRIMARY KEY)
- name (TEXT) - Loan name
- initial_balance (REAL) - Original loan amount
- start_date (TEXT) - When loan started
- notes (TEXT) - Additional notes
- loan_type (TEXT) - 'loan' or 'line_of_credit'
- is_paid_off (INTEGER) - 0 or 1
- created_at (TEXT)
- updated_at (TEXT)

### Loan Balances Table
- id (INTEGER PRIMARY KEY)
- loan_id (INTEGER) - Foreign key to loans table (CASCADE DELETE)
- year (INTEGER)
- month (INTEGER)
- remaining_balance (REAL) - Outstanding balance
- rate (REAL) - Interest rate percentage
- created_at (TEXT)
- updated_at (TEXT)
- UNIQUE constraint on (loan_id, year, month)

### Budgets Table
- id (INTEGER PRIMARY KEY)
- year (INTEGER)
- month (INTEGER)
- category (TEXT) - 'Food', 'Gas', or 'Other'
- limit (REAL) - Budget limit amount (must be > 0)
- created_at (TEXT)
- updated_at (TEXT)
- UNIQUE constraint on (year, month, category)

### Investments Table
- id (INTEGER PRIMARY KEY)
- name (TEXT) - Investment name
- type (TEXT) - 'TFSA' or 'RRSP'
- initial_value (REAL) - Initial investment amount
- created_at (TEXT)
- updated_at (TEXT)

### Investment Values Table
- id (INTEGER PRIMARY KEY)
- investment_id (INTEGER) - Foreign key to investments table (CASCADE DELETE)
- year (INTEGER)
- month (INTEGER)
- value (REAL) - Investment value at end of month
- created_at (TEXT)
- updated_at (TEXT)
- UNIQUE constraint on (investment_id, year, month)

### People Table
- id (INTEGER PRIMARY KEY)
- name (TEXT NOT NULL) - Person's name
- date_of_birth (DATE) - Optional date of birth
- created_at (TEXT)
- updated_at (TEXT)

### Expense People Table (Junction Table)
- id (INTEGER PRIMARY KEY)
- expense_id (INTEGER) - Foreign key to expenses table (CASCADE DELETE)
- person_id (INTEGER) - Foreign key to people table (CASCADE DELETE)
- amount (DECIMAL) - Out-of-pocket amount allocated to this person
- original_amount (REAL) - Original cost allocation for insurance tracking
- created_at (TEXT)
- UNIQUE constraint on (expense_id, person_id)

### Expense Invoices Table
- id (INTEGER PRIMARY KEY)
- expense_id (INTEGER) - Foreign key to expenses table (CASCADE DELETE)
- person_id (INTEGER) - Optional foreign key to people table (SET NULL on delete)
- filename (TEXT) - Stored filename
- original_filename (TEXT) - Original upload filename
- file_path (TEXT) - Full path to file
- file_size (INTEGER) - File size in bytes
- mime_type (TEXT) - File MIME type (application/pdf)
- upload_date (TEXT) - When invoice was uploaded
- Indexes on expense_id, person_id, and upload_date for performance

### Payment Methods Table
- id (INTEGER PRIMARY KEY)
- type (TEXT) - 'cash', 'cheque', 'debit', 'credit_card'
- display_name (TEXT) - Short name shown in dropdowns
- full_name (TEXT) - Full descriptive name
- account_details (TEXT) - Optional account details
- credit_limit (REAL) - Credit limit (credit cards only)
- current_balance (REAL) - Current balance (credit cards only)
- payment_due_day (INTEGER) - Day of month payment is due
- billing_cycle_start (INTEGER) - Day billing cycle starts
- billing_cycle_end (INTEGER) - Day billing cycle ends
- is_active (INTEGER) - 1 = active, 0 = inactive
- created_at (TEXT)
- updated_at (TEXT)

### Credit Card Payments Table
- id (INTEGER PRIMARY KEY)
- payment_method_id (INTEGER) - Foreign key to payment_methods (CASCADE DELETE)
- amount (REAL) - Payment amount
- payment_date (TEXT) - Date of payment
- notes (TEXT) - Optional notes
- created_at (TEXT)

### Credit Card Statements Table
- id (INTEGER PRIMARY KEY)
- payment_method_id (INTEGER) - Foreign key to payment_methods (CASCADE DELETE)
- statement_date (TEXT) - Statement date
- statement_period_start (TEXT) - Period start date
- statement_period_end (TEXT) - Period end date
- filename (TEXT) - Stored filename
- original_filename (TEXT) - Original upload filename
- file_path (TEXT) - Path to file
- file_size (INTEGER) - File size in bytes
- mime_type (TEXT) - MIME type
- created_at (TEXT)

## Documentation

For more detailed information, see:

- **[DOCKER.md](./DOCKER.md)** - Complete Docker deployment guide with troubleshooting
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and release notes
- **[Build and Push Documentation](./BUILD_AND_PUSH.md)** - Comprehensive Docker build and registry guide
- **[Quick Build Guide](./QUICK_BUILD_GUIDE.md)** - Fast reference for Docker builds
- **[Documentation Index](./docs/README.md)** - Comprehensive documentation
  - [Feature Documentation](./docs/features/) - Detailed feature guides
  - [Deployment Guides](./docs/deployments/) - Deployment and migration notes
  - [User Guides](./docs/guides/) - Setup and usage guides

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.
