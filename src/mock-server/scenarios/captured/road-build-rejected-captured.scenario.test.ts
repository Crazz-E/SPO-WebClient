/**
 * Validation for the captured road-build rejection scenario (live planitia,
 * 2026-07-03, SPO_test3 without an office role).
 *
 * Protocol evidence captured here: a placement-refused CreateCircuitSeg does
 * NOT come back as an RDO error frame — the server answers normally with the
 * ordinal result `res="#22"` (surfaced to the user as "Cannot build a road at
 * this location — area may be occupied or restricted").
 */

import { describe, it, expect } from '@jest/globals';
import { resolveScenarioVariables } from '../../log-capture-converter';
import { roadBuildRejectedCapturedScenario } from './road-build-rejected-captured.scenario';

const resolved = resolveScenarioVariables(roadBuildRejectedCapturedScenario);
const roadCalls = resolved.exchanges.filter(
  e => e.matchKeys?.member === 'CreateCircuitSeg'
);

describe('road-build-rejected captured scenario', () => {
  it('captured both build attempts', () => {
    expect(roadCalls).toHaveLength(2);
  });

  it('CreateCircuitSeg request shape: sync call with 7 ordinal args (type, ownerId, x1, y1, x2, y2, cost)', () => {
    for (const call of roadCalls) {
      expect(call.request).toMatch(
        /call CreateCircuitSeg "\^" "#1","#\d+","#\d+","#\d+","#\d+","#\d+","#2000000"$/
      );
    }
  });

  it('attempts target the verified tiles adjacent to the existing road', () => {
    expect(roadCalls[0].request).toContain('"#955","#1000","#955","#1001"');
    expect(roadCalls[1].request).toContain('"#954","#998","#954","#997"');
  });

  it('placement refusal is the ordinal result #22, not an RDO error frame', () => {
    for (const call of roadCalls) {
      expect(call.response).toMatch(/^A\d+ res="#22"$/);
    }
  });
});
