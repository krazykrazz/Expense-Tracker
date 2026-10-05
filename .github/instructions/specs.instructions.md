---
description: "Use when creating, reviewing, or implementing a feature spec in specs/."
applyTo: "specs/**"
---
# Feature Specs

- One file per feature: `specs/<feature-name>/spec.md` combining requirements, design and tasks. Do not split into `requirements.md` / `design.md` / `tasks.md`.
- Move completed specs to `specs/archive/<feature-name>/`.
- Implement on a `feature/<feature-name>` branch. If already on a feature branch, ask whether to continue there or create a new one.

## Review Checklist

1. Activity log: new, updated and deleted entities emit events (`<entity>_added|_updated|_deleted`).
2. Note safe cleanup/refactor opportunities found while implementing.
3. Docs updated: affected `docs/features/*`, `docs/API_DOCUMENTATION.md` (Endpoint Reference), `docs/DATABASE_SCHEMA.md`, `docs/guides/USER_GUIDE.md`, README.
4. Tests follow the testing rules (test type choice, PBT invariant comments, no raw `fetch`).
5. Full-suite validation tasks use `.\scripts\run-test-summary.ps1`.
