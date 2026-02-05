# Testing Conventions

## Jest 30 CLI Options

This project uses Jest 30, which has different CLI options than earlier versions.

### Running Specific Tests

**CORRECT (Jest 30):**
```bash
# Filter by test file path pattern
npm test -- --testPathPatterns="pattern"

# Run a specific test file
npm test -- --testPathPatterns="billingCycleHistoryService.effective"

# Run all PBT tests
npm test -- --testPathPatterns="pbt"
```

**WRONG (deprecated in Jest 30):**
```bash
# These will NOT work:
npm test -- --testPathPattern="pattern"  # singular - DEPRECATED
npm test -- --testNamePattern="pattern"  # for test names, not file paths
```

### Key Differences

| Purpose | Jest 29 (old) | Jest 30 (current) |
|---------|---------------|-------------------|
| Filter by file path | `--testPathPattern` | `--testPathPatterns` |
| Filter by test name | `--testNamePattern` | `--testNamePatterns` |

### Common Test Commands

```bash
# Run all backend tests
npm test

# Run fast tests (reduced PBT iterations)
npm run test:fast

# Run only unit tests (no PBT)
npm run test:unit

# Run only PBT tests
npm run test:pbt

# Run specific test file
npm test -- --testPathPatterns="serviceName"

# Run tests with verbose output
npm test -- --testPathPatterns="serviceName" --verbose
```

### Working Directory

Always run backend tests from the `backend` directory:
```bash
# Using cwd parameter (preferred)
cwd: backend
command: npm test -- --testPathPatterns="pattern"
```
