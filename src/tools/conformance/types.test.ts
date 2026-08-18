/**
 * `types.ts` is mostly types; what it also carries is the reading of a step's
 * risk, and that reading decides which flag a frame needs before it reaches a
 * live server. It is worth its own test for one reason: since 2026-08-18 a step
 * can declare SEVERAL risk classes, and a reader that only ever looked at the
 * first would let wave 2 of the sweep — `"^"` on unadjudicated members, on a
 * live account — run without `--allow-mutations`.
 */

import { StepSkip, hasRisk, isImperativeStep, stepRisks } from './types';
import type { ImperativeStep, RdoStep } from './types';
import { RdoAction, RdoVerb } from '../../shared/types';

describe('stepRisks', () => {
  it('reads a bare string as a list of one', () => {
    expect(stepRisks({ risk: 'mutation' })).toEqual(['mutation']);
  });

  it('reads a list as itself', () => {
    expect(stepRisks({ risk: ['mutation', 'variant-on-procedure'] })).toEqual(['mutation', 'variant-on-procedure']);
  });

  it('reads a step that declares nothing as declaring nothing', () => {
    expect(stepRisks({})).toEqual([]);
    expect(stepRisks({ risk: undefined })).toEqual([]);
  });
});

describe('hasRisk', () => {
  // The point of the whole change: a step that is BOTH must answer yes to both,
  // or one of the two gates lets it through unannounced.
  it('sees every class a step declares, not just the first', () => {
    const both = { risk: ['mutation', 'variant-on-procedure'] } as const;
    expect(hasRisk(both, 'mutation')).toBe(true);
    expect(hasRisk(both, 'variant-on-procedure')).toBe(true);
    expect(hasRisk(both, 'read')).toBe(false);
  });

  it('still works on the single-class form the catalogue was written with', () => {
    expect(hasRisk({ risk: 'variant-on-procedure' }, 'variant-on-procedure')).toBe(true);
    expect(hasRisk({ risk: 'variant-on-procedure' }, 'mutation')).toBe(false);
    expect(hasRisk({}, 'mutation')).toBe(false);
  });
});

describe('isImperativeStep', () => {
  const declarative: RdoStep = {
    id: 'd', intent: 'declarative', target: 'clientView',
    packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'UserName' },
  };
  const imperative: ImperativeStep = {
    id: 'i', intent: 'imperative', run: () => Promise.resolve({ response: '', elapsedMs: 0 }),
  };

  it('splits the two shapes by the presence of run()', () => {
    expect(isImperativeStep(imperative)).toBe(true);
    expect(isImperativeStep(declarative)).toBe(false);
  });
});

describe('StepSkip', () => {
  it('carries its reason and is recognisable across the runner boundary', () => {
    const skip = new StepSkip('the account owns no park');
    expect(skip).toBeInstanceOf(Error);
    expect(skip.name).toBe('StepSkip');
    expect(skip.message).toBe('the account owns no park');
  });
});
