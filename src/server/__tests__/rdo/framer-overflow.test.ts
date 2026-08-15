import { RdoFramer } from '../../rdo';

/**
 * P-L6 — buffer overflow used to discard complete frames along with the tail.
 *
 * Overflow means one frame never terminated. Everything before its start is
 * intact and parseable; wiping the whole buffer threw those away too. The
 * responses lost that way belonged to requests that then sat until their full
 * 180 s timeout, surfacing as "the server is slow" (see P-L7).
 */

const MAX = 5 * 1024 * 1024;

function frame(rid: number, payload: string): string {
  return `A${rid} res="%${payload}";`;
}

describe('RdoFramer overflow (P-L6)', () => {
  it('keeps complete frames that precede an unterminated tail', () => {
    const framer = new RdoFramer();

    // Three good frames, then a frame that never terminates and blows the cap.
    const good = frame(1, 'one') + frame(2, 'two') + frame(3, 'three');
    const runaway = `A4 res="%${'x'.repeat(MAX)}`;

    const messages = framer.ingest(Buffer.from(good + runaway, 'latin1'));

    // The regression: this used to be [].
    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain('one');
    expect(messages[2]).toContain('three');
  });

  it('drops the unterminated tail rather than carrying it into the next frame', () => {
    const framer = new RdoFramer();
    framer.ingest(Buffer.from(frame(1, 'one') + `A2 res="%${'x'.repeat(MAX)}`, 'latin1'));

    // A well-formed frame arriving next must parse cleanly — proof the corrupt
    // tail was not left glued to the head of the buffer.
    const next = framer.ingest(Buffer.from(frame(9, 'after'), 'latin1'));
    expect(next).toHaveLength(1);
    expect(next[0]).toContain('after');
    expect(next[0]).not.toContain('xxx');
  });

  it('discards everything when the overflow contains no frame boundary at all', () => {
    const framer = new RdoFramer();
    const messages = framer.ingest(Buffer.from(`A1 res="%${'x'.repeat(MAX + 10)}`, 'latin1'));

    expect(messages).toEqual([]);
    // And the framer stays usable afterwards.
    expect(framer.ingest(Buffer.from(frame(2, 'ok'), 'latin1'))).toHaveLength(1);
  });

  it('leaves a normal-sized stream untouched', () => {
    const framer = new RdoFramer();
    const messages = framer.ingest(Buffer.from(frame(1, 'a') + frame(2, 'b'), 'latin1'));
    expect(messages).toHaveLength(2);
  });
});
