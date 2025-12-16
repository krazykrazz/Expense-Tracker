# Expense Tracker

A full-stack expense tracking application built with React and Node.js.

## Features

### Expense Management
- 📝 Add, edit, and delete expenses
- 🔍 **Global expense filtering** - Filter by category and payment method across all time periods
- 🔎 Search expenses by place or notes globally
- 📊 View monthly summaries with weekly breakdowns
- 📅 Filter expenses by month and year
- 📥 CSV import for bulk expense entry
- ✨ Smart category suggestions based on place history
- 💳 Payment method memory (remembers last used)

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

### Budget Tracking & Alerts
- 💵 Set monthly budget limits for expense categories (Food, Gas, Other)
- 📊 Real-time progress bars with color-coded status indicators
- ⚠️ Visual alerts at 80%, 90%, and 100% thresholds
- 🔄 Automatic budget carry-forward from previous month
- 📋 Manual budget copy from any previous month
- 📈 Historical budget performance analysis (3, 6, or 12 months)
- 📉 Budget vs actual spending comparisons
- 🎯 Overall budget summary with total budgeted vs spent

### Data Management
- 💾 Automated and manual database backups (includes all data)
- 📤 CSV export functionality
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
2. **Edit Expenses**: Click the edit button (✏️) next to any expense
3. **Delete Expenses**: Click the delete button (🗑️) next to any expense
4. **Global Filtering**: Use the search bar filters to find expenses across all time periods
   - **Text Search**: Search by place or notes
   - **Category Filter**: Filter by expense type (Groceries, Gas, etc.)
   - **Payment Method Filter**: Filter by payment method (Credit Card, Cash, etc.)
   - **Combine Filters**: Use multiple filters together for precise results
   - **Clear Filters**: Click "Clear Filters" to return to monthly view
5. **Monthly Filtering**: Use the dropdowns in the expense list to filter within the current month

### Income & Fixed Expenses
6. **Manage Income**: Click the "👁️ View/Edit" button next to Monthly Gross Income to add/edit income sources
7. **Manage Fixed Expenses**: Click the "👁️ View/Edit" button next to Total Fixed Expenses to manage predictable monthly costs
8. **Carry Forward**: Use the "📋 Copy from Previous Month" button to copy previous month's income or fixed expenses

### Loans & Lines of Credit
9. **View Loans**: Click the "💳 Loans" button in the summary panel to see all loans
10. **Add Loan**: Click "+ Add New Loan" and select the loan type:
    - **Loan**: For traditional loans (mortgages, car loans, student loans)
    - **Line of Credit**: For revolving credit (credit cards, HELOCs)
11. **Track Balances**: Click on any loan to view details and add monthly balance/rate entries
12. **View Charts**: Lines of credit display a dual-axis chart showing balance and interest rate trends
13. **Mark Paid Off**: Traditional loans auto-mark as paid off when balance reaches zero

### Investment Tracking
14. **View Investments**: Click the "📈 Investments" button in the summary panel to see all investments
15. **Add Investment**: Click "+ Add New Investment" and select the type (TFSA or RRSP)
16. **Track Values**: Click "View" on any investment to see details and add monthly value entries
17. **Monitor Performance**: View line graphs showing investment value changes over time
18. **Value History**: See chronological list of all value entries with change indicators and percentages
19. **Portfolio Overview**: View total portfolio value across all investments in the summary panel
20. **Data Reminders**: See reminder banners when investment values need updating for the current month

### Net Worth Tracking
21. **View Net Worth**: See your net worth automatically calculated on both annual and monthly summaries
22. **Annual Net Worth**: View year-end financial position on the Annual Summary page
23. **Monthly Net Worth**: Track current month position on the Summary Panel
24. **Assets & Liabilities**: See breakdown showing total investments (assets) minus total loans (liabilities)
25. **Color Indicators**: Green for positive net worth, red for negative net worth

### Budget Tracking & Alerts
26. **Manage Budgets**: Click the "💵 Manage Budgets" button in the month selector to set budget limits
27. **Set Budget Limits**: Enter budget amounts for Food, Gas, and Other categories
28. **Monitor Progress**: View real-time progress bars with color-coded status:
    - **Green**: Under 80% of budget (safe)
    - **Yellow**: 80-89% of budget (warning)
    - **Orange**: 90-99% of budget (danger)
    - **Red**: 100% or more (over budget)
29. **Copy Budgets**: Use "📋 Copy from Previous Month" to replicate budget limits
30. **View History**: Click "📊 Budget History" to analyze budget performance over time
31. **Automatic Carry-Forward**: Budgets automatically copy from previous month when accessing a new month
32. **Budget Summary**: View overall budget status in the summary panel showing total budgeted vs spent

### Medical Expense People Tracking
33. **Manage People**: Click "⚙️ Settings" → "People" tab to add family members
34. **Add Person**: Enter name and optional date of birth for each family member
35. **Assign to Expense**: When creating a medical expense (Tax - Medical), select one or more people
36. **Single Person**: Selecting one person automatically assigns the full amount
37. **Multiple People**: Selecting multiple people opens the allocation modal
38. **Split Equally**: Use the "Split Equally" button to divide the expense evenly
39. **Custom Allocation**: Enter specific amounts for each person (must sum to total)
40. **View by Person**: In Tax Deductible view, toggle "Group by Person" to see expenses organized by family member
41. **Quick Assign**: Assign people to unassigned medical expenses directly from the Tax Deductible view
42. **Tax Preparation**: Use person-grouped view to get per-person totals for tax forms

### Merchant Analytics
43. **View Merchant Analytics**: Click the "🏪 Merchant Analytics" button in the main navigation to open analytics
44. **Analyze Top Merchants**: View merchants ranked by total spending, visit frequency, or average spend per visit
45. **Filter by Time Period**: Use the period dropdown to analyze different time ranges (All Time, This Year, This Month, Last 3 Months)
46. **Sort Options**: Toggle between sorting by total spend, number of visits, or average spend per visit
47. **View Merchant Details**: Click on any merchant to see detailed statistics, category breakdowns, and spending trends
48. **Monthly Trends**: View line charts showing spending patterns over the last 12 months for each merchant
49. **Category Analysis**: See which expense categories you spend on most at each merchant
50. **Payment Method Insights**: View which payment methods you use most frequently at each merchant
51. **Visit Patterns**: See average days between visits and identify your shopping frequency habits
52. **Drill-Down to Expenses**: Click "View All Expenses" to see the complete list of expenses at any merchant

### Data Management
53. **Backup**: Click the "💾 Backup" button to download your database
54. **Automated Backups**: Configure scheduled backups in Backup Settings
55. **Data Reminders**: Receive visual reminders when monthly data needs updating (investments and loans)

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

### Merchant Analytics
- `GET /api/analytics/merchants` - Get top merchants with analytics (query params: period, sortBy)
- `GET /api/analytics/merchants/:name` - Get detailed statistics for a specific merchant (query params: period)
- `GET /api/analytics/merchants/:name/trend` - Get monthly spending trend for a merchant (query params: months)
- `GET /api/analytics/merchants/:name/expenses` - Get all expenses for a specific merchant (query params: period)

### Backup
- `GET /api/backup` - Download database backup
- `POST /api/backup/restore` - Restore from backup file

## Database Schema

### Expenses Table
- id (INTEGER PRIMARY KEY)
- date (TEXT)
- place (TEXT)
- notes (TEXT)
- amount (REAL)
- type (TEXT) - Categories include: Clothing, Dining Out, Entertainment, Gas, Gifts, Groceries, Housing, Insurance, Personal Care, Pet Care, Recreation Activities, Subscriptions, Utilities, Vehicle Maintenance, Other, Tax - Medical, Tax - Donation
- week (INTEGER) - 1-5
- method (TEXT) - Payment method
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
- amount (DECIMAL) - Amount allocated to this person
- created_at (TEXT)
- UNIQUE constraint on (expense_id, person_id)

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
