# Expense Tracker

A full-stack personal finance management application for tracking expenses, income, loans, investments, and budgets. Built with React and Node.js, deployed via Docker.

> **Disclaimer**: This project represents an attempt to create a personal project using AI-assisted development to explore the possibilities and limits using these techniques.

## Quick Start

### For Users (Pre-Built Docker Image)

The easiest way to run the application is using Docker. A single container includes both frontend and backend.

```bash
docker pull ghcr.io/krazykrazz/expense-tracker:latest
docker run -d -p 2424:2424 -v ./config:/config ghcr.io/krazykrazz/expense-tracker:latest
```

Access at http://localhost:2424

For detailed setup, version tags, and configuration options, see the **[Docker Deployment Guide](./docs/guides/DOCKER_DEPLOYMENT.md)**.

### For Developers (Local Development)

```bash
# Install dependencies
npm run install-all

# Start backend (port 2424)
cd backend && npm start

# Start frontend dev server (port 5173)
cd frontend && npm run dev
```

See **[Development Setup](./docs/development/SETUP.md)** for local registry setup and development workflow.

## Key Features

### Core Functionality
- 📝 **Expense Management** - Add, edit, delete expenses with smart category suggestions and payment method memory
- 🔍 **Global Filtering** - Search and filter expenses across all time periods by category, payment method, year
- 💳 **Payment Methods** - Configurable payment methods with credit card balance tracking and utilization indicators
- 💰 **Income & Fixed Expenses** - Track multiple income sources and recurring expenses with categorization
- 📊 **Budget Tracking** - Set budget limits with real-time alerts at 80%, 90%, and 100% thresholds

### Financial Tracking
- 💳 **Loans & Mortgages** - Track loans, lines of credit, and mortgages with payment history and balance calculations
- 📈 **Investments** - Monitor TFSA and RRSP portfolios with value history and performance charts
- 💎 **Net Worth** - Automatic calculation showing assets minus liabilities
- 🏪 **Merchant Analytics** - Analyze spending patterns by merchant with trend charts and insights

### Medical & Tax Features
- 👨‍👩‍👧‍👦 **People Tracking** - Associate medical expenses with family members for tax preparation
- 🏥 **Insurance Tracking** - Track claim status and reimbursements for medical expenses
- 📄 **Invoice Attachments** - Attach multiple PDF invoices to medical expenses with built-in viewer
- 🧾 **Tax Reports** - Generate tax-deductible expense reports grouped by person or provider

### Data Management
- 💾 **Automated Backups** - Scheduled database backups with restore functionality
- 🔄 **Data Reminders** - Monthly reminders to update investments and loan balances
- 🌐 **Multi-Device Access** - Access from any device on your local network

For a complete feature list, see **[Feature Documentation](./docs/features/)**.

## Tech Stack

- **Frontend:** React 18, Vite, CSS3
- **Backend:** Node.js, Express, SQLite3
- **Deployment:** Docker, Docker Compose

## Documentation

### Getting Started
- **[Docker Deployment Guide](./docs/guides/DOCKER.md)** - Complete Docker setup and configuration
- **[Quick Build Guide](./docs/guides/QUICK_BUILD_GUIDE.md)** - Building and publishing Docker images
- **[Startup Guide](./docs/guides/STARTUP_GUIDE.md)** - First-time setup and configuration

### Features
- **[Feature Documentation](./docs/features/)** - Detailed guides for all features
- **[API Documentation](./docs/API_DOCUMENTATION.md)** - Complete API reference

### Development
- **[Development Setup](./docs/development/)** - Local development environment setup
- **[Testing Guidelines](./docs/development/FRONTEND_TESTING_GUIDELINES.md)** - Testing conventions and patterns
- **[Deployment Workflow](./docs/deployment/DEPLOYMENT_WORKFLOW.md)** - Production deployment process

### Reference
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and release notes
- **[Documentation Index](./docs/README.md)** - Complete documentation listing

## Usage

For detailed usage instructions, see **[User Guide](./docs/guides/USER_GUIDE.md)**.

### Quick Reference

**Expense Management:**
- Add expenses with smart category suggestions
- Global filtering by category, payment method, and year
- Edit and delete expenses with one click

**Payment Methods:**
- Configure payment methods (Cash, Cheque, Debit, Credit Card)
- Track credit card balances and utilization
- Record payments and upload statements

**Income & Budgets:**
- Track income from multiple sources
- Set budget limits with real-time alerts
- Monitor spending against budgets

**Loans & Investments:**
- Track loans, lines of credit, and mortgages
- Record payments with automatic balance calculation
- Monitor investment portfolios (TFSA, RRSP)

**Medical & Tax:**
- Associate medical expenses with family members
- Track insurance claims and reimbursements
- Attach PDF invoices with built-in viewer
- Generate tax-deductible expense reports

**Data Management:**
- Automated and manual database backups
- Restore from backup files
- Monthly data reminders

## Project Structure

```
expense-tracker/
├── backend/          # Node.js/Express API server
├── frontend/         # React application
├── docs/             # Documentation
├── scripts/          # Deployment and utility scripts
└── archive/          # Archived specs and reports
```

For detailed architecture information, see **[Development Documentation](./docs/development/)**.

## API Reference

The application provides a RESTful API for all operations. For complete API documentation including endpoints, request/response formats, and examples, see **[API Documentation](./docs/API_DOCUMENTATION.md)**.

### Core Endpoints
- `/api/expenses` - Expense CRUD operations
- `/api/payment-methods` - Payment method management
- `/api/loans` - Loan and mortgage tracking
- `/api/investments` - Investment portfolio management
- `/api/budgets` - Budget tracking
- `/api/people` - Family member management
- `/api/invoices` - Invoice attachments
- `/api/analytics` - Spending analytics and predictions

## Database Schema

The application uses SQLite3 for data persistence. For complete schema documentation including all tables, fields, constraints, and relationships, see **[Database Schema Documentation](./docs/DATABASE_SCHEMA.md)**.

### Core Tables
- `expenses` - Variable expense transactions
- `income_sources` - Monthly income tracking
- `fixed_expenses` - Recurring monthly expenses
- `loans` - Loan, line of credit, and mortgage tracking
- `investments` - Investment account tracking
- `budgets` - Monthly budget limits
- `people` - Family member records
- `payment_methods` - Configurable payment methods

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.
