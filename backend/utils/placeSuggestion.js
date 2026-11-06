/**
 * Suggest a tracker place for a bank description ("SOBEYS #4123", "Shell C21777 - Purchase",
 * "SHELL C21777 KANATA, ON"), best evidence first:
 *   1. learned: the place chosen before for a bank row with the same description key;
 *   2. an existing place whose words start the description (longest, then most used);
 *   3. none: the caller keeps the bank's text.
 */

// Wealthsimple appends the transaction kind: "Loblaws #1114 - Purchase", "Telus Mobility - Pre-authorized debit"
const KIND_SUFFIX = /\s+-\s+(purchase|refund|pre-authorized debit|bill payment|interac e-transfer\S*|e-transfer\S*|direct deposit|withdrawal|deposit)\s*$/i;
// CIBC/RBC style "NAME CITY, ON": drop the province; the city stays and is just extra trailing words
const PROVINCE_SUFFIX = /,\s*[a-z]{2}\s*$/i;
const MIN_PLACE_CHARS = 3;

/**
 * Words of a description or place with store numbers, kind/province suffixes and punctuation removed.
 * @param {string} text
 * @returns {string[]}
 */
function placeWords(text) {
  const cleaned = String(text || '')
    .toLowerCase()
    .replace(KIND_SUFFIX, '')
    .replace(PROVINCE_SUFFIX, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ');
  // Store numbers go ("SOBEYS #4123", "Shell C21777"); a leading number is part of the name ("7-Eleven",
  // "1202499 ONTARIO LTD" must not become "Ontario")
  return cleaned.split(' ').filter(Boolean).filter((word, i) => i === 0 || !/\d/.test(word));
}

/** Key for learned lookups: the cleaned words joined. */
const placeKey = (text) => placeWords(text).join(' ');

/**
 * @param {Array<{place: string, count: number, lastUsed?: string}>} places existing expense places
 */
function buildPlaceIndex(places) {
  return places
    .map(({ place, count, lastUsed }) => {
      const words = placeWords(place);
      return { place, count: count || 0, lastUsed: lastUsed || '', words, compact: words.join('') };
    })
    .filter(entry => entry.compact.length >= MIN_PLACE_CHARS);
}

/**
 * Best existing place for one description: the longest place whose letters, ignoring spaces, equal the
 * description's first words ("Sobeys" / "SOBEYS #4123", "Petro Canada" / "PETRO-CANADA 35212", "WalMart" /
 * "WAL MART"), ties broken by use count then recency.
 */
function closestPlace(description, index) {
  const words = placeWords(description);
  if (words.length === 0) return null;
  let best = null;
  for (const entry of index) {
    if (!startsAtWordBoundary(words, entry.compact)) continue;
    const score = entry.compact.length;
    if (!best || score > best.score || (score === best.score && (entry.count > best.entry.count
      || (entry.count === best.entry.count && entry.lastUsed > best.entry.lastUsed)))) {
      best = { score, entry };
    }
  }
  return best ? best.entry.place : null;
}

/** True when `compact` equals the first N words joined without spaces. */
function startsAtWordBoundary(words, compact) {
  let joined = '';
  for (const word of words) {
    joined += word;
    if (joined === compact) return true;
    if (joined.length >= compact.length) return false;
  }
  return false;
}

/**
 * placeKey(description) → place, from bank rows already turned into expenses. The place used most often for a
 * description wins, the most recent on a tie (rows come newest first).
 * @param {Array<{name: string, merchantName?: string|null, place: string}>} rows newest first
 * @returns {Map<string, string>}
 */
function buildLearnedPlaces(rows) {
  const tallies = new Map();
  rows.forEach((row, order) => {
    const keys = new Set([placeKey(row.merchantName), placeKey(row.name)].filter(Boolean));
    for (const key of keys) {
      const byPlace = tallies.get(key) || new Map();
      const tally = byPlace.get(row.place) || { count: 0, order };
      tally.count++;
      byPlace.set(row.place, tally);
      tallies.set(key, byPlace);
    }
  });
  const learned = new Map();
  for (const [key, byPlace] of tallies) {
    const [best] = [...byPlace].sort(([, a], [, b]) => b.count - a.count || a.order - b.order);
    learned.set(key, best[0]);
  }
  return learned;
}

/**
 * @param {string[]} descriptions bank texts for one transaction, most useful first (merchant name, raw name)
 * @param {Map<string, string>} learned placeKey(description) → place chosen before
 * @param {ReturnType<typeof buildPlaceIndex>} index
 * @returns {string|null}
 */
function suggestPlace(descriptions, learned, index) {
  const texts = descriptions.filter(Boolean);
  for (const text of texts) {
    const place = learned.get(placeKey(text));
    if (place) return place;
  }
  for (const text of texts) {
    const place = closestPlace(text, index);
    if (place) return place;
  }
  return null;
}

module.exports = { placeWords, placeKey, buildPlaceIndex, buildLearnedPlaces, closestPlace, suggestPlace };
