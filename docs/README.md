# Documentation Index

Welcome to the Expense Tracker documentation. This index helps you find the right documentation for your needs.

## For End Users

Getting started and using the application:

- [Docker Deployment Guide](guides/DOCKER_DEPLOYMENT.md) - Deploy pre-built images from GHCR
- [User Guide](guides/USER_GUIDE.md) - Complete feature documentation
- [Startup Guide](guides/STARTUP_GUIDE.md) - Quick start instructions
- [Database Schema](DATABASE_SCHEMA.md) - Understanding your data structure

## For Developers

Contributing and developing:

### Getting Started
- [Development Setup](development/SETUP.md) - Local development environment
- [Feature Branch Workflow](development/FEATURE_BRANCH_WORKFLOW.md) - Git workflow and branching
- [GitHub Actions CI/CD](development/GITHUB_ACTIONS_CICD.md) - Continuous integration

### Testing
- [Frontend Testing Guidelines](development/FRONTEND_TESTING_GUIDELINES.md) - Testing practices
- [Parallel Test Execution](development/PARALLEL_TEST_EXECUTION.md) - Fast test runs
- [Example Test Patterns](development/EXAMPLE_TEST_PATTERNS.md) - Test examples

### Deployment
- [Deployment Workflow](deployment/DEPLOYMENT_WORKFLOW.md) - Internal deployment process
- [SHA-Based Containers](deployment/SHA_BASED_CONTAINERS.md) - Container workflow
- [Workflow Automation](deployment/WORKFLOW_AUTOMATION.md) - Automated deployments

### Project Steering
- [Steering Index](steering/README.md) - Repository-tracked development rules and conventions
- [Hook Automations](steering/HOOK_AUTOMATIONS.md) - Requirement and test-task checklists derived from Kiro hooks
- [Testing Steering](steering/testing.md) - Canonical test execution and guardrails
- [Git and Deployment Steering](steering/git-commits.md) - Branch, PR, and merge rules

### Architecture
- [API Documentation](API_DOCUMENTATION.md) - REST API reference
- [Database Schema](DATABASE_SCHEMA.md) - Database structure and relationships

### Features
- [Feature Documentation](features/) - Detailed feature specifications
- [Spec Documentation Review](SPEC_DOCUMENTATION_REVIEW_REPORT.md) - Spec review process

## Documentation Structure

```
docs/
├── README.md (this file)
├── guides/              # End-user documentation
│   ├── DOCKER_DEPLOYMENT.md
│   ├── USER_GUIDE.md
│   └── STARTUP_GUIDE.md
├── development/         # Developer guides
│   ├── SETUP.md
│   ├── FEATURE_BRANCH_WORKFLOW.md
│   └── FRONTEND_TESTING_GUIDELINES.md
├── steering/            # Project steering and workflow rules
│   ├── HOOK_AUTOMATIONS.md
│   ├── testing.md
│   └── ...
├── deployment/          # Internal deployment docs
│   ├── DEPLOYMENT_WORKFLOW.md
│   └── SHA_BASED_CONTAINERS.md
├── features/            # Feature specifications
│   ├── CREDIT_CARD_BILLING_CYCLES.md
│   ├── LOAN_PAYMENT_TRACKING.md
│   └── ...
├── API_DOCUMENTATION.md
└── DATABASE_SCHEMA.md
```

## Quick Links

- **I want to use the app**: Start with [Docker Deployment Guide](guides/DOCKER_DEPLOYMENT.md)
- **I want to contribute**: Start with [Development Setup](development/SETUP.md)
- **I want coding workflow rules**: Start with [Steering Index](steering/README.md)
- **I want to understand a feature**: Check [Feature Documentation](features/)
- **I want spec artifacts**: See `../specs/` for active specs and `../specs/archive/` for completed specs
- **I want to deploy internally**: See [Deployment Workflow](deployment/DEPLOYMENT_WORKFLOW.md)
- **I want to understand the API**: See [API Documentation](API_DOCUMENTATION.md)

## Getting Help

- Check the [User Guide](guides/USER_GUIDE.md) for feature questions
- Review [GitHub Issues](https://github.com/krazykrazz/expense-tracker/issues) for known issues
- See [Development Setup](development/SETUP.md) for development questions
