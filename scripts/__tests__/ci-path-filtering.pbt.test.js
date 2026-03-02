/**
 * Property-Based Tests for CI Path-Based Test Filtering
 * 
 * These tests validate the correctness properties of the path filtering logic
 * using fast-check to generate test cases.
 */

const fc = require('fast-check');
const {
  evaluatePathFilter,
  shouldRunBackendTests,
  shouldRunFrontendTests,
  shouldWorkflowTrigger
} = require('../ci-path-filter-logic');

describe('Feature: ci-path-based-test-filtering', () => {
  describe('Property 1: Frontend-only changes skip backend tests', () => {
    test('backend tests are skipped for frontend-only changes', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1 }).map(s => `frontend/${s}`),
            { minLength: 1 }
          ),
          (changedFiles) => {
            const filterOutputs = evaluatePathFilter(changedFiles);
            const shouldRun = shouldRunBackendTests(filterOutputs);
            return shouldRun === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('frontend filter is true for frontend-only changes', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1 }).map(s => `frontend/${s}`),
            { minLength: 1 }
          ),
          (changedFiles) => {
            const filterOutputs = evaluatePathFilter(changedFiles);
            return filterOutputs.frontend === true && filterOutputs.backend === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Backend-only changes skip frontend tests', () => {
    test('frontend tests are skipped for backend-only changes', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1 }).map(s => `backend/${s}`),
            { minLength: 1 }
          ),
          (changedFiles) => {
            const filterOutputs = evaluatePathFilter(changedFiles);
            const shouldRun = shouldRunFrontendTests(filterOutputs);
            return shouldRun === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('backend filter is true for backend-only changes', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1 }).map(s => `backend/${s}`),
            { minLength: 1 }
          ),
          (changedFiles) => {
            const filterOutputs = evaluatePathFilter(changedFiles);
            return filterOutputs.backend === true && filterOutputs.frontend === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Path patterns correctly identify file categories', () => {
    test('backend files are correctly categorized', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => `backend/${s}`),
          (filePath) => {
            const filterOutputs = evaluatePathFilter([filePath]);
            return filterOutputs.backend === true && 
                   filterOutputs.frontend === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('frontend files are correctly categorized', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => `frontend/${s}`),
          (filePath) => {
            const filterOutputs = evaluatePathFilter([filePath]);
            return filterOutputs.frontend === true && 
                   filterOutputs.backend === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('scripts/ files are categorized as shared', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => `scripts/${s}`),
          (filePath) => {
            const filterOutputs = evaluatePathFilter([filePath]);
            return filterOutputs.shared === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Dockerfile is categorized as shared', () => {
      const filterOutputs = evaluatePathFilter(['Dockerfile']);
      expect(filterOutputs.shared).toBe(true);
    });

    test('docker-compose files are categorized as shared', () => {
      const testFiles = [
        'docker-compose.yml',
        'docker-compose.ghcr.yml',
        'docker-compose.preview.yml'
      ];
      
      testFiles.forEach(file => {
        const filterOutputs = evaluatePathFilter([file]);
        expect(filterOutputs.shared).toBe(true);
      });
    });

    test('workflow files are categorized as shared', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => `.github/workflows/${s}`),
          (filePath) => {
            const filterOutputs = evaluatePathFilter([filePath]);
            return filterOutputs.shared === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('root package files are categorized as shared', () => {
      const rootFiles = ['package.json', 'package-lock.json', '.dockerignore'];
      
      rootFiles.forEach(file => {
        const filterOutputs = evaluatePathFilter([file]);
        expect(filterOutputs.shared).toBe(true);
      });
    });
  });

  describe('Property 5: Shared infrastructure changes trigger all tests', () => {
    test('scripts/ changes trigger all tests', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1 }).map(s => `scripts/${s}`),
            { minLength: 1 }
          ),
          (changedFiles) => {
            const filterOutputs = evaluatePathFilter(changedFiles);
            const backendRuns = shouldRunBackendTests(filterOutputs);
            const frontendRuns = shouldRunFrontendTests(filterOutputs);
            return backendRuns === true && frontendRuns === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Dockerfile changes trigger all tests', () => {
      const filterOutputs = evaluatePathFilter(['Dockerfile']);
      expect(shouldRunBackendTests(filterOutputs)).toBe(true);
      expect(shouldRunFrontendTests(filterOutputs)).toBe(true);
    });

    test('docker-compose changes trigger all tests', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'docker-compose.yml',
            'docker-compose.ghcr.yml',
            'docker-compose.preview.yml'
          ),
          (file) => {
            const filterOutputs = evaluatePathFilter([file]);
            return shouldRunBackendTests(filterOutputs) === true &&
                   shouldRunFrontendTests(filterOutputs) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('workflow changes trigger all tests', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => `.github/workflows/${s}`),
          (file) => {
            const filterOutputs = evaluatePathFilter([file]);
            return shouldRunBackendTests(filterOutputs) === true &&
                   shouldRunFrontendTests(filterOutputs) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('root package file changes trigger all tests', () => {
      const rootFiles = ['package.json', 'package-lock.json', '.dockerignore'];
      
      rootFiles.forEach(file => {
        const filterOutputs = evaluatePathFilter([file]);
        expect(shouldRunBackendTests(filterOutputs)).toBe(true);
        expect(shouldRunFrontendTests(filterOutputs)).toBe(true);
      });
    });
  });

  describe('Property 6: Mixed backend and frontend changes trigger all tests', () => {
    test('mixed changes trigger all tests', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(
              fc.string({ minLength: 1 }).map(s => `backend/${s}`),
              { minLength: 1 }
            ),
            fc.array(
              fc.string({ minLength: 1 }).map(s => `frontend/${s}`),
              { minLength: 1 }
            )
          ),
          ([backendFiles, frontendFiles]) => {
            const changedFiles = [...backendFiles, ...frontendFiles];
            const filterOutputs = evaluatePathFilter(changedFiles);
            const backendRuns = shouldRunBackendTests(filterOutputs);
            const frontendRuns = shouldRunFrontendTests(filterOutputs);
            return backendRuns === true && frontendRuns === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('mixed changes with shared files trigger all tests', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(
              fc.string({ minLength: 1 }).map(s => `backend/${s}`),
              { minLength: 1 }
            ),
            fc.array(
              fc.string({ minLength: 1 }).map(s => `frontend/${s}`),
              { minLength: 1 }
            ),
            fc.constantFrom('Dockerfile', 'package.json', 'docker-compose.yml')
          ),
          ([backendFiles, frontendFiles, sharedFile]) => {
            const changedFiles = [...backendFiles, ...frontendFiles, sharedFile];
            const filterOutputs = evaluatePathFilter(changedFiles);
            return shouldRunBackendTests(filterOutputs) === true &&
                   shouldRunFrontendTests(filterOutputs) === true &&
                   filterOutputs.shared === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 11: Paths-ignore configuration is preserved', () => {
    test('documentation-only changes do not trigger workflow', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1 }).map(s => `docs/${s}`),
            { minLength: 1 }
          ),
          (changedFiles) => {
            const shouldTrigger = shouldWorkflowTrigger(changedFiles);
            return shouldTrigger === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('markdown-only changes do not trigger workflow', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1 }).map(s => `${s}.md`),
            { minLength: 1 }
          ),
          (changedFiles) => {
            const shouldTrigger = shouldWorkflowTrigger(changedFiles);
            return shouldTrigger === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('steering file changes do not trigger workflow', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1 }).map(s => `.kiro/steering/${s}`),
            { minLength: 1 }
          ),
          (changedFiles) => {
            const shouldTrigger = shouldWorkflowTrigger(changedFiles);
            return shouldTrigger === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('CHANGELOG.md changes do not trigger workflow', () => {
      const shouldTrigger = shouldWorkflowTrigger(['CHANGELOG.md']);
      expect(shouldTrigger).toBe(false);
    });

    test('mixed ignored files do not trigger workflow', () => {
      const ignoredFiles = [
        'docs/README.md',
        'CONTRIBUTING.md',
        '.kiro/steering/testing.md',
        'CHANGELOG.md'
      ];
      
      const shouldTrigger = shouldWorkflowTrigger(ignoredFiles);
      expect(shouldTrigger).toBe(false);
    });

    test('code changes with ignored files trigger workflow', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1 }).map(s => `backend/${s}`),
            fc.string({ minLength: 1 }).map(s => `docs/${s}`)
          ),
          ([codeFile, docFile]) => {
            const changedFiles = [codeFile, docFile];
            const shouldTrigger = shouldWorkflowTrigger(changedFiles);
            return shouldTrigger === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 12: Test file changes trigger relevant tests', () => {
    test('backend test file changes trigger backend tests', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('.test.js', '.pbt.test.js', '.integration.test.js')
            .chain(ext => 
              fc.string({ minLength: 1 }).map(s => `backend/${s}${ext}`)
            ),
          (testFile) => {
            const filterOutputs = evaluatePathFilter([testFile]);
            return shouldRunBackendTests(filterOutputs) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('frontend test file changes trigger frontend tests', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('.test.jsx', '.pbt.test.jsx', '.test.js')
            .chain(ext => 
              fc.string({ minLength: 1 }).map(s => `frontend/${s}${ext}`)
            ),
          (testFile) => {
            const filterOutputs = evaluatePathFilter([testFile]);
            return shouldRunFrontendTests(filterOutputs) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('backend test-only changes skip frontend tests', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom('.test.js', '.pbt.test.js')
              .chain(ext => 
                fc.string({ minLength: 1 }).map(s => `backend/${s}${ext}`)
              ),
            { minLength: 1 }
          ),
          (testFiles) => {
            const filterOutputs = evaluatePathFilter(testFiles);
            return shouldRunBackendTests(filterOutputs) === true &&
                   shouldRunFrontendTests(filterOutputs) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('frontend test-only changes skip backend tests', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom('.test.jsx', '.pbt.test.jsx')
              .chain(ext => 
                fc.string({ minLength: 1 }).map(s => `frontend/${s}${ext}`)
              ),
            { minLength: 1 }
          ),
          (testFiles) => {
            const filterOutputs = evaluatePathFilter(testFiles);
            return shouldRunFrontendTests(filterOutputs) === true &&
                   shouldRunBackendTests(filterOutputs) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 13: Workflow changes trigger all tests', () => {
    test('ci.yml changes trigger all tests', () => {
      const filterOutputs = evaluatePathFilter(['.github/workflows/ci.yml']);
      expect(shouldRunBackendTests(filterOutputs)).toBe(true);
      expect(shouldRunFrontendTests(filterOutputs)).toBe(true);
    });

    test('any workflow file changes trigger all tests', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => `.github/workflows/${s}.yml`),
          (workflowFile) => {
            const filterOutputs = evaluatePathFilter([workflowFile]);
            return shouldRunBackendTests(filterOutputs) === true &&
                   shouldRunFrontendTests(filterOutputs) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('workflow changes with other files trigger all tests', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1 }).map(s => `.github/workflows/${s}.yml`),
            fc.oneof(
              fc.string({ minLength: 1 }).map(s => `backend/${s}`),
              fc.string({ minLength: 1 }).map(s => `frontend/${s}`)
            )
          ),
          ([workflowFile, otherFile]) => {
            const changedFiles = [workflowFile, otherFile];
            const filterOutputs = evaluatePathFilter(changedFiles);
            return shouldRunBackendTests(filterOutputs) === true &&
                   shouldRunFrontendTests(filterOutputs) === true &&
                   filterOutputs.shared === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    test('empty file array returns all false', () => {
      const filterOutputs = evaluatePathFilter([]);
      expect(filterOutputs.backend).toBe(false);
      expect(filterOutputs.frontend).toBe(false);
      expect(filterOutputs.shared).toBe(false);
    });

    test('empty file array triggers workflow (fail-safe)', () => {
      const shouldTrigger = shouldWorkflowTrigger([]);
      expect(shouldTrigger).toBe(true);
    });

    test('invalid input throws TypeError', () => {
      expect(() => evaluatePathFilter(null)).toThrow(TypeError);
      expect(() => evaluatePathFilter('not-an-array')).toThrow(TypeError);
      expect(() => evaluatePathFilter(123)).toThrow(TypeError);
    });

    test('files not matching any pattern return all false', () => {
      const filterOutputs = evaluatePathFilter(['random-file.txt']);
      expect(filterOutputs.backend).toBe(false);
      expect(filterOutputs.frontend).toBe(false);
      expect(filterOutputs.shared).toBe(false);
    });

    test('non-ignored files trigger workflow', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1 }).map(s => `backend/${s}`),
            fc.string({ minLength: 1 }).map(s => `frontend/${s}`),
            fc.constantFrom('Dockerfile', 'package.json')
          ),
          (file) => {
            const shouldTrigger = shouldWorkflowTrigger([file]);
            return shouldTrigger === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
