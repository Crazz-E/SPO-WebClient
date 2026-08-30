/**
 * FavoritesTree — issue #129: a single-level tree over the Favorites list.
 *
 * What matters: a folder expands lazily and caches what it fetched (no
 * re-fetch on a second open), a link click hands the item straight to
 * `onNavigate`, a folder found one level down is shown but not itself
 * expandable (TREE_SCOPE — depth <= 1), and a failed read says so instead of
 * silently staying empty.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { FavoritesTree } from './FavoritesTree';
import type { FavoritesFolderItem, FavoritesLinkItem } from '@/shared/types';

const folder = (id: number, name: string, path = String(id)): FavoritesFolderItem =>
  ({ id, name, path, kind: 0 });
const link = (id: number, name: string, x: number, y: number, path = String(id)): FavoritesLinkItem =>
  ({ id, name, x, y, path, kind: 1 });

describe('FavoritesTree', () => {
  beforeEach(() => {
    useUiStore.getState().closeModal();
  });

  it('shows the empty state when there is nothing at the root', () => {
    renderWithProviders(<FavoritesTree items={[]} onNavigate={jest.fn()} />);
    expect(screen.getByText('No facilities found')).toBeTruthy();
  });

  it('renders folders and links at the root', () => {
    renderWithProviders(
      <FavoritesTree items={[folder(9, 'Farms'), link(1, 'Mill', 10, 20)]} onNavigate={jest.fn()} />,
    );
    expect(screen.getByText('Farms')).toBeTruthy();
    expect(screen.getByText('Mill')).toBeTruthy();
    expect(screen.getByText('10, 20')).toBeTruthy();
  });

  it('a link click hands the item straight to onNavigate', () => {
    const onNavigate = jest.fn();
    const item = link(1, 'Mill', 10, 20);
    renderWithProviders(<FavoritesTree items={[item]} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('Mill'));

    expect(onNavigate).toHaveBeenCalledWith(item);
  });

  it('expanding a folder fetches its children and shows them', async () => {
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]) => [link(10, 'Farm 1', 118, 226, '9/10')]);
    renderWithProviders(
      <FavoritesTree items={[folder(9, 'Farms')]} onNavigate={jest.fn()} />,
      { clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }) },
    );

    fireEvent.click(screen.getByText('Farms'));

    expect(screen.getByText('Loading…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Farm 1')).toBeTruthy());
    expect(onFetchFavoritesFolder).toHaveBeenCalledWith('9');
  });

  it('says a folder is empty rather than showing nothing', async () => {
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]) => []);
    renderWithProviders(
      <FavoritesTree items={[folder(9, 'Farms')]} onNavigate={jest.fn()} />,
      { clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }) },
    );

    fireEvent.click(screen.getByText('Farms'));
    await waitFor(() => expect(screen.getByText('Empty folder')).toBeTruthy());
  });

  it('reports a failed read instead of leaving the folder silently empty', async () => {
    const onFetchFavoritesFolder = jest.fn(() => Promise.reject(new Error('socket closed')));
    renderWithProviders(
      <FavoritesTree items={[folder(9, 'Farms')]} onNavigate={jest.fn()} />,
      { clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }) },
    );

    fireEvent.click(screen.getByText('Farms'));
    await waitFor(() => expect(screen.getByText('Could not read this folder.')).toBeTruthy());
  });

  it('collapsing and reopening a folder reuses the cached children — one fetch only', async () => {
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]) => [link(10, 'Farm 1', 118, 226, '9/10')]);
    renderWithProviders(
      <FavoritesTree items={[folder(9, 'Farms')]} onNavigate={jest.fn()} />,
      { clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }) },
    );

    fireEvent.click(screen.getByText('Farms'));
    await waitFor(() => expect(screen.getByText('Farm 1')).toBeTruthy());

    fireEvent.click(screen.getByText('Farms')); // collapse
    expect(screen.queryByText('Farm 1')).toBeNull();

    fireEvent.click(screen.getByText('Farms')); // reopen
    expect(screen.getByText('Farm 1')).toBeTruthy();
    expect(onFetchFavoritesFolder).toHaveBeenCalledTimes(1);
  });

  it('a child folder one level down is shown but has no disclosure control (TREE_SCOPE: depth <= 1)', async () => {
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]) => [folder(20, 'Nested', '9/20')]);
    const onNavigate = jest.fn();
    renderWithProviders(
      <FavoritesTree items={[folder(9, 'Farms')]} onNavigate={onNavigate} />,
      { clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }) },
    );

    fireEvent.click(screen.getByText('Farms'));
    await waitFor(() => expect(screen.getByText('Nested')).toBeTruthy());

    // A child folder is a <span>, not a <button> — clicking it does nothing.
    fireEvent.click(screen.getByText('Nested'));
    expect(onFetchFavoritesFolder).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('a child link one level down still navigates', async () => {
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]) => [link(10, 'Farm 1', 118, 226, '9/10')]);
    const onNavigate = jest.fn();
    renderWithProviders(
      <FavoritesTree items={[folder(9, 'Farms')]} onNavigate={onNavigate} />,
      { clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }) },
    );

    fireEvent.click(screen.getByText('Farms'));
    await waitFor(() => expect(screen.getByText('Farm 1')).toBeTruthy());
    fireEvent.click(screen.getByText('Farm 1'));

    expect(onNavigate).toHaveBeenCalledWith(link(10, 'Farm 1', 118, 226, '9/10'));
  });

  it('"New folder" creates a folder at the root and reports success up', () => {
    const onAddFavoriteFolder = jest.fn(async (..._args: unknown[]) => ({ success: true, id: 12 }));
    const onRootChanged = jest.fn();
    renderWithProviders(
      <FavoritesTree items={[]} onNavigate={jest.fn()} onRootChanged={onRootChanged} />,
      { clientCallbacks: createSpiedCallbacks({ onAddFavoriteFolder }) },
    );

    fireEvent.click(screen.getByText('New folder'));
    const onSubmit = useUiStore.getState().promptPayload?.onSubmit;
    expect(onSubmit).toBeTruthy();
    onSubmit?.('Farms');

    expect(onAddFavoriteFolder).toHaveBeenCalledWith('', 'Farms');
    return waitFor(() => expect(onRootChanged).toHaveBeenCalled());
  });

  it('an empty or blank folder name is not submitted', () => {
    const onAddFavoriteFolder = jest.fn(async (..._args: unknown[]) => ({ success: true, id: 12 }));
    renderWithProviders(
      <FavoritesTree items={[]} onNavigate={jest.fn()} />,
      { clientCallbacks: createSpiedCallbacks({ onAddFavoriteFolder }) },
    );

    fireEvent.click(screen.getByText('New folder'));
    useUiStore.getState().promptPayload?.onSubmit('   ');

    expect(onAddFavoriteFolder).not.toHaveBeenCalled();
  });

  it('a refused folder creation does not report the root as changed', async () => {
    const onAddFavoriteFolder = jest.fn(async (..._args: unknown[]) => ({ success: false, message: 'Nope.' }));
    const onRootChanged = jest.fn();
    renderWithProviders(
      <FavoritesTree items={[]} onNavigate={jest.fn()} onRootChanged={onRootChanged} />,
      { clientCallbacks: createSpiedCallbacks({ onAddFavoriteFolder }) },
    );

    fireEvent.click(screen.getByText('New folder'));
    useUiStore.getState().promptPayload?.onSubmit('Farms');

    await waitFor(() => expect(onAddFavoriteFolder).toHaveBeenCalled());
    expect(onRootChanged).not.toHaveBeenCalled();
  });
});
