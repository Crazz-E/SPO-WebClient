import { deleteFacility } from './building-management-handler';
import { setBuildingProperty } from './building-property-handler';
import type { SessionContext } from './session-context';
import type { RdoPacket } from '../../shared/types';

/**
 * The mutation layer — audit findings M-B, M-C, M-D, M-E.
 *
 * Every one of these was the same defect wearing a different hat: the gateway
 * reported success without establishing that anything had happened. These tests
 * drive the real handlers, so they fail if the reporting goes back to being
 * optimistic.
 */

function makeCtx(overrides: Partial<Record<string, unknown>> = {}): {
  ctx: SessionContext;
  sent: Array<{ member?: string; args?: unknown[] }>;
  frames: string[];
} {
  const sent: Array<{ member?: string; args?: unknown[] }> = [];
  const frames: string[] = [];

  const ctx = {
    worldId: '30430748',
    log: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
    clearBuildingFocus: jest.fn(),
    connectConstructionService: jest.fn().mockResolvedValue(undefined),
    connectMapService: jest.fn().mockResolvedValue(undefined),
    cacherCreateObject: jest.fn().mockResolvedValue('temp-1'),
    cacherSetObject: jest.fn().mockResolvedValue(undefined),
    cacherCloseObject: jest.fn().mockResolvedValue(undefined),
    cacherGetPropertyList: jest.fn().mockResolvedValue(['8161308', '8161308']),
    // writeRdoFrame writes a latin1 Buffer, not a string — the L1 codec sits on
    // this path. Decode so assertions read the actual bytes on the wire.
    getSocket: jest.fn().mockReturnValue({
      write: (f: Buffer | string) => {
        frames.push(Buffer.isBuffer(f) ? f.toString('latin1') : f);
        return true;
      },
    }),
    sendRdoRequest: jest.fn(async (_s: string, packet: Record<string, unknown>) => {
      sent.push({ member: packet.member as string, args: packet.args as unknown[] });
      return { payload: 'res="#0"' } as RdoPacket;
    }),
    ...overrides,
  } as unknown as SessionContext;

  return { ctx, sent, frames };
}

// =============================================================================
// M-B — deleteFacility ignored the return code
// =============================================================================
describe('deleteFacility (M-B)', () => {
  it('reports success when the server answers NOERROR', async () => {
    const { ctx } = makeCtx();

    const result = await deleteFacility(ctx, 100, 200);

    expect(result.success).toBe(true);
    expect(ctx.clearBuildingFocus).toHaveBeenCalled();
  });

  // The defect: the reply was logged, never read. A refused demolition was
  // reported as done, and the client removed the building from the map.
  it('reports failure when the server refuses, and keeps the focus', async () => {
    const { ctx } = makeCtx({
      sendRdoRequest: jest.fn().mockResolvedValue({ payload: 'res="#33"' } as RdoPacket),
    });

    const result = await deleteFacility(ctx, 100, 200);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/refused/i);
    expect(ctx.clearBuildingFocus).not.toHaveBeenCalled();
  });

  it('treats an unparseable reply as a failure, not a success', async () => {
    const { ctx } = makeCtx({
      sendRdoRequest: jest.fn().mockResolvedValue({ payload: '' } as RdoPacket),
    });

    expect((await deleteFacility(ctx, 100, 200)).success).toBe(false);
  });
});

// =============================================================================
// M-D — any unmapped name went to the wire verbatim
// =============================================================================
describe('setBuildingProperty — unknown commands (M-D)', () => {
  it('refuses a command it cannot build arguments for', async () => {
    const { ctx, frames } = makeCtx();

    const result = await setBuildingProperty(ctx, 10, 20, 'NotARealCommand', '1');

    expect(result.success).toBe(false);
    expect(frames).toEqual([]); // nothing reached the wire
  });

  // Salaries0 is the concrete case: it fell through the mapping (M-C) and was
  // sent as `call Salaries0`, a member the server does not publish. Silently.
  it('refuses Salaries0 — the exact name the workforce editor used to emit', async () => {
    const { ctx, frames } = makeCtx();

    const result = await setBuildingProperty(ctx, 10, 20, 'Salaries0', '500');

    expect(result.success).toBe(false);
    expect(frames).toEqual([]);
  });
});

// =============================================================================
// M-C — the whole salary triplet, or nothing
// =============================================================================
describe('setBuildingProperty — RDOSetSalaries (M-C)', () => {
  // The old fallback was `params.salaryN || value`, so editing one salary wrote
  // the typed value into ALL THREE. The two untouched salaries were overwritten
  // with no indication whatsoever.
  it('refuses a partial triplet rather than overwriting the other two', async () => {
    const { ctx, frames } = makeCtx();

    const result = await setBuildingProperty(ctx, 10, 20, 'RDOSetSalaries', '500', {
      salary0: '500',
    });

    expect(result.success).toBe(false);
    expect(frames).toEqual([]);
  });

  it('accepts the full triplet and sends all three values', async () => {
    const { ctx, frames } = makeCtx();

    await setBuildingProperty(ctx, 10, 20, 'RDOSetSalaries', '500', {
      salary0: '500', salary1: '600', salary2: '700',
    });

    expect(frames).toHaveLength(1);
    expect(frames[0]).toContain('"#500"');
    expect(frames[0]).toContain('"#600"');
    expect(frames[0]).toContain('"#700"');
  });
});

// =============================================================================
// M-E — the read-back echoed the requested value
// =============================================================================
describe('setBuildingProperty — confirmation (M-E)', () => {
  it('reports the value the server holds, not the one we asked for', async () => {
    const { ctx } = makeCtx({
      cacherGetPropertyList: jest.fn()
        .mockResolvedValueOnce(['8161308', '8161308']) // CurrBlock / ObjectId
        .mockResolvedValueOnce(['42']),                // read-back
    });

    const result = await setBuildingProperty(ctx, 10, 20, 'RDOAutoProduce', '99');

    expect(result.newValue).toBe('42');
    expect(result.confirmed).toBe(true);
  });

  // The regression sentinel. `readValues[0] || value` returned '99' here — the
  // value we had just asked for — making a discarded mutation indistinguishable
  // from an applied one.
  it('does not echo the requested value when the read-back is empty', async () => {
    const { ctx } = makeCtx({
      cacherGetPropertyList: jest.fn()
        .mockResolvedValueOnce(['8161308', '8161308'])
        .mockResolvedValueOnce([]),
    });

    const result = await setBuildingProperty(ctx, 10, 20, 'RDOAutoProduce', '99');

    expect(result.newValue).not.toBe('99');
    expect(result.newValue).toBe('');
    expect(result.confirmed).toBe(false);
  });

  it('warns when it cannot confirm, so the gap is visible in the logs', async () => {
    const { ctx } = makeCtx({
      cacherGetPropertyList: jest.fn()
        .mockResolvedValueOnce(['8161308', '8161308'])
        .mockResolvedValueOnce(['']),
    });

    await setBuildingProperty(ctx, 10, 20, 'RDOAutoProduce', '99');

    expect(ctx.log.warn).toHaveBeenCalledWith(expect.stringMatching(/could not be confirmed/));
  });
});
