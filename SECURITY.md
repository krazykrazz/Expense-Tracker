# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Email:** Open a [GitHub Security Advisory](https://github.com/krazykrazz/expense-tracker/security/advisories/new) on this repository.

Please include:
- A description of the vulnerability
- Steps to reproduce the issue
- Any potential impact

I'll acknowledge receipt within 48 hours and aim to provide a fix or mitigation plan within 7 days.

## Scope

This is a self-hosted personal finance application designed for local network use. Security considerations include:

- SQLite database access and injection prevention
- File upload validation (invoices, statements)
- Input sanitization across all API endpoints
- Docker container isolation

## Supported Versions

Only the latest release is actively maintained with security updates.
