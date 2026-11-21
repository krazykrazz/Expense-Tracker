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

  test('caps exponential retry delay at max_wait', () => {
    const binDir = path.join(tmpDir, 'bin');
    fs.mkdirSync(binDir);
    const sleepLog = path.join(tmpDir, 'sleep.log').replace(/\\/g, '/');
    fs.writeFileSync(path.join(binDir, 'curl'), '#!/bin/sh\necho 500\n', { mode: 0o755 });
    fs.writeFileSync(path.join(binDir, 'sleep'), '#!/bin/sh\necho "$1" >> "$SLEEP_LOG"\n', { mode: 0o755 });

    // Prepend the mock bin dir from inside bash so Git Bash on Windows gets a POSIX path.
    const result = spawnSync(
      bash,
      [
        '-c',
        'BIN="$(cygpath -u "$1" 2>/dev/null || echo "$1")"; PATH="$BIN:$PATH" exec bash "$2" http://localhost/test 4 100 30 7',
        '_',
        binDir,
        SCRIPT.replace(/\\/g, '/'),
      ],
      { encoding: 'utf-8', env: { ...process.env, SLEEP_LOG: sleepLog } }
    );

    expect(result.status).toBe(1);
    expect(fs.readFileSync(sleepLog, 'utf8').trim().split(/\r?\n/)).toEqual(['7', '7', '7']);
  });
});
