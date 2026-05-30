# Project Steering Index

This directory contains repository-tracked steering guidance imported from local Kiro steering plus hook-derived checklists.

## Canonical Spec Locations

- Active specs: `specs/<feature-name>/`
- Completed and historical specs: `specs/archive/<feature-name>/`

## Core Steering

- [product.md](product.md) - Product scope and behavior context
- [structure.md](structure.md) - Project structure and organization patterns
- [auth-patterns.md](auth-patterns.md) - Frontend and backend authentication patterns
- [api-integration.md](api-integration.md) - API integration conventions
- [error-handling.md](error-handling.md) - Error handling and resilience patterns
- [logging-best-practices.md](logging-best-practices.md) - Logging and observability expectations
- [database-migrations.md](database-migrations.md) - Schema migration process

## Workflow Steering

- [testing.md](testing.md) - Test strategy execution, command usage, and gotchas
- [TESTING_STRATEGY.md](TESTING_STRATEGY.md) - Test type decision matrix and when to use each type
- [ci-enforcement.md](ci-enforcement.md) - CI guardrail scripts and extension steps
- [git-commits.md](git-commits.md) - Branch, PR, merge, and deployment commit workflow
- [versioning.md](versioning.md) - Version bump locations and release rules
- [pre-deployment.md](pre-deployment.md) - Release readiness checks
- [docker-compose.md](docker-compose.md) - Container orchestration conventions

## Hook-Derived Guidance

- [HOOK_AUTOMATIONS.md](HOOK_AUTOMATIONS.md) - Requirement review and test-task update checklists tracked in-repo as project steering
