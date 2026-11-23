const { send, buildPayload, ICON_URL, OK_RESPONSE } = require('./notifiarrProvider');
const packageJson = require('../package.json');

const API_KEY = '00000000-1111-2222-3333-444444444444';
const CHANNEL = '1234567890123456789';
const MESSAGE = {
  name: 'Expense Tracker: Bank Needs Login', title: 'CIBC', description: 'Use Reconnect.', color: 'E74C3C', ping: true,
  fields: [{ title: 'Error code', text: 'ITEM_LOGIN_REQUIRED', inline: true }]
};
const CREDENTIALS = { apiKey: API_KEY, channelId: CHANNEL, pingUserId: '' };

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const processed = reply(200, { details: { response: OK_RESPONSE } });

let originalFetch;
beforeEach(() => { originalFetch = global.fetch; global.fetch = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; });

describe('buildPayload', () => {
  test('keeps the channel ID a string (it exceeds Number.MAX_SAFE_INTEGER) and adds app icon and footer', () => {
    const payload = buildPayload(MESSAGE, { channelId: CHANNEL });

    expect(payload.discord.ids.channel).toBe(CHANNEL);
    expect(JSON.stringify(payload)).toContain(`"channel":"${CHANNEL}"`);
    expect(payload.discord.text).toMatchObject({ icon: ICON_URL, footer: `Expense Tracker v${packageJson.version}`, fields: MESSAGE.fields });
  });

  test('the message supplies the header line, subject and description; the event is empty unless asked for', () => {
    const payload = buildPayload(MESSAGE, { channelId: CHANNEL });

    expect(payload.notification).toEqual({ update: false, name: 'Expense Tracker: Bank Needs Login', event: '' });
    expect(payload.discord.text).toMatchObject({ title: 'CIBC', description: 'Use Reconnect.' });
    expect(buildPayload({ ...MESSAGE, title: undefined, description: undefined, name: undefined }, { channelId: CHANNEL, event: 'x' }))
      .toMatchObject({ notification: { name: 'Expense Tracker', event: 'x' }, discord: { text: { title: '', description: '' } } });
  });

  test('pings the user only for messages that ask for it', () => {
    const ping = (message) => buildPayload(message, { channelId: CHANNEL, pingUserId: '123456789012345678' }).discord.ping.pingUser;
    expect(ping(MESSAGE)).toBe('123456789012345678');
    expect(ping({ ...MESSAGE, ping: false })).toBe(0);
  });
});

describe('send', () => {
  test('posts to the API-key URL and succeeds only when Notifiarr says it processed the payload', async () => {
    global.fetch.mockResolvedValue(processed);

    await expect(send(CREDENTIALS, MESSAGE, { event: 'CIBC', update: true })).resolves.toEqual({ ok: true });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://notifiarr.com/api/v1/notification/passthrough/${API_KEY}`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body).notification.update).toBe(true);
  });

  test('HTTP 200 without the processed response is a failure', async () => {
    global.fetch.mockResolvedValue(reply(200, { details: { response: 'Channel not found' } }));
    expect(await send(CREDENTIALS, MESSAGE, { event: 'CIBC' })).toEqual({ ok: false, reason: 'HTTP 200: Channel not found' });
  });

  test('an error status reports the status and body', async () => {
    global.fetch.mockResolvedValue(reply(401, 'invalid api key'));
    expect(await send(CREDENTIALS, MESSAGE, { event: 'CIBC' })).toEqual({ ok: false, reason: 'HTTP 401: invalid api key' });
  });

  test('network errors and timeouts never throw, and the API key is never in the reason', async () => {
    global.fetch.mockRejectedValue(Object.assign(new Error(`connect ECONNREFUSED https://notifiarr.com/x/${API_KEY}`), { name: 'FetchError' }));
    const failed = await send(CREDENTIALS, MESSAGE, { event: 'CIBC' });
    expect(failed.ok).toBe(false);
    expect(failed.reason).not.toContain(API_KEY);

    global.fetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    expect(await send(CREDENTIALS, MESSAGE, { event: 'CIBC' })).toEqual({ ok: false, reason: 'Timed out after 5 s' });
  });
});
