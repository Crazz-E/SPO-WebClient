/**
 * Smoke tests for common UI components.
 *
 * Verifies each component renders without crashing with minimal props.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { Badge, CountBadge } from './Badge';
import { GlassCard } from './GlassCard';
import { Skeleton, SkeletonLines } from './Skeleton';
import { ProgressBar } from './ProgressBar';
import { IconButton } from './IconButton';
import { ConfirmDialog } from './ConfirmDialog';
import { TabBar } from './TabBar';
import { SliderInput } from './SliderInput';
import { ToastContainer, showToast, resetToasts } from './Toast';

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

describe('Badge', () => {
  it('renders children text', () => {
    renderWithProviders(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders dot variant without text', () => {
    const { container } = renderWithProviders(<Badge dot>Hidden</Badge>);
    expect(container.textContent).toBe('');
  });

  it('renders with variant class', () => {
    const { container } = renderWithProviders(<Badge variant="success">OK</Badge>);
    expect(container.querySelector('[class*="success"]')).toBeTruthy();
  });
});

describe('CountBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = renderWithProviders(<CountBadge count={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders count', () => {
    renderWithProviders(<CountBadge count={5} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('caps at max', () => {
    renderWithProviders(<CountBadge count={150} max={99} />);
    expect(screen.getByText('99+')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// GlassCard
// ---------------------------------------------------------------------------

describe('GlassCard', () => {
  it('renders children', () => {
    renderWithProviders(<GlassCard>Card Content</GlassCard>);
    expect(screen.getByText('Card Content')).toBeTruthy();
  });

  it('applies maxWidth style', () => {
    const { container } = renderWithProviders(<GlassCard maxWidth={400}>Test</GlassCard>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.style.maxWidth).toBe('400px');
  });

  it('adds button role when onClick provided', () => {
    renderWithProviders(<GlassCard onClick={() => {}}>Clickable</GlassCard>);
    expect(screen.getByRole('button')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

describe('Skeleton', () => {
  it('renders with default dimensions', () => {
    const { container } = renderWithProviders(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('1em');
  });

  it('renders with custom dimensions', () => {
    const { container } = renderWithProviders(<Skeleton width="200px" height="24px" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('24px');
  });
});

describe('SkeletonLines', () => {
  it('renders specified number of lines', () => {
    const { container } = renderWithProviders(<SkeletonLines lines={4} />);
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------

describe('ProgressBar', () => {
  it('renders with value', () => {
    const { container } = renderWithProviders(<ProgressBar value={0.75} />);
    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar?.getAttribute('aria-valuenow')).toBe('75');
  });

  it('clamps value between 0 and 1', () => {
    const { container } = renderWithProviders(<ProgressBar value={1.5} />);
    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('shows label when showLabel is true', () => {
    renderWithProviders(<ProgressBar value={0.42} showLabel />);
    expect(screen.getByText('42%')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// IconButton
// ---------------------------------------------------------------------------

describe('IconButton', () => {
  it('renders with aria-label', () => {
    renderWithProviders(<IconButton icon={<span>X</span>} label="Close" />);
    expect(screen.getByLabelText('Close')).toBeTruthy();
  });

  it('renders badge count', () => {
    renderWithProviders(<IconButton icon={<span>M</span>} label="Mail" badge={3} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders disabled state', () => {
    renderWithProviders(<IconButton icon={<span>X</span>} label="Disabled" disabled />);
    const btn = screen.getByLabelText('Disabled') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls onClick', () => {
    let clicked = false;
    renderWithProviders(<IconButton icon={<span>X</span>} label="Click" onClick={() => { clicked = true; }} />);
    fireEvent.click(screen.getByLabelText('Click'));
    expect(clicked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

describe('ConfirmDialog', () => {
  const defaultProps = {
    title: 'Delete Building',
    message: 'This cannot be undone.',
    onConfirm: () => {},
    onCancel: () => {},
  };

  it('renders title and message', () => {
    renderWithProviders(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete Building')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
  });

  it('confirm button disabled until text matches', () => {
    renderWithProviders(<ConfirmDialog {...defaultProps} />);
    const confirmBtn = screen.getByText('Confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('confirm button enabled when text matches', () => {
    renderWithProviders(<ConfirmDialog {...defaultProps} confirmText="DELETE" />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'DELETE' } });
    const confirmBtn = screen.getByText('Confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TabBar
// ---------------------------------------------------------------------------

describe('TabBar', () => {
  const tabs = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'sent', label: 'Sent', badge: 2 },
    { id: 'drafts', label: 'Drafts' },
  ];

  it('renders all tabs', () => {
    renderWithProviders(<TabBar tabs={tabs} activeTab="inbox" onTabChange={() => {}} />);
    expect(screen.getByText('Inbox')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Drafts')).toBeTruthy();
  });

  it('marks active tab with aria-selected', () => {
    renderWithProviders(<TabBar tabs={tabs} activeTab="sent" onTabChange={() => {}} />);
    const sentTab = screen.getByText('Sent').closest('[role="tab"]');
    expect(sentTab?.getAttribute('aria-selected')).toBe('true');
  });

  it('renders badge on tab', () => {
    renderWithProviders(<TabBar tabs={tabs} activeTab="inbox" onTabChange={() => {}} />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('calls onTabChange when clicked', () => {
    let selected = '';
    renderWithProviders(<TabBar tabs={tabs} activeTab="inbox" onTabChange={(id) => { selected = id; }} />);
    fireEvent.click(screen.getByText('Drafts'));
    expect(selected).toBe('drafts');
  });
});

// ---------------------------------------------------------------------------
// SliderInput
// ---------------------------------------------------------------------------

describe('SliderInput', () => {
  it('renders label and value', () => {
    renderWithProviders(<SliderInput label="Demand" value={75} onChange={() => {}} />);
    expect(screen.getByText('Demand')).toBeTruthy();
    expect(screen.getByText('75')).toBeTruthy();
  });

  it('renders with suffix', () => {
    renderWithProviders(<SliderInput label="Tax" value={30} suffix="%" onChange={() => {}} />);
    expect(screen.getByText('30%')).toBeTruthy();
  });

  it('renders slider with aria-label', () => {
    renderWithProviders(<SliderInput label="Quality" value={50} onChange={() => {}} />);
    expect(screen.getByLabelText('Quality')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

describe('ToastContainer', () => {
  beforeEach(() => {
    resetToasts();
  });

  // Criterion changed by doc/ux/handoff/00-socle.md §2.9: the live regions are mounted
  // permanently (a region created in the same tick as its first message is not announced),
  // but they are empty until a toast arrives.
  it('mounts empty live regions when there are no toasts', () => {
    renderWithProviders(<ToastContainer />);
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('renders toast message after showToast()', () => {
    renderWithProviders(<ToastContainer />);
    act(() => { showToast('Building constructed', 'success'); });
    expect(screen.getByText('Building constructed')).toBeTruthy();
  });

  it('renders dismiss button', () => {
    renderWithProviders(<ToastContainer />);
    act(() => { showToast('Error occurred', 'error'); });
    expect(screen.getByLabelText('Dismiss')).toBeTruthy();
  });
});
