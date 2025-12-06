# Logging Best Practices

## Overview

This project uses a centralized logging module (`backend/config/logger.js`) that provides consistent, configurable logging across the application.

## Usage

### Import the Logger

```javascript
const logger = require('../config/logger');
```

### Log Levels

Use the appropriate log level for each situation:

#### DEBUG
- Detailed diagnostic information
- Variable values during execution
- Function entry/exit points
- Only visible when `LOG_LEVEL=debug`

```javascript
logger.debug('Processing expense:', { id, amount, category });
logger.debug('Database query:', query);
```

#### INFO
- Normal operational messages
- Successful operations
- State changes
- Default log level

```javascript
logger.info('Backup completed successfully:', filename);
logger.info('Server started on port:', port);
logger.info('Migration applied:', migrationName);
```

#### WARN
- Potentially harmful situations
- Deprecated feature usage
- Recoverable errors
- Configuration issues

```javascript
logger.warn('Budget approaching limit:', { category, percentage });
logger.warn('Using default configuration');
logger.warn('Deprecated API endpoint called');
```

#### ERROR
- Error events
- Exceptions
- Failed operations
- Requires attention

```javascript
logger.error('Database operation failed:', error);
logger.error('Backup error:', error);
logger.error('Invalid input:', validationError);
```

## Rules

### Production Code
- ❌ **NEVER** use `console.log`, `console.error`, or `console.warn` in production code
- ✅ **ALWAYS** use the logger module for all logging
- ✅ Use appropriate log levels (debug, info, warn, error)
- ✅ Include context in log messages (IDs, values, etc.)

### Script Files
- ✅ Console statements are acceptable in utility scripts (`backend/scripts/`)
- ✅ Scripts are meant to be run manually and need direct console output
- ✅ Examples: migration scripts, database utilities, test scripts

### Test Files
- ✅ Console statements are acceptable in test files
- ✅ Tests may need to output results directly
- ✅ Consider using test framework's built-in logging when possible

## Configuration

### Environment Variable

Set the log level using the `LOG_LEVEL` environment variable:

```bash
# Development - see all logs
LOG_LEVEL=debug npm start

# Production - only info and above
LOG_LEVEL=info npm start

# Quiet - only warnings and errors
LOG_LEVEL=warn npm start

# Critical only - only errors
LOG_LEVEL=error npm start
```

### Docker Configuration

```yaml
environment:
  - LOG_LEVEL=info  # or debug, warn, error
```

## Benefits

### Consistency
- All logs follow the same format
- Timestamps are automatically added
- Easy to parse and analyze

### Configurability
- Control verbosity without code changes
- Different levels for development vs production
- Easy to adjust for debugging

### Maintainability
- Centralized logging logic
- Easy to add features (file logging, remote logging, etc.)
- Consistent across the entire codebase

## Examples

### Good ✅

```javascript
const logger = require('../config/logger');

async function performBackup() {
  logger.debug('Starting backup process');
  
  try {
    const result = await createBackup();
    logger.info('Backup completed successfully:', result.filename);
    return result;
  } catch (error) {
    logger.error('Backup failed:', error);
    throw error;
  }
}
```

### Bad ❌

```javascript
async function performBackup() {
  console.log('Starting backup process');
  
  try {
    const result = await createBackup();
    console.log('Backup completed:', result.filename);
    return result;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
}
```

## Migration Guide

### Replacing Console Statements

1. **Add logger import:**
   ```javascript
   const logger = require('../config/logger');
   ```

2. **Replace console.log:**
   ```javascript
   // Before
   console.log('Message');
   
   // After
   logger.info('Message');  // or logger.debug() for detailed info
   ```

3. **Replace console.error:**
   ```javascript
   // Before
   console.error('Error:', error);
   
   // After
   logger.error('Error:', error);
   ```

4. **Replace console.warn:**
   ```javascript
   // Before
   console.warn('Warning');
   
   // After
   logger.warn('Warning');
   ```

## Future Enhancements

Potential improvements to the logging system:

- File-based logging (write logs to files)
- Log rotation (manage log file sizes)
- Remote logging (send logs to external service)
- Structured logging (JSON format for parsing)
- Request ID tracking (trace requests through the system)

---

**Last Updated:** December 3, 2025  
**Status:** Active
