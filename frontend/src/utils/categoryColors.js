/**
 * Category pill colours. Hues are hand-picked so neighbouring categories stay
 * distinguishable; the pill CSS derives light/dark-theme shades from the hue.
 */
const CATEGORY_HUES = {
  Automotive: 220,
  Clothing: 330,
  'Dining Out': 24,
  Entertainment: 275,
  Gas: 4,
  Gifts: 348,
  Groceries: 145,
  Housing: 199,
  Insurance: 234,
  'Personal Care': 298,
  'Pet Care': 42,
  'Recreation Activities': 170,
  Subscriptions: 256,
  Utilities: 186,
  'Tax - Donation': 38,
  'Tax - Medical': 217,
};

const FALLBACK_HUES = [212, 160, 262, 28, 336, 188];

/**
 * @param {string} category
 * @returns {number|null} Hue (0-360) for the category, or null for a neutral pill
 */
export const getCategoryHue = (category) => {
  if (!category || category === 'Other') return null;
  if (category in CATEGORY_HUES) return CATEGORY_HUES[category];

  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0;
  }
  return FALLBACK_HUES[Math.abs(hash) % FALLBACK_HUES.length];
};
