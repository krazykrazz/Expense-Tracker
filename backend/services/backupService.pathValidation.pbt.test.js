/**
 * Property-Based Tests for Backup Service Path Traversal Prevention
 *
 * @invariant Path traversal prevention: For any generated path string (including
 * strings containing "..", absolute paths, URL-encoded traversal sequences, and
 * symlink-like patterns), the backup targetPath validator correctly rejects paths
 * that resolve outside the allowed base configuration directory. Randomization
 * covers diverse traversal attack vectors that fixed examples would miss.
 *
 * Feature: auth-infrastructure, Property 7: Path traversal prevention
 * Validates: Requirements 10.1, 10.2
 */

const fc = require('fast-check');
const path = require('path');
const { pbtOptions } = require('../test/pbtArbitraries');
const backupService = require('./backupService');
const { getConfigDir } = require('../config/paths');

describe('BackupService - Path Traversal Prevention (Property 7)', () => {
  const configDir = getConfigDir();
  const resolvedBase = path.resolve(configDir);

  // Save and restore config between tests
  let originalConfig;
  beforeEach(() => {
    originalConfig = { ...backupService.config };
  });
  afterEach(() => {
    backupService.config = originalConfig;
  });

  /**
   * Property 7a: Paths within the config directory are accepted.
   * For any subdirectory name, a path under the config directory should be allowed.
   */
  test('Property 7a: Paths within config directory are accepted', () => {
    const safeSubdir = fc.array(
      fc.constantFrom('a','b','c','backups','data','test'),
      { minLength: 1, maxLength: 3 }
    ).map(parts => path.join(configDir, ...parts));

    fc.assert(
      fc.property(safeSubdir, (targetPath) => {
        // Should not throw for paths within the config directory
        expect(() => {
          backupService.updateConfig({ targetPath });
        }).not.toThrow();
      }),
      pbtOptions()
    );
  });

  /**
   * Property 7b: Paths with ".." that escape the config directory are rejected.
   * For any number of ".." segments prepended, if the resolved path escapes
   * the config directory, updateConfig should throw with status 400.
   */
  test('Property 7b: Dot-dot traversal paths outside config directory are rejected', () => {
    const traversalDepth = fc.integer({ min: 1, max: 10 });
    const suffix = fc.constantFrom('etc', 'passwd', 'windows', 'system32', 'tmp', 'root');

    fc.assert(
      fc.property(traversalDepth, suffix, (depth, sfx) => {
        const segments = Array(depth).fill('..');
        const targetPath = path.join(configDir, ...segments, sfx);
        const resolved = path.resolve(targetPath);

        // Only test paths that actually escape the config dir
        if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
          try {
            backupService.updateConfig({ targetPath });
            // Should not reach here
            return false;
          } catch (error) {
            expect(error.message).toBe('Target path must be within the configuration directory');
            expect(error.statusCode).toBe(400);
            return true;
          }
        }
        return true;
      }),
      pbtOptions()
    );
  });

  /**
   * Property 7c: Absolute paths outside the config directory are rejected.
   * For any absolute path that does not start with the config directory prefix,
   * updateConfig should throw.
   */
  test('Property 7c: Absolute paths outside config directory are rejected', () => {
    const absolutePath = fc.constantFrom(
      '/etc/passwd',
      '/tmp/evil',
      '/root/.ssh',
      'C:\\Windows\\System32',
      'C:\\Users\\attacker',
      '/var/log',
      '/home/user/.bashrc'
    );

    fc.assert(
      fc.property(absolutePath, (targetPath) => {
        const resolved = path.resolve(targetPath);
        if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
          try {
            backupService.updateConfig({ targetPath });
            return false;
          } catch (error) {
            expect(error.message).toBe('Target path must be within the configuration directory');
            expect(error.statusCode).toBe(400);
            return true;
          }
        }
        return true;
      }),
      pbtOptions()
    );
  });

  /**
   * Property 7d: URL-encoded and mixed traversal patterns are rejected.
   * For any combination of encoded traversal sequences, the validator
   * should still reject paths that resolve outside the allowed directory.
   */
  test('Property 7d: URL-encoded and mixed traversal patterns are rejected', () => {
    const encodedTraversal = fc.constantFrom(
      '..%2f..%2f..%2fetc%2fpasswd',
      '..%5c..%5c..%5cwindows',
      '%2e%2e/%2e%2e/etc',
      '....//....//etc',
      '..\\..\\..\\windows\\system32',
      '..//..//..//etc',
      '..%252f..%252f..%252fetc'
    );

    fc.assert(
      fc.property(encodedTraversal, (traversal) => {
        const targetPath = path.join(configDir, traversal);
        const resolved = path.resolve(targetPath);

        if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
          try {
            backupService.updateConfig({ targetPath });
            return false;
          } catch (error) {
            expect(error.message).toBe('Target path must be within the configuration directory');
            expect(error.statusCode).toBe(400);
            return true;
          }
        }
        return true;
      }),
      pbtOptions()
    );
  });

  /**
   * Property 7e: The validator is consistent with path.resolve.
   * For any arbitrary string used as targetPath, the validator accepts it
   * if and only if path.resolve(targetPath) starts with the config directory.
   */
  test('Property 7e: Validator is consistent with path.resolve', () => {
    const arbitraryPath = fc.oneof(
      // Random strings
      fc.string({ minLength: 1, maxLength: 50 }),
      // Paths with traversal
      fc.array(fc.constantFrom('..', '.', 'a', 'b', 'backups'), { minLength: 1, maxLength: 6 })
        .map(parts => path.join(configDir, ...parts)),
      // Absolute paths
      fc.constantFrom('/tmp', '/etc', 'C:\\Windows', configDir, path.join(configDir, 'backups'))
    );

    fc.assert(
      fc.property(arbitraryPath, (targetPath) => {
        const resolved = path.resolve(targetPath);
        const isWithinBase = resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase;

        if (isWithinBase) {
          // Should be accepted
          expect(() => {
            backupService.updateConfig({ targetPath });
          }).not.toThrow();
        } else {
          // Should be rejected
          try {
            backupService.updateConfig({ targetPath });
            return false;
          } catch (error) {
            expect(error.statusCode).toBe(400);
            return true;
          }
        }
        return true;
      }),
      pbtOptions()
    );
  });
});
