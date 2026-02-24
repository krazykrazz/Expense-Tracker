/**
 * @invariant Modal Width Token Adoption: For any modal container, max-width references a --modal-width-* design token.
 * Feature: ux-consistency, Property 6: Modal width token adoption
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';

// Modal CSS files and their expected container selectors
const MODAL_CSS_CONFIGS = [
  {
    name: 'PeopleManagementModal',
    file: 'PeopleManagementModal.css',
    containerSelector: '.people-modal-container'
  },
  {
    name: 'FinancialOverviewModal',
    file: 'FinancialOverviewModal.css',
    containerSelector: '.financial-modal-container'
  },
  {
    name: 'MerchantAnalyticsModal',
    file: 'MerchantAnalyticsModal.css',
    containerSelector: '.merchant-analytics-modal-container'
  },
  {
    name: 'CreditCardDetailView',
    file: 'CreditCardDetailView.css',
    containerSelector: '.cc-detail-modal-container'
  },
  {
    name: 'BudgetsModal',
    file: 'BudgetsModal.css',
    containerSelector: '.budgets-modal-container'
  },
  {
    name: 'AnalyticsHubModal',
    file: 'AnalyticsHubModal.css',
    containerSelector: '.analytics-hub-container'
  },
  {
    name: 'SystemModal',
    file: 'SystemModal.css',
    containerSelector: '.system-modal'
  }
];

// Read all CSS files once
const cssContents = MODAL_CSS_CONFIGS.map(config => ({
  ...config,
  content: fs.readFileSync(path.resolve(__dirname, config.file), 'utf-8')
}));

/**
 * Extract the max-width value from the primary container selector in a CSS file.
 * Finds the first occurrence of the selector and extracts max-width from that block.
 */
function extractContainerMaxWidth(cssContent, containerSelector) {
  // Escape the selector for regex
  const escapedSelector = containerSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Find the selector block - match the selector followed by its declaration block
  const selectorRegex = new RegExp(
    escapedSelector + '\\s*\\{([^}]*?)\\}',
    's'
  );
  const match = cssContent.match(selectorRegex);
  if (!match) return null;

  const block = match[1];
  const maxWidthMatch = block.match(/max-width\s*:\s*(.+?)(?:;|$)/m);
  if (!maxWidthMatch) return null;

  return maxWidthMatch[1].trim();
}

describe('UX Consistency - Modal Width Token Adoption', () => {
  /**
   * **Feature: ux-consistency, Property 6: Modal width token adoption**
   *
   * For any modal container in the set {PeopleManagementModal, FinancialOverviewModal,
   * MerchantAnalyticsModal, CreditCardDetailView, BudgetsModal, AnalyticsHubModal,
   * SystemModal}, verify `max-width` references a `--modal-width-*` token.
   *
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  it('Property 6: Modal width token adoption', () => {
    const configIndexArb = fc.integer({ min: 0, max: cssContents.length - 1 });

    fc.assert(
      fc.property(
        configIndexArb,
        (index) => {
          const config = cssContents[index];
          const maxWidth = extractContainerMaxWidth(config.content, config.containerSelector);

          expect(
            maxWidth,
            `${config.name} (${config.containerSelector}) should have a max-width declaration`
          ).toBeTruthy();

          // Verify it uses a --modal-width-* token
          const usesModalWidthToken = /var\(--modal-width-(sm|md|lg|xl)\)/.test(maxWidth);
          expect(
            usesModalWidthToken,
            `${config.name} max-width should use a --modal-width-* token, found: "${maxWidth}"`
          ).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
