import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VersionUpgradeModal from './VersionUpgradeModal';

describe('VersionUpgradeModal', () => {
  const sampleEntries = [
    {
      version: '2.0.0',
      date: 'March 1, 2026',
      added: ['New dashboard feature', 'Export to CSV'],
      changed: ['Improved performance'],
      fixed: ['Fixed date parsing bug'],
      removed: ['Removed legacy import']
    }
  ];

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <VersionUpgradeModal
        isOpen={false}
        onClose={vi.fn()}
        newVersion="2.0.0"
        changelogEntries={sampleEntries}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders modal with version number when isOpen is true', () => {
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        newVersion="2.0.0"
        changelogEntries={sampleEntries}
      />
    );
    expect(screen.getByText(/Updated to v2\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText('New Version')).toBeInTheDocument();
  });

  it('renders changelog entries with categorized items', () => {
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        newVersion="2.0.0"
        changelogEntries={sampleEntries}
      />
    );
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('New dashboard feature')).toBeInTheDocument();
    expect(screen.getByText('Export to CSV')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText('Improved performance')).toBeInTheDocument();
    expect(screen.getByText('Fixed')).toBeInTheDocument();
    expect(screen.getByText('Fixed date parsing bug')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
    expect(screen.getByText('Removed legacy import')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={onClose}
        newVersion="2.0.0"
        changelogEntries={sampleEntries}
      />
    );
    fireEvent.click(screen.getByLabelText('Close upgrade notification'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={onClose}
        newVersion="2.0.0"
        changelogEntries={sampleEntries}
      />
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal body is clicked', () => {
    const onClose = vi.fn();
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={onClose}
        newVersion="2.0.0"
        changelogEntries={sampleEntries}
      />
    );
    fireEvent.click(screen.getByText(/Updated to v2\.0\.0/));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows fallback message when no changelog entries provided', () => {
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        newVersion="2.0.0"
        changelogEntries={[]}
      />
    );
    expect(screen.getByText('See changelog for details.')).toBeInTheDocument();
  });

  it('shows fallback message when changelogEntries is null', () => {
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        newVersion="2.0.0"
        changelogEntries={null}
      />
    );
    expect(screen.getByText('See changelog for details.')).toBeInTheDocument();
  });

  it('only renders categories that have items', () => {
    const partialEntry = [
      {
        version: '2.0.0',
        date: 'March 1, 2026',
        added: ['New feature'],
        changed: [],
        fixed: null,
        removed: undefined
      }
    ];
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        newVersion="2.0.0"
        changelogEntries={partialEntry}
      />
    );
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('New feature')).toBeInTheDocument();
    expect(screen.queryByText('Changed')).not.toBeInTheDocument();
    expect(screen.queryByText('Fixed')).not.toBeInTheDocument();
    expect(screen.queryByText('Removed')).not.toBeInTheDocument();
  });

  it('includes accessible aria attributes', () => {
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        newVersion="3.1.0"
        changelogEntries={sampleEntries}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Version 3.1.0 upgrade details');
  });

  it('renders version and date in changelog entry', () => {
    render(
      <VersionUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        newVersion="2.0.0"
        changelogEntries={sampleEntries}
      />
    );
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
    expect(screen.getByText('March 1, 2026')).toBeInTheDocument();
  });
});
