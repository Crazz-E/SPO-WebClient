/**
 * "Write to <owner>" in the inspector header — offered to everyone, not just the owner,
 * from the `Creator` property the header already shows.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, resetStores, createSpiedCallbacks } from '../../../__tests__/setup/render-helpers';
import { useBuildingStore } from '../../../store/building-store';
import { useEmpireStore } from '../../../store/empire-store';
import { useGameStore } from '../../../store/game-store';
import { useMailStore } from '../../../store/mail-store';
import { useUiStore } from '../../../store/ui-store';
import { BuildingInspector } from '../BuildingInspector';
import type { BuildingFocusInfo, BuildingDetailsResponse } from '@/shared/types';

const focus: BuildingFocusInfo = {
  buildingId: 'bld-1',
  buildingName: 'Small Factory',
  ownerName: 'TestCo',
  x: 100,
  y: 200,
  xsize: 2,
  ysize: 2,
  visualClass: '300',
} as BuildingFocusInfo;

function makeDetails(withCreator: boolean): BuildingDetailsResponse {
  return {
    buildingId: 'bld-1',
    x: 100,
    y: 200,
    visualClass: '300',
    templateName: 'SrvGeneral',
    buildingName: 'Small Factory',
    ownerName: 'TestCo',
    securityId: 'sec-1',
    canGovern: true,
    tabs: [{ id: 'general', name: 'GENERAL', order: 0, icon: 'G', handlerName: 'SrvGeneral' }],
    groups: withCreator ? { general: [{ name: 'Creator', value: 'Bob' }] } : { general: [] },
    timestamp: 0,
  } as unknown as BuildingDetailsResponse;
}

function seed(isOwner: boolean, withCreator = true): void {
  useBuildingStore.getState().setFocus(focus);
  useBuildingStore.setState({ details: makeDetails(withCreator), isLoading: false, isOwner });
  useEmpireStore.getState().setFacilities([]);
  useGameStore.setState({ worldName: 'Shamba' });
}

describe('BuildingInspector — write to owner', () => {
  beforeEach(() => {
    resetStores();
    useEmpireStore.getState().reset();
  });

  it('offers a non-owner "Write to Bob" that opens compose addressed to Bob@Shamba.net', () => {
    seed(false);
    renderWithProviders(<BuildingInspector />, { clientCallbacks: createSpiedCallbacks({}) });

    fireEvent.click(screen.getByRole('button', { name: 'Write to Bob' }));

    expect(useMailStore.getState().composeTo).toBe('Bob@Shamba.net');
    expect(useMailStore.getState().currentView).toBe('compose');
    expect(useUiStore.getState().rightPanel).toBe('mail');
  });

  it('offers both "Write to Bob" and "Add to Empire list" to the owner', () => {
    seed(true);
    renderWithProviders(<BuildingInspector />, { clientCallbacks: createSpiedCallbacks({}) });

    expect(screen.getByRole('button', { name: 'Write to Bob' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to Empire list' })).toBeTruthy();
  });

  it('renders no write button when there is no Creator property', () => {
    seed(true, false);
    renderWithProviders(<BuildingInspector />, { clientCallbacks: createSpiedCallbacks({}) });

    expect(screen.queryByRole('button', { name: /Write to/ })).toBeNull();
  });
});
