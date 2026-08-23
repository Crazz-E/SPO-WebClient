import { describe, it, expect, jest } from '@jest/globals';
import { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { Tabs, TabPanel, tabIds, type TabItem } from './Tabs';

const THREE: TabItem[] = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Admin', badge: 3 },
  { id: 'c', label: 'Elections' },
];

function tab(name: string): HTMLButtonElement {
  return screen.getByRole('tab', { name }) as HTMLButtonElement;
}

/** Controlled harness so keyboard activation re-renders the roving tabindex like a real flow. */
function Harness({ tabs, onChange, initial = 'a', variant }: {
  tabs: TabItem[];
  onChange?: (id: string) => void;
  initial?: string;
  variant?: 'underline' | 'segmented';
}) {
  const [active, setActive] = useState(initial);
  return (
    <>
      <Tabs
        tabs={tabs}
        activeId={active}
        onChange={(id) => { setActive(id); onChange?.(id); }}
        aria-label="Sections"
        idBase="t"
        variant={variant}
      />
      <TabPanel tabsId="t" tabId={active}>panel {active}</TabPanel>
    </>
  );
}

describe('Tabs', () => {
  it('tabIds gives Tabs and TabPanel the same ids', () => {
    expect(tabIds('x', 'y')).toEqual({ tab: 'x-tab-y', panel: 'x-panel-y' });
  });

  it('wires tablist / tab / tabpanel roles, labels and ids', () => {
    renderWithProviders(<Harness tabs={THREE} />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy();
    const a = tab('Overview');
    const panel = screen.getByRole('tabpanel');
    expect(a.id).toBe('t-tab-a');
    expect(a.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(a.id);
    expect(panel.tabIndex).toBe(0);
    expect(a.type).toBe('button');
  });

  it('roving tabindex: only the active tab is in the tab order and is aria-selected', () => {
    renderWithProviders(<Harness tabs={THREE} initial="b" />);
    expect(tab('Overview').tabIndex).toBe(-1);
    expect(tab('Admin 3 new').tabIndex).toBe(0);
    expect(tab('Admin 3 new').getAttribute('aria-selected')).toBe('true');
    expect(tab('Overview').getAttribute('aria-selected')).toBe('false');
  });

  it('generates an id base with useId when none is given', () => {
    renderWithProviders(<Tabs tabs={THREE} activeId="a" onChange={() => {}} aria-label="L" />);
    const a = tab('Overview');
    expect(a.id).toMatch(/-tab-a$/);
    expect(a.getAttribute('aria-controls')).toMatch(/-panel-a$/);
  });

  it('click activates a tab and calls onChange once', () => {
    const onChange = jest.fn();
    renderWithProviders(<Harness tabs={THREE} onChange={onChange} />);
    fireEvent.click(tab('Elections'));
    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.getByRole('tabpanel').textContent).toBe('panel c');
    fireEvent.click(tab('Elections'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ArrowRight moves focus, activates, and wraps to the first tab', () => {
    const onChange = jest.fn();
    renderWithProviders(<Harness tabs={THREE} onChange={onChange} initial="c" />);
    tab('Elections').focus();
    fireEvent.keyDown(tab('Elections'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(document.activeElement).toBe(tab('Overview'));
    expect(tab('Overview').tabIndex).toBe(0);
    expect(tab('Elections').tabIndex).toBe(-1);
  });

  it('ArrowLeft moves back and wraps to the last tab', () => {
    const onChange = jest.fn();
    renderWithProviders(<Harness tabs={THREE} onChange={onChange} />);
    fireEvent.keyDown(tab('Overview'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    expect(document.activeElement).toBe(tab('Elections'));
    fireEvent.keyDown(tab('Elections'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('Home / End jump to the first / last enabled tab', () => {
    const onChange = jest.fn();
    renderWithProviders(<Harness tabs={THREE} onChange={onChange} initial="b" />);
    fireEvent.keyDown(tab('Admin 3 new'), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    expect(document.activeElement).toBe(tab('Elections'));
    fireEvent.keyDown(tab('Elections'), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(document.activeElement).toBe(tab('Overview'));
  });

  it('Enter / Space activate the focused tab; other keys are ignored', () => {
    const onChange = jest.fn();
    renderWithProviders(<Harness tabs={THREE} onChange={onChange} />);
    fireEvent.keyDown(tab('Admin 3 new'), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(tab('Elections'), { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(tab('Elections'), { key: 'a' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('disabled tabs are aria-disabled, skipped by arrows / Home / End, and never activated', () => {
    const onChange = jest.fn();
    const tabs: TabItem[] = [
      { id: 'a', label: 'A', disabled: true },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C', disabled: true },
      { id: 'd', label: 'D' },
    ];
    renderWithProviders(<Harness tabs={tabs} onChange={onChange} initial="b" />);
    expect(tab('A').getAttribute('aria-disabled')).toBe('true');
    expect(tab('B').getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(tab('C'));
    fireEvent.keyDown(tab('C'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(tab('B'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('d');
    fireEvent.keyDown(tab('D'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(tab('B'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('d');
    fireEvent.keyDown(tab('D'), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(tab('B'), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('d');
  });

  it('stays put when every other tab is disabled, and ignores Home/End when all are disabled', () => {
    const onChange = jest.fn();
    renderWithProviders(
      <Harness tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }]} onChange={onChange} />,
    );
    fireEvent.keyDown(tab('A'), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(tab('A'));

    renderWithProviders(
      <Tabs tabs={[{ id: 'z', label: 'Z', disabled: true }]} activeId="z" onChange={onChange} aria-label="All off" />,
    );
    fireEvent.keyDown(tab('Z'), { key: 'Home' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the badge with an accessible count, caps at 99+, and hides zero', () => {
    renderWithProviders(
      <Tabs
        tabs={[{ id: 'a', label: 'A', badge: 0 }, { id: 'b', label: 'B', badge: 250 }]}
        activeId="a"
        onChange={() => {}}
        aria-label="L"
      />,
    );
    expect(tab('A').querySelector('span')).toBeNull();
    const badge = tab('B 250 new').querySelector('span');
    expect(badge?.textContent).toBe('99+');
    expect(badge?.getAttribute('aria-label')).toBe('250 new');
  });

  it('applies variant and extra classes', () => {
    renderWithProviders(<Harness tabs={THREE} variant="segmented" />);
    expect(screen.getByRole('tablist').className).toContain('segmented');
  });

  it('defaults to the underline variant and forwards className', () => {
    renderWithProviders(<Tabs tabs={THREE} activeId="a" onChange={() => {}} aria-label="L" className="extra" />);
    const list = screen.getByRole('tablist');
    expect(list.className).toContain('underline');
    expect(list.className).toContain('extra');
  });

  it('TabPanel forwards className', () => {
    renderWithProviders(<TabPanel tabsId="p" tabId="q" className="mine">body</TabPanel>);
    const panel = screen.getByRole('tabpanel');
    expect(panel.className).toContain('mine');
    expect(panel.id).toBe('p-panel-q');
    expect(panel.getAttribute('aria-labelledby')).toBe('p-tab-q');
  });
});
