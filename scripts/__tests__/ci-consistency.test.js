/**
 * Cross-file consistency tests for CI pipeline configuration.
 * These tests parse actual repository files to verify consistency
 * between the Dockerfile, CI workflow, rollback script, and documentation.
 *
 * Feature: ci-pipeline-hardening, Property 3: Health check timing respects Dockerfile start period
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Parse the Dockerfile HEALTHCHECK --start-period value in seconds.
 * Expects format like: --start-period=40s
 */
function parseDockerfileStartPeriod(dockerfileContent) {
  const match = dockerfileContent.match(/--start-period=(\d+)s/);
  if (!match) {
    throw new Error('Could not find HEALTHCHECK --start-period in Dockerfile');
  }
  return parseInt(match[1], 10);
}

/**
 * Parse the sleep value from the "Wait for container initialization" step in ci.yml.
 */
function parseCiWorkflowSleepValue(ciContent) {
  // Find the "Wait for container initialization" step and extract the sleep value
  const stepPattern = /Wait for container initialization[\s\S]*?sleep\s+(\d+)/;
  const match = ciContent.match(stepPattern);
  if (!match) {
    throw new Error('Could not find sleep value in "Wait for container initialization" step of ci.yml');
  }
  return parseInt(match[1], 10);
}

/**
 * Parse the sleep value from rollback.sh (the container startup wait).
 */
function parseRollbackSleepValue(rollbackContent) {
  // Find the sleep command used for container initialization wait
  const match = rollbackContent.match(/sleep\s+(\d+)/);
  if (!match) {
    throw new Error('Could not find sleep value in rollback.sh');
  }
  return parseInt(match[1], 10);
}

// ─── Property 3: Health check timing respects Dockerfile start period ───
// **Validates: Requirement 2.3**

describe('Property 3: Health check timing respects Dockerfile start period', () => {
  let dockerfileContent;
  let ciContent;
  let rollbackContent;

  beforeAll(() => {
    dockerfileContent = fs.readFileSync(path.join(ROOT_DIR, 'Dockerfile'), 'utf-8');
    ciContent = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml'), 'utf-8');
    rollbackContent = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'rollback.sh'), 'utf-8');
  });

  test('Dockerfile has a HEALTHCHECK with --start-period', () => {
    expect(dockerfileContent).toMatch(/HEALTHCHECK.*--start-period=\d+s/);
  });

  test('CI workflow sleep value is ≥ 75% of Dockerfile start period', () => {
    const startPeriod = parseDockerfileStartPeriod(dockerfileContent);
    const ciSleep = parseCiWorkflowSleepValue(ciContent);
    const minRequired = startPeriod * 0.75;

    expect(ciSleep).toBeGreaterThanOrEqual(minRequired);
  });

  test('Rollback script sleep value is ≥ 75% of Dockerfile start period', () => {
    const startPeriod = parseDockerfileStartPeriod(dockerfileContent);
    const rollbackSleep = parseRollbackSleepValue(rollbackContent);
    const minRequired = startPeriod * 0.75;

    expect(rollbackSleep).toBeGreaterThanOrEqual(minRequired);
  });

  test('both sleep values reference the Dockerfile start period in comments', () => {
    // CI workflow should have a comment about the Dockerfile HEALTHCHECK start-period
    expect(ciContent).toMatch(/HEALTHCHECK.*start-period|start-period.*HEALTHCHECK|start.period.*40s|75%.*start.period/i);

    // Rollback script should have a comment about the Dockerfile HEALTHCHECK start-period
    expect(rollbackContent).toMatch(/HEALTHCHECK.*start-period|start-period.*HEALTHCHECK|start.period.*40s|75%.*start.period/i);
  });
});

// ─── Property 4: Version location consistency across documents ───
// Feature: ci-pipeline-hardening, Property 4: Version location consistency across documents
// **Validates: Requirement 8.3**

/**
 * Parse version locations from the "Version Locations" section of versioning.md.
 * Expects numbered list items like: 1. `frontend/package.json` — description
 */
function parseVersioningLocations(content) {
  // Extract only the "Version Locations" section (between its header and the next ## header)
  const sectionMatch = content.match(/##\s+Version Locations[^\n]*\n([\s\S]*?)(?=\n##\s)/);
  if (!sectionMatch) {
    throw new Error('Could not find "Version Locations" section in versioning.md');
  }
  const section = sectionMatch[1];
  const locations = [];
  const pattern = /^\d+\.\s+`([^`]+)`/gm;
  let match;
  while ((match = pattern.exec(section)) !== null) {
    locations.push(match[1]);
  }
  return locations;
}

/**
 * Parse the version location count from pre-deployment.md.
 * Expects a header like: ## 3. Version Bump (All 7 Locations)
 */
function parsePreDeploymentCount(content) {
  const match = content.match(/All\s+(\d+)\s+Locations/i);
  if (!match) {
    throw new Error('Could not find "All N Locations" count in pre-deployment.md');
  }
  return parseInt(match[1], 10);
}

/**
 * Parse version locations listed in the Version Bump section of pre-deployment.md.
 * Expects numbered list items like: 1. `frontend/package.json` (description)
 */
function parsePreDeploymentLocations(content) {
  // Extract the Version Bump section (between the "Version Bump" header and the next ## header)
  const sectionMatch = content.match(/##\s+\d+\.\s+Version Bump[^\n]*\n([\s\S]*?)(?=\n##\s|\n$)/);
  if (!sectionMatch) {
    throw new Error('Could not find Version Bump section in pre-deployment.md');
  }
  const section = sectionMatch[1];
  const locations = [];
  const pattern = /^\d+\.\s+`([^`]+)`/gm;
  let match;
  while ((match = pattern.exec(section)) !== null) {
    locations.push(match[1]);
  }
  return locations;
}

describe('Property 4: Version location consistency across documents', () => {
  let versioningContent;
  let preDeploymentContent;

  beforeAll(() => {
    versioningContent = fs.readFileSync(
      path.join(ROOT_DIR, '.kiro', 'steering', 'versioning.md'),
      'utf-8'
    );
    preDeploymentContent = fs.readFileSync(
      path.join(ROOT_DIR, '.kiro', 'steering', 'pre-deployment.md'),
      'utf-8'
    );
  });

  test('versioning.md has version locations listed', () => {
    const locations = parseVersioningLocations(versioningContent);
    expect(locations.length).toBeGreaterThan(0);
  });

  test('pre-deployment.md count matches the number of locations in versioning.md', () => {
    const versioningLocations = parseVersioningLocations(versioningContent);
    const preDeploymentCount = parsePreDeploymentCount(preDeploymentContent);

    expect(preDeploymentCount).toBe(versioningLocations.length);
  });

  test('every location from versioning.md appears in pre-deployment.md', () => {
    const versioningLocations = parseVersioningLocations(versioningContent);
    const preDeploymentLocations = parsePreDeploymentLocations(preDeploymentContent);

    for (const location of versioningLocations) {
      expect(preDeploymentLocations).toContain(location);
    }
  });

  test('pre-deployment.md does not list extra locations not in versioning.md', () => {
    const versioningLocations = parseVersioningLocations(versioningContent);
    const preDeploymentLocations = parsePreDeploymentLocations(preDeploymentContent);

    for (const location of preDeploymentLocations) {
      expect(versioningLocations).toContain(location);
    }
  });
});

// ─── Property 5: CI documentation accuracy ───
// Feature: ci-pipeline-hardening, Property 5: CI documentation accuracy
// **Validates: Requirements 9.3, 10.3**

/**
 * Parse job keys and their display names from ci.yml using regex.
 * Looks for top-level keys under the `jobs:` block and their `name:` fields.
 * Returns an object mapping job keys to display names.
 */
function parseWorkflowJobs(ciContent) {
  const jobs = {};
  // Find the jobs: block and extract each job key + name
  const jobsMatch = ciContent.match(/^jobs:\s*\n([\s\S]+)/m);
  if (!jobsMatch) return jobs;

  const jobsBlock = jobsMatch[1];
  // Match top-level job keys (2-space indented, followed by colon)
  const jobKeyPattern = /^  (\S+):\s*$/gm;
  let match;
  const jobKeys = [];
  while ((match = jobKeyPattern.exec(jobsBlock)) !== null) {
    jobKeys.push({ key: match[1], index: match.index });
  }

  for (let i = 0; i < jobKeys.length; i++) {
    const start = jobKeys[i].index;
    const end = i + 1 < jobKeys.length ? jobKeys[i + 1].index : jobsBlock.length;
    const jobBlock = jobsBlock.substring(start, end);

    // Extract the name: field from this job block
    const nameMatch = jobBlock.match(/^\s+name:\s+(.+)$/m);
    const displayName = nameMatch
      ? nameMatch[1].replace(/\s*\$\{\{.*?\}\}/g, '').trim()
      : jobKeys[i].key;
    jobs[jobKeys[i].key] = displayName;
  }

  return jobs;
}

/**
 * Parse the `on:` trigger block from ci.yml using regex.
 * Returns an object with push and pull_request branch arrays and paths-ignore.
 */
function parseWorkflowTriggers(ciContent) {
  const triggers = {};

  // Extract the entire on: block (from "on:" to the next top-level key like "concurrency:" or "jobs:")
  const onBlockMatch = ciContent.match(/^on:\s*\n([\s\S]*?)(?=\n\w+:)/m);
  if (!onBlockMatch) return triggers;
  const onBlock = onBlockMatch[1];

  // Split the on: block into event sections by finding 2-space indented keys
  // e.g., "  push:", "  pull_request:", "  workflow_dispatch:"
  const eventPattern = /^  (\S+):\s*$/gm;
  const events = [];
  let match;
  while ((match = eventPattern.exec(onBlock)) !== null) {
    events.push({ name: match[1], index: match.index + match[0].length });
  }

  for (let i = 0; i < events.length; i++) {
    const start = events[i].index;
    const end = i + 1 < events.length ? events[i + 1].index - events[i + 1].name.length - 4 : onBlock.length;
    const eventBlock = onBlock.substring(start, end);
    const eventName = events[i].name;

    // Extract branches
    const branchesMatch = eventBlock.match(/branches:\s*\n((?:\s+-\s+.+\n?)+)/);
    if (branchesMatch) {
      triggers[eventName] = triggers[eventName] || {};
      triggers[eventName].branches = [];
      const branchLines = branchesMatch[1].match(/-\s+(\S+)/g);
      if (branchLines) {
        triggers[eventName].branches = branchLines.map(b => b.replace(/^-\s+/, ''));
      }
    }

    // Extract paths-ignore
    const pathsIgnoreMatch = eventBlock.match(/paths-ignore:\s*\n((?:\s+-\s+.+\n?)+)/);
    if (pathsIgnoreMatch) {
      triggers[eventName] = triggers[eventName] || {};
      triggers[eventName]['paths-ignore'] = [];
      const pathLines = pathsIgnoreMatch[1].match(/-\s+'([^']+)'/g);
      if (pathLines) {
        triggers[eventName]['paths-ignore'] = pathLines.map(p => p.replace(/^-\s+'/, '').replace(/'$/, ''));
      }
    }
  }

  return triggers;
}

/**
 * Extract job names described in the CI docs as implemented (not "Planned").
 * Parses the "### Jobs" section for #### headings, the "#### Deployment Health Check"
 * under the GHCR section, and the "### Dependency Vulnerability Scanning" section.
 *
 * Jobs with "Planned" in their heading or a "> **Status: Planned**" marker are excluded.
 *
 * Returns an array of display names for implemented jobs.
 */
function parseDocumentedJobs(docsContent) {
  const documentedJobs = [];

  // Collect sections marked as "Planned" (heading contains "— Planned" or has Status: Planned blockquote)
  const plannedNames = new Set();
  const plannedHeadingPattern = /^#{3,4}\s+(.+?)(?:\s*—\s*Planned|\s*-\s*Planned)\s*$/gm;
  let match;
  while ((match = plannedHeadingPattern.exec(docsContent)) !== null) {
    plannedNames.add(match[1].trim());
  }
  // Also match "> **Status: Planned**" after a heading
  const lines = docsContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^#{3,4}\s+(.+?)(?:\s*—\s*Planned|\s*-\s*Planned)?\s*$/);
    if (headingMatch) {
      // Check next few lines for Status: Planned
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].match(/>\s*\*\*Status:\s*Planned\*\*/)) {
          plannedNames.add(headingMatch[1].replace(/\s*—\s*Planned/, '').replace(/\s*-\s*Planned/, '').trim());
          break;
        }
        if (lines[j].match(/^#{1,4}\s/)) break; // hit another heading
      }
    }
  }

  // Extract jobs from the "### Jobs" section
  const jobsSectionMatch = docsContent.match(/^###\s+Jobs\s*\n([\s\S]*?)(?=\n###\s[^#]|\n##\s[^#]|$)/m);
  if (jobsSectionMatch) {
    const jobsSection = jobsSectionMatch[1];
    const subHeadingPattern = /^####\s+(.+)$/gm;
    while ((match = subHeadingPattern.exec(jobsSection)) !== null) {
      const rawName = match[1].trim();
      const cleanName = rawName.replace(/\s*\(Sharded\)/, '').trim();
      if (!plannedNames.has(rawName) && !plannedNames.has(cleanName)) {
        documentedJobs.push(cleanName);
      }
    }
  }

  // Check for Deployment Health Check under the GHCR section
  if (docsContent.match(/^####\s+Deployment Health Check\s*$/m)) {
    if (!documentedJobs.includes('Deployment Health Check')) {
      documentedJobs.push('Deployment Health Check');
    }
  }

  // Check for Security Audit in the Dependency Vulnerability Scanning section
  const depVulnMatch = docsContent.match(/^###\s+Dependency Vulnerability Scanning\s*\n([\s\S]*?)(?=\n###\s|$)/m);
  if (depVulnMatch) {
    const secContent = depVulnMatch[1];
    if (secContent.match(/security-audit/i) && !secContent.match(/Status:\s*Planned/i)) {
      if (!documentedJobs.includes('Security Audit')) {
        documentedJobs.push('Security Audit');
      }
    }
  }

  return documentedJobs;
}

describe('Property 5: CI documentation accuracy', () => {
  let docsContent;
  let ciContent;
  let workflowJobs;
  let workflowTriggers;

  beforeAll(() => {
    docsContent = fs.readFileSync(
      path.join(ROOT_DIR, 'docs', 'development', 'GITHUB_ACTIONS_CICD.md'),
      'utf-8'
    );
    ciContent = fs.readFileSync(
      path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml'),
      'utf-8'
    );
    workflowJobs = parseWorkflowJobs(ciContent);
    workflowTriggers = parseWorkflowTriggers(ciContent);
  });

  test('CI docs describe at least one implemented job', () => {
    const documentedJobs = parseDocumentedJobs(docsContent);
    expect(documentedJobs.length).toBeGreaterThan(0);
  });

  test('every documented implemented job exists in the workflow', () => {
    const documentedJobs = parseDocumentedJobs(docsContent);
    const workflowDisplayNames = Object.values(workflowJobs).map(n => n.toLowerCase());
    const workflowKeys = Object.keys(workflowJobs).map(k => k.toLowerCase());

    for (const docJob of documentedJobs) {
      const normalizedDoc = docJob.toLowerCase();
      const kebabDoc = normalizedDoc.replace(/\s+/g, '-');

      const matchesDisplayName = workflowDisplayNames.includes(normalizedDoc);
      const matchesJobKey = workflowKeys.includes(kebabDoc);

      expect({
        job: docJob,
        found: matchesDisplayName || matchesJobKey
      }).toEqual({
        job: docJob,
        found: true
      });
    }
  });

  test('CI docs do not describe Trivy scanning as implemented', () => {
    // Trivy is marked as "Planned" — verify it's not described as if it exists
    const trivySection = docsContent.match(/Trivy[\s\S]*?(?=\n###\s|\n##\s|$)/);
    if (trivySection) {
      expect(trivySection[0]).toMatch(/Planned|not yet exist|future/i);
    }
  });

  test('push trigger in docs matches actual workflow (main only)', () => {
    const triggersSection = docsContent.match(/###\s+Triggers[\s\S]*?(?=\n###\s[^#]|\n##\s[^#]|$)/);
    expect(triggersSection).not.toBeNull();

    // Verify the actual workflow push trigger is main only
    expect(workflowTriggers.push).toBeDefined();
    expect(workflowTriggers.push.branches).toEqual(['main']);

    // Verify docs don't claim feature/** is a push trigger
    const triggerText = triggersSection[0];
    const pushRowMatch = triggerText.match(/`push`[^\n]*\|[^\n]*\|/);
    if (pushRowMatch) {
      expect(pushRowMatch[0]).not.toMatch(/feature/);
    }
  });

  test('pull_request trigger in docs matches actual workflow (main only)', () => {
    expect(workflowTriggers.pull_request).toBeDefined();
    expect(workflowTriggers.pull_request.branches).toEqual(['main']);

    const triggersSection = docsContent.match(/###\s+Triggers[\s\S]*?(?=\n###\s[^#]|\n##\s[^#]|$)/);
    expect(triggersSection).not.toBeNull();
    expect(triggersSection[0]).toMatch(/pull_request/);
  });

  test('docs mention paths-ignore matching actual workflow configuration', () => {
    expect(workflowTriggers.push['paths-ignore']).toBeDefined();
    expect(workflowTriggers.push['paths-ignore'].length).toBeGreaterThan(0);

    // Docs should mention paths-ignore or documentation-only skip behavior
    expect(docsContent).toMatch(/paths-ignore|documentation-only/i);
  });

  test('docs clarify feature branches trigger CI via pull_request, not push', () => {
    expect(docsContent).toMatch(/feature.*pull_request|pull_request.*feature|feature.*not.*trigger.*push|feature.*do\s+not.*trigger/i);
  });
});
