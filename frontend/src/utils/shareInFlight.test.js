import { describe, it, expect, vi } from 'vitest';
import { shareInFlight } from './shareInFlight';

describe('shareInFlight', () => {
  it('shares one request between concurrent callers and gives each its own copy', async () => {
    const loader = vi.fn(() => Promise.resolve([{ id: 1 }]));
    const load = shareInFlight(loader);

    const [a, b] = await Promise.all([load(), load()]);
    a[0].id = 99;

    expect(loader).toHaveBeenCalledTimes(1);
    expect(b).toEqual([{ id: 1 }]);
  });

  it('fetches again once the previous request has settled, including after a failure', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    const load = shareInFlight(loader);

    await expect(load()).rejects.toThrow('boom');
    await expect(load()).resolves.toBe('ok');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
