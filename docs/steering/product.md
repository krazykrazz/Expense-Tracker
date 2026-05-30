# Product Overview

Personal expense tracking app for household finances. React 19 + Express + SQLite, Docker-deployed, multi-device via local network.

## Navigation & UI (v5.12.0)

- **Sidebar Navigation**: Persistent left sidebar with 7 main sections (Expenses, Financial Overview, Budgets, Annual Summary, Income Tax, Analytics Hub, Merchant Analytics) plus Settings and System buttons
- **Route-Based Views**: Hash-based client-side routing with nested sub-routes for financial details, replacing modal-based navigation
- **Dark Mode**: Light/dark theme toggle with persisted preference, inverted neutral palette, adjusted semantic colors
- **Transaction Drawer**: Slide-in panel for editing expense details with Danger Zone section, ESC/click-outside to close
- **Smart Insights**: Collapsible panel with budget overages, upcoming bills, unusual transactions, predictions (red for urgent, neutral for info)
- **Filter Drawer**: Expandable filter controls with pill-style multi-select, active filter chips
- **Virtualized Lists**: Windowed rendering for 500+ items with 60fps scrolling performance

## Core Domains

- Expenses: CRUD, global search, category/payment/year filtering, filter chips, advanced filters (invoice/insurance status), smart category suggestions, progressive disclosure form, reimbursement tracking, transaction drawer
- Payment Methods: configurable (Cash, Cheque, Debit, Credit Card), credit card balance/utilization tracking, payment history, statement uploads, billing cycle history with auto-generation, statement balance calculation, posted date support, payment method memory
- Financial Summaries: monthly/annual with weekly breakdowns, annual YoY comparison, savings rate, YTD handling, income by category, monthly net balance graph, redesigned summary panel with large numeric values and trend indicators
- Income & Fixed Expenses: multi-source gross income with categories, fixed expenses with category/payment tracking, carry-forward, loan linkage, due date reminders
- Budgets: tracking with proactive alerts (Warning 80-89%, Danger 90-99%, Critical ≥100%), progress bars with color coding and text labels
- Loans & Debt: loans, lines of credit, mortgages with balance history, payment tracking, amortization, equity, variable rates, total debt overview, payment reminders with auto-log
- Investments: TFSA/RRSP portfolio tracking, value history, performance charts, net worth (assets minus liabilities)
- Tax: deductible expense tracking (medical/donations), insurance claim status, people tracking, multi-invoice PDFs, person-grouped reports, donation grouping by place, tax credit calculator with YoY
- Merchant Analytics: spending insights, visit frequency, trends, fixed expenses integration
- Notifications: smart insights panel with insurance claim reminders (30+ days), loan payment reminders, budget alerts, billing cycle reminders, anomaly alerts with simplified card layout (severity border, plain-language summary, "✓ Got it" primary action, "Mute alerts like this" secondary, details toggle for enriched data), life-event grouping (travel/moving/holiday), collapsible section with count badge
- Analytics Hub: four-tab layout (Monthly Summary, Merchants, Activity Insights, Trends), spending predictions, trend analysis, activity log insights, data quality scoring
- Authentication: dual-mode (Password_Gate / Open_Mode), JWT access + refresh tokens, bcrypt password hashing, SSE auth via query param, frontend authAwareFetch with silent token refresh, security settings UI
- System: automated/manual backups with restore, activity log with cleanup/retention, settings modal, system modal, real-time multi-device sync via SSE with visibility-based lifecycle, container update detection with refresh banner, version upgrade tracking with changelog modal, remote update availability checking via GitHub Releases API
