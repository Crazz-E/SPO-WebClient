/// <reference path="../matchers/rdo-matchers.d.ts" />
/**
 * L1 proof for the people-search fix (#455): a search for a known alias must
 * actually come back, and the `ValueNameList` argument of `RDOSearchKey` must
 * never be emitted empty (`TDirectoryManager.SearchKey`,
 * `DirectoryManager.pas:976`, skips its whole body when `valueNames.Count == 0`).
 *
 * Same harness as `rdo-boundary-hardening.test.ts` §4: a real `StarpeaceSession`,
 * a mocked `sendRdoRequest` responder, and the writes it fires fire-and-forget
 * re-framed by `RdoFramer` / `RdoProtocol` for wire-level assertions.
 */

import type { Socket } from 'net';
import type { RdoPacket } from '../../../shared/types';
import { RDO_CONSTANTS, RdoVerb } from '../../../shared/types';
import type { RdoScenario } from '../../../mock-server/types/rdo-exchange-types';
import { RdoFramer, RdoProtocol } from '../../rdo';
import { writeRdoFrame } from '../../rdo-helpers';
import { StarpeaceSession } from '../../spo_session';

const DIRECTORY_SERVER_ID = '39751288';
const DIRECTORY_SESSION_ID = '142217260';

/** A capture socket: every `writeRdoFrame` lands in `writes`, nothing else. */
function makeCaptureSocket(writes: Buffer[]): Socket {
  return {
    write(chunk: Buffer | string): boolean {
      writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'latin1'));
      return true;
    },
    end(): void { /* no-op */ },
    destroyed: false,
  } as unknown as Socket;
}

/**
 * Wires a `StarpeaceSession` to a responder that can see which bucket the
 * last `RDOSetCurrentKey` selected, so `RDOSearchKey` answers can depend on it.
 */
function makeSearchSession(searchBlockForBucket: (bucket: string) => string | undefined): {
  session: StarpeaceSession;
  writes: Buffer[];
} {
  const writes: Buffer[] = [];
  const socket = makeCaptureSocket(writes);
  const session = new StarpeaceSession();
  jest.spyOn(session, 'createSocket').mockResolvedValue(socket);
  jest.spyOn(session, 'deleteSocket').mockImplementation(() => undefined);

  let rid = 1;
  let currentBucket = '';
  jest.spyOn(session, 'sendRdoRequest').mockImplementation(
    async (_n: string, pd: Partial<RdoPacket>): Promise<RdoPacket> => {
      const packet = { ...pd, rid: rid++ } as RdoPacket;
      writeRdoFrame(socket, RdoProtocol.format(packet) + RDO_CONSTANTS.PACKET_DELIMITER, true);

      let payload: string;
      if (pd.verb === RdoVerb.IDOF) {
        payload = `objid="${DIRECTORY_SERVER_ID}"`;
      } else if (pd.member === 'RDOOpenSession') {
        payload = `RDOOpenSession="#${DIRECTORY_SESSION_ID}"`;
      } else if (pd.member === 'RDOSetCurrentKey') {
        currentBucket = String(pd.args?.[0] ?? '').replace(/^"%/, '').replace(/"$/, '');
        payload = 'res="#-1"';
      } else if (pd.member === 'RDOSearchKey') {
        const block = searchBlockForBucket(currentBucket);
        payload = block === undefined ? 'res="%"' : `res="%${block}"`;
      } else {
        payload = 'res="%"';
      }
      return { raw: '', type: 'RESPONSE', rid: packet.rid, payload };
    },
  );

  return { session, writes };
}

describe('people search — known alias round-trip', () => {
  afterEach(() => jest.restoreAllMocks());

  it('finds a known alias', async () => {
    const { session } = makeSearchSession(
      bucket => (bucket === 'Root/Users/C' ? 'Count=1\nKey0=crazz\nAlias0=Crazz' : undefined),
    );

    await expect(session.searchPeople('Crazz')).resolves.toEqual(['Crazz']);
  });
});

describe('people search — ValueNameList is never emitted empty', () => {
  afterEach(() => jest.restoreAllMocks());

  function searchFrames(writes: Buffer[]): string[] {
    return new RdoFramer().ingest(Buffer.concat(writes))
      .filter(f => RdoProtocol.parse(f).member === 'RDOSearchKey');
  }

  it.each([
    ['single-character search', 'c'],
    ['multi-character search', 'test'],
  ])('every RDOSearchKey frame carries "%%Alias\\n" (%s)', async (_label, searchStr) => {
    const { session, writes } = makeSearchSession(() => 'Count=0');

    await session.searchPeople(searchStr);

    const frames = searchFrames(writes);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame).toContain('"%Alias\n"');
      expect(frame).not.toContain('","%"');
    }

    const scenario: RdoScenario = {
      name: 'people-search',
      description: 'RDOSearchKey frames emitted by searchPeople',
      variables: {},
      exchanges: frames.map((request, i) => ({
        id: `people-search-${i}`,
        request,
        response: '',
      })),
    };
    expect(scenario).toPassStrictRdoValidation();
  });
});
