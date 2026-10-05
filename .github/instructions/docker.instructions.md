---
description: "Use when editing Dockerfile, docker-compose files, container settings, resource limits, or image tags."
applyTo: "Dockerfile,docker-compose*.yml,.dockerignore"
---
# Docker Rules

Image `ghcr.io/krazykrazz/expense-tracker`; tags `<short-sha>`, `vX.Y.Z`, `staging`, `latest`. Process: `docs/deployment/DEPLOYMENT_WORKFLOW.md`.

| File | Service | Image | Ports | Data |
|---|---|---|---|---|
| `docker-compose.yml` | `expense-tracker` | `:latest` | `2424:2424` | `./config:/config` |
| `docker-compose.yml` | `expense-tracker-test` (profile `staging`) | `:staging` | `2627:2424` | `./staging-data:/config` |
| `docker-compose.preview.yml` | `expense-tracker-preview` | local `expense-tracker:preview-<branch>` | `3001:2424` | `./preview-data:/config` |
| `docker-compose.ghcr.yml` | `expense-tracker` (minimal example) | `:latest` | `2424:2424` | `./config:/config` |

- Don't rename `expense-tracker` / `expense-tracker-test`: `scripts/build-and-push.ps1` deploys those names.
- All persistent data lives under `/config`; the container listens on 2424 and runs as non-root `node` (UID 1000), so mounts must be writable by UID 1000.
- Keep both `docker-compose.yml` services in sync: `stop_grace_period: 15s`, `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, `deploy.resources.limits` (`memory: 512M`, `cpus: '1.0'`) and `NODE_OPTIONS=--max-old-space-size=384`. Change the heap flag whenever the memory limit changes.
- Production runs from a compose file outside this repo; changes to these settings must be mirrored there by hand.
- `.dockerignore` must use `**/node_modules` (bare `node_modules` only matches the root).
- Never build production images locally; CI builds them and `build-and-push.ps1` promotes by retagging.
