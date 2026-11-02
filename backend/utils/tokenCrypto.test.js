const crypto = require('crypto');
const { encrypt, decrypt } = require('./tokenCrypto');
const { decodeTokenKey } = require('../config/plaid');

const key = crypto.randomBytes(32);

describe('tokenCrypto', () => {
  test('round-trips a token and never stores it in clear text', () => {
    const token = 'access-sandbox-1234-abcd';
    const encrypted = encrypt(token, key);

    expect(encrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(encrypted).not.toContain(token);
    expect(decrypt(encrypted, key)).toBe(token);
  });

  test('uses a fresh IV for every encryption', () => {
    expect(encrypt('same', key)).not.toBe(encrypt('same', key));
  });

  test('rejects tampered ciphertext', () => {
    const [version, iv, tag, ciphertext] = encrypt('secret-token', key).split(':');
    const flipped = Buffer.from(ciphertext, 'base64');
    flipped[0] ^= 0xff;
    const tampered = [version, iv, tag, flipped.toString('base64')].join(':');

    expect(() => decrypt(tampered, key)).toThrow(/could not be decrypted/);
  });

  test('rejects a different key', () => {
    expect(() => decrypt(encrypt('secret-token', key), crypto.randomBytes(32))).toThrow(/could not be decrypted/);
  });

  test.each([['garbage'], ['v2:a:b:c'], [null]])('rejects unrecognized payload %p', (payload) => {
    expect(() => decrypt(payload, key)).toThrow(/Unrecognized/);
  });

  test('refuses to encrypt with an invalid PLAID_TOKEN_KEY instead of falling back to the key file', () => {
    const previous = process.env.PLAID_TOKEN_KEY;
    process.env.PLAID_TOKEN_KEY = 'too-short';
    try {
      expect(() => encrypt('x')).toThrow(/32-byte key/);
    } finally {
      if (previous === undefined) delete process.env.PLAID_TOKEN_KEY;
      else process.env.PLAID_TOKEN_KEY = previous;
    }
  });
});

describe('decodeTokenKey', () => {
  test.each([
    ['base64', key.toString('base64'), true],
    ['hex', key.toString('hex'), true],
    ['too short', crypto.randomBytes(16).toString('base64'), false],
    ['empty', '', false],
    ['missing', undefined, false],
  ])('%s', (_label, raw, valid) => {
    const decoded = decodeTokenKey(raw);
    if (valid) {
      expect(decoded.equals(key)).toBe(true);
    } else {
      expect(decoded).toBeNull();
    }
  });
});
