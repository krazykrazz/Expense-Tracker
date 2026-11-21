#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArguments(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !key.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument: ${key || ''}`);
    }
    values[key.slice(2)] = value;
  }
  return values;
}

function normalizeDescription(description) {
  const normalized = String(description || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    throw new Error('Release description is required');
  }
  return normalized;
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) {
    throw new Error(`Invalid semantic version: ${version || ''}`);
  }
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    throw new Error(`Invalid ISO date: ${date || ''}`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
}

function formatDisplayDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function updatePackageVersion(rootDir, relativePath, version) {
  const filePath = path.join(rootDir, relativePath);
  const packageJson = JSON.parse(readFile(filePath));
  packageJson.version = version;
  writeFile(filePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function updateLockfileVersion(rootDir, relativePath, version) {
  const filePath = path.join(rootDir, relativePath);
  const lockfile = JSON.parse(readFile(filePath));
  lockfile.version = version;
  if (lockfile.packages && lockfile.packages['']) {
    lockfile.packages[''].version = version;
  }
  writeFile(filePath, `${JSON.stringify(lockfile, null, 2)}\n`);
}

function updateChangelog(rootDir, version, date, description) {
  const filePath = path.join(rootDir, 'CHANGELOG.md');
  let content = readFile(filePath);
  if (content.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already contains version ${version}`);
  }
  if (!content.startsWith('# Changelog')) {
    throw new Error('CHANGELOG.md does not start with "# Changelog"');
  }
  const entry = `## [${version}] - ${date}\n\n### ${description}`;
  content = content.replace('# Changelog', `# Changelog\n\n${entry}`);
  writeFile(filePath, content);
}

function updateChangelogModule(rootDir, version, displayDate, description) {
  const filePath = path.join(rootDir, 'frontend', 'src', 'utils', 'changelog.js');
  let content = readFile(filePath);
  const marker = 'const changelogEntries = [';
  if (content.includes(`version: '${version}'`)) {
    throw new Error(`changelog.js already contains version ${version}`);
  }
  if (!content.includes(marker)) {
    throw new Error('changelog.js does not contain the changelogEntries declaration');
  }
  const entry = [
    '  {',
    `    version: '${version}',`,
    `    date: ${JSON.stringify(displayDate)},`,
    '    added: [],',
    `    changed: [${JSON.stringify(description)}],`,
    '    fixed: [],',
    '    removed: [],',
    '  },',
  ].join('\n');
  content = content.replace(marker, `${marker}\n${entry}`);
  writeFile(filePath, content);
}

function updateBackupSettings(rootDir, version, displayDate, description) {
  const filePath = path.join(rootDir, 'frontend', 'src', 'components', 'system', 'BackupSettings.jsx');
  let content = readFile(filePath);
  const marker = '<div className="changelog">';
  if (content.includes(`>v${version}<`)) {
    throw new Error(`BackupSettings.jsx already contains version ${version}`);
  }
  if (!content.includes(marker)) {
    throw new Error('BackupSettings.jsx does not contain the changelog marker');
  }
  const entry = [
    '              <div className="changelog-entry">',
    `                <div className="changelog-version">v${version}</div>`,
    `                <div className="changelog-date">${displayDate}</div>`,
    '                <ul className="changelog-items">',
    `                  <li>${escapeHtml(description)}</li>`,
    '                </ul>',
    '              </div>',
  ].join('\n');
  content = content.replace(marker, `${marker}\n${entry}`);
  writeFile(filePath, content);
}

function updateSystemModal(rootDir, version, displayDate, description) {
  const filePath = path.join(rootDir, 'frontend', 'src', 'components', 'system', 'SystemModal.jsx');
  let content = readFile(filePath);
  const marker = '<div className="changelog">';
  if (content.includes(`v${version}`)) {
    throw new Error(`SystemModal.jsx already contains version ${version}`);
  }
  if (!content.includes(marker)) {
    throw new Error('SystemModal.jsx does not contain the changelog marker');
  }
  const entry = [
    '            <div className="changelog-entry">',
    '              <div className="changelog-version">',
    `                v${version}`,
    `                {isCurrentVersion('v${version}') && <span className="current-version-badge">Current Version</span>}`,
    '              </div>',
    `              <div className="changelog-date">${displayDate}</div>`,
    '              <ul className="changelog-items">',
    `                <li>${escapeHtml(description)}</li>`,
    '              </ul>',
    '            </div>',
  ].join('\n');
  content = content.replace(marker, `${marker}\n${entry}`);
  writeFile(filePath, content);
}

function updateReleaseFiles({ rootDir, version, date, description }) {
  validateVersion(version);
  validateDate(date);
  const normalizedDescription = normalizeDescription(description);
  const displayDate = formatDisplayDate(date);

  updatePackageVersion(rootDir, 'backend/package.json', version);
  updatePackageVersion(rootDir, 'frontend/package.json', version);
  updateLockfileVersion(rootDir, 'backend/package-lock.json', version);
  updateLockfileVersion(rootDir, 'frontend/package-lock.json', version);
  updateChangelog(rootDir, version, date, normalizedDescription);
  updateChangelogModule(rootDir, version, displayDate, normalizedDescription);
  updateBackupSettings(rootDir, version, displayDate, normalizedDescription);
  updateSystemModal(rootDir, version, displayDate, normalizedDescription);

  return [
    'backend/package.json',
    'frontend/package.json',
    'backend/package-lock.json',
    'frontend/package-lock.json',
    'CHANGELOG.md',
    'frontend/src/utils/changelog.js',
    'frontend/src/components/system/BackupSettings.jsx',
    'frontend/src/components/system/SystemModal.jsx',
  ];
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const rootDir = path.resolve(args.root || path.resolve(__dirname, '..'));
  updateReleaseFiles({
    rootDir,
    version: args.version,
    date: args.date,
    description: args.description,
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  parseArguments,
  normalizeDescription,
  validateVersion,
  validateDate,
  formatDisplayDate,
  updateReleaseFiles,
};
