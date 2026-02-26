import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Mock AuthContext
const mockLogin = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    login: mockLogin,
  }),
}));

// Mock logo asset
vi.mock('../assets/tracker.png.png', () => ({ default: 'mock-logo.png' }));

import LoginScreen from './LoginScreen';

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogin.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  // --- Rendering (Requirement 8.7) ---

  it('renders the login form with logo and title', () => {
    render(<LoginScreen />);

    expect(screen.getByAltText('Expense Tracker Logo')).toBeInTheDocument();
    expect(screen.getByText('Expense Tracker')).toBeInTheDocument();
    expect(screen.getByText('Enter your password to continue')).toBeInTheDocument();
  });

  // --- ARIA labels (Requirement 8.7) ---

  it('renders password input with aria-label="Password"', () => {
    render(<LoginScreen />);

    const input = screen.getByLabelText('Password');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders submit button with aria-label="Log in"', () => {
    render(<LoginScreen />);

    const button = screen.getByLabelText('Log in');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'submit');
  });

  // --- Form submission ---

  it('calls login with entered password on form submit', async () => {
    render(<LoginScreen />);

    const input = screen.getByLabelText('Password');
    const button = screen.getByLabelText('Log in');

    fireEvent.change(input, { target: { value: 'mypassword' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('mypassword');
    });
  });

  it('submit button is disabled when password is empty', () => {
    render(<LoginScreen />);

    const button = screen.getByLabelText('Log in');
    expect(button).toBeDisabled();
  });

  it('submit button is enabled when password is entered', () => {
    render(<LoginScreen />);

    const input = screen.getByLabelText('Password');
    fireEvent.change(input, { target: { value: 'test' } });

    const button = screen.getByLabelText('Log in');
    expect(button).not.toBeDisabled();
  });

  // --- Error display ---

  it('displays error message on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    render(<LoginScreen />);

    const input = screen.getByLabelText('Password');
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
  });

  it('clears error message on new submission', async () => {
    mockLogin
      .mockRejectedValueOnce(new Error('Invalid credentials'))
      .mockResolvedValueOnce(undefined);

    render(<LoginScreen />);

    const input = screen.getByLabelText('Password');

    // First attempt — fails
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Second attempt — succeeds, error should clear
    fireEvent.change(input, { target: { value: 'correct' } });
    fireEvent.click(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // --- Loading state ---

  it('shows loading text and disables input during login', async () => {
    // Make login hang to observe loading state
    let resolveLogin;
    mockLogin.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve; }));

    render(<LoginScreen />);

    const input = screen.getByLabelText('Password');
    fireEvent.change(input, { target: { value: 'password' } });
    fireEvent.click(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.getByText('Logging in...')).toBeInTheDocument();
    });

    expect(input).toBeDisabled();

    // Resolve to clean up
    resolveLogin();
  });

  it('re-enables input after login completes', async () => {
    mockLogin.mockResolvedValue(undefined);

    render(<LoginScreen />);

    const input = screen.getByLabelText('Password');
    fireEvent.change(input, { target: { value: 'password' } });
    fireEvent.click(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(input).not.toBeDisabled();
    });
  });

  // --- Error with no message ---

  it('displays fallback error when error has no message', async () => {
    mockLogin.mockRejectedValue(new Error());

    render(<LoginScreen />);

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test' } });
    fireEvent.click(screen.getByLabelText('Log in'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
  });
});
