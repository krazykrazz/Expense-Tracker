# Security Bug Hunt Report

Date: 2026-02-25  
Version: 5.x  
Scope: Full application (frontend + backend + infrastructure) security-focused code review

---

## Critical Issues

### SEC-001: No Authentication or Authorization System
- **Files**: `backend/server.js`, all route files
- **Description**: The application has zero authentication. Every API endpoint is publicly accessible to any device on the local network. There is no user login, no session management, no API keys, no token-based auth. Anyone who can reach the server can read, modify, or delete all financial data, trigger backups/restores, change settings, and access uploaded invoices.
- **Impact**: Complete data exposure. Any device on the network has full read/write access to all personal financial records, income data, loan details, investment information, and tax documents.
- **Severity**: Critical
- **Mitigating Factor**: The app is designed for single-household use on a local network, not exposed to the internet. Docker deployment further isolates it. This is a known design tradeoff, not an oversight.
- **Fix**: Add optional authentication (e.g., a simple PIN or password gate) that can be enabled via settings for users who want it.

### SEC-002: CORS Allows All Origins
- **File**: `backend/server.js` — Line `app.use(cors())`
- **Description**: CORS is configured with no restrictions (`cors()` with no options), meaning any origin can make requests to the API. Combined with SEC-001, any website open in a browser on the same network could make authenticated-by-default requests to the expense tracker API.
- **Impact**: A malicious website visited by someone on the local network could silently read or modify all financial data via cross-origin requests.
- **Severity**: Critical
- **Mitigating Factor**: Requires the attacker to know the server's local IP and port. The app runs on a private network.
- **Fix**: Restrict CORS to the app's own origin, or at minimum to the local network subnet. Example: `cors({ origin: ['http://localhost:2424', 'http://192.168.x.x:2424'] })`.

---

## High Severity Issues

### SEC-003: Backup/Restore Endpoints Completely Unauthenticated
- **File**: `backend/controllers/backupController.js`, `backend/routes/backupRoutes.js`
- **Description**: All backup operations (download database, restore from archive, update backup config) are accessible without any authentication. An attacker on the network can download the full SQLite database (containing all financial data), restore a malicious backup, or change the backup target path.
- **Impact**: Full database exfiltration via `GET /api/backup`, or data destruction via restore with a crafted backup file.
- **Severity**: High
- **Fix**: At minimum, add a confirmation token or rate-limit downloads more aggressively. Ideally, gate behind authentication (see SEC-001).

### SEC-004: Backup Config Accepts Arbitrary Target Path from User Input
- **File**: `backend/controllers/backupController.js` — `updateBackupConfig()` (Line 29)
- **Description**: The `updateBackupConfig` endpoint accepts a `targetPath` field from the request body and calls `fs.mkdirSync(targetPath, { recursive: true })` to create the directory if it doesn't exist. There is no validation that the path is within an expected directory. An attacker could set `targetPath` to any writable location on the filesystem (e.g., `/tmp/exfil`, or overwrite config directories).
- **Impact**: Arbitrary directory creation anywhere the Node.js process has write access. Could be used to set up exfiltration paths or interfere with other services.
- **Severity**: High
- **Fix**: Validate that `targetPath` resolves to a path within the expected config/backup directory. Use `path.resolve()` and check it starts with the allowed base path.

---

## Medium Severity Issues

### SEC-005: SSE Connections Unauthenticated
- **File**: `backend/services/sseService.js`, `backend/controllers/syncController.js`
- **Description**: Server-Sent Events connections have no authentication. Any client on the network can connect to the SSE endpoint and receive real-time notifications about all data changes (entity types, creation/update/deletion events).
- **Impact**: Information leakage about user activity patterns — an observer can see when expenses are added, settings changed, backups performed, etc.
- **Severity**: Medium
- **Fix**: Add a connection token or tie SSE connections to authenticated sessions.

### SEC-006: File Permission Utilities Exist But Are Not Called During Storage
- **Files**: `backend/utils/filePermissions.js`, `backend/utils/fileStorage.js`
- **Description**: `filePermissions.js` contains utilities for setting restrictive file permissions on uploaded files, but these functions are never called in the actual file storage pipeline (`fileStorage.js`). Uploaded invoices and statements are stored with default filesystem permissions.
- **Impact**: Uploaded financial documents (invoices, credit card statements) may be readable by other processes or users on the host system.
- **Severity**: Medium
- **Fix**: Call the file permission utilities after writing files in `fileStorage.js`.

### SEC-007: `docker-compose.ghcr.yml` Has Stale Volume Mount Paths
- **File**: `docker-compose.ghcr.yml`
- **Description**: The GHCR compose file mounts `./data:/app/backend/database` and `./uploads:/app/backend/uploads`, but the current application uses a unified `/config` volume mount (as seen in `docker-compose.yml`: `./config:/config`). If someone deploys using the GHCR file, the database and uploads would be written to unmounted paths inside the container and lost on restart.
- **Impact**: Data loss — database and uploaded files would not persist across container restarts for anyone using this deployment file.
- **Severity**: Medium
- **Fix**: Update `docker-compose.ghcr.yml` to use `./config:/config` matching the current directory structure.

### SEC-008: CSP Uses `'unsafe-inline'` for Scripts and Styles
- **File**: `backend/server.js` — Helmet CSP configuration
- **Description**: The Content Security Policy allows `'unsafe-inline'` for both `scriptSrc` and `styleSrc`. While this is common for React apps using inline styles, it weakens XSS protection by allowing inline script execution.
- **Impact**: Reduces the effectiveness of CSP as an XSS mitigation layer. If an injection point exists, inline scripts could execute.
- **Severity**: Medium
- **Mitigating Factor**: React's JSX rendering escapes content by default, reducing XSS risk. The app doesn't use `dangerouslySetInnerHTML`.
- **Fix**: Consider using nonce-based CSP for scripts. For styles, `'unsafe-inline'` is harder to avoid with vanilla CSS but could be addressed with a build-time hash approach.

### SEC-009: No Sensitive Data Redaction in Logs
- **File**: `backend/config/logger.js`, various services
- **Description**: The logging system does not redact sensitive financial data. Expense amounts, income figures, loan details, invoice metadata, and other financial information are logged in plaintext. The upload middleware also logs user agent strings and IP addresses.
- **Impact**: Log files contain sensitive financial data. If logs are exposed (e.g., via a log aggregation service or container log access), personal financial details are visible.
- **Severity**: Medium
- **Fix**: Add a log sanitizer that redacts or masks financial amounts, account details, and PII before writing to logs.

---

## Low Severity Issues

### SEC-010: Docker Compose Missing Security Hardening Options
- **File**: `docker-compose.yml`
- **Description**: The Docker Compose configuration doesn't include `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, or resource limits (`mem_limit`, `cpus`). While the Dockerfile correctly runs as non-root user `node`, additional container hardening is missing.
- **Impact**: The container runs with more Linux capabilities than necessary. No resource limits means a runaway process could consume all host resources.
- **Severity**: Low
- **Fix**: Add security options to docker-compose.yml:
  ```yaml
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  deploy:
    resources:
      limits:
        memory: 512M
        cpus: '1.0'
  ```

### SEC-011: GITHUB_REPO Environment Variable Could Redirect Update Checks
- **File**: `backend/services/updateCheckService.js` — `getGitHubRepo()` function
- **Description**: The `GITHUB_REPO` environment variable controls which GitHub repository the update check queries. If an attacker can set environment variables (e.g., via container config manipulation), they could redirect update checks to a malicious repository, potentially tricking the user into thinking a fake "update" is available.
- **Impact**: Minor SSRF via environment variable manipulation. The fetch only reads release tag names from the GitHub API, so the actual attack surface is limited to displaying a false "update available" message.
- **Severity**: Low
- **Mitigating Factor**: Requires environment variable access, which implies the attacker already has significant control. The 5-second AbortController timeout limits hanging requests.
- **Fix**: Hardcode the repository or validate the env var format matches `owner/repo` pattern.

---

## Positive Security Findings

The codebase demonstrates solid security practices in several areas:

1. **Parameterized SQL Queries**: All repositories consistently use `?` placeholders for SQL parameters. No string concatenation of user input into SQL was found. Dynamic column names in `expenseRepository` and `loanRepository` are built from internal code, not user input.

2. **Helmet Security Headers**: Properly configured with CSP directives, HSTS, X-Frame-Options, and other protective headers.

3. **Tiered Rate Limiting**: Well-designed rate limiting strategy — 500/min general, 60/min writes, 30/15min uploads, 5/hr backups. SSE and health checks correctly excluded.

4. **File Upload Validation**: Robust multi-layer validation — PDF magic byte checking, MIME type verification, extension validation, 10MB size limit, secure random filenames, and filename sanitization.

5. **Path Traversal Protection**: `restoreFromArchive` properly validates filenames (rejects `..`, `/`, `\`). Archive extraction uses the `tar` npm package which has built-in zip-slip protection.

6. **Non-Root Docker**: Dockerfile uses multi-stage build and runs as the `node` user, not root.

7. **No Hardcoded Secrets**: No API keys, passwords, or tokens found in the codebase. `.gitignore` properly excludes `.env*`, database files, invoices, backups, and statements.

8. **Error Handler**: `errorHandler.js` only exposes stack traces when `NODE_ENV === 'development'`. Production responses contain only the error message.

9. **Proper CI/CD Security**: GitHub Actions uses `${{ secrets.GITHUB_TOKEN }}` for GHCR authentication. No hardcoded credentials in workflows.

10. **Update Check Timeout**: The GitHub API call uses a 5-second `AbortController` timeout, preventing indefinite hangs.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| Critical | 2 | No auth (SEC-001), open CORS (SEC-002) |
| High | 2 | Unauthenticated backup (SEC-003), arbitrary targetPath (SEC-004) |
| Medium | 5 | SSE no auth (SEC-005), unused file perms (SEC-006), stale GHCR mounts (SEC-007), unsafe-inline CSP (SEC-008), log redaction (SEC-009) |
| Low | 2 | Docker hardening (SEC-010), env var SSRF (SEC-011) |
| **Total** | **11** | |

### Context

This is a personal household finance app deployed on a local network via Docker. It is not internet-facing. The critical findings (SEC-001, SEC-002) are known design tradeoffs for simplicity in a trusted network environment. The most actionable fixes are SEC-004 (targetPath validation), SEC-006 (enable file permissions), and SEC-007 (fix stale GHCR compose file), as these are straightforward code changes with no UX impact.
