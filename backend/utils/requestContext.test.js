const { requestContextMiddleware, getTabId, runWithTabId } = require('./requestContext');

const runMiddleware = (headers, fn) => {
  const req = { headers };
  return new Promise((resolve, reject) => {
    requestContextMiddleware(req, {}, () => Promise.resolve().then(fn).then(resolve, reject));
  });
};

describe('requestContext', () => {
  test('exposes the X-Tab-ID header for the rest of the request, across awaits and timers', async () => {
    const seen = await runMiddleware({ 'x-tab-id': 'tab-1' }, async () => {
      const first = getTabId();
      await new Promise(resolve => setTimeout(resolve, 5));
      await new Promise(resolve => setImmediate(resolve));
      return [first, getTabId()];
    });

    expect(seen).toEqual(['tab-1', 'tab-1']);
  });

  test('keeps concurrent requests apart', async () => {
    const read = async (tabId, delay) => runMiddleware({ 'x-tab-id': tabId }, async () => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return getTabId();
    });

    const results = await Promise.all([read('a', 20), read('b', 1), read('c', 10)]);

    expect(results).toEqual(['a', 'b', 'c']);
  });

  test.each([
    ['no header', {}],
    ['an empty header', { 'x-tab-id': '' }],
    ['an array header', { 'x-tab-id': ['a', 'b'] }],
  ])('has no tab id for %s', async (_, headers) => {
    expect(await runMiddleware(headers, async () => getTabId())).toBeNull();
  });

  test('has no tab id outside a request', () => {
    expect(getTabId()).toBeNull();
  });

  test('runWithTabId scopes a tab id to the callback only', async () => {
    const inside = await runWithTabId('tab-9', async () => getTabId());

    expect(inside).toBe('tab-9');
    expect(getTabId()).toBeNull();
  });
});
