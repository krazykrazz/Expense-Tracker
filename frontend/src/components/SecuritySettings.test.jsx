import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock AuthContext
const mockLogin = vi.fn();
const mockEnableAuth = vi.fn();
const mockLogout = vi.fn();
const mockDisableAuth = vi.fn();
const mockGetAccessToken = vi.fn(() => 'test-token');
let mockIsPasswordRequired = false;

vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    isPasswordRequired: mockIsPasswordRequired,
    login: mockLogin,
    enableAuth: mockEnableAuth,
    logout: mockLogout,
    disableAuth: mockDisableAuth,
    getAccessToken: mockGetAccessToken,
  }),
}));

// Mock authApi
const mockGetAuthStatus = vi.fn();
const mockSetPassword = vi.fn();
const mockRemovePassword = vi.fn();

vi.mock('../services/authApi', () => ({
  getAuthStatus: (...args) => mockGetAuthStatus(...args),
  setPassword: (...args) => mockSetPassword(...args),
  removePassword: (...args) => mockRemovePassword(...args),
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

import SecuritySettings from './SecuritySettings';

describe('SecuritySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPasswordRequired = false;
    mockGetAuthStatus.mockResolvedValue({ passwordRequired: false, username: 'admin' });
    mockSetPassword.mockResolvedValue({ message: 'ok' });
    mockRemovePassword.mockResolvedValue({ message: 'ok' });
    mockLogin.mockResolvedValue(undefined);
    mockEnableAuth.mockResolvedValue(undefined);
    mockLogout.mockResolvedValue(undefined);
    mockDisableAuth.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const waitForLoaded = async () => {
    await waitFor(() => {
      expect(screen.queryByText('Loading security settings...')).not.toBeInTheDocument();
    });
  };

  describe('Rendering', () => {
    it('should show loading state initially', () => {
      mockGetAuthStatus.mockReturnValue(new Promise(() => {}));
      render(<SecuritySettings />);
      expect(screen.getByText('Loading security settings...')).toBeInTheDocument();
    });

    it('should display username as read-only', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    it('should display auth toggle', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      expect(screen.getByLabelText('Enable authentication')).toBeInTheDocument();
    });

    it('should show toggle unchecked when Open_Mode', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      expect(screen.getByLabelText('Enable authentication')).not.toBeChecked();
    });

    it('should show toggle checked when Password_Gate active', async () => {
      mockIsPasswordRequired = true;
      mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
      render(<SecuritySettings />);
      await waitForLoaded();
      expect(screen.getByLabelText('Enable authentication')).toBeChecked();
    });

    it('should show error when auth status fetch fails', async () => {
      mockGetAuthStatus.mockRejectedValue(new Error('Network error'));
      render(<SecuritySettings />);
      await waitForLoaded();
      expect(screen.getByText('Failed to load security settings')).toBeInTheDocument();
    });
  });

  describe('Enable authentication (Open_Mode → Password_Gate)', () => {
    it('should show password form when toggle is checked', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      expect(screen.getByText('Set Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    });

    it('should validate empty password fields', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.click(screen.getByText('Enable Authentication'));
      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
    });

    it('should validate short password', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ab' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'ab' } });
      fireEvent.click(screen.getByText('Enable Authentication'));
      await waitFor(() => {
        expect(screen.getByText('Password must be at least 4 characters')).toBeInTheDocument();
      });
    });

    it('should validate password mismatch', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password2' } });
      fireEvent.click(screen.getByText('Enable Authentication'));
      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });

    it('should call setPassword and enableAuth on successful enable', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test1234' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'test1234' } });
      fireEvent.click(screen.getByText('Enable Authentication'));
      await waitFor(() => {
        expect(mockSetPassword).toHaveBeenCalledWith(null, 'test1234');
        expect(mockEnableAuth).toHaveBeenCalledWith('test1234');
      });
    });

    it('should show success message after enabling', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test1234' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'test1234' } });
      fireEvent.click(screen.getByText('Enable Authentication'));
      await waitFor(() => {
        expect(screen.getByText('Authentication enabled successfully')).toBeInTheDocument();
      });
    });

    it('should show error message on API failure', async () => {
      mockSetPassword.mockRejectedValue(new Error('Server error'));
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test1234' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'test1234' } });
      fireEvent.click(screen.getByText('Enable Authentication'));
      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });
  });

  describe('Disable authentication (Password_Gate → Open_Mode)', () => {
    beforeEach(() => {
      mockIsPasswordRequired = true;
      mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    });

    it('should show disable form when toggle is unchecked', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      const headings = screen.getAllByText('Disable Authentication');
      expect(headings.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
    });

    it('should require current password to disable', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      // Click the disable button (not the heading)
      const buttons = screen.getAllByText('Disable Authentication');
      const disableButton = buttons.find(el => el.tagName === 'BUTTON');
      fireEvent.click(disableButton);
      await waitFor(() => {
        expect(screen.getByText('Current password is required')).toBeInTheDocument();
      });
    });

    it('should call removePassword and disableAuth on successful disable', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'mypass' } });
      const buttons = screen.getAllByText('Disable Authentication');
      const disableButton = buttons.find(el => el.tagName === 'BUTTON');
      fireEvent.click(disableButton);
      await waitFor(() => {
        expect(mockRemovePassword).toHaveBeenCalledWith('mypass');
        expect(mockDisableAuth).toHaveBeenCalled();
      });
    });

    it('should show success message after disabling', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'mypass' } });
      const buttons = screen.getAllByText('Disable Authentication');
      const disableButton = buttons.find(el => el.tagName === 'BUTTON');
      fireEvent.click(disableButton);
      await waitFor(() => {
        expect(screen.getByText('Authentication disabled')).toBeInTheDocument();
      });
    });
  });

  describe('Change password (Password_Gate active, toggle stays ON)', () => {
    beforeEach(() => {
      mockIsPasswordRequired = true;
      mockGetAuthStatus.mockResolvedValue({ passwordRequired: true, username: 'admin' });
    });

    it('should show change password form when Password_Gate active and toggle stays checked', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      // Toggle is already checked, so the change password form should show
      const headings = screen.getAllByText('Change Password');
      expect(headings.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
      expect(screen.getByLabelText('New Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
    });

    it('should validate all fields on change password', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));
      await waitFor(() => {
        expect(screen.getByText('Current password is required')).toBeInTheDocument();
        expect(screen.getByText('New password is required')).toBeInTheDocument();
      });
    });

    it('should call setPassword and login on successful change', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass' } });
      fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass1' } });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'newpass1' } });
      fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));
      await waitFor(() => {
        expect(mockSetPassword).toHaveBeenCalledWith('oldpass', 'newpass1');
        expect(mockLogin).toHaveBeenCalledWith('newpass1');
      });
    });

    it('should show success message after password change', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass' } });
      fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass1' } });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'newpass1' } });
      fireEvent.click(screen.getByText('Change Password', { selector: 'button' }));
      await waitFor(() => {
        expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
      });
    });
  });

  describe('Validation feedback', () => {
    it('should clear validation error when user types in the field', async () => {
      render(<SecuritySettings />);
      await waitForLoaded();
      fireEvent.click(screen.getByLabelText('Enable authentication'));
      fireEvent.click(screen.getByText('Enable Authentication'));
      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a' } });
      expect(screen.queryByText('Password is required')).not.toBeInTheDocument();
    });
  });
});
