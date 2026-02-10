# Design Document: Application Rebrand

## Overview

This design document outlines the technical approach for rebranding the Expense Tracker application with a new name and visual identity. The rebrand will be implemented systematically across all application layers while maintaining backward compatibility and ensuring zero data loss.

### Design Goals

1. **Systematic Updates**: Update all references to the application name across code, documentation, and deployment artifacts
2. **Visual Consistency**: Implement a cohesive visual identity with new logo, colors, and branding
3. **Zero Downtime**: Ensure existing users can upgrade seamlessly without service interruption
4. **Backward Compatibility**: Maintain API compatibility and data integrity during transition
5. **Completeness**: Ensure no legacy references remain in production code

### Proposed Name

**Primary Option**: "Ledger"

**Rationale**: 
- Short, memorable, and professional
- Directly relates to financial record-keeping
- Easy to pronounce and spell
- Available as a brand name in the financial software space
- Works well in URLs and Docker image names (ledger, not expense-tracker)

**Alternative Options**: Vault, Tally, Compass Finance, Beacon, Finflow, Cashwise, Moneta, Fiscal, Penny

## Architecture

### Rebrand Scope

The rebrand touches the following architectural layers:

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
│  - Header logo and title                                     │
│  - Page titles and meta tags                                 │
│  - Footer version display                                    │
│  - In-app changelog                                          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  - Package names (frontend/backend)                          │
│  - Component display text                                    │
│  - Error messages and logging                                │
│  - API documentation                                         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Deployment Layer                           │
│  - Docker image names                                        │
│  - Docker registry paths                                     │
│  - Container names                                           │
│  - Volume names                                              │
│  - Deployment scripts                                        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Documentation Layer                         │
│  - README.md                                                 │
│  - All docs/ files                                           │
│  - CHANGELOG.md                                              │
│  - Code comments                                             │
│  - User guides                                               │
└─────────────────────────────────────────────────────────────┘
```

### Migration Strategy

**Phase 1: Asset Creation**
- Create new logo and visual assets
- Define new color scheme
- Generate favicon and app icons

**Phase 2: Frontend Updates**
- Update UI components with new branding
- Update CSS variables for color scheme
- Update package.json and meta tags
- Update in-app text and error messages

**Phase 3: Backend Updates**
- Update package.json
- Update logging and error messages
- Update API documentation comments

**Phase 4: Deployment Updates**
- Update Docker image names
- Update docker-compose files
- Update deployment scripts
- Maintain backward compatibility aliases

**Phase 5: Documentation Updates**
- Update README.md
- Update all documentation files
- Update CHANGELOG.md
- Update code comments

**Phase 6: Validation**
- Run validation script to find remaining references
- Test all functionality
- Verify Docker builds
- Update version and deploy

## Components and Interfaces

### 1. Visual Assets

**Logo Component**
```javascript
// frontend/src/assets/ledger-logo.svg
// SVG logo with the new brand identity
// Dimensions: 48x48px for header display
// Color: Primary brand color with transparency support
```

**Favicon Files**
```
frontend/public/favicon.ico       // 16x16, 32x32 multi-resolution ICO
frontend/public/favicon-16x16.png
frontend/public/favicon-32x32.png
frontend/public/favicon-192x192.png  // For mobile devices
frontend/public/apple-touch-icon.png // 180x180 for iOS
```

**Color Scheme**
```css
/* frontend/src/styles/variables.css */
:root {
  /* Primary Brand Colors */
  --brand-primary: #2C5F7C;      /* Deep blue - trust and stability */
  --brand-secondary: #4A90A4;    /* Medium blue - professionalism */
  --brand-accent: #7FB3D5;       /* Light blue - approachability */
  
  /* Semantic Colors (maintain existing) */
  --success-color: #4caf50;
  --warning-color: #ff9800;
  --danger-color: #f44336;
  --info-color: #2196f3;
  
  /* UI Colors (maintain existing) */
  --background-color: #f5f5f5;
  --card-background: #ffffff;
  --text-primary: #333333;
  --text-secondary: #666666;
  --border-color: #e0e0e0;
}
```

### 2. Frontend Components

**App.jsx Updates**
```javascript
// Update header title
<div className="header-title">
  <img src={ledgerLogo} alt="Ledger Logo" className="app-logo" />
  <h1>Ledger</h1>
</div>

// Update footer version display (no change needed - already dynamic)
```

**index.html Updates**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Ledger - Personal finance management application" />
    <title>Ledger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

**BackupSettings.jsx Changelog Update**
```javascript
// Add new changelog entry at the top
<div className="changelog-entry">
  <div className="changelog-version">v5.9.0</div>
  <div className="changelog-date">January 27, 2025</div>
  <ul className="changelog-items">
    <li>🎨 Rebranded application as "Ledger" with new logo and visual identity</li>
    <li>Updated all user-facing text and documentation</li>
    <li>Maintained full backward compatibility with existing data</li>
  </ul>
</div>
```

### 3. Package Configuration

**frontend/package.json**
```json
{
  "name": "ledger-frontend",
  "version": "5.9.0",
  "description": "Ledger React Frontend",
  ...
}
```

**backend/package.json**
```json
{
  "name": "ledger",
  "version": "5.9.0",
  "description": "Full-stack Ledger Application",
  ...
}
```

### 4. Docker Configuration

**docker-compose.yml**
```yaml
services:
  ledger:
    image: ghcr.io/krazykrazz/ledger:latest
    container_name: ledger
    ports:
      - "2424:2424"
    volumes:
      - ledger-data:/app/backend/database
      - ledger-config:/config
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    restart: unless-stopped

volumes:
  ledger-data:
  ledger-config:
```

**Dockerfile**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --only=production
RUN cd backend && npm ci --only=production
RUN cd frontend && npm ci

# Copy application code
COPY . .

# Build frontend
RUN cd frontend && npm run build

# Expose port
EXPOSE 2424

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:2424/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "backend/server.js"]
```

### 5. Deployment Scripts

**scripts/build-and-push.ps1**
```powershell
# Update image name references
$ImageName = "ghcr.io/krazykrazz/ledger"

# Build with new name
docker build -t "${ImageName}:${SHA}" .

# Tag for environments
docker tag "${ImageName}:${SHA}" "${ImageName}:staging"
docker tag "${ImageName}:${SHA}" "${ImageName}:latest"

# Push to registry
docker push "${ImageName}:${SHA}"
docker push "${ImageName}:staging"
docker push "${ImageName}:latest"
```

**scripts/deploy-to-production.ps1**
```powershell
# Update references to new application name
Write-Host "Deploying Ledger v${NewVersion}..." -ForegroundColor Cyan

# Build and push with new image name
.\scripts\build-and-push.ps1 -Environment production
```

### 6. Documentation Updates

**README.md Structure**
```markdown
# Ledger

A full-stack personal finance management application...

## Quick Start

docker pull ghcr.io/krazykrazz/ledger:latest
docker run -d -p 2424:2424 -v ./config:/config ghcr.io/krazykrazz/ledger:latest

Access at http://localhost:2424
```

**CHANGELOG.md Entry**
```markdown
## [5.9.0] - 2025-01-27

### Changed
- 🎨 **REBRAND**: Application rebranded as "Ledger"
  - New logo and visual identity
  - Updated color scheme for professional appearance
  - Updated all user-facing text and documentation
  - Updated Docker image names (ghcr.io/krazykrazz/ledger)
  - Maintained full backward compatibility

### Migration Notes
- Existing users: Data and configuration remain unchanged
- Docker users: Update image name from `expense-tracker` to `ledger`
- API endpoints: No changes (backward compatible)
```

## Data Models

### No Database Changes Required

The rebrand does not require any database schema changes. All existing tables, fields, and relationships remain unchanged:

- `expenses` table: No changes
- `income_sources` table: No changes
- `fixed_expenses` table: No changes
- `loans` table: No changes
- `investments` table: No changes
- All other tables: No changes

**Rationale**: The application name is not stored in the database. All data structures are independent of the application branding.

### Configuration Files

**Version Information**
```javascript
// backend/server.js - version endpoint response
{
  "version": "5.9.0",
  "name": "Ledger",
  "docker": {
    "tag": "latest",
    "image": "ghcr.io/krazykrazz/ledger"
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After analyzing the acceptance criteria, I've identified the following testable properties:

**Testable as Properties:**
- 1.4: Name consistency across UI touchpoints
- 2.4: CSS variables validation
- 3.3, 3.4, 3.5: Component text, documentation, and error message updates
- 5.2, 5.4: Documentation and code comment updates
- 7.3: API endpoint path preservation
- 9.1, 9.2: Environment variable and configuration file updates
- 10.3: Validation script correctness

**Testable as Examples:**
- 3.1, 3.2, 3.6: Package.json, HTML titles, and codebase search
- 4.1, 4.2, 4.5: Docker configuration updates
- 5.1, 5.3: README and CHANGELOG updates
- 6.1, 6.2, 6.3: Version and changelog entries
- 7.1, 7.2, 7.4: Database and Docker compatibility
- 8.1, 8.2, 8.3, 8.4, 8.5: Asset file existence and optimization
- 9.3, 9.4: Docker container and volume names
- 10.2: Validation script existence

**Redundancy Analysis:**

1. **Legacy Reference Detection**: Properties 3.3, 3.4, 3.5, 5.2, 5.4, 9.1, and 9.2 all test for the absence of old name references. These can be combined into a single comprehensive property: "No legacy references in production code."

2. **File Content Validation**: Properties 3.6 and 10.3 both validate that legacy references are found/not found. Property 10.3 (validation script) subsumes 3.6 (manual search).

3. **Configuration Consistency**: Properties 4.1, 4.2, 9.3, and 9.4 all check Docker configuration files. These can be combined into: "Docker configuration uses new name consistently."

**Final Property Set After Reflection:**

1. **Name Consistency Property** (1.4): UI displays consistent name
2. **CSS Variables Property** (2.4): CSS variables are valid
3. **Legacy Reference Elimination Property** (3.3-3.5, 5.2, 5.4, 9.1-9.2): No old name in production code
4. **API Compatibility Property** (7.3): API endpoints unchanged
5. **Validation Script Property** (10.3): Script correctly identifies legacy references

### Correctness Properties

#### Property 1: UI Name Consistency

*For any* page or component in the application, the displayed application name should be "Ledger" (or the configured name) consistently across all UI elements.

**Validates: Requirements 1.4**

**Testing Approach**: Render different pages and components, extract all text content that references the application name, and verify they all use the same name.

#### Property 2: CSS Variable Validity

*For any* CSS variable defined in the color scheme, the value should be a valid CSS color format (hex, rgb, rgba, hsl, or named color).

**Validates: Requirements 2.4**

**Testing Approach**: Parse CSS variables from variables.css, validate each color value against CSS color format specifications.

#### Property 3: Legacy Reference Elimination

*For any* production code file (excluding tests, documentation, and archives), searching for "Expense Tracker" or "expense-tracker" should return zero matches in code, comments, strings, and identifiers.

**Validates: Requirements 3.3, 3.4, 3.5, 5.2, 5.4, 9.1, 9.2**

**Testing Approach**: Recursively search all production files for legacy name patterns, excluding allowed locations (CHANGELOG.md historical entries, archived specs, test fixtures).

#### Property 4: API Endpoint Preservation

*For any* API endpoint defined before the rebrand, the endpoint path should remain unchanged after the rebrand (backward compatibility).

**Validates: Requirements 7.3**

**Testing Approach**: Compare API route definitions before and after rebrand, verify all paths are identical.

#### Property 5: Validation Script Correctness

*For any* test file containing legacy references, the validation script should correctly identify and report those references.

**Validates: Requirements 10.3**

**Testing Approach**: Create test files with known legacy references, run validation script, verify it reports all expected matches.

## Error Handling

### Asset Loading Failures

**Scenario**: Logo or favicon files fail to load

**Handling**:
```javascript
// Fallback to text-only header if logo fails
<img 
  src={ledgerLogo} 
  alt="Ledger Logo" 
  className="app-logo"
  onError={(e) => {
    e.target.style.display = 'none';
    console.warn('Logo failed to load, using text-only header');
  }}
/>
```

### Docker Image Migration

**Scenario**: Users pull old image name after rebrand

**Handling**:
- Maintain old image name as an alias for 6 months
- Add deprecation notice in old image description
- Provide clear migration instructions in CHANGELOG.md

```bash
# Old image (deprecated, will be removed 2025-07-27)
docker pull ghcr.io/krazykrazz/expense-tracker:latest

# New image (recommended)
docker pull ghcr.io/krazykrazz/ledger:latest
```

### Configuration File Compatibility

**Scenario**: Existing docker-compose.yml files reference old image name

**Handling**:
- Document migration steps in CHANGELOG.md
- Provide migration script to update docker-compose files
- Support both old and new volume names during transition

```powershell
# scripts/migrate-docker-config.ps1
# Updates docker-compose.yml files to use new image name
$content = Get-Content docker-compose.yml
$content = $content -replace 'expense-tracker', 'ledger'
Set-Content docker-compose.yml $content
```

### Version Endpoint Compatibility

**Scenario**: Monitoring tools expect old application name in version endpoint

**Handling**:
```javascript
// backend/server.js - version endpoint
app.get('/api/version', (req, res) => {
  res.json({
    version: packageJson.version,
    name: 'Ledger',
    previousName: 'Expense Tracker', // For backward compatibility
    docker: {
      tag: process.env.DOCKER_TAG || 'latest',
      image: 'ghcr.io/krazykrazz/ledger'
    }
  });
});
```

## Testing Strategy

### Dual Testing Approach

The rebrand will be validated using both unit tests and property-based tests:

**Unit Tests**: Verify specific examples and edge cases
- Package.json files contain correct name
- HTML title tags updated
- Favicon files exist and are valid
- Docker configuration files use new names
- CHANGELOG.md contains rebrand entry
- Asset files exist and meet size requirements

**Property Tests**: Verify universal properties across all inputs
- UI name consistency across all components
- CSS variable validity for all color definitions
- Legacy reference elimination across all production files
- API endpoint preservation for all routes
- Validation script correctness for all test cases

### Test Configuration

**Property-Based Testing Library**: fast-check (already in use)

**Test Iterations**: Minimum 100 iterations per property test

**Test Tags**: Each property test must include a comment referencing the design property:
```javascript
// Feature: application-rebrand, Property 1: UI Name Consistency
test('displays consistent application name across all UI elements', () => {
  fc.assert(
    fc.property(fc.constantFrom('Home', 'Settings', 'Summary'), (page) => {
      const rendered = renderPage(page);
      const appNames = extractApplicationNames(rendered);
      return appNames.every(name => name === 'Ledger');
    }),
    { numRuns: 100 }
  );
});
```

### Validation Script

**Purpose**: Automated detection of legacy references

**Implementation**:
```javascript
// scripts/validate-rebrand.js
const fs = require('fs');
const path = require('path');

const LEGACY_PATTERNS = [
  /Expense Tracker/gi,
  /expense-tracker/g,
  /expense_tracker/g
];

const EXCLUDED_PATHS = [
  'node_modules',
  '.git',
  'archive',
  'CHANGELOG.md', // Historical entries allowed
  'docs/deployment/SHA_BASED_CONTAINERS.md' // Migration docs
];

function searchFiles(dir, results = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!EXCLUDED_PATHS.some(excluded => filePath.includes(excluded))) {
        searchFiles(filePath, results);
      }
    } else {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of LEGACY_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
          results.push({
            file: filePath,
            matches: matches.length,
            pattern: pattern.source
          });
        }
      }
    }
  }
  
  return results;
}

const results = searchFiles('.');
if (results.length > 0) {
  console.error('❌ Found legacy references:');
  results.forEach(r => {
    console.error(`  ${r.file}: ${r.matches} matches for ${r.pattern}`);
  });
  process.exit(1);
} else {
  console.log('✅ No legacy references found');
  process.exit(0);
}
```

### Test Execution

**Pre-deployment validation**:
```bash
# Run validation script
node scripts/validate-rebrand.js

# Run all tests
npm test  # Frontend
cd backend && npm test  # Backend

# Verify Docker build
docker build -t ledger:test .
docker run --rm ledger:test node -e "console.log('Build successful')"
```

**CI/CD Integration**:
- Add validation script to GitHub Actions workflow
- Run on all PRs that modify branding-related files
- Block merge if legacy references found

### Manual Testing Checklist

- [ ] Application loads with new logo in header
- [ ] Favicon displays correctly in browser tab
- [ ] All pages show "Ledger" consistently
- [ ] Footer displays correct version
- [ ] In-app changelog shows rebrand entry
- [ ] Docker image builds successfully
- [ ] Docker container runs with new name
- [ ] Existing data loads correctly after upgrade
- [ ] API endpoints respond correctly
- [ ] Documentation is accurate and complete

## Implementation Notes

### Migration Timeline

**Week 1**: Asset creation and frontend updates
- Create logo, favicon, and app icons
- Update frontend components and styling
- Update package.json and HTML files

**Week 2**: Backend and deployment updates
- Update backend package.json
- Update Docker configuration
- Update deployment scripts
- Create validation script

**Week 3**: Documentation and testing
- Update all documentation files
- Run comprehensive testing
- Fix any issues found
- Prepare CHANGELOG entry

**Week 4**: Deployment and transition
- Deploy to staging for testing
- Deploy to production
- Publish new Docker images
- Announce rebrand to users
- Maintain old image aliases

### Rollback Plan

If critical issues are discovered after deployment:

1. **Immediate**: Revert to previous Docker image tag
2. **Short-term**: Fix issues in hotfix branch
3. **Long-term**: Re-deploy corrected version

**Rollback Command**:
```bash
docker pull ghcr.io/krazykrazz/ledger:5.8.1  # Previous version
docker-compose down
docker-compose up -d
```

### Communication Plan

**User Notification**:
- Update README.md with prominent rebrand notice
- Add banner to CHANGELOG.md
- Include rebrand details in in-app changelog
- Update Docker Hub description

**Developer Notification**:
- Update all documentation
- Add migration guide for contributors
- Update issue templates with new name
- Update PR templates with new name

### Success Criteria

The rebrand is considered successful when:

1. ✅ All tests pass (unit and property tests)
2. ✅ Validation script reports zero legacy references
3. ✅ Docker images build and run successfully
4. ✅ Application functions identically to pre-rebrand version
5. ✅ Documentation is complete and accurate
6. ✅ Users can upgrade seamlessly without data loss
7. ✅ New branding is consistent across all touchpoints
