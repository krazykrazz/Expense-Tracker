import { useState, useRef, useEffect } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import './UserMenu.css';

/**
 * UserMenu - Small user icon button in the header with a logout dropdown.
 * Only visible when Password_Gate is active (isPasswordRequired=true).
 */
const UserMenu = () => {
  const { isPasswordRequired, logout } = useAuthContext();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  const isActive = isPasswordRequired;

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className={`user-menu-button settings-button${!isActive ? ' user-menu-inactive' : ''}`}
        onClick={() => isActive && setIsOpen(!isOpen)}
        aria-label="User menu"
        aria-expanded={isActive ? isOpen : undefined}
        aria-haspopup={isActive ? 'true' : undefined}
        aria-disabled={!isActive}
        title={isActive ? 'User menu' : 'Authentication not enabled'}
      >
        👤
      </button>
      {isOpen && isActive && (
        <div className="user-menu-dropdown" role="menu">
          <button
            className="user-menu-item"
            onClick={handleLogout}
            role="menuitem"
          >
            🚪 Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
