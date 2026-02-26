import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getAuthStatus, login as apiLogin, refreshAccessToken, logout as apiLogout } from '../services/authApi';
import { createAuthFetch } from '../utils/authFetch';
import { setFetchFn, getNativeFetch } from '../utils/fetchProvider';

const AuthContext = createContext(null);

/**
 * AuthProvider - Manages authentication state and token lifecycle
 * 
 * On mount, calls getAuthStatus() to determine if Password_Gate is active.
 * Stores access token in React state (never localStorage).
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.5, 8.6
 */
export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Ref to always have current token available synchronously for getAccessToken
  const tokenRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  // On mount, check auth status and attempt silent refresh (Requirements 8.1, 8.4)
  useEffect(() => {
    let isMounted = true;
    const checkAuthStatus = async () => {
      try {
        const status = await getAuthStatus();
        if (!isMounted) return;
        setIsPasswordRequired(status.passwordRequired);

        // If Password_Gate is active, attempt silent refresh using the HTTP-only
        // refresh cookie. This lets users survive tab close/reopen without
        // re-entering their password (cookie has 7-day expiry).
        if (status.passwordRequired) {
          try {
            const result = await refreshAccessToken();
            if (isMounted) {
              setAccessToken(result.accessToken);
              tokenRef.current = result.accessToken;
            }
          } catch {
            // Refresh cookie absent or expired — user must log in again
          }
        }
      } catch {
        // If we can't reach the server, default to not requiring password
        if (isMounted) {
          setIsPasswordRequired(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    checkAuthStatus();
    return () => { isMounted = false; };
  }, []);

  // isAuthenticated: true in Open_Mode OR when Password_Gate active and token exists
  const isAuthenticated = useMemo(() => {
    if (!isPasswordRequired) return true;
    return !!accessToken;
  }, [isPasswordRequired, accessToken]);

  // Login: call API, store token in state (Requirement 8.3)
  const login = useCallback(async (password) => {
    const result = await apiLogin(password);
    setAccessToken(result.accessToken);
    tokenRef.current = result.accessToken;
  }, []);

  // enableAuth: atomically transition from Open_Mode → Password_Gate.
  // Sets isPasswordRequired=true AND stores the token in one batch so the
  // useEffect that wires authFetch fires before any subsequent API calls.
  // Without this, login() alone leaves isPasswordRequired=false and all
  // API calls go out without Bearer tokens → 401s everywhere.
  const enableAuth = useCallback(async (password) => {
    const result = await apiLogin(password);
    setIsPasswordRequired(true);
    setAccessToken(result.accessToken);
    tokenRef.current = result.accessToken;
  }, []);

  // Logout: clear token, call API (Requirement 8.6)
  const logout = useCallback(async () => {
    setAccessToken(null);
    tokenRef.current = null;
    try {
      await apiLogout();
    } catch {
      // Logout API failure is non-critical — token is already cleared
    }
  }, []);

  // disableAuth: atomically transition from Password_Gate → Open_Mode.
  // Sets isPasswordRequired=false FIRST so isAuthenticated stays true,
  // then clears the token and calls logout API. This prevents the flash
  // of login screen that occurs when logout() runs while isPasswordRequired
  // is still true.
  const disableAuth = useCallback(async () => {
    setIsPasswordRequired(false);
    setAccessToken(null);
    tokenRef.current = null;
    try {
      await apiLogout();
    } catch {
      // Non-critical — cookie cleanup is best-effort
    }
  }, []);

  // getAccessToken: return current token from ref (always current)
  const getAccessToken = useCallback(() => {
    return tokenRef.current;
  }, []);

  // refreshToken: attempt silent refresh, update state (Requirement 8.5)
  const refreshToken = useCallback(async () => {
    try {
      const result = await refreshAccessToken();
      setAccessToken(result.accessToken);
      tokenRef.current = result.accessToken;
      return true;
    } catch {
      setAccessToken(null);
      tokenRef.current = null;
      return false;
    }
  }, []);

  // Wire authFetch into the global fetch provider so apiClient, fetchWithTabId,
  // and all API services automatically attach Bearer tokens when Password_Gate
  // is active. In Open_Mode, revert to native fetch.
  useEffect(() => {
    if (isPasswordRequired) {
      const authFetch = createAuthFetch(
        () => tokenRef.current,
        async () => {
          try {
            const result = await refreshAccessToken();
            setAccessToken(result.accessToken);
            tokenRef.current = result.accessToken;
            return true;
          } catch {
            setAccessToken(null);
            tokenRef.current = null;
            return false;
          }
        },
        () => {
          // On auth failure (refresh failed), clear token to trigger login screen
          setAccessToken(null);
          tokenRef.current = null;
        }
      );
      setFetchFn(authFetch);
    } else {
      // Open_Mode — revert to native fetch
      setFetchFn(getNativeFetch());
    }
  }, [isPasswordRequired]);

  const value = useMemo(() => ({
    isAuthenticated,
    isPasswordRequired,
    isLoading,
    login,
    enableAuth,
    logout,
    disableAuth,
    getAccessToken,
    refreshToken,
  }), [isAuthenticated, isPasswordRequired, isLoading, login, enableAuth, logout, disableAuth, getAccessToken, refreshToken]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuthContext - Custom hook for consuming auth context
 */
export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
