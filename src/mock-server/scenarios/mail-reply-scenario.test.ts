/**
 * L1 protocol scenario — a reply send, from the WS request down to the frames.
 *
 * The claim under test is an ORDER, not a payload: a `REQ_MAIL_COMPOSE`
 * carrying a `headers` block must put `AddHeaders` on the wire before the first
 * `AddLine`, because the mail server appends header lines to the message that
 * is currently open (Mail Server/MailServer.pas:1002) and `Post` reads
 * `Header[MessageId]` back out of it (`:1062`).
 *
 * So this drives the real `composeMail` — not a re-implementation of it — with
 * the `mail-ws-003` request out of the mail scenario, and matches what it emits
 * against the scenario's own RDO exchanges (`mail-rdo-014` = AddHeaders,
 * `mail-rdo-003` = AddLine), through the strict validator.
 *
 * The two channels are distinct and that is the whole point: `AddHeaders` is a
 * `procedure`, written fire-and-forget with no QueryId (`fake.frames.mail`),
 * while `AddLine` is awaited (`fake.sent`). "Before" therefore means the frame
 * exists while `fake.sent` still holds nothing but `NewMail`.
 */

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RdoMock } from '../rdo-mock';
import { RdoStrictValidator } from '../rdo-strict-validator';
import { RdoProtocol } from '@/server/rdo';
import { composeMail } from '@/server/session/mail-handler';
import { makeSessionCtx } from '@/server/__tests__/session/fake-session-context';
import type { FakeSessionCtx, SentRequest } from '@/server/__tests__/session/fake-session-context';
import { createMailScenario, CAPTURED_MAIL_SEND, CAPTURED_MAIL_REPLY } from './mail-scenario';
import { DEFAULT_VARIABLES } from './scenario-variables';
import { RdoValue } from '@/shared/rdo-types';
import type { RdoPacket, WorldInfo } from '@/shared/types';
import type { WsReqMailCompose } from '@/shared/types/message-types';

const WORLD: WorldInfo = {
  name: DEFAULT_VARIABLES.worldName,
  url: 'http://158.69.153.134',
  ip: '158.69.153.134',
  port: 7000,
};

const scenario = createMailScenario();

/** The `REQ_MAIL_COMPOSE` the scenario captured for a reply, headers and all. */
function scenarioRequest(id: string): WsReqMailCompose {
  const exchange = scenario.ws.exchanges.find(e => e.id === id);
  if (!exchange) throw new Error(`missing WS exchange ${id}`);
  return exchange.request as unknown as WsReqMailCompose;
}

function membersOf(sent: SentRequest[]): string[] {
  return sent.map(s => s.packet.member ?? '');
}

/** Answers NewMail with the captured message id and Post with success. */
function answerCompose(fake: FakeSessionCtx): void {
  fake.respond((p: Partial<RdoPacket>) => {
    if (p.member === 'NewMail') return `NewMail="#${CAPTURED_MAIL_SEND.messageId}"`;
    if (p.member === 'Post') return `Post="#-1"`;
    return '';
  });
}

describe('L1: mail reply — AddHeaders precedes AddLine', () => {
  let rdoMock: RdoMock;
  let validator: RdoStrictValidator;

  beforeEach(() => {
    jest.useFakeTimers();
    rdoMock = new RdoMock();
    validator = new RdoStrictValidator();
    rdoMock.addScenario(scenario.rdo);
    validator.addScenario(scenario.rdo);
  });

  afterEach(() => {
    jest.useRealTimers();
    const errors = validator.getErrors();
    if (errors.length > 0) {
      throw new Error(validator.formatReport());
    }
  });

  it('a REQ_MAIL_COMPOSE carrying headers emits AddHeaders while AddLine has not been issued', async () => {
    const req = scenarioRequest('mail-ws-003');
    expect(req.headers).toBe(CAPTURED_MAIL_REPLY.headers);

    const fake = makeSessionCtx({
      sockets: ['mail'],
      mailAccount: DEFAULT_VARIABLES.mailAccount,
      currentWorldInfo: WORLD,
    });
    answerCompose(fake);

    const pending = composeMail(fake.ctx, req.to, req.subject, req.body, req.headers);

    // The AddHeaders frame is written as soon as NewMail has answered, then the
    // handler parks — so at this instant nothing has been *sent* but NewMail.
    await jest.advanceTimersByTimeAsync(0);
    expect(fake.frames.mail).toHaveLength(1);
    expect(membersOf(fake.sent)).toEqual(['NewMail']);

    const headerFrame = fake.frames.mail[0];
    validator.validate(RdoProtocol.parse(headerFrame), headerFrame);
    const headerMatch = rdoMock.match(headerFrame);
    expect(headerMatch).not.toBeNull();
    expect(headerMatch!.exchange.id).toBe('mail-rdo-014');

    // The whole block travels as one OLEString argument, line breaks intact —
    // the form Voyager itself emitted (MsgComposerHandler.pas:370).
    expect(headerFrame).toContain(RdoValue.string(CAPTURED_MAIL_REPLY.headers).format());
    expect(headerFrame).toContain('In-Reply-To=');
    expect(headerFrame).toContain('"*"');

    // Only now does the body follow.
    await jest.advanceTimersByTimeAsync(50);
    expect(await pending).toBe(true);
    expect(membersOf(fake.sent)).toEqual(['NewMail', 'AddLine', 'Post', 'CloseMessage']);

    const addLineFrame = RdoProtocol.format({
      raw: '', type: 'REQUEST', rid: 2174, ...fake.sent[1].packet,
    } as RdoPacket);
    validator.validate(RdoProtocol.parse(addLineFrame), addLineFrame);
    const lineMatch = rdoMock.match(addLineFrame);
    expect(lineMatch).not.toBeNull();
    expect(lineMatch!.exchange.id).toBe('mail-rdo-003');
    expect(addLineFrame).toContain(RdoValue.string(CAPTURED_MAIL_REPLY.body).format());
  });

  it('the same compose without headers writes nothing on the fire-and-forget channel', async () => {
    const req = scenarioRequest('mail-ws-001');
    expect(req.headers).toBeUndefined();

    const fake = makeSessionCtx({
      sockets: ['mail'],
      mailAccount: DEFAULT_VARIABLES.mailAccount,
      currentWorldInfo: WORLD,
    });
    answerCompose(fake);

    expect(await composeMail(fake.ctx, req.to, req.subject, req.body, req.headers)).toBe(true);
    expect(fake.frames.mail).toHaveLength(0);
    expect(membersOf(fake.sent)).toEqual(['NewMail', 'AddLine', 'Post', 'CloseMessage']);
  });
});
