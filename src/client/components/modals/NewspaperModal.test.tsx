/**
 * NewspaperModal — the editorial board Voyager opens from "Rate the Mayor".
 *
 * Covers the two navigations (index -> column -> back), the composer's two
 * modes (new column / reply), and the lazy read that fills the modal.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import {
  renderWithProviders,
  resetStores,
  createSpiedCallbacks,
} from '../../__tests__/setup/render-helpers';
import { useNewspaperStore } from '../../store/newspaper-store';
import { useUiStore } from '../../store/ui-store';
import { NewspaperModal } from './NewspaperModal';
import type { NewspaperBoard } from '@/shared/types';

const CONTEXT = {
  paperName: 'Helartia Herald',
  townName: 'Helartia',
  isCapitol: false,
  buildingX: 118,
  buildingY: 226,
};

const ROOT = 'boards\\Planitia\\Helartia Herald\\';

const INDEX: NewspaperBoard = {
  paperName: 'Helartia Herald',
  root: ROOT,
  path: ROOT,
  columns: [
    { author: 'SPO_test3', subject: 'VERY NICE GUY', summary: 'VOTE FOR HIM', path: 'm1.five' },
  ],
  article: null,
  error: '',
};

const ARTICLE: NewspaperBoard = {
  ...INDEX,
  path: 'm1.five',
  columns: [],
  article: {
    subject: 'VERY NICE GUY',
    byline: 'By SPO_test3 of Yellow Inc.',
    body: 'VOTE FOR HIM',
    replies: [{ author: 'Innos', subject: 'Agreed', summary: 'Well said', path: 'r1.five' }],
  },
};

function openWith(board: NewspaperBoard | null, loadState: 'idle' | 'loading' | 'loaded' | 'error' = 'loaded'): void {
  useUiStore.getState().openModal('newspaper');
  useNewspaperStore.setState({ context: CONTEXT, board, loadState, isPosting: false, requestedPath: '' });
}

beforeEach(() => {
  resetStores();
  useNewspaperStore.getState().reset();
});

describe('NewspaperModal', () => {
  it('renders nothing when another modal holds the slot', () => {
    useUiStore.getState().openModal('settings');
    const { container } = renderWithProviders(<NewspaperModal />);
    expect(container.firstChild).toBeNull();
  });

  // Same lazy contract as the Politics tab: nothing is read until it is on screen.
  it('reads the board on open when nothing has been read', () => {
    const spy = jest.fn();
    openWith(null, 'idle');
    renderWithProviders(
      <NewspaperModal />,
      { clientCallbacks: createSpiedCallbacks({ onRequestNewspaperBoard: spy }) },
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not read again while a read is in flight', () => {
    const spy = jest.fn();
    openWith(null, 'loading');
    renderWithProviders(
      <NewspaperModal />,
      { clientCallbacks: createSpiedCallbacks({ onRequestNewspaperBoard: spy }) },
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('lists the latest columns with their author and summary', () => {
    openWith(INDEX);
    renderWithProviders(<NewspaperModal />);
    expect(screen.getByText('Helartia Herald')).toBeTruthy();
    expect(screen.getByText('SPO_test3')).toBeTruthy();
    expect(screen.getByText('VERY NICE GUY')).toBeTruthy();
    expect(screen.getByText('VOTE FOR HIM')).toBeTruthy();
  });

  it('says so when nobody has written yet', () => {
    openWith({ ...INDEX, columns: [] });
    renderWithProviders(<NewspaperModal />);
    expect(screen.getByText('Nobody has written a column yet.')).toBeTruthy();
  });

  it('opens a column by its board path', () => {
    const spy = jest.fn();
    openWith(INDEX);
    renderWithProviders(
      <NewspaperModal />,
      { clientCallbacks: createSpiedCallbacks({ onRequestNewspaperBoard: spy }) },
    );
    fireEvent.click(screen.getByText('VERY NICE GUY'));
    expect(spy).toHaveBeenCalledWith('m1.five');
  });

  it('shows an open column with its byline, body and replies', () => {
    openWith(ARTICLE);
    renderWithProviders(<NewspaperModal />);
    expect(screen.getByText('By SPO_test3 of Yellow Inc.')).toBeTruthy();
    expect(screen.getByText('VOTE FOR HIM')).toBeTruthy();
    expect(screen.getByText('Replies')).toBeTruthy();
    expect(screen.getByText('Agreed')).toBeTruthy();
  });

  it('goes back to the index with no path', () => {
    const spy = jest.fn();
    openWith(ARTICLE);
    renderWithProviders(
      <NewspaperModal />,
      { clientCallbacks: createSpiedCallbacks({ onRequestNewspaperBoard: spy }) },
    );
    fireEvent.click(screen.getByText('All columns'));
    expect(spy).toHaveBeenCalledWith();
  });

  it('reports a board that could not be read', () => {
    openWith({ ...INDEX, error: 'This town has no newspaper.' }, 'error');
    renderWithProviders(<NewspaperModal />);
    expect(screen.getByText('This town has no newspaper.')).toBeTruthy();
  });

  // ---- The composer ----

  it('posts a new column at the board root', () => {
    const spy = jest.fn();
    openWith(INDEX);
    renderWithProviders(
      <NewspaperModal />,
      { clientCallbacks: createSpiedCallbacks({ onPostNewspaperColumn: spy }) },
    );
    fireEvent.click(screen.getByText('Post a column'));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Roads' } });
    fireEvent.change(screen.getByLabelText('Column'), { target: { value: 'We need more' } });
    fireEvent.click(screen.getByText('Post Column'));
    // No reply path — `boardmsg.asp:90` then posts at the root.
    expect(spy).toHaveBeenCalledWith('Roads', 'We need more', undefined);
  });

  it('posts a reply under the open column', () => {
    const spy = jest.fn();
    openWith(ARTICLE);
    renderWithProviders(
      <NewspaperModal />,
      { clientCallbacks: createSpiedCallbacks({ onPostNewspaperColumn: spy }) },
    );
    fireEvent.click(screen.getByText('Reply to this column'));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Agreed' } });
    fireEvent.click(screen.getByText('Post Reply'));
    expect(spy).toHaveBeenCalledWith('Agreed', '', 'm1.five');
  });

  // `boardmsg.asp:94` drops a subject-less post silently.
  it('will not post without a subject', () => {
    openWith(INDEX);
    renderWithProviders(<NewspaperModal />);
    fireEvent.click(screen.getByText('Post a column'));
    expect((screen.getByText('Post Column') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables the form while the post is in flight', () => {
    openWith(INDEX);
    renderWithProviders(<NewspaperModal />);
    fireEvent.click(screen.getByText('Post a column'));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Roads' } });
    act(() => { useNewspaperStore.getState().setPosting(true); });
    expect(screen.getByText('Publishing…')).toBeTruthy();
  });

  it('resets the form without closing it', () => {
    openWith(INDEX);
    renderWithProviders(<NewspaperModal />);
    fireEvent.click(screen.getByText('Post a column'));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Roads' } });
    fireEvent.click(screen.getByText('Reset Form'));
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('');
  });

  it('hides the form on request', () => {
    openWith(INDEX);
    renderWithProviders(<NewspaperModal />);
    fireEvent.click(screen.getByText('Post a column'));
    fireEvent.click(screen.getByText('Hide Form'));
    expect(screen.queryByLabelText('Subject')).toBeNull();
  });

  it('the refresh control puts the board back in the read path', () => {
    openWith(INDEX);
    renderWithProviders(<NewspaperModal />);
    fireEvent.click(screen.getByLabelText('Refresh'));
    expect(useNewspaperStore.getState().loadState).toBe('idle');
  });

  it('closes the modal', () => {
    openWith(INDEX);
    renderWithProviders(<NewspaperModal />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(useUiStore.getState().modal).toBeNull();
  });
});
