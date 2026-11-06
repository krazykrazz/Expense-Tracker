const crypto = require('crypto');
const plaidConfig = require('../config/plaid');

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function requireKey(key, { create }) {
  const resolved = key || plaidConfig.getTokenKey({ create });
  if (!resolved || resolved.length !== 32) {
    throw Object.assign(
      new Error(process.env.PLAID_TOKEN_KEY
        ? 'PLAID_TOKEN_KEY must be a 32-byte key encoded as base64 or hex'
        : 'The Plaid encryption key file is missing, so stored bank secrets cannot be decrypted. Reconnect the bank.'),
      { statusCode: process.env.PLAID_TOKEN_KEY ? 503 : 500 }
    );
  }
  return resolved;
}

/**
 * Encrypt a secret (e.g. a Plaid access token) with AES-256-GCM.
 * @param {string} plaintext
 * @param {Buffer} [key] defaults to PLAID_TOKEN_KEY, else the generated key file (created if missing)
 * @returns {string} `v1:<iv>:<tag>:<ciphertext>` (base64 parts)
 */
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, requireKey(key, { create: true }), iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypt a value produced by encrypt(). Throws when the value was tampered with or the key is wrong.
 * @param {string} payload
 * @param {Buffer} [key] defaults to PLAID_TOKEN_KEY, else the generated key file (never created here)
 * @returns {string}
 */
function decrypt(payload, key) {
  const parts = typeof payload === 'string' ? payload.split(':') : [];
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unrecognized encrypted token format');
  }
  const [, iv, tag, ciphertext] = parts.map((part, i) => (i === 0 ? part : Buffer.from(part, 'base64')));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Unrecognized encrypted token format');
  }
  // authTagLength: a truncated tag must not authenticate
  const decipher = crypto.createDecipheriv(ALGORITHM, requireKey(key, { create: false }), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw Object.assign(
      new Error('Stored bank secret could not be decrypted (the Plaid encryption key changed). Reconnect the bank.'),
      { statusCode: 500 }
    );
  }
}

module.exports = { encrypt, decrypt };
