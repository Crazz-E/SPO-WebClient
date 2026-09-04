/**
 * REQ_PROFILE_COMPANY_PROFITLOSS — one company's account tree, at the
 * WebSocket frontier.
 *
 * A failure here must never become RESP_ERROR: the client's RESP_ERROR
 * branch only logs and routes to the search menu, so it could never clear
 * a company drill-down waiting on this answer. The typed response carries
 * `data: null` and an `error` string instead.
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
  it('forwards the company name and cluster and answers with the parsed tree', async () => {
    const tree = { root: { label: 'Net Profit (losses)', level: 0, amount: '1250000' } };
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

  it('a thrown failure answers the same response type with data: null and no RESP_ERROR', async () => {
    const r = createCtx(new Error('CompanyPage.asp carries no account tree for "Red Corp."'));

    await handleProfileCompanyProfitLoss(r.ctx, msg({ companyName: 'Red Corp.', cluster: 'PGI' }));

    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_PROFILE_COMPANY_PROFITLOSS,
      wsRequestId: 'req-1',
      companyName: 'Red Corp.',
      data: null,
      error: 'CompanyPage.asp carries no account tree for "Red Corp."',
    }]);
    expect(r.sent.some(s => s.type === WsMessageType.RESP_ERROR)).toBe(false);
  });

  it('an empty company name answers data: null without calling the session', async () => {
    const r = createCtx({ root: {} });

    await handleProfileCompanyProfitLoss(r.ctx, msg({ companyName: '', cluster: 'PGI' }));

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
