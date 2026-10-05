# Documentation Index

Welcome to the Expense Tracker documentation. This index helps you find the right documentation for your needs.

## For End Users

- [Docker Deployment Guide](guides/DOCKER_DEPLOYMENT.md) - Run the pre-built image from GHCR
- [User Guide](guides/USER_GUIDE.md) - Using the application
- [Budget Management Guide](guides/BUDGET_MANAGEMENT_GUIDE.md) - Setting and tracking budgets
- [Restore Backup Guide](guides/RESTORE_BACKUP_GUIDE.md) - Restoring from a backup archive
- [Invoice Troubleshooting](guides/TROUBLESHOOTING_INVOICES.md) and [Invoice Maintenance](guides/MAINTENANCE_GUIDE_INVOICES.md) - Invoice attachment issues and upkeep
- [Feature Documentation](features/README.md) - Per-feature behaviour reference

## For Developers

### Getting Started
- [Startup Guide](guides/STARTUP_GUIDE.md) - Local development and Docker startup
- [Feature Branch Workflow](development/FEATURE_BRANCH_WORKFLOW.md) - Branch conventions and PR scripts
- [Project Conventions](../.github/copilot-instructions.md) - Architecture summary and coding/git rules

### Architecture and Reference
- [API Documentation](API_DOCUMENTATION.md) - REST API reference
- [Database Schema](DATABASE_SCHEMA.md) - Tables, constraints, indexes, relationships
- [Database Migrations](DATABASE_MIGRATIONS.md) - How schema changes are applied
- [Validation Utilities](development/VALIDATION_UTILITIES_GUIDE.md) - Backend validators and middleware
- [Tech Debt](TECH-DEBT.md) - Engineering backlog

### Testing and CI
- [Testing Rules](../.github/instructions/testing.instructions.md) - Test commands, choosing test types, PBT guardrails
- [Frontend Testing Guidelines](development/FRONTEND_TESTING_GUIDELINES.md) - Frontend utilities and patterns
- [CI Test Reliability](development/CI_TEST_RELIABILITY.md) - CI-mode differences and determinism helpers
- [GitHub Actions CI/CD](development/GITHUB_ACTIONS_CICD.md) - CI jobs, budgets, security scanning, troubleshooting

### Deployment
- [Deployment Workflow](deployment/DEPLOYMENT_WORKFLOW.md) - Image builds, releases, staging/production promotion, rollback
- [Feature Preview Deployment](deployment/FEATURE_PREVIEW_DEPLOYMENT.md) - Local container preview of a feature branch
- [Staging Environment](development/STAGING_ENVIRONMENT.md) - Staging data setup and migration testing

### Coding Rules (Copilot instructions)

Development rules live in `.github/` so Copilot loads them automatically: [copilot-instructions.md](../.github/copilot-instructions.md) (always on) and [instructions/](../.github/instructions/) (backend, frontend, database, testing, CI scripts, Docker, release, specs — applied by file pattern).

## Documentation Structure

```
docs/
├── README.md (this file)
├── API_DOCUMENTATION.md
├── DATABASE_SCHEMA.md
├── DATABASE_MIGRATIONS.md
├── TECH-DEBT.md
├── guides/              # End-user and operator guides
├── features/            # Per-feature behaviour reference
├── development/         # CI, testing, branching, staging, validation
└── deployment/          # Release and deployment process
```

## Quick Links

- **I want to use the app**: Start with [Docker Deployment Guide](guides/DOCKER_DEPLOYMENT.md)
- **I want to contribute**: Start with [Startup Guide](guides/STARTUP_GUIDE.md)
- **I want coding workflow rules**: Start with [copilot-instructions.md](../.github/copilot-instructions.md)
- **I want to understand a feature**: Check [Feature Documentation](features/README.md)
- **I want spec artifacts**: See `../specs/` for active specs and `../specs/archive/` for completed specs
- **I want to release or deploy**: See [Deployment Workflow](deployment/DEPLOYMENT_WORKFLOW.md)
- **I want to understand the API**: See [API Documentation](API_DOCUMENTATION.md)

## Getting Help

- Check the [User Guide](guides/USER_GUIDE.md) for feature questions
- Review [GitHub Issues](https://github.com/krazykrazz/Expense-Tracker/issues) for known issues
- See [Startup Guide](guides/STARTUP_GUIDE.md) for development questions
