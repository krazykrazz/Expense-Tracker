import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { AuthProvider, useAuthContext } from './AuthContext';

// Mock authApi
const mockGetAuthStatus = vi.fn();
const mockLogin = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockLogout = vi.fn();

vi.mock('../services/authApi', () => ({
  getAuthStatus: (...args) => mockGetAuthStatus(...args),
  login: (...args) => mockLogin(...args),
  refreshAccessToken: (...args) => mockRefreshAccessToken(...args),
  logout: (...args) => mockLogout(...args),
}));

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Open_Mode (no password required)
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: false, username: 'admin' });
  });

  afterEach(() => {
    cleanup();
  });

  // --- Provider / Hook contract ---

  it('useAuthContext throws when used outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuthContext())).toThrow(
      'useAuthContext must be used within an AuthProvider'
    );
    spy.mockRestore();
  });

  it('provides all expected context values', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(typeof result.current.isAuthenticated).toBe('boolean');
    expect(typeof result.current.isPasswordRequired).toBe('boolean');
    expect(typeof result.current.isLoading).toBe('boolean');
    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.getAccessToken).toBe('function');
    expect(typeof result.current.refreshToken).toBe('function');
  });

  // --- Initial state / Auth status check (Requirement 8.1) ---

  it('starts in loading state', () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it('calls getAuthStatus on mount', async () => {
    renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(mockGetAuthStatus).toHaveBeenCalledTimes(1));
  });

  it('sets isPasswordRequired=false in Open_Mode', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: false, username: 'admin' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPasswordRequired).toBe(false);
  });

  it('sets isPasswordRequired=true when Password_Gate active', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPasswordRequired).toBe(true);
  });

  it('defaults to Open_Mode when getAuthStatus fails', async () => {
    mockGetAuthStatus.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPasswordRequired).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  // --- isAuthenticated logic ---

  it('isAuthenticated=true in Open_Mode (no token needed)', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: false, username: 'admin' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('isAuthenticated=false when Password_Gate active and no token', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('isAuthenticated=true when Password_Gate active and token exists', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    mockLogin.mockResolvedValue({ accessToken: 'test-token' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login('password123');
    });

    expect(result.current.isAuthenticated).toBe(true);
  });

  // --- Login flow (Requirement 8.3) ---

  it('login stores access token and sets isAuthenticated', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    mockLogin.mockResolvedValue({ accessToken: 'my-jwt-token' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('mypassword');
    });

    expect(mockLogin).toHaveBeenCalledWith('mypassword');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.getAccessToken()).toBe('my-jwt-token');
  });

  it('login propagates errors on failure', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('wrong');
      })
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.getAccessToken()).toBeNull();
  });

  // --- Logout flow (Requirement 8.6) ---

  it('logout clears token and calls API', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    mockLogin.mockResolvedValue({ accessToken: 'token-to-clear' });
    mockLogout.mockResolvedValue({ message: 'Logged out' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('password');
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.getAccessToken()).toBeNull();
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('logout clears token even if API call fails', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    mockLogin.mockResolvedValue({ accessToken: 'token' });
    mockLogout.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('password');
    });

    await act(async () => {
      await result.current.logout();
    });

    // Token should still be cleared despite API failure
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.getAccessToken()).toBeNull();
  });

  // --- Token refresh (Requirement 8.5) ---

  it('refreshToken updates token on success and returns true', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    mockLogin.mockResolvedValue({ accessToken: 'old-token' });
    mockRefreshAccessToken.mockResolvedValue({ accessToken: 'new-token' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('password');
    });

    let refreshResult;
    await act(async () => {
      refreshResult = await result.current.refreshToken();
    });

    expect(refreshResult).toBe(true);
    expect(result.current.getAccessToken()).toBe('new-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('refreshToken clears token on failure and returns false', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    mockLogin.mockResolvedValue({ accessToken: 'old-token' });
    mockRefreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('password');
    });

    expect(result.current.isAuthenticated).toBe(true);

    let refreshResult;
    await act(async () => {
      refreshResult = await result.current.refreshToken();
    });

    expect(refreshResult).toBe(false);
    expect(result.current.getAccessToken()).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  // --- getAccessToken ---

  it('getAccessToken returns null when no token exists', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getAccessToken()).toBeNull();
  });

  it('getAccessToken returns current token after login', async () => {
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    mockLogin.mockResolvedValue({ accessToken: 'abc123' });

    const { result } = renderHook(() => useAuthContext(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('password');
    });

    expect(result.current.getAccessToken()).toBe('abc123');
  });
});
