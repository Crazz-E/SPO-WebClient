/**
 * EmpireOverview — the folders selector feeds straight into FacilityList.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useEmpireStore } from '../../store/empire-store';
import { EmpireOverview } from './EmpireOverview';

describe('EmpireOverview', () => {
  beforeEach(() => {
    useEmpireStore.getState().reset();
  });

  it('passes the store\'s folders through to the Folders section', () => {
    useEmpireStore.getState().setFacilities([], [{ id: 1, name: 'Farms', path: '1' }]);

    renderWithProviders(<EmpireOverview />, {
      clientCallbacks: createSpiedCallbacks({ onRequestFacilities: () => { /* no-op */ } }),
    });

    expect(screen.getByText('Folders')).toBeTruthy();
    expect(screen.getByText('📁 Farms')).toBeTruthy();
  });
});
