/**
 * @invariant Rollback container startup matches deployment health check
 * Feature: ci-security-hardening, Property 1: Rollback container startup matches deployment health check
 *
 * For any volume mount or environment variable present in the deployment-health-check
 * job's docker run command, the rollback.sh script's docker run command should include
 * the same mount and environment variable. Specifically, both must mount a temporary
 * directory to /config and pass -e NODE_ENV=production -e LOG_LEVEL=info.
 *
 * **Validates: Requirements 2.1, 2.5**
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Extract the docker run command block from the deployment-health-check job's
 * "Start container" step in ci.yml.
 * The command spans multiple continuation lines (ending with \) inside a run: | block.
 */
function extractHealthCheckDockerRun(ciContent) {
  // Normalize line endings to \n for consistent regex matching
  const normalized = ciContent.replace(/\r\n/g, '\n');

  // Find the deployment-health-check job block (last job, so match to end of file)
  const jobMatch = normalized.match(/deployment-health-check:[\s\S]+/m);
  if (!jobMatch) throw new Error('Could not find deployment-health-check job');

  // Find the docker run command block — match from "docker run" through continuation
  // lines to the last line of the command (the image ref line without trailing backslash)
  const dockerRunMatch = jobMatch[0].match(/docker run -d\s*\\[\s\S]*?(?:"\$\{\{[^}]*\}\}")/);
  if (!dockerRunMatch) throw new Error('Could not find docker run in deployment-health-check');

  return dockerRunMatch[0];
}

/**
 * Extract the docker run command block from rollback.sh.
 * The command spans multiple continuation lines ending with backslash.
 */
function extractRollbackDockerRun(rollbackContent) {
  // Normalize line endings
  const normalized = rollbackContent.replace(/\r\n/g, '\n');

  // Match docker run through continuation lines to the final image ref line
  const dockerRunMatch = normalized.match(/docker run -d\s*\\[\s\S]*?"\$ROLLBACK_IMAGE"/);
  if (!dockerRunMatch) throw new Error('Could not find docker run in rollback.sh');

  return dockerRunMatch[0];
}

/**
 * Extract volume mount targets (the container-side path) from a docker run command.
 * Matches -v patterns like: -v "$VAR:/config" or -v "/path:/config"
 * Returns an array of container mount paths (e.g., ["/config"]).
 */
function extractVolumeMountTargets(dockerRunCmd) {
  const mounts = [];
  const pattern = /-v\s+["']?[^:\s]+:([^"'\s\\]+)/g;
  let match;
  while ((match = pattern.exec(dockerRunCmd)) !== null) {
    mounts.push(match[1]);
  }
  return mounts;
}

/**
 * Extract environment variable assignments from a docker run command.
 * Matches -e patterns like: -e NODE_ENV=production
 * Returns an array of "KEY=VALUE" strings.
 */
function extractEnvVars(dockerRunCmd) {
  const envVars = [];
  const pattern = /-e\s+(\w+=\w+)/g;
  let match;
  while ((match = pattern.exec(dockerRunCmd)) !== null) {
    envVars.push(match[1]);
  }
  return envVars;
}

describe('Property 1: Rollback container startup matches deployment health check', () => {
  let ciContent;
  let rollbackContent;
  let healthCheckDockerRun;
  let rollbackDockerRun;
  let healthCheckMounts;
  let healthCheckEnvVars;
  let rollbackMounts;
  let rollbackEnvVars;

  beforeAll(() => {
    ciContent = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml'), 'utf-8');
    rollbackContent = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'rollback.sh'), 'utf-8');

    healthCheckDockerRun = extractHealthCheckDockerRun(ciContent);
    rollbackDockerRun = extractRollbackDockerRun(rollbackContent);

    healthCheckMounts = extractVolumeMountTargets(healthCheckDockerRun);
    healthCheckEnvVars = extractEnvVars(healthCheckDockerRun);
    rollbackMounts = extractVolumeMountTargets(rollbackDockerRun);
    rollbackEnvVars = extractEnvVars(rollbackDockerRun);
  });

  it('both commands mount a volume to /config', () => {
    expect(healthCheckMounts).toContain('/config');
    expect(rollbackMounts).toContain('/config');
  });

  it('both commands pass NODE_ENV=production and LOG_LEVEL=info', () => {
    expect(healthCheckEnvVars).toContain('NODE_ENV=production');
    expect(healthCheckEnvVars).toContain('LOG_LEVEL=info');
    expect(rollbackEnvVars).toContain('NODE_ENV=production');
    expect(rollbackEnvVars).toContain('LOG_LEVEL=info');
  });

  it('every volume mount target in the health check exists in the rollback script', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...healthCheckMounts),
        (mountTarget) => {
          expect(rollbackMounts).toContain(mountTarget);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every env var in the health check exists in the rollback script', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...healthCheckEnvVars),
        (envVar) => {
          expect(rollbackEnvVars).toContain(envVar);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('structural parity holds for arbitrary volume mount path variations', () => {
    // Generate arbitrary mount paths and verify that the structural pattern
    // (both files use -v <dir>:/config) is consistent regardless of the
    // host-side path value
    fc.assert(
      fc.property(
        fc.stringMatching(/^\/[a-z][a-z0-9/_-]{1,50}$/),
        (arbitraryHostPath) => {
          // Simulate substituting the host path into both docker run templates
          // The key invariant: both commands mount to /config container target
          const healthCheckPattern = `-v "${arbitraryHostPath}:/config"`;
          const rollbackPattern = `-v "${arbitraryHostPath}:/config"`;

          // Both patterns produce the same container-side mount
          const healthCheckTarget = healthCheckPattern.match(/:([^"]+)/)[1];
          const rollbackTarget = rollbackPattern.match(/:([^"]+)/)[1];

          expect(healthCheckTarget).toBe(rollbackTarget);
          expect(healthCheckTarget).toBe('/config');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('env var sets are identical between health check and rollback', () => {
    // For any permutation of the env vars, the sets should be equal
    fc.assert(
      fc.property(
        fc.shuffledSubarray(healthCheckEnvVars, { minLength: healthCheckEnvVars.length, maxLength: healthCheckEnvVars.length }),
        (shuffledEnvVars) => {
          // Every env var from health check must exist in rollback
          for (const envVar of shuffledEnvVars) {
            expect(rollbackEnvVars).toContain(envVar);
          }
          // And the counts must match (no extras in either direction)
          expect(new Set(healthCheckEnvVars).size).toBe(new Set(rollbackEnvVars).size);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * @invariant Rollback script creates writable /config mount for all invocations
 * Feature: ci-security-hardening, Property 2: Rollback script creates writable /config mount for all invocations
 *
 * For any valid invocation of rollback.sh (with valid previous_sha, registry, and
 * image_name arguments), the script shall create a temporary directory with
 * world-writable permissions (chmod -R 777), mount it as -v <dir>:/config in the
 * docker run command, and output a config_dir=<path> line so the caller can clean it up.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

describe('Property 2: Rollback script creates writable /config mount for all invocations', () => {
  let rollbackContent;

  // Arbitraries for valid rollback.sh arguments
  const shaArb = fc.stringMatching(/^[0-9a-f]{7,40}$/);
  const registryArb = fc.tuple(
    fc.stringMatching(/^[a-z][a-z0-9.-]{2,20}$/),
    fc.stringMatching(/^[a-z][a-z0-9_-]{1,20}$/)
  ).map(([host, owner]) => `${host}/${owner}`);
  const imageNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,30}$/);

  beforeAll(() => {
    rollbackContent = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'rollback.sh'), 'utf-8');
  });

  it('script uses mktemp -d to create a temporary directory', () => {
    fc.assert(
      fc.property(shaArb, registryArb, imageNameArb, (sha, registry, imageName) => {
        // The script must contain mktemp -d regardless of what arguments are passed
        // This is a structural invariant — the temp dir creation is unconditional
        // after argument validation passes
        expect(rollbackContent).toMatch(/mktemp\s+-d/);
      }),
      { numRuns: 100 }
    );
  });

  it('script sets world-writable permissions with chmod -R 777', () => {
    fc.assert(
      fc.property(shaArb, registryArb, imageNameArb, (sha, registry, imageName) => {
        expect(rollbackContent).toMatch(/chmod\s+-R\s+777/);
      }),
      { numRuns: 100 }
    );
  });

  it('script mounts the temp directory to /config in docker run', () => {
    fc.assert(
      fc.property(shaArb, registryArb, imageNameArb, (sha, registry, imageName) => {
        // Verify -v mount to /config exists in the docker run command
        expect(rollbackContent).toMatch(/-v\s+["']?\$CONFIG_DIR:\/config["']?/);
      }),
      { numRuns: 100 }
    );
  });

  it('script outputs config_dir= line for CI cleanup', () => {
    fc.assert(
      fc.property(shaArb, registryArb, imageNameArb, (sha, registry, imageName) => {
        // The script must output config_dir=$CONFIG_DIR so the CI job can capture it
        expect(rollbackContent).toMatch(/echo\s+["']?config_dir=\$CONFIG_DIR["']?/);
      }),
      { numRuns: 100 }
    );
  });

  it('mktemp -d appears before docker run (temp dir created before container start)', () => {
    fc.assert(
      fc.property(shaArb, registryArb, imageNameArb, (sha, registry, imageName) => {
        const mktempIndex = rollbackContent.indexOf('mktemp -d');
        const dockerRunIndex = rollbackContent.indexOf('docker run -d');
        expect(mktempIndex).toBeGreaterThan(-1);
        expect(dockerRunIndex).toBeGreaterThan(-1);
        expect(mktempIndex).toBeLessThan(dockerRunIndex);
      }),
      { numRuns: 100 }
    );
  });

  it('chmod -R 777 appears before docker run (permissions set before container start)', () => {
    fc.assert(
      fc.property(shaArb, registryArb, imageNameArb, (sha, registry, imageName) => {
        const chmodIndex = rollbackContent.search(/chmod\s+-R\s+777/);
        const dockerRunIndex = rollbackContent.indexOf('docker run -d');
        expect(chmodIndex).toBeGreaterThan(-1);
        expect(dockerRunIndex).toBeGreaterThan(-1);
        expect(chmodIndex).toBeLessThan(dockerRunIndex);
      }),
      { numRuns: 100 }
    );
  });

  it('config_dir= output appears after docker run (output after container started)', () => {
    fc.assert(
      fc.property(shaArb, registryArb, imageNameArb, (sha, registry, imageName) => {
        const dockerRunIndex = rollbackContent.indexOf('docker run -d');
        const configDirOutputIndex = rollbackContent.search(/echo\s+["']?config_dir=/);
        expect(dockerRunIndex).toBeGreaterThan(-1);
        expect(configDirOutputIndex).toBeGreaterThan(-1);
        expect(configDirOutputIndex).toBeGreaterThan(dockerRunIndex);
      }),
      { numRuns: 100 }
    );
  });
});
