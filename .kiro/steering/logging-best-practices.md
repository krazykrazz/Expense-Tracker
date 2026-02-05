# Logging Best Practices

This project uses a centralized logging module (`backend/config/logger.js`).

## Usage

```javascript
const logger = require('../config/logger');

logger.debug('Detailed diagnostic info:', { id, value });
logger.info('Normal operation:', message);
logger.warn('Potential issue:', warning);
logger.error('Error occurred:', error);
```

## Log Levels

| Level | Use For |
|-------|---------|
| DEBUG | Diagnostic info, variable values (only visible when `LOG_LEVEL=debug`) |
| INFO | Normal operations, successful actions (default level) |
| WARN | Recoverable errors, deprecation warnings |
| ERROR | Failures requiring attention |

## Rules

### Production Code
- ❌ **NEVER** use `console.log`, `console.error`, or `console.warn`
- ✅ **ALWAYS** use the logger module
- ✅ Include context in log messages (IDs, values)

### Exceptions
- ✅ Console statements OK in `backend/scripts/` (utility scripts)
- ✅ Console statements OK in test files

## Configuration

```bash
LOG_LEVEL=debug npm start  # Development - all logs
LOG_LEVEL=info npm start   # Production - info and above
LOG_LEVEL=warn npm start   # Quiet - warnings and errors only
```

Docker:
```yaml
environment:
  - LOG_LEVEL=info
```
