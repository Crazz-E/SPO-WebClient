/**
 * REQ_PROFILE_COMPANY_PROFITLOSS — one company's P&L, at the WebSocket frontier.
 *
 * A thrown failure (the gateway's "cannot be read" signal, or any transport
 * error) must answer the same typed response with `data: null` and an
 * `error`, never `RESP_ERROR` — the client's RESP_ERROR branch only logs and
 * routes to the search menu, so it could never clear the company view.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { WebSocket } from 'ws';
import { WsMessageType, type WsMessage } from '../../../shared/types';
import { handleProfileCompanyProfitLoss } from '../profile-handlers';
import type { WsHandlerContext } from '../types';

function createCtx(result: unknown) {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    send(payload: string): void {
      sent.push(JSON.parse(payload) as Record<string, unknown>);
    },
  } as unknown as WebSocket;

  const fn = jest.fn(async (...args: unknown[]): Promise<unknown> => {
    void args;
    if (result instanceof Error) throw result;
    return result;
  });

  const ctx = { ws, session: { fetchCompanyProfitLoss: fn } } as unknown as WsHandlerContext;
  return { ctx, sent, fn };
}

const msg = (over: Record<string, unknown>): WsMessage =>
  ({ type: WsMessageType.REQ_PROFILE_COMPANY_PROFITLOSS, wsRequestId: 'req-1', ...over }) as unknown as WsMessage;

describe('handleProfileCompanyProfitLoss', () => {
  it('forwards the company name and cluster and answers with the data', async () => {
    const tree = { root: { label: 'Net', level: 0, amount: '1', children: [] } };
    const r = createCtx(tree);

    await handleProfileCompanyProfitLoss(r.ctx, msg({ companyName: 'Yellow Inc.', cluster: 'PGI' }));

    expect(r.fn).toHaveBeenCalledWith('Yellow Inc.', 'PGI');
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_PROFILE_COMPANY_PROFITLOSS,
      wsRequestId: 'req-1',
      companyName: 'Yellow Inc.',
      data: tree,
    }]);
  });

  it('a thrown "no account tree" failure answers data: null + error, never RESP_ERROR', async () => {
    const r = createCtx(new Error('CompanyPage.asp carries no account tree for "Red Corp."'));

    await handleProfileCompanyProfitLoss(r.ctx, msg({ companyName: 'Red Corp.', cluster: 'PGI' }));

    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_PROFILE_COMPANY_PROFITLOSS,
      wsRequestId: 'req-1',
      companyName: 'Red Corp.',
      data: null,
      error: 'CompanyPage.asp carries no account tree for "Red Corp."',
    }]);
    expect(r.sent.every(s => s.type !== WsMessageType.RESP_ERROR)).toBe(true);
  });

  it('an empty company name answers data: null without calling the session', async () => {
    const r = createCtx({ root: { label: 'Net', level: 0, amount: '1', children: [] } });

    await handleProfileCompanyProfitLoss(r.ctx, msg({ companyName: '  ', cluster: 'PGI' }));

    expect(r.fn).not.toHaveBeenCalled();
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_PROFILE_COMPANY_PROFITLOSS,
      wsRequestId: 'req-1',
      companyName: '',
      data: null,
      error: 'A company name is required',
    }]);
  });
});
