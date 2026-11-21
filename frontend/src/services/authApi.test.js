import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS } from '../config';
import { logApiError } from '../utils/apiClient';
import {
  getAuthStatus,
  login,
  logout,
  refreshAccessToken,
  removePassword,
  setPassword
} from './authApi';

vi.mock('../utils/apiClient', () => ({
  logApiError: vi.fn()
}));

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body)
  };
}

describe('authApi', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gets the current auth status', async () => {
    const payload = { passwordRequired: true, username: 'admin' };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(getAuthStatus()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(API_ENDPOINTS.AUTH_STATUS);
  });

  it('logs in with a JSON body and credentials', async () => {
    const payload = { accessToken: 'access-token' };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(login('secret')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(API_ENDPOINTS.AUTH_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password: 'secret' })
    });
  });

  it.each([
    ['refreshes the access token', refreshAccessToken, API_ENDPOINTS.AUTH_REFRESH],
    ['logs out', logout, API_ENDPOINTS.AUTH_LOGOUT]
  ])('%s with the refresh cookie', async (_description, invoke, endpoint) => {
    const payload = endpoint === API_ENDPOINTS.AUTH_REFRESH
      ? { accessToken: 'new-token' }
      : { message: 'Logged out' };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(invoke()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(endpoint, {
      method: 'POST',
      credentials: 'include'
    });
  });

  it('sets a password with the current and new passwords', async () => {
    const payload = { message: 'Password updated' };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(setPassword('current', 'replacement')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(API_ENDPOINTS.AUTH_PASSWORD, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword: 'current', newPassword: 'replacement' })
    });
  });

  it('removes a password with the current password', async () => {
    const payload = { message: 'Password removed' };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(removePassword('current')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(API_ENDPOINTS.AUTH_PASSWORD, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword: 'current' })
    });
  });

  it.each([
    ['status', () => getAuthStatus(), 'fetching auth status'],
    ['login', () => login('secret'), 'login'],
    ['refresh', () => refreshAccessToken(), 'refreshing token'],
    ['logout', () => logout(), 'logout'],
    ['password update', () => setPassword(null, 'secret'), 'setting password'],
    ['password removal', () => removePassword('secret'), 'removing password']
  ])('preserves the server error and status for %s', async (_name, invoke, action) => {
    fetchMock.mockResolvedValue(jsonResponse(
      { error: 'Specific server error' },
      { ok: false, status: 422 }
    ));

    const promise = invoke();
    await expect(promise).rejects.toThrow('Specific server error');
    await expect(promise).rejects.toMatchObject({ status: 422 });
    expect(logApiError).toHaveBeenCalledWith(action, expect.objectContaining({ status: 422 }));
  });

  it('uses the documented fallback when an error response is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new SyntaxError('not json'))
    });

    await expect(getAuthStatus()).rejects.toThrow('Failed to get auth status');
    expect(logApiError).toHaveBeenCalledWith(
      'fetching auth status',
      expect.objectContaining({ status: 500 })
    );
  });

  it('logs and rethrows network errors unchanged', async () => {
    const networkError = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(networkError);

    await expect(refreshAccessToken()).rejects.toBe(networkError);
    expect(logApiError).toHaveBeenCalledWith('refreshing token', networkError);
  });
});
