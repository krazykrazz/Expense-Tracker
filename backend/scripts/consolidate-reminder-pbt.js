#!/usr/bin/env node
/**
 * Script to consolidate reminderService PBT test files
 * Task 6.1: Consolidate reminderService PBT files (8 → 3)
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '..', 'services');

// Read source files
const alertShowContent = fs.readFileSync(path.join(servicesDir, 'reminderService.alertShow.pbt.test.js'), 'utf8');
const alertSuppressionContent = fs.readFileSync(path.join(servicesDir, 'reminderService.alertSuppression.pbt.test.js'), 'utf8');
const backwardCompatContent = fs.readFileSync(path.join(servicesDir, 'reminderService.backwardCompatibility.pbt.test.js'), 'utf8');
const generalContent = fs.readFileSync(path.join(servicesDir, 'reminderService.pbt.test.js'), 'utf8');

const billingCycleContent = fs.readFileSync(path.join(servicesDir, 'reminderService.billingCycle.pbt.test.js'), 'utf8');
const loanPaymentContent = fs.readFileSync(path.join(servicesDir, 'reminderService.loanPayment.pbt.test.js'), 'utf8');
const insuranceClaimsContent = fs.readFileSync(path.join(servicesDir, 'reminderService.insuranceClaims.pbt.test.js'), 'utf8');
const autoGenContent = fs.readFileSync(path.join(servicesDir, 'reminderService.autoGenNotification.pbt.test.js'), 'utf8');

const isUserEnteredContent = fs.readFileSync(path.join(servicesDir, 'reminderService.isUserEntered.pbt.test.js'), 'utf8');

// Helper to extract everything after imports (helpers + describe blocks)
function extractTestContent(content) {
  const lines = content.split('\n');
  
  // Find where imports/requires end (look for first non-import/comment line)
  let contentStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip empty lines, comments, and require statements
    if (line === '' || line.startsWith('//') || line.startsWith('/*') || 
        line.startsWith('*') || line.startsWith('const') && line.includes('require(') ||
        line.includes('jest.mock(')) {
      continue;
    }
    // Found first real content line
    contentStart = i;
    break;
  }
  
  return lines.slice(contentStart).join('\n');
}

// Create consolidated files
console.log('Creating reminderService.alerts.pbt.test.js...');
const alertsHeader = `/**
 * Property-Based Tests for Reminder Service - Alert Logic
 * 
 * Consolidated from:
 * - reminderService.alertShow.pbt.test.js
 * - reminderService.alertSuppression.pbt.test.js
 * - reminderService.backwardCompatibility.pbt.test.js
 * - reminderService.pbt.test.js (general)
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 4.1, 4.2, 5.2, 5.3, 5.4, 5.6**
 */

const fc = require('fast-check');
const { pbtOptions, calculatePreviousCycleDates } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Helper functions (consolidated from source files)
`;

// Extract all test content (helpers + describe blocks) from each file
const alertsContent = alertsHeader + 
  extractTestContent(alertShowContent) + '\n\n' +
  extractTestContent(alertSuppressionContent) + '\n\n' +
  extractTestContent(backwardCompatContent) + '\n\n' +
  extractTestContent(generalContent);

fs.writeFileSync(path.join(servicesDir, 'reminderService.alerts.pbt.test.js'), alertsContent);

console.log('Creating reminderService.domains.pbt.test.js...');
const domainsHeader = `/**
 * Property-Based Tests for Reminder Service - Domain-Specific Reminders
 * 
 * Consolidated from:
 * - reminderService.billingCycle.pbt.test.js
 * - reminderService.loanPayment.pbt.test.js
 * - reminderService.insuranceClaims.pbt.test.js
 * - reminderService.autoGenNotification.pbt.test.js
 * 
 * **Validates: Requirements 1.3, 1.4, 2.1, 2.2, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.2, 5.3, 7.4, 7.5, 7.6**
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions, calculatePreviousCycleDates } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Mock activity log service
jest.mock('./activityLogService');

// Helper functions (consolidated from source files)
`;

const domainsContent = domainsHeader +
  extractTestContent(billingCycleContent) + '\n\n' +
  extractTestContent(loanPaymentContent) + '\n\n' +
  extractTestContent(insuranceClaimsContent) + '\n\n' +
  extractTestContent(autoGenContent);

fs.writeFileSync(path.join(servicesDir, 'reminderService.domains.pbt.test.js'), domainsContent);

console.log('Creating reminderService.classification.pbt.test.js...');
// isUserEntered file is already well-structured, just copy it with updated header
const classificationContent = isUserEnteredContent.replace(
  /\/\*\*[\s\S]*?\*\//,
  `/**
 * Property-Based Tests for Reminder Service - Record Classification
 * 
 * Consolidated from:
 * - reminderService.isUserEntered.pbt.test.js
 * 
 * Tests the is_user_entered flag logic for determining which billing cycle
 * records are authoritative for alert suppression.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */`
);

fs.writeFileSync(path.join(servicesDir, 'reminderService.classification.pbt.test.js'), classificationContent);

console.log('✓ Consolidation complete!');
console.log('Created:');
console.log('  - reminderService.alerts.pbt.test.js');
console.log('  - reminderService.domains.pbt.test.js');
console.log('  - reminderService.classification.pbt.test.js');
