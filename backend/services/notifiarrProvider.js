/**
 * Sends a notification through Notifiarr's Passthrough integration, which posts it to a Discord channel:
 * https://notifiarr.wiki/pages/integrations/passthrough/
 * The API key is part of the URL, so it is stripped from anything returned or logged.
 */
const packageJson = require('../package.json');

const ENDPOINT = 'https://notifiarr.com/api/v1/notification/passthrough/';
/** Discord can't render SVG, so this is a PNG rendered from favicon.svg; it appears once the file is on main. */
const ICON_URL = 'https://raw.githubusercontent.com/krazykrazz/Expense-Tracker/main/frontend/public/notification-icon.png';
const APP_NAME = 'Expense Tracker';
const OK_RESPONSE = 'Pass through payload processed.';
const TIMEOUT_MS = 5000;
/** Also keeps the key safe to put in a URL path. */
const API_KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
/** Discord IDs are 64-bit: they exceed Number.MAX_SAFE_INTEGER, so they stay strings (Notifiarr accepts them). */
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

/**
 * @param {{name?: string, title: string, description?: string, color: string, ping?: boolean,
 *   fields: Array<{title: string, text: string, inline: boolean}>}} message
 *   `name` is the header line next to the icon; `title` the bold subject; `description` a sentence under it
 * @param {{event?: string, update?: boolean, channelId: string, pingUserId?: string}} options
 *   `event` is only needed to edit a message later (`update`); it is shown after the name, so it is empty by default
 */
function buildPayload(message, { event = '', update = false, channelId, pingUserId }) {
  return {
    notification: { update, name: message.name || APP_NAME, event },
    discord: {
      color: message.color,
      ping: { pingUser: message.ping && pingUserId ? pingUserId : 0, pingRole: 0 },
      images: { thumbnail: '', image: '' },
      text: {
        title: message.title || '',
        icon: ICON_URL,
        content: '',
        description: message.description || '',
        fields: message.fields,
        footer: `${APP_NAME} v${packageJson.version}`
      },
      ids: { channel: channelId }
    }
  };
}

const withoutKey = (text, apiKey) => String(text).split(apiKey).join('•••');

/**
 * Never throws.
 * @param {{apiKey: string, channelId: string, pingUserId?: string}} credentials
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function send({ apiKey, channelId, pingUserId }, message, { event = '', update = false } = {}) {
  try {
    const response = await fetch(ENDPOINT + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
      body: JSON.stringify(buildPayload(message, { event, update, channelId, pingUserId })),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* plain text */ }
    // An HTTP 200 alone isn't enough: Notifiarr says whether it processed the payload
    if (response.ok && body?.details?.response === OK_RESPONSE) return { ok: true };
    const detail = body?.details?.response || body?.result || text.slice(0, 200);
    return { ok: false, reason: withoutKey(`HTTP ${response.status}: ${detail}`, apiKey) };
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? `Timed out after ${TIMEOUT_MS / 1000} s` : `${err.name}: ${err.message}`;
    return { ok: false, reason: withoutKey(reason, apiKey) };
  }
}

module.exports = { send, buildPayload, API_KEY_PATTERN, SNOWFLAKE_PATTERN, ICON_URL, OK_RESPONSE, TIMEOUT_MS };
