/**
 * Unit tests for the "Push Docker image to GHCR" step in .github/workflows/ci.yml.
 *
 * Release tags (vX.Y.Z) must keep pointing at the image built from the release commit:
 * every main build between releases still reports the last released version, so the step
 * may only create the version tag when it does not exist yet. The step's shell is run
 * against a fake `docker` to check what it pushes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CI_YML = path.join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml');

function extractPushScript() {
  const yml = fs.readFileSync(CI_YML, 'utf-8');
  const start = yml.indexOf('- name: Push Docker image to GHCR');
  expect(start).toBeGreaterThan(-1);
  const afterName = yml.slice(start);
  const runIndex = afterName.indexOf('run: |');
  const body = afterName.slice(runIndex + 'run: |'.length).split('\n');
  // The script is the block indented deeper than the "run:" key, up to the next step
  const lines = [];
  let indent = null;
  for (const line of body.slice(1)) {
    if (line.trim() === '') { lines.push(''); continue; }
    const lead = line.match(/^ */)[0].length;
    if (indent === null) indent = lead;
    if (lead < indent) break;
    lines.push(line.slice(indent));
  }
  return lines
    .join('\n')
    .replace(/\$\{\{\s*github\.repository_owner\s*\}\}/g, 'owner')
    .replace(/\$\{\{\s*steps\.meta\.outputs\.sha_short\s*\}\}/g, 'abc1234')
    .replace(/\$\{\{\s*steps\.meta\.outputs\.version\s*\}\}/g, '1.13.0');
}

function findBash() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe']
    : ['bash'];
  return candidates.find(candidate => {
    const probe = spawnSync(candidate, ['-c', 'echo ok'], { encoding: 'utf-8' });
    return probe.status === 0 && probe.stdout.trim() === 'ok';
  });
}

const FAKE_DOCKER = `#!/bin/sh
echo "$@" >> "$DOCKER_LOG"
if [ "$1" = "manifest" ] && [ "$2" = "inspect" ]; then
  case "$FAKE_MANIFEST" in
    exists) echo '{"schemaVersion": 2}'; exit 0 ;;
    missing) echo 'manifest unknown'; exit 1 ;;
    *) echo 'denied: permission_denied: read_package'; exit 1 ;;
  esac
fi
exit 0
`;

const bash = findBash();
const describeWithBash = bash ? describe : describe.skip;

describeWithBash('ci.yml: Push Docker image to GHCR', () => {
  let tmpDir;
  let script;

  beforeAll(() => {
    script = extractPushScript();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-push-'));
    fs.writeFileSync(path.join(tmpDir, 'docker'), FAKE_DOCKER, { mode: 0o755 });
  });

  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  function runStep(manifestState) {
    const log = path.join(tmpDir, `docker-${manifestState}.log`).replace(/\\/g, '/');
    fs.writeFileSync(log, '');
    const result = spawnSync(bash, ['-eo', 'pipefail', '-c', script], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${tmpDir}${path.delimiter}${process.env.PATH}`,
        DOCKER_LOG: log,
        FAKE_MANIFEST: manifestState,
      },
    });
    const calls = fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean);
    return { ...result, calls, pushes: calls.filter(c => c.startsWith('push ')) };
  }

  test('pushes the SHA tag and creates the version tag when it does not exist yet', () => {
    const result = runStep('missing');

    expect(result.status).toBe(0);
    expect(result.pushes).toEqual([
      'push ghcr.io/owner/expense-tracker:abc1234',
      'push ghcr.io/owner/expense-tracker:v1.13.0',
    ]);
  });

  test('never moves an existing version tag', () => {
    const result = runStep('exists');

    expect(result.status).toBe(0);
    expect(result.pushes).toEqual(['push ghcr.io/owner/expense-tracker:abc1234']);
    expect(result.stdout).toContain('already exists');
  });

  test('fails instead of pushing the version tag when GHCR cannot be checked', () => {
    const result = runStep('denied');

    expect(result.status).not.toBe(0);
    expect(result.pushes).toEqual(['push ghcr.io/owner/expense-tracker:abc1234']);
    expect(result.stdout + result.stderr).toContain('Could not check whether');
  });

  test('checks the version tag against the same repository it pushes to', () => {
    const result = runStep('missing');

    expect(result.calls).toContain('manifest inspect ghcr.io/owner/expense-tracker:v1.13.0');
  });
});

describe('ci.yml: version tag handling', () => {
  test('the workflow never pushes the version tag unconditionally', () => {
    const yml = fs.readFileSync(CI_YML, 'utf-8');

    expect(yml).not.toMatch(/docker push [^\n]*expense-tracker:v\$\{\{/);
  });
});
