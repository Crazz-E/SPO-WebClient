/**
 * Lot L2 — WebSocket frontier allow-lists (P-H3 / P-M2).
 *
 * One handler lets the browser choose an RDO member name or object id:
 *   - REQ_BUILDING_SET_PROPERTY → `set <propertyName>` / `call <propertyName>`
 *     (building-property-handler.ts:147-174)
 *
 * Delphi's `ReadIdent` (RDOUtils.pas:127-145) stops at the first character
 * outside `[A-Za-z0-9_]` and the remainder is re-parsed as sub-commands
 * (RDOQueryServer.pas:133-160), so an unvalidated name is arbitrary method
 * invocation on the target object. These tests assert the request is rejected
 * BEFORE any session work happens.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { WebSocket } from 'ws';
import { WsMessageType, SessionPhase, type WsMessage } from '../../../shared/types';
import { handleBuildingSetProperty } from '../building-handlers';
import type { WsHandlerContext } from '../types';

interface Recorded {
  ctx: WsHandlerContext;
  sent: Array<Record<string, unknown>>;
  setBuildingProperty: jest.Mock;
  executeRdo: jest.Mock;
}

function createCtx(): Recorded {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    send(payload: string): void {
      sent.push(JSON.parse(payload) as Record<string, unknown>);
    },
  } as unknown as WebSocket;

  const setBuildingProperty = jest.fn(async () => ({ success: true, newValue: '1' }));
  const executeRdo = jest.fn(async () => 'res="#0"');

  const ctx = {
    ws,
    session: {
      setBuildingProperty,
      executeRdo,
      getPhase: (): SessionPhase => SessionPhase.WORLD_CONNECTED,
    },
  } as unknown as WsHandlerContext;

  return { ctx, sent, setBuildingProperty, executeRdo };
}

const lastError = (sent: Array<Record<string, unknown>>): Record<string, unknown> | undefined =>
  sent.find((m) => m.type === WsMessageType.RESP_ERROR);

describe('REQ_BUILDING_SET_PROPERTY — propertyName allow-list', () => {
  const HOSTILE = 'RDOAcceptCloning" call SellFacility "*" "';

  it('rejects a propertyName that is not a Delphi identifier', async () => {
    const r = createCtx();
    await handleBuildingSetProperty(r.ctx, {
      type: WsMessageType.REQ_BUILDING_SET_PROPERTY,
      wsRequestId: 'w1', x: 10, y: 20, propertyName: HOSTILE, value: '-1',
    } as unknown as WsMessage);

    expect(r.setBuildingProperty).not.toHaveBeenCalled();
    expect(lastError(r.sent)?.errorMessage).toContain('Invalid RDO identifier');
  });

  it('rejects a hostile additionalParams.propertyName', async () => {
    const r = createCtx();
    await handleBuildingSetProperty(r.ctx, {
      type: WsMessageType.REQ_BUILDING_SET_PROPERTY,
      wsRequestId: 'w2', x: 10, y: 20, propertyName: 'property', value: '1',
      additionalParams: { propertyName: HOSTILE },
    } as unknown as WsMessage);

    expect(r.setBuildingProperty).not.toHaveBeenCalled();
    expect(lastError(r.sent)?.errorMessage).toContain('additionalParams.propertyName');
  });

  it('lets a legitimate property through untouched', async () => {
    const r = createCtx();
    await handleBuildingSetProperty(r.ctx, {
      type: WsMessageType.REQ_BUILDING_SET_PROPERTY,
      wsRequestId: 'w3', x: 10, y: 20, propertyName: 'RDOAcceptCloning', value: '-1',
      additionalParams: { propertyName: 'RDOAcceptCloning' },
    } as unknown as WsMessage);

    expect(r.setBuildingProperty).toHaveBeenCalledWith(10, 20, 'RDOAcceptCloning', '-1', {
      propertyName: 'RDOAcceptCloning',
    });
    expect(lastError(r.sent)).toBeUndefined();
    expect(r.sent[0]?.type).toBe(WsMessageType.RESP_BUILDING_SET_PROPERTY);
  });

  it('leaves requests without additionalParams alone', async () => {
    const r = createCtx();
    await handleBuildingSetProperty(r.ctx, {
      type: WsMessageType.REQ_BUILDING_SET_PROPERTY,
      wsRequestId: 'w4', x: 1, y: 2, propertyName: 'RdoRepair', value: '0',
    } as unknown as WsMessage);

    expect(r.setBuildingProperty).toHaveBeenCalled();
    expect(lastError(r.sent)).toBeUndefined();
  });
});

