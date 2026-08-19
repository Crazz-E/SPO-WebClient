import { buildSalaryParams, collectSalaryTriplet, pendingKeyFor, resolveRdoCommand } from '../property-utils';
import type { BuildingPropertyValue } from '@/shared/types';
import type { RdoCommandMapping } from '@/shared/building-details';

/**
 * M-C — the workforce editor and RDOSetSalaries.
 *
 * Two defects met here. `resolveRdoCommand` only honoured `indexed`, so the
 * `allSalaries` mapping never matched and `Salaries0` fell through to the
 * passthrough — reaching the server as `call Salaries0`, a member it does not
 * publish. And the gateway defaulted any missing salary to the edited value,
 * so a single edit overwrote the other two.
 */

const props = (values: Record<string, string>): BuildingPropertyValue[] =>
  Object.entries(values).map(([name, value]) => ({ name, value }) as BuildingPropertyValue);

const WORKFORCE_COMMANDS: Record<string, RdoCommandMapping> = {
  Salaries: { command: 'RDOSetSalaries', allSalaries: true },
};

describe('resolveRdoCommand — allSalaries (M-C)', () => {
  it('maps Salaries0 to RDOSetSalaries instead of passing it through', () => {
    expect(resolveRdoCommand('Salaries0', WORKFORCE_COMMANDS)).toEqual({
      command: 'RDOSetSalaries',
      params: { index: '0' },
    });
  });

  it.each(['0', '1', '2'])('carries index %s', index => {
    expect(resolveRdoCommand(`Salaries${index}`, WORKFORCE_COMMANDS).params?.index).toBe(index);
  });

  // The regression sentinel: passthrough is what sent `call Salaries0`.
  it('never returns the raw property name as the command', () => {
    expect(resolveRdoCommand('Salaries0', WORKFORCE_COMMANDS).command).not.toBe('Salaries0');
  });
});

describe('collectSalaryTriplet', () => {
  const current = props({ Salaries0: '100', Salaries1: '200', Salaries2: '300' });

  it('replaces only the edited salary and preserves the other two', () => {
    expect(collectSalaryTriplet(current, '1', 250)).toEqual({
      salary0: '100',
      salary1: '250',
      salary2: '300',
    });
  });

  it.each([
    ['0', { salary0: '999', salary1: '200', salary2: '300' }],
    ['2', { salary0: '100', salary1: '200', salary2: '999' }],
  ])('edits index %s in place', (index, expected) => {
    expect(collectSalaryTriplet(current, index, 999)).toEqual(expected);
  });

  // This is the shape the old code produced by defaulting: all three equal to
  // the typed value. It must never come out of this function.
  it('does not flatten the triplet to the edited value', () => {
    const result = collectSalaryTriplet(current, '0', 777);
    expect(new Set(Object.values(result)).size).toBeGreaterThan(1);
  });

  it('treats a missing salary as 0 rather than dropping the key', () => {
    // The gateway refuses a partial triplet, so all three keys must be present
    // even when the building reports fewer.
    const partial = props({ Salaries0: '100' });
    expect(collectSalaryTriplet(partial, '0', 150)).toEqual({
      salary0: '150',
      salary1: '0',
      salary2: '0',
    });
  });
});

describe('buildSalaryParams / pendingKeyFor', () => {
  const current = props({ Salaries0: '100', Salaries1: '200', Salaries2: '300' });

  it('carries the edited index alongside the full triplet', () => {
    const resolved = resolveRdoCommand('Salaries1', WORKFORCE_COMMANDS);
    expect(buildSalaryParams(current, resolved.params, 250)).toEqual({
      index: '1',
      salary0: '100',
      salary1: '250',
      salary2: '300',
    });
  });

  it('defaults to index 0 when the mapping resolved no index', () => {
    expect(buildSalaryParams(current, undefined, 150).salary0).toBe('150');
  });

  /**
   * The workforce editor predicts this key to subscribe its save indicator;
   * building-action-handler builds the real one the same way. The literal is
   * the contract between them — key order included, since it goes through
   * JSON.stringify.
   */
  it('produces the key building-action-handler registers', () => {
    const resolved = resolveRdoCommand('Salaries1', WORKFORCE_COMMANDS);
    const params = buildSalaryParams(current, resolved.params, 250);
    expect(pendingKeyFor(resolved.command, params)).toBe(
      'RDOSetSalaries:{"index":"1","salary0":"100","salary1":"250","salary2":"300"}',
    );
  });

  it('leaves a parameterless command unsuffixed', () => {
    expect(pendingKeyFor('RDOAutoProduce')).toBe('RDOAutoProduce');
  });
});
