import { useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import logo from '../assets/tracker.png.png';
import './LoginScreen.css';

/**
 * LoginScreen - Displayed when Password_Gate is active and no valid token exists.
 * 
 * Requirements: 8.2, 8.7
 */
const LoginScreen = () => {
  const { login } = useAuthContext();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(password);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <img src={logo} alt="Expense Tracker Logo" className="login-logo" />
          <h1 className="login-title">Expense Tracker</h1>
          <p className="login-subtitle">Enter your password to continue</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="login-field">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
              placeholder="Password"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="login-button"
            aria-label="Log in"
            disabled={isLoading || !password}
          >
            {isLoading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
