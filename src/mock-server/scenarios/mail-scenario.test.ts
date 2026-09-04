/// <reference path="../../server/__tests__/matchers/rdo-matchers.d.ts" />
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

/**
 * The mail read path at the WS frontier, driven through the L1 substrate.
 *
 * Proves the one fact the plan for issue 504 turns on: reading an Inbox
 * message produces the RDO read sequence plus exactly one header-touching
 * HTTP GET (MessageBody.asp, `mail-http-005`); the same request for a Draft
 * produces none. Everything upstream of `readMailMessage` — the WS handler,
 * the session context — is exercised for real; only the socket and the fetch
 * are mocked, through `RdoMock` / `HttpMock`.
 */

import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import type { WebSocket } from 'ws';
import { RdoProtocol } from '@/server/rdo';
import type { RdoPacket } from '@/shared/types/protocol-types';
import { WsMessageType, type WsMessage } from '@/shared/types';
import { RdoValue, RdoCommand } from '@/shared/rdo-types';
import { readMailMessage as readMailMessageHandler, composeMail as composeMailHandler } from '@/server/session/mail-handler';
import { handleMailReadMessage, handleMailCompose } from '@/server/ws-handlers/mail-handlers';
import type { WsHandlerContext } from '@/server/ws-handlers/types';
import { makeSessionCtx } from '@/server/__tests__/session/fake-session-context';
import { RdoMock } from '../rdo-mock';
import { HttpMock } from '../http-mock';
import type { RdoScenario } from '../types/rdo-exchange-types';
import { createMailScenario, CAPTURED_MAIL_SEND } from './mail-scenario';
import { DEFAULT_VARIABLES } from './scenario-variables';

const mockFetch = fetch as unknown as jest.MockedFunction<
  (url: string, init?: unknown) => Promise<Response>
>;

const { rdo, http } = createMailScenario();

function membersOf(sent: string[]): string[] {
  return sent.map(cmd => RdoProtocol.parse(cmd).member ?? '');
}

/** Drives `handleMailReadMessage` / `handleMailCompose` through a fresh RdoMock/HttpMock pair. */
function drive(scenario: { rdo: RdoScenario; http: typeof http } = { rdo, http }) {
  const rdoMock = new RdoMock();
  rdoMock.addScenario(scenario.rdo);
  const httpMock = new HttpMock();
  httpMock.addScenario(scenario.http);

  mockFetch.mockImplementation(async (url: string) => {
    const result = httpMock.match('GET', url);
    if (!result) return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    return { ok: result.status === 200, status: result.status, text: async () => result.body } as unknown as Response;
  });

  const sentCommands: string[] = [];
  let nextRid = 3000;

  const fake = makeSessionCtx({
    sockets: ['mail'],
    mailAccount: DEFAULT_VARIABLES.mailAccount,
    mailServerId: DEFAULT_VARIABLES.mailServerId,
    currentWorldInfo: {
      name: DEFAULT_VARIABLES.worldName,
      url: DEFAULT_VARIABLES.worldUrl,
      ip: DEFAULT_VARIABLES.worldIp,
      port: DEFAULT_VARIABLES.worldPort,
    },
  });
  fake.respond((packet) => {
    const rid = nextRid++;
    const command = RdoProtocol.format({ ...packet, raw: '', type: 'REQUEST', rid } as RdoPacket);
    sentCommands.push(command);
    const result = rdoMock.match(command);
    if (!result) throw new Error(`L1: no exchange for ${command}`);
    return result.response.replace(/^A\d+\s*/, '');
  });

  const sentResponses: WsMessage[] = [];
  const ws = {
    send: jest.fn((payload: string) => { sentResponses.push(JSON.parse(payload) as WsMessage); }),
  } as unknown as WebSocket;

  const wsCtx = {
    ws,
    session: {
      readMailMessage: (folder: string, messageId: string) =>
        readMailMessageHandler(fake.ctx, folder, messageId),
      composeMail: (to: string, subject: string, body: string[], headers?: string, existingDraftId?: string) =>
        composeMailHandler(fake.ctx, to, subject, body, headers, existingDraftId),
    },
  } as unknown as WsHandlerContext;

  return { wsCtx, sentCommands, sentResponses, sentFrames: fake.frames.mail };
}

const request = (folder: string, messageId: string): WsMessage => ({
  type: WsMessageType.REQ_MAIL_READ_MESSAGE,
  wsRequestId: 'req-1',
  folder,
  messageId,
}) as unknown as WsMessage;

describe('mail-scenario — readMailMessage at the WS frontier', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('passes strict RDO validation', () => {
    expect(rdo).toPassStrictRdoValidation();
  });

  it('an Inbox read runs the RDO sequence and touches MessageBody.asp exactly once', async () => {
    const { wsCtx, sentCommands, sentResponses } = drive();

    await handleMailReadMessage(wsCtx, request('Inbox', 'MSG-77'));

    expect(membersOf(sentCommands)).toEqual([
      'OpenMessage', 'GetHeaders', 'GetLines', 'GetAttachmentCount', 'CloseMessage',
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    const httpMock = new HttpMock();
    httpMock.addScenario(http);
    const matched = httpMock.match('GET', url);
    expect(matched?.exchange.id).toBe('mail-http-005');
    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0]).toMatchObject({ type: WsMessageType.RESP_MAIL_MESSAGE, wsRequestId: 'req-1' });
  });

  it('a Draft read runs the same RDO sequence and touches nothing over HTTP', async () => {
    const { wsCtx, sentCommands, sentResponses } = drive();

    await handleMailReadMessage(wsCtx, request('Draft', 'MSG-77'));

    expect(membersOf(sentCommands)).toEqual([
      'OpenMessage', 'GetHeaders', 'GetLines', 'GetAttachmentCount', 'CloseMessage',
    ]);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0]).toMatchObject({ type: WsMessageType.RESP_MAIL_MESSAGE, wsRequestId: 'req-1' });
  });
});

const composeRequest = (existingDraftId?: string): WsMessage => ({
  type: WsMessageType.REQ_MAIL_COMPOSE,
  wsRequestId: 'compose-1',
  to: CAPTURED_MAIL_SEND.to,
  subject: CAPTURED_MAIL_SEND.subject,
  body: [CAPTURED_MAIL_SEND.body],
  ...(existingDraftId ? { existingDraftId } : {}),
}) as unknown as WsMessage;

describe('mail-scenario — composeMail at the WS frontier', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('passes strict RDO validation', () => {
    expect(rdo).toPassStrictRdoValidation();
  });

  it('an existingDraftId with a successful Post fires DeleteMessage on Draft before CloseMessage', async () => {
    const { wsCtx, sentCommands, sentResponses, sentFrames } = drive();

    await handleMailCompose(wsCtx, composeRequest('DRAFT-9'));

    expect(membersOf(sentCommands)).toEqual(['NewMail', 'AddLine', 'Post', 'CloseMessage']);
    const expectedFrame = RdoCommand.sel(DEFAULT_VARIABLES.mailServerId).call('DeleteMessage').push()
      .args(
        RdoValue.string(DEFAULT_VARIABLES.worldName),
        RdoValue.string(DEFAULT_VARIABLES.mailAccount),
        RdoValue.string('Draft'),
        RdoValue.string('DRAFT-9'),
      ).build();
    expect(sentFrames).toEqual([expectedFrame]);

    const rdoMock = new RdoMock();
    rdoMock.addScenario(rdo);
    const matched = rdoMock.match(sentFrames[0]);
    expect(matched?.exchange.id).toBe('mail-rdo-008');

    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0]).toMatchObject({ type: WsMessageType.RESP_MAIL_SENT, wsRequestId: 'compose-1', success: true });
  });

  it('an existingDraftId with a failing Post fires no DeleteMessage and reports the failure', async () => {
    const scenario = createMailScenario(undefined, { postSucceeds: false });
    const { wsCtx, sentCommands, sentResponses, sentFrames } = drive({ rdo: scenario.rdo, http: scenario.http });

    await handleMailCompose(wsCtx, composeRequest('DRAFT-9'));

    expect(membersOf(sentCommands)).toEqual(['NewMail', 'AddLine', 'Post', 'CloseMessage']);
    expect(sentFrames).toEqual([]);
    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0]).toMatchObject({ type: WsMessageType.RESP_MAIL_SENT, wsRequestId: 'compose-1', success: false });
  });

  it('no existingDraftId fires no DeleteMessage even on a successful Post', async () => {
    const { wsCtx, sentCommands, sentResponses, sentFrames } = drive();

    await handleMailCompose(wsCtx, composeRequest());

    expect(membersOf(sentCommands)).toEqual(['NewMail', 'AddLine', 'Post', 'CloseMessage']);
    expect(sentFrames).toEqual([]);
    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0]).toMatchObject({ type: WsMessageType.RESP_MAIL_SENT, wsRequestId: 'compose-1', success: true });
  });
});
