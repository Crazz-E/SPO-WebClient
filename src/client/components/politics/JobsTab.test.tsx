/**
 * JobsTab tests — the minimum-wage slider's write discipline.
 *
 * Voyager emits one frame per gesture (`PercentEdit.pas:357-362`). Three DOM
 * events end one gesture here, so the guard is what keeps the count at one.
 */

import { describe, it, expect } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react';
import { createSpiedCallbacks, renderWithProviders } from '../../__tests__/setup/render-helpers';
import { JobsTab } from './JobsTab';
import type { BuildingPropertyValue } from '@/shared/types';

const JOBS: BuildingPropertyValue[] = [
  { name: 'hiWorkDemand', value: '10' },
  { name: 'hiMinSalary', value: '200' },
  { name: 'midWorkDemand', value: '20' },
  { name: 'midMinSalary', value: '150' },
  { name: 'loWorkDemand', value: '30' },
  { name: 'loMinSalary', value: '100' },
];

/** Render with a spy, and hand back the sliders plus the SETs they produce. */
function renderJobs() {
  const sent: string[] = [];
  const callbacks = createSpiedCallbacks({
    onSetBuildingProperty: (...args: unknown[]) => { sent.push(args[3] as string); },
  });
  renderWithProviders(
    <JobsTab properties={JOBS} buildingX={1} buildingY={2} isCapitol={false} canGovern />,
    { clientCallbacks: callbacks },
  );
  const sliders = [
    screen.getByLabelText('Executive minimum wage (town)'),
    screen.getByLabelText('Professional minimum wage (town)'),
    screen.getByLabelText('Worker minimum wage (town)'),
  ];
  return { sent, sliders };
}

// Same values as the mock scenario's Town Hall fixture
// (src/mock-server/scenarios/building-details-scenario.ts:527-540): town figure
// 140/95/55, world floor 150/100/60.
const JOBS_WITH_WORLD_FLOOR: BuildingPropertyValue[] = [
  { name: 'hiMinSalary', value: '140' }, { name: 'hiActualMinSalary', value: '150' },
  { name: 'midMinSalary', value: '95' }, { name: 'midActualMinSalary', value: '100' },
  { name: 'loMinSalary', value: '55' }, { name: 'loActualMinSalary', value: '60' },
];

describe('JobsTab world floor', () => {
  it('shows both figures and names the second as the world floor', () => {
    renderWithProviders(
      <JobsTab properties={JOBS_WITH_WORLD_FLOOR} buildingX={1} buildingY={2} isCapitol={false} canGovern />,
      { clientCallbacks: createSpiedCallbacks({}) },
    );
    expect(screen.getAllByText('World floor')).toHaveLength(3);
    expect(screen.getByText('150%')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
  });

  it('binds only the town figure to the range input', () => {
    renderWithProviders(
      <JobsTab properties={JOBS_WITH_WORLD_FLOOR} buildingX={1} buildingY={2} isCapitol={false} canGovern />,
      { clientCallbacks: createSpiedCallbacks({}) },
    );
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(3);
    expect(sliders.map((s) => (s as HTMLInputElement).value)).toEqual(['140', '95', '55']);
    expect(screen.getByText('150%').tagName).toBe('SPAN');
    expect(screen.queryByLabelText(/world floor/i)).toBeNull();
  });

  it('the world floor never emits RDOSetMinSalaryValue', () => {
    const sent: unknown[] = [];
    renderWithProviders(
      <JobsTab properties={JOBS_WITH_WORLD_FLOOR} buildingX={1} buildingY={2} isCapitol={false} canGovern />,
      { clientCallbacks: createSpiedCallbacks({ onSetBuildingProperty: (...args: unknown[]) => { sent.push(args); } }) },
    );
    const worldFloor = screen.getByText('150%');
    fireEvent.click(worldFloor);
    fireEvent.blur(worldFloor);
    expect(sent).toEqual([]);
  });

  it('omits the world-floor row on the Capitol', () => {
    renderWithProviders(
      <JobsTab properties={JOBS_WITH_WORLD_FLOOR} buildingX={1} buildingY={2} isCapitol canGovern />,
      { clientCallbacks: createSpiedCallbacks({}) },
    );
    expect(screen.queryByText('World floor')).toBeNull();
  });
});

describe('JobsTab min-wage slider', () => {
  it('names each slider after its job class', () => {
    const { sliders } = renderJobs();
    expect(sliders).toHaveLength(3);
  });

  it('names the world floor as the world floor on the Capitol', () => {
    renderWithProviders(
      <JobsTab properties={JOBS} buildingX={1} buildingY={2} isCapitol canGovern />,
      { clientCallbacks: createSpiedCallbacks({}) },
    );
    // max(town, world) is what the town enforces (Kernel/Kernel.pas:9342-9345),
    // so which floor a slider writes has to reach a screen reader too.
    expect(screen.getByLabelText('Executive minimum wage (world)')).toBeTruthy();
  });

  it('emits one frame per gesture, not one per event that ends it', () => {
    const { sent, sliders } = renderJobs();

    fireEvent.change(sliders[0], { target: { value: '180' } });
    fireEvent.keyUp(sliders[0]);
    fireEvent.blur(sliders[0]);

    expect(sent).toEqual(['180']);
  });

  it('stays silent when the gesture lands back on the town figure', () => {
    const { sent, sliders } = renderJobs();

    fireEvent.change(sliders[0], { target: { value: '180' } });
    fireEvent.change(sliders[0], { target: { value: '200' } });
    fireEvent.blur(sliders[0]);

    expect(sent).toEqual([]);
  });

  it('emits again once the next gesture lands somewhere new', () => {
    const { sent, sliders } = renderJobs();

    fireEvent.change(sliders[0], { target: { value: '180' } });
    fireEvent.blur(sliders[0]);
    fireEvent.change(sliders[0], { target: { value: '160' } });
    fireEvent.blur(sliders[0]);

    expect(sent).toEqual(['180', '160']);
  });

  it('disables every slider for a player who does not govern', () => {
    renderWithProviders(
      <JobsTab properties={JOBS} buildingX={1} buildingY={2} isCapitol={false} canGovern={false} />,
      { clientCallbacks: createSpiedCallbacks({}) },
    );
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(3);
    expect(sliders.every((s) => (s as HTMLInputElement).disabled)).toBe(true);
  });
});
