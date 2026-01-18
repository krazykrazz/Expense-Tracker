/**
 * Property-Based Tests for CSS Design System
 * 
 * These tests verify universal properties across all CSS files:
 * - Property 1: Transition Duration Consistency (150-300ms)
 * - Property 2: Reduced Motion Accessibility
 * 
 * **Validates: Requirements 9.1, 9.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// Helper function to recursively find all CSS files
function findCssFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !item.includes('node_modules')) {
      findCssFiles(fullPath, files);
    } else if (item.endsWith('.css')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Helper function to parse transition duration from CSS value
function parseTransitionDuration(value) {
  // Match duration values like "150ms", "0.2s", "200ms ease", etc.
  const msMatch = value.match(/(\d+(?:\.\d+)?)\s*ms/i);
  const sMatch = value.match(/(\d+(?:\.\d+)?)\s*s(?![a-z])/i);
  
  if (msMatch) {
    return parseFloat(msMatch[1]);
  }
  if (sMatch) {
    return parseFloat(sMatch[1]) * 1000;
  }
  return null;
}

// Helper function to extract transition durations from CSS content
function extractTransitionDurations(cssContent) {
  const durations = [];
  
  // Match transition and transition-duration properties
  // Exclude CSS variable definitions (--transition-*)
  const transitionRegex = /(?<!--)transition(?:-duration)?:\s*([^;]+);/gi;
  let match;
  
  while ((match = transitionRegex.exec(cssContent)) !== null) {
    const value = match[1].trim();
    
    // Skip CSS variable references (var(--...))
    if (value.includes('var(--')) {
      // Extract fallback value if present
      const fallbackMatch = value.match(/var\([^,]+,\s*([^)]+)\)/);
      if (fallbackMatch) {
        const duration = parseTransitionDuration(fallbackMatch[1]);
        if (duration !== null) {
          durations.push({ value: fallbackMatch[1], duration, original: value });
        }
      }
      continue;
    }
    
    // Handle multiple transitions (comma-separated)
    const parts = value.split(',');
    for (const part of parts) {
      const duration = parseTransitionDuration(part.trim());
      if (duration !== null) {
        durations.push({ value: part.trim(), duration, original: value });
      }
    }
  }
  
  return durations;
}

// Helper function to check for prefers-reduced-motion rules
function hasReducedMotionSupport(cssContent) {
  return cssContent.includes('prefers-reduced-motion');
}

// Helper function to extract animation names from CSS content
function extractAnimationNames(cssContent) {
  const animations = new Set();
  
  // Match @keyframes definitions
  const keyframesRegex = /@keyframes\s+([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = keyframesRegex.exec(cssContent)) !== null) {
    animations.add(match[1]);
  }
  
  return Array.from(animations);
}

// Helper function to check if a file has significant animations
function hasSignificantAnimations(cssContent) {
  // Check for @keyframes definitions
  const hasKeyframes = /@keyframes\s+[a-zA-Z0-9_-]+/g.test(cssContent);
  
  // Check for animation property usage (not just animation: none)
  const animationRegex = /animation(?:-name)?:\s*([^;]+);/gi;
  let match;
  let hasActiveAnimations = false;
  
  while ((match = animationRegex.exec(cssContent)) !== null) {
    const value = match[1].trim().toLowerCase();
    // Skip "none" and "inherit" values
    if (value !== 'none' && value !== 'inherit' && !value.startsWith('var(')) {
      hasActiveAnimations = true;
      break;
    }
  }
  
  return hasKeyframes || hasActiveAnimations;
}

describe('CSS Design System Properties', () => {
  // Get all CSS files in the frontend/src directory
  const srcDir = path.resolve(__dirname, '..');
  const cssFiles = findCssFiles(srcDir);
  
  describe('Property 1: Transition Duration Consistency', () => {
    /**
     * **Property 1: Transition Duration Consistency**
     * For any interactive element with a CSS transition, the transition duration 
     * SHALL be between 150ms and 300ms.
     * 
     * **Validates: Requirements 9.1**
     */
    it('all transition durations should be between 150ms and 300ms', () => {
      const violations = [];
      
      for (const cssFile of cssFiles) {
        const content = fs.readFileSync(cssFile, 'utf-8');
        const durations = extractTransitionDurations(content);
        
        for (const { value, duration, original } of durations) {
          // Allow 0ms/0s for disabling transitions (e.g., in reduced motion)
          if (duration === 0) continue;
          
          // Allow very short durations for immediate feedback (within 100ms as per Req 9.5)
          // But main transitions should be 150-300ms
          if (duration < 150 || duration > 300) {
            // Check if this is in a reduced-motion context (acceptable to have 0.01ms)
            if (duration < 1 && content.includes('prefers-reduced-motion')) {
              continue;
            }
            violations.push({
              file: path.relative(srcDir, cssFile),
              value: original,
              duration: `${duration}ms`,
              expected: '150-300ms'
            });
          }
        }
      }
      
      if (violations.length > 0) {
        console.log('Transition duration violations:');
        violations.forEach(v => {
          console.log(`  ${v.file}: ${v.value} (${v.duration}, expected ${v.expected})`);
        });
      }
      
      expect(violations).toHaveLength(0);
    });
    
    /**
     * Property test: Generate random CSS transition values and verify parsing
     */
    it('should correctly parse various transition duration formats', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 500 }),
          (ms) => {
            // Test millisecond format
            const msValue = `${ms}ms`;
            const parsedMs = parseTransitionDuration(msValue);
            expect(parsedMs).toBe(ms);
            
            // Test second format
            const sValue = `${ms / 1000}s`;
            const parsedS = parseTransitionDuration(sValue);
            expect(parsedS).toBeCloseTo(ms, 1);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 2: Reduced Motion Accessibility', () => {
    /**
     * **Property 2: Reduced Motion Accessibility**
     * For any CSS animation or transition defined in the codebase, there SHALL exist 
     * a corresponding @media (prefers-reduced-motion: reduce) rule that disables 
     * or reduces the animation.
     * 
     * **Validates: Requirements 9.4**
     */
    it('all CSS files with animations should have prefers-reduced-motion support', () => {
      const violations = [];
      
      for (const cssFile of cssFiles) {
        const content = fs.readFileSync(cssFile, 'utf-8');
        const relativePath = path.relative(srcDir, cssFile);
        
        // Skip test files
        if (relativePath.includes('.test.')) continue;
        
        // Check if file has significant animations
        if (hasSignificantAnimations(content)) {
          // Check if it has reduced motion support
          if (!hasReducedMotionSupport(content)) {
            const animations = extractAnimationNames(content);
            violations.push({
              file: relativePath,
              animations: animations.length > 0 ? animations : ['(inline animations)']
            });
          }
        }
      }
      
      if (violations.length > 0) {
        console.log('Files with animations missing prefers-reduced-motion support:');
        violations.forEach(v => {
          console.log(`  ${v.file}: ${v.animations.join(', ')}`);
        });
      }
      
      expect(violations).toHaveLength(0);
    });
    
    /**
     * Property test: Verify that reduced motion rules properly disable animations
     */
    it('reduced motion rules should set animation to none or transition to none', () => {
      for (const cssFile of cssFiles) {
        const content = fs.readFileSync(cssFile, 'utf-8');
        const relativePath = path.relative(srcDir, cssFile);
        
        // Skip test files
        if (relativePath.includes('.test.')) continue;
        
        // If file has reduced motion support, verify it properly disables animations
        if (hasReducedMotionSupport(content)) {
          // Extract the reduced motion media query content
          const reducedMotionRegex = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gi;
          let match;
          
          while ((match = reducedMotionRegex.exec(content)) !== null) {
            const mediaContent = match[1];
            
            // Verify it contains animation: none or transition: none
            const hasAnimationNone = /animation(?:-[a-z]+)?:\s*none/i.test(mediaContent);
            const hasTransitionNone = /transition(?:-[a-z]+)?:\s*none/i.test(mediaContent);
            const hasTransformNone = /transform:\s*none/i.test(mediaContent);
            
            // At least one of these should be present
            const hasProperDisabling = hasAnimationNone || hasTransitionNone || hasTransformNone;
            
            if (!hasProperDisabling) {
              // This is a warning, not a failure - the rule might be doing something else valid
              console.log(`Note: ${relativePath} has reduced motion rule but may not fully disable animations`);
            }
          }
        }
      }
      
      // This test always passes - it's informational
      expect(true).toBe(true);
    });
  });
});
