# Implementation Plan: Application Rebrand

## Overview

This implementation plan systematically rebrands the Expense Tracker application as "Ledger" with a new visual identity. The approach ensures completeness, maintains backward compatibility, and validates that no legacy references remain in production code.

## Tasks

- [ ] 1. Create visual assets and branding materials
  - Create new logo in SVG format (48x48px for header)
  - Create logo in PNG format for fallback
  - Create favicon files (ICO with 16x16 and 32x32, plus PNG variants)
  - Create apple-touch-icon.png (180x180px for iOS)
  - Create app icon at 192x192px for PWA support
  - Optimize all assets for web delivery (logo < 50KB)
  - Store assets in `frontend/src/assets/` and `frontend/public/`
  - _Requirements: 2.1, 2.2, 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 2. Update frontend branding and styling
  - [ ] 2.1 Update CSS color scheme variables
    - Update `frontend/src/styles/variables.css` with new brand colors
    - Define --brand-primary, --brand-secondary, --brand-accent
    - Maintain existing semantic colors (success, warning, danger, info)
    - _Requirements: 2.3, 2.4_
  
  - [ ]* 2.2 Write property test for CSS variable validity
    - **Property 2: CSS Variable Validity**
    - **Validates: Requirements 2.4**
  
  - [ ] 2.3 Update App.jsx header with new logo and name
    - Import new logo asset
    - Update header title to "Ledger"
    - Update logo alt text
    - Add error handling for logo loading failures
    - _Requirements: 1.4, 2.1, 2.5_
  
  - [ ] 2.4 Update index.html with new branding
    - Update page title to "Ledger"
    - Update meta description
    - Add favicon links (ICO, PNG variants, apple-touch-icon)
    - _Requirements: 1.4, 3.2_
  
  - [ ] 2.5 Update frontend package.json
    - Change name to "ledger-frontend"
    - Update description
    - Increment version to 5.9.0
    - _Requirements: 3.1, 6.1_

- [ ] 3. Update backend configuration
  - [ ] 3.1 Update backend package.json
    - Change name to "ledger"
    - Update description to "Full-stack Ledger Application"
    - Increment version to 5.9.0
    - _Requirements: 3.1, 6.1_
  
  - [ ] 3.2 Update version endpoint in server.js
    - Update name field to "Ledger"
    - Add previousName field for backward compatibility
    - Update docker.image field to new registry path
    - _Requirements: 1.4, 7.3_
  
  - [ ]* 3.3 Write property test for API endpoint preservation
    - **Property 4: API Endpoint Preservation**
    - **Validates: Requirements 7.3**

- [ ] 4. Update Docker configuration and deployment
  - [ ] 4.1 Update docker-compose.yml
    - Change service name to "ledger"
    - Update image name to "ghcr.io/krazykrazz/ledger:latest"
    - Update container_name to "ledger"
    - Update volume names to "ledger-data" and "ledger-config"
    - _Requirements: 4.1, 4.2, 9.3, 9.4_
  
  - [ ] 4.2 Update docker-compose.ghcr.yml
    - Apply same changes as docker-compose.yml
    - Ensure consistency across all compose files
    - _Requirements: 4.1, 4.2_
  
  - [ ] 4.3 Update Dockerfile
    - Update LABEL maintainer and description
    - Update any comments referencing application name
    - _Requirements: 3.5, 5.4_
  
  - [ ] 4.4 Update build-and-push.ps1 script
    - Change $ImageName to "ghcr.io/krazykrazz/ledger"
    - Update all image tag references
    - Update script comments and output messages
    - _Requirements: 4.3, 4.5_
  
  - [ ] 4.5 Update deploy-to-production.ps1 script
    - Update output messages to reference "Ledger"
    - Update any variable names referencing the application
    - _Requirements: 4.3, 9.1_
  
  - [ ] 4.6 Update promote-feature.ps1 script
    - Update output messages and comments
    - _Requirements: 3.5, 5.4_

- [ ] 5. Checkpoint - Verify Docker builds successfully
  - Build Docker image with new name
  - Verify image tags correctly
  - Test container starts and runs
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Update documentation
  - [ ] 6.1 Update README.md
    - Change title to "# Ledger"
    - Update description and all references
    - Update Docker pull commands with new image name
    - Update Quick Start section
    - _Requirements: 5.1_
  
  - [ ] 6.2 Update CHANGELOG.md
    - Add new entry for v5.9.0 with rebrand details
    - Include migration notes for Docker users
    - Document backward compatibility approach
    - _Requirements: 5.3, 6.2_
  
  - [ ] 6.3 Update BackupSettings.jsx in-app changelog
    - Add changelog entry for v5.9.0
    - Include rebrand details with emoji
    - _Requirements: 6.3_
  
  - [ ] 6.4 Update all documentation files in docs/
    - Update docs/guides/DOCKER_DEPLOYMENT.md
    - Update docs/guides/USER_GUIDE.md
    - Update docs/guides/STARTUP_GUIDE.md
    - Update docs/deployment/*.md files
    - Update docs/features/*.md files
    - Update docs/development/*.md files
    - Search and replace "Expense Tracker" with "Ledger"
    - _Requirements: 5.2_
  
  - [ ]* 6.5 Write property test for documentation updates
    - **Property 3: Legacy Reference Elimination** (documentation subset)
    - **Validates: Requirements 5.2**

- [ ] 7. Create validation script
  - [ ] 7.1 Create scripts/validate-rebrand.js
    - Implement recursive file search
    - Define legacy patterns (Expense Tracker, expense-tracker, expense_tracker)
    - Define excluded paths (node_modules, .git, archive, CHANGELOG.md)
    - Report all legacy references found
    - Exit with error code if references found
    - _Requirements: 10.2_
  
  - [ ]* 7.2 Write property test for validation script correctness
    - **Property 5: Validation Script Correctness**
    - **Validates: Requirements 10.3**
  
  - [ ] 7.3 Run validation script and fix any issues
    - Execute node scripts/validate-rebrand.js
    - Review and fix any reported legacy references
    - Re-run until zero references found
    - _Requirements: 3.6, 10.3_

- [ ] 8. Update environment and configuration files
  - [ ] 8.1 Search for environment variable references
    - Check .env files (if any)
    - Check docker-compose environment sections
    - Update any variables referencing application name
    - _Requirements: 9.1_
  
  - [ ] 8.2 Update configuration file references
    - Check for config files with application name
    - Update any configuration file names if needed
    - _Requirements: 9.2_
  
  - [ ]* 8.3 Write property test for environment variable updates
    - **Property 3: Legacy Reference Elimination** (config subset)
    - **Validates: Requirements 9.1, 9.2**

- [ ] 9. Comprehensive testing and validation
  - [ ]* 9.1 Write property test for UI name consistency
    - **Property 1: UI Name Consistency**
    - **Validates: Requirements 1.4**
  
  - [ ]* 9.2 Write property test for legacy reference elimination
    - **Property 3: Legacy Reference Elimination** (complete)
    - **Validates: Requirements 3.3, 3.4, 3.5, 5.2, 5.4, 9.1, 9.2**
  
  - [ ] 9.3 Run all existing tests
    - Run frontend tests: `cd frontend && npm test`
    - Run backend tests: `cd backend && npm test`
    - Verify all tests pass with new branding
    - _Requirements: 10.1_
  
  - [ ] 9.4 Manual testing checklist
    - Verify logo displays in header
    - Verify favicon displays in browser tab
    - Verify all pages show "Ledger" consistently
    - Verify footer version displays correctly
    - Verify in-app changelog shows rebrand entry
    - Test Docker container with new name
    - Verify existing data loads correctly
    - _Requirements: 1.4, 2.1, 2.2, 6.4, 7.5_

- [ ] 10. Checkpoint - Final validation before deployment
  - Run validation script (should report zero references)
  - All tests passing
  - Docker image builds successfully
  - Manual testing complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Build and deploy
  - [ ] 11.1 Build frontend with new branding
    - Run `cd frontend && npm run build`
    - Verify build completes successfully
    - _Requirements: 6.1_
  
  - [ ] 11.2 Build Docker image with new name
    - Run `.\scripts\build-and-push.ps1`
    - Verify image builds with correct tags
    - _Requirements: 4.5, 10.4_
  
  - [ ] 11.3 Deploy to staging for testing
    - Run `.\scripts\build-and-push.ps1 -Environment staging`
    - Test staging deployment thoroughly
    - _Requirements: 10.5_
  
  - [ ] 11.4 Deploy to production
    - Run `.\scripts\build-and-push.ps1 -Environment latest`
    - Verify production deployment successful
    - Monitor for any issues
    - _Requirements: 10.5_

- [ ] 12. Post-deployment tasks
  - [ ] 12.1 Create migration guide for users
    - Document how to update docker-compose.yml
    - Provide migration script if needed
    - Add to documentation
    - _Requirements: 7.5_
  
  - [ ] 12.2 Update GitHub repository settings
    - Update repository description
    - Update repository topics/tags
    - Update README badges if any
    - _Requirements: 5.1_
  
  - [ ] 12.3 Maintain backward compatibility aliases
    - Keep old Docker image name as alias for 6 months
    - Add deprecation notice to old image
    - Document sunset timeline
    - _Requirements: 4.4, 7.5_

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- The rebrand is a MINOR version bump (5.8.1 → 5.9.0) as it adds new branding without breaking changes
- Backward compatibility is maintained through API endpoint preservation and Docker image aliases
- The validation script is critical for ensuring completeness - run it multiple times during implementation
- All existing data and configuration remain unchanged (no database migrations required)
- Docker volume names change, but data is preserved through volume mounts
- Consider creating a backup before deploying the rebrand to production
