const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  normalizeDescription,
  validateVersion,
  validateDate,
  formatDisplayDate,
  updateReleaseFiles,
} = require('../update-release-files');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempReleaseDir() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-files-'));
  writeJson(path.join(rootDir, 'backend', 'package.json'), { name: 'backend', version: '1.0.0' });
  writeJson(path.join(rootDir, 'frontend', 'package.json'), { name: 'frontend', version: '1.0.0' });
  writeJson(path.join(rootDir, 'backend', 'package-lock.json'), {
    name: 'backend',
    version: '1.0.0',
    packages: { '': { name: 'backend', version: '1.0.0' } },
  });
  writeJson(path.join(rootDir, 'frontend', 'package-lock.json'), {
    name: 'frontend',
    version: '1.0.0',
    packages: { '': { name: 'frontend', version: '1.0.0' } },
  });
  fs.writeFileSync(path.join(rootDir, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-01-01\n');
  fs.mkdirSync(path.join(rootDir, 'frontend', 'src', 'utils'), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'frontend', 'src', 'utils', 'changelog.js'),
    "const changelogEntries = [\n];\n\nexport { changelogEntries };"
  );
  const componentDir = path.join(rootDir, 'frontend', 'src', 'components', 'system');
  fs.mkdirSync(componentDir, { recursive: true });
  fs.writeFileSync(
    path.join(componentDir, 'BackupSettings.jsx'),
    '<div className="changelog">\n</div>'
  );
  fs.writeFileSync(
    path.join(componentDir, 'SystemModal.jsx'),
    '<div className="changelog">\n</div>\n'
  );
  return rootDir;
}

describe('update-release-files', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = createTempReleaseDir();
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('updates all release locations with safe text', () => {
    const changed = updateReleaseFiles({
      rootDir,
      version: '1.2.3',
      date: '2026-11-21',
      description: 'Fix <headers> &  protect "quotes" {braces}',
    });

    expect(changed).toHaveLength(8);

    const backend = JSON.parse(fs.readFileSync(path.join(rootDir, 'backend', 'package.json'), 'utf8'));
    const frontend = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend', 'package.json'), 'utf8'));
    expect(backend.version).toBe('1.2.3');
    expect(frontend.version).toBe('1.2.3');

    const backendLock = JSON.parse(fs.readFileSync(path.join(rootDir, 'backend', 'package-lock.json'), 'utf8'));
    expect(backendLock.version).toBe('1.2.3');
    expect(backendLock.packages[''].version).toBe('1.2.3');

    const changelog = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('## [1.2.3] - 2026-11-21');
    expect(changelog).toContain('Fix <headers> & protect "quotes"');

    const changelogModule = fs.readFileSync(
      path.join(rootDir, 'frontend', 'src', 'utils', 'changelog.js'),
      'utf8'
    );
    expect(changelogModule).toContain("version: '1.2.3'");
    expect(changelogModule).toContain('Fix <headers> & protect \\"quotes\\"');

    const backup = fs.readFileSync(
      path.join(rootDir, 'frontend', 'src', 'components', 'system', 'BackupSettings.jsx'),
      'utf8'
    );
    expect(backup).toContain('Fix &lt;headers&gt; &amp; protect &quot;quotes&quot; &#123;braces&#125;');

    const modal = fs.readFileSync(
      path.join(rootDir, 'frontend', 'src', 'components', 'system', 'SystemModal.jsx'),
      'utf8'
    );
    expect(modal).toContain('Fix &lt;headers&gt; &amp; protect &quot;quotes&quot; &#123;braces&#125;');
  });

  test('normalizes multiline descriptions', () => {
    expect(normalizeDescription('  Fix\n this \t release  ')).toBe('Fix this release');
  });

  test('rejects invalid versions and dates', () => {
    expect(() => validateVersion('1.2')).toThrow('Invalid semantic version');
    expect(() => validateDate('2026-02-30')).toThrow('Invalid ISO date');
  });

  test('formats an ISO date consistently', () => {
    expect(formatDisplayDate('2026-11-21')).toBe('November 21, 2026');
  });

  test('rejects a duplicate release version', () => {
    updateReleaseFiles({
      rootDir,
      version: '1.2.3',
      date: '2026-11-21',
      description: 'First release',
    });

    expect(() => updateReleaseFiles({
      rootDir,
      version: '1.2.3',
      date: '2026-11-22',
      description: 'Duplicate release',
    })).toThrow('already contains version');
  });
});
