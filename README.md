# Expense Tracker

[![CI](https://github.com/krazykrazz/Expense-Tracker/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/krazykrazz/Expense-Tracker/actions/workflows/ci.yml)

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

# Start backend (port 2626 outside Docker)
cd backend && npm start

# Start frontend dev server (port 5173, proxies /api to 2626)
cd frontend && npm run dev
```

See **[Startup Guide](./docs/guides/STARTUP_GUIDE.md)** for detailed development setup and troubleshooting.

## Key Features

### Core Functionality
- 📝 **Expense Management** - Add, edit, delete expenses with smart category suggestions and payment method memory
- 🔍 **Global Filtering** - Search and filter expenses across all time periods by category, payment method, year, and custom date range (with quick presets)
- 🗂️ **Expense List** - Date-grouped list with quick views (Needs review, Tax-deductible, Recurring), local filters, and pagination
- 💳 **Payment Methods** - Configurable payment methods with credit card balance tracking and utilization indicators
- 💰 **Income & Fixed Expenses** - Track multiple income sources and recurring expenses with categorization
- 📊 **Budget Tracking** - Set budget limits with real-time alerts at 80%, 90%, and 100% thresholds

### Financial Tracking
- 💳 **Loans & Mortgages** - Track loans, lines of credit, and mortgages with payment history, interest-aware balance calculations, and balance override
- 📈 **Investments** - Monitor TFSA and RRSP portfolios with value history and performance charts
- 💎 **Net Worth** - Automatic calculation showing assets minus liabilities
- 📊 **Analytics Hub** - Monthly summary, Spending and Cash Flow views over any period, merchant analytics, activity insights, and trends
- 🚨 **Anomaly Alerts** - Actionable alerts for unusual spending, with dismiss and suppression rules

### Medical & Tax Features
- 👨‍👩‍👧‍👦 **People Tracking** - Associate medical expenses with family members for tax preparation
- 🏥 **Insurance Tracking** - Track claim status and reimbursements for medical expenses
- 📄 **Invoice Attachments** - Attach multiple PDF invoices to medical expenses with built-in viewer
- 🧾 **Tax Reports** - Generate tax-deductible expense reports grouped by person or provider

### Data Management
- 💾 **Automated Backups** - Scheduled database backups with restore functionality
- 🔄 **Data Reminders** - Monthly reminders to update investments and loan balances
- 📋 **Activity Log** - Comprehensive tracking of all data changes with automatic cleanup
- ⚙️ **Settings & System** - Separate modals for user settings and system information
- 🔒 **Optional Password** - Off by default; enable a password gate from Settings
- 🌐 **Multi-Device Access** - Access from any device on your local network, kept in sync in real time

For a complete feature list, see **[Feature Documentation](./docs/features/)**.

## Tech Stack

- **Frontend:** React 19, Vite, CSS3
- **Backend:** Node.js, Express, SQLite3
- **Deployment:** Docker, Docker Compose

## Documentation

### Getting Started
- **[Docker Deployment Guide](./docs/guides/DOCKER_DEPLOYMENT.md)** - Complete Docker setup and configuration
- **[Startup Guide](./docs/guides/STARTUP_GUIDE.md)** - First-time setup and configuration

### Features
- **[Feature Documentation](./docs/features/)** - Detailed guides for all features
- **[API Documentation](./docs/API_DOCUMENTATION.md)** - Complete API reference

### Development
- **[Development Docs](./docs/development/)** - CI/CD, feature branch workflow, staging, validation utilities
- **[Testing Rules](./.github/instructions/testing.instructions.md)** - How to run backend/frontend tests and CI guardrails
- **[Frontend Testing Guidelines](./docs/development/FRONTEND_TESTING_GUIDELINES.md)** - Frontend test utilities and patterns
- **[Project Conventions](./.github/copilot-instructions.md)** - Architecture, coding and git rules (also loaded by Copilot, with per-area rules in `.github/instructions/`)
- **[Deployment Workflow](./docs/deployment/DEPLOYMENT_WORKFLOW.md)** - Image builds, releases, staging and production promotion

### Reference
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and release notes
- **[CHANGELOG.pre-1.0.md](./CHANGELOG.pre-1.0.md)** - Historical release notes (v1.0.0–v5.17.5)
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
- Activity log with comprehensive event tracking

## Project Structure

```
expense-tracker/
├── backend/          # Node.js/Express API server
├── frontend/         # React application
├── docs/             # Documentation
├── specs/            # Active and archived feature specs
└── scripts/          # Deployment and utility scripts
```

For architecture and conventions, see **[Project Conventions](./.github/copilot-instructions.md)**.

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

The application uses SQLite3 for data persistence. The schema is defined declaratively in `backend/database/schema.js` as a single source of truth, shared by both production and test databases. For complete schema documentation including all tables, fields, constraints, and relationships, see **[Database Schema Documentation](./docs/DATABASE_SCHEMA.md)**.

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

Collaborators welcome! If you'd like to contribute, please open an issue first to discuss what you have in mind. For bug fixes and small improvements, feel free to submit a pull request directly.
