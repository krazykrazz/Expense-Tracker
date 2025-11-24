# Expense Tracker

A full-stack expense tracking application built with React and Node.js.

## Features

### Expense Management
- 📝 Add, edit, and delete expenses
- 🔍 Search and filter expenses by type and payment method
- 📊 View monthly summaries with weekly breakdowns
- 📅 Filter expenses by month and year
- 📥 CSV import for bulk expense entry

### Income & Fixed Expenses
- 💰 Track monthly gross income from multiple sources
- 🏠 Manage fixed monthly expenses (rent, utilities, subscriptions)
- 🔄 Carry forward income sources and fixed expenses from previous month
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
2. **Edit Expenses**: Click the edit button (✏️) next to any expense
3. **Delete Expenses**: Click the delete button (🗑️) next to any expense
4. **Filter**: Use the dropdowns to filter by type or payment method
5. **Search**: Use the search bar to find expenses by place or notes

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

### Budget Tracking & Alerts
14. **Manage Budgets**: Click the "💵 Manage Budgets" button in the month selector to set budget limits
15. **Set Budget Limits**: Enter budget amounts for Food, Gas, and Other categories
16. **Monitor Progress**: View real-time progress bars with color-coded status:
    - **Green**: Under 80% of budget (safe)
    - **Yellow**: 80-89% of budget (warning)
    - **Orange**: 90-99% of budget (danger)
    - **Red**: 100% or more (over budget)
17. **Copy Budgets**: Use "📋 Copy from Previous Month" to replicate budget limits
18. **View History**: Click "📊 Budget History" to analyze budget performance over time
19. **Automatic Carry-Forward**: Budgets automatically copy from previous month when accessing a new month
20. **Budget Summary**: View overall budget status in the summary panel showing total budgeted vs spent

### Data Management
14. **Backup**: Click the "💾 Backup" button to download your database
15. **Automated Backups**: Configure scheduled backups in Backup Settings

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
- `GET /api/income/:year/:month` - Get income sources for a month
- `POST /api/income` - Create a new income source
- `PUT /api/income/:id` - Update an income source
- `DELETE /api/income/:id` - Delete an income source
- `POST /api/income/:year/:month/copy-previous` - Copy income sources from previous month

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
- type (TEXT) - 'Other', 'Food', 'Gas', 'Tax - Medical', 'Tax - Donation'
- week (INTEGER) - 1-5
- method (TEXT) - Payment method
- created_at (TEXT)

### Income Sources Table
- id (INTEGER PRIMARY KEY)
- year (INTEGER)
- month (INTEGER)
- name (TEXT) - Income source name
- amount (REAL)
- created_at (TEXT)

### Fixed Expenses Table
- id (INTEGER PRIMARY KEY)
- year (INTEGER)
- month (INTEGER)
- name (TEXT) - Fixed expense name
- amount (REAL)
- created_at (TEXT)

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
