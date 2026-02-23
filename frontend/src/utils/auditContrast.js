/**
 * Audit script for WCAG AA contrast compliance
 * Run this to check all text/background color combinations
 */

import { calculateContrastRatio, meetsWCAGAA } from './contrastUtils.js';

// Color palette from CSS variables
const colors = {
  // Blue-gray backgrounds
  'financial-bg-base': '#f8f9fa',
  'financial-bg-hover': '#f1f5f9',
  'financial-bg-alt': '#f0f4f8',
  'bg-card': '#ffffff',
  
  // Text colors
  'financial-text-primary': '#334155',
  'financial-text-secondary': '#475569', // Updated for WCAG AA compliance
  'text-primary': '#0f172a',
  'text-secondary': '#475569',
  'text-tertiary': '#64748b', // Updated from #94a3b8 for WCAG AA compliance
  
  // Border colors
  'financial-border': '#e2e8f0',
  'financial-border-strong': '#cbd5e1',
  
  // Button colors
  'financial-btn-primary-bg': '#047857', // Updated for WCAG AA compliance with white text
  'financial-btn-secondary-bg': '#f8fafc',
  'financial-btn-secondary-border': '#cbd5e1',
  'financial-btn-danger-text': '#dc2626', // Updated for WCAG AA compliance
};

// Text/background combinations to audit
const combinations = [
  // Primary text on backgrounds
  { text: 'financial-text-primary', bg: 'financial-bg-base', context: 'Primary text on base background' },
  { text: 'financial-text-primary', bg: 'financial-bg-hover', context: 'Primary text on hover background' },
  { text: 'financial-text-primary', bg: 'financial-bg-alt', context: 'Primary text on alt background' },
  { text: 'financial-text-primary', bg: 'bg-card', context: 'Primary text on white card' },
  
  // Secondary text on backgrounds
  { text: 'financial-text-secondary', bg: 'financial-bg-base', context: 'Secondary text on base background' },
  { text: 'financial-text-secondary', bg: 'financial-bg-hover', context: 'Secondary text on hover background' },
  { text: 'financial-text-secondary', bg: 'financial-bg-alt', context: 'Secondary text on alt background' },
  { text: 'financial-text-secondary', bg: 'bg-card', context: 'Secondary text on white card' },
  
  // Darker text colors on backgrounds
  { text: 'text-primary', bg: 'financial-bg-base', context: 'Darker primary text on base background' },
  { text: 'text-primary', bg: 'financial-bg-hover', context: 'Darker primary text on hover background' },
  { text: 'text-primary', bg: 'bg-card', context: 'Darker primary text on white card' },
  
  { text: 'text-secondary', bg: 'financial-bg-base', context: 'Darker secondary text on base background' },
  { text: 'text-secondary', bg: 'bg-card', context: 'Darker secondary text on white card' },
  
  { text: 'text-tertiary', bg: 'financial-bg-base', context: 'Tertiary text on base background' },
  { text: 'text-tertiary', bg: 'bg-card', context: 'Tertiary text on white card' },
  
  // Button text
  { text: '#ffffff', bg: 'financial-btn-primary-bg', context: 'White text on primary button' },
  { text: 'financial-text-primary', bg: 'financial-btn-secondary-bg', context: 'Primary text on secondary button' },
  { text: 'financial-btn-danger-text', bg: 'financial-btn-secondary-bg', context: 'Danger text on secondary button' },
];

console.log('='.repeat(80));
console.log('WCAG AA CONTRAST AUDIT');
console.log('Minimum ratio required: 4.5:1 for normal text');
console.log('='.repeat(80));
console.log('');

let passCount = 0;
let failCount = 0;
const failures = [];

combinations.forEach(({ text, bg, context }) => {
  const textColor = colors[text] || text;
  const bgColor = colors[bg] || bg;
  
  const ratio = calculateContrastRatio(textColor, bgColor);
  const passes = meetsWCAGAA(textColor, bgColor);
  
  if (passes) {
    passCount++;
    console.log(`✓ PASS: ${context}`);
    console.log(`  Text: ${textColor} | Background: ${bgColor} | Ratio: ${ratio.toFixed(2)}:1`);
  } else {
    failCount++;
    failures.push({ context, textColor, bgColor, ratio });
    console.log(`✗ FAIL: ${context}`);
    console.log(`  Text: ${textColor} | Background: ${bgColor} | Ratio: ${ratio.toFixed(2)}:1`);
  }
  console.log('');
});

console.log('='.repeat(80));
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
console.log('='.repeat(80));

if (failures.length > 0) {
  console.log('');
  console.log('FAILURES REQUIRING ATTENTION:');
  failures.forEach(({ context, textColor, bgColor, ratio }) => {
    console.log(`  - ${context}`);
    console.log(`    Text: ${textColor} | Background: ${bgColor} | Ratio: ${ratio.toFixed(2)}:1`);
    console.log(`    Needs improvement: ${(4.5 / ratio * 100).toFixed(0)}% darker text or lighter background`);
  });
}

export { combinations, colors };
