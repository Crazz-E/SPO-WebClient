/**
 * REQ_SEARCH_MENU_PEOPLE_SEARCH at the WebSocket frontier.
 *
 * The handler forwards the search string straight to the session (which now
 * owns the RDO lookup, rather than the search menu service) and echoes the
 * results back as RESP_SEARCH_MENU_PEOPLE_SEARCH.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { WebSocket } from 'ws';
import { WsMessageType, type WsMessage } from '../../../shared/types';
import { handleSearchMenuPeopleSearch } from '../search-handlers';
import type { WsHandlerContext } from '../types';

interface Recorded {
  ctx: WsHandlerContext;
  sent: Array<Record<string, unknown>>;
  searchPeople: jest.Mock;
}

function createCtx(results: string[] = []): Recorded {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    send(payload: string): void {
      sent.push(JSON.parse(payload) as Record<string, unknown>);
    },
  } as unknown as WebSocket;

  const searchPeople = jest.fn(async () => results);

  const ctx = { ws, session: { searchPeople } } as unknown as WsHandlerContext;
  return { ctx, sent, searchPeople };
}

const request = (over: Partial<Record<string, unknown>> = {}): WsMessage => ({
  type: WsMessageType.REQ_SEARCH_MENU_PEOPLE_SEARCH,
  wsRequestId: '123',
  searchStr: 'mayor',
  ...over,
}) as unknown as WsMessage;

describe('handleSearchMenuPeopleSearch', () => {
  it('calls session.searchPeople and returns results', async () => {
    const { ctx, sent, searchPeople } = createCtx(['Tycoon1', 'Tycoon2']);

    await handleSearchMenuPeopleSearch(ctx, request());

    expect(searchPeople).toHaveBeenCalledWith('mayor');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH,
      wsRequestId: '123',
      results: ['Tycoon1', 'Tycoon2'],
    });
  });
});
