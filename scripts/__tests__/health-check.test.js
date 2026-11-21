const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'health-check.sh');

function findBash() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe']
    : ['bash'];
  return candidates.find(candidate => {
    const probe = spawnSync(candidate, ['-c', 'echo ok'], { encoding: 'utf-8' });
    return probe.status === 0 && probe.stdout.trim() === 'ok';
  });
}

const bash = findBash();
const describeWithBash = bash ? describe : describe.skip;

describeWithBash('health-check.sh', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-check-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('rejects retries outside the supported range', () => {
    const result = spawnSync(
      bash,
      [SCRIPT, 'http://localhost/test', '31', '3', '30', '60'],
      { encoding: 'utf-8' }
    );
    expect(result.status).toBe(2);
    expect(result.stdout + result.stderr).toContain('max_retries');
  });

  test('rejects an excessive timeout', () => {
    const result = spawnSync(
      bash,
      [SCRIPT, 'http://localhost/test', '10', '3', '301', '60'],
      { encoding: 'utf-8' }
    );
    expect(result.status).toBe(2);
    expect(result.stdout + result.stderr).toContain('timeout');
  });

  test('caps exponential retry delay and validates numeric bounds', () => {
    const content = fs.readFileSync(SCRIPT, 'utf8');
    expect(content).toMatch(/MAX_RETRIES" -gt 30/);
    expect(content).toMatch(/MAX_WAIT/);
    expect(content).toMatch(/WAIT_TIME" -gt "\$MAX_WAIT"/);
  });
});
