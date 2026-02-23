/**
 * Utility functions for calculating WCAG color contrast ratios
 */

/**
 * Convert hex color to RGB
 * @param {string} hex - Hex color string (e.g., "#334155" or "334155")
 * @returns {{r: number, g: number, b: number}}
 */
export function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Calculate relative luminance of a color
 * @param {{r: number, g: number, b: number}} rgb - RGB color object
 * @returns {number} Relative luminance (0-1)
 */
export function getRelativeLuminance(rgb) {
  const { r, g, b } = rgb;
  
  // Convert to sRGB
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;
  
  // Apply gamma correction
  const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
  
  // Calculate relative luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculate contrast ratio between two colors
 * @param {string} color1 - First color (hex)
 * @param {string} color2 - Second color (hex)
 * @returns {number} Contrast ratio (1-21)
 */
export function calculateContrastRatio(color1, color2) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);
  
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG AA standard (4.5:1 for normal text)
 * @param {string} textColor - Text color (hex)
 * @param {string} bgColor - Background color (hex)
 * @returns {boolean} True if meets WCAG AA standard
 */
export function meetsWCAGAA(textColor, bgColor) {
  const ratio = calculateContrastRatio(textColor, bgColor);
  return ratio >= 4.5;
}

/**
 * Check if contrast ratio meets WCAG AAA standard (7:1 for normal text)
 * @param {string} textColor - Text color (hex)
 * @param {string} bgColor - Background color (hex)
 * @returns {boolean} True if meets WCAG AAA standard
 */
export function meetsWCAGAAA(textColor, bgColor) {
  const ratio = calculateContrastRatio(textColor, bgColor);
  return ratio >= 7.0;
}
