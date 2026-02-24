/**
 * Property-Based Test: No rem units in migrated component CSS
 * Feature: ux-consistency, Property 5: No rem units in migrated component CSS
 *
 * For any CSS file in {CollapsibleSection.css, BudgetReminderBanner.css,
 * LoanPaymentReminderBanner.css, PeopleManagementModal.css, FinancialOverviewModal.css},
 * verify zero rem-based font-size values and zero hardcoded numeric font-weight values.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';

const CSS_FILES = [
  'CollapsibleSection.css',
  'BudgetReminderBanner.css',
  'LoanPaymentReminderBanner.css',
  'PeopleManagementModal.css',
  'FinancialOverviewModal.css'
];

const COMPONENTS_DIR = path.resolve(__dirname);

/**
 * Matches font-size declarations using rem units.
 * e.g., "font-size: 0.95rem", "font-size: 1.2rem"
 * Does NOT match values inside var() references.
 */
const REM_FONT_SIZE_REGEX = /font-size:\s*[\d.]+rem/g;

/**
 * Matches bare numeric font-weight declarations (500, 600, 700).
 * e.g., "font-weight: 600", "font-weight: 700"
 * Does NOT match values inside var() like "var(--font-semibold, 600)".
 */
const BARE_FONT_WEIGHT_REGEX = /font-weight:\s*(500|600|700)\s*[;}]/g;

describe('UX Consistency - No rem Units in Migrated CSS Property Tests', () => {
  /**
   * **Feature: ux-consistency, Property 5: No rem units in migrated component CSS**
   *
   * For any CSS file in {CollapsibleSection.css, BudgetReminderBanner.css,
   * LoanPaymentReminderBanner.css, PeopleManagementModal.css, FinancialOverviewModal.css},
   * verify zero rem-based font-size values and zero hardcoded numeric font-weight values.
   *
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7**
   */
  it('Property 5: No rem units in migrated component CSS', () => {
    const fileIndexArb = fc.integer({ min: 0, max: CSS_FILES.length - 1 });

    fc.assert(
      fc.property(
        fileIndexArb,
        (index) => {
          const fileName = CSS_FILES[index];
          const filePath = path.join(COMPONENTS_DIR, fileName);
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for rem-based font-size values
          const remMatches = content.match(REM_FONT_SIZE_REGEX) || [];
          expect(
            remMatches.length,
            `${fileName} should have zero rem-based font-size values, found: ${remMatches.join(', ')}`
          ).toBe(0);

          // Check for bare numeric font-weight values (500, 600, 700)
          // Filter out values inside var() fallbacks like "var(--font-semibold, 600)"
          const lines = content.split('\n');
          const bareWeightViolations = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip lines that contain var( — these are token references with fallbacks
            if (line.includes('var(')) continue;

            const weightMatches = line.match(/font-weight:\s*(500|600|700)/g);
            if (weightMatches) {
              bareWeightViolations.push(`Line ${i + 1}: ${line.trim()}`);
            }
          }

          expect(
            bareWeightViolations.length,
            `${fileName} should have zero hardcoded numeric font-weight values, found:\n${bareWeightViolations.join('\n')}`
          ).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});
