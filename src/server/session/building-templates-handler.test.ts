import { placeBuilding, placeCapitol } from './building-templates-handler';
import type { SessionContext } from './session-context';
import type { RdoPacket } from '../../shared/types';

// =============================================================================
// placeBuilding / placeCapitol — M-A regression
//
// These call the REAL handler against a mocked RDO transport, unlike the
// synthetic-packet suites in __tests__/protocol-validation/, which assert
// hand-built command strings and therefore never observe the return value.
// See report/rdo-audit-2026-08-14.md §5 (M-A) and §7 (test blind spots).
// =============================================================================

/** Minimal SessionContext satisfying what the two placement handlers touch. */
function makeCtx(payload: string): { ctx: SessionContext; sendRdoRequest: jest.Mock } {
  const sendRdoRequest = jest.fn().mockResolvedValue({ payload } as RdoPacket);
  const ctx = {
    worldContextId: 8161308,
    currentCompany: { id: '618' },
    log: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    sendRdoRequest,
  } as unknown as SessionContext;
  return { ctx, sendRdoRequest };
}

describe('placeBuilding', () => {
  // The captured live response for a successful placement is `A147 res="#0";`
  // — doc/Mock_Server_scenarios_captures.md:3399-3400. It carries no building id.
  it('reports success with a null id — the protocol never returns one', async () => {
    const { ctx } = makeCtx('res="#0"');

    const result = await placeBuilding(ctx, 'PGISupermarketC', 28, 618);

    expect(result).toEqual({ success: true, buildingId: null });
  });

  // Guards the exact defect: a `/sel (\d+)/` match against the RESPONSE. `sel`
  // only ever appears in REQUESTS, so any payload echoing one must still yield
  // null rather than a plausible-looking id scraped out of the wrong frame.
  it('does not scrape an id out of a payload that happens to contain "sel"', async () => {
    const { ctx } = makeCtx('res="#0" sel 30430748');

    const result = await placeBuilding(ctx, 'PGISupermarketC', 28, 618);

    expect(result.buildingId).toBeNull();
  });

  // res="#33" is ERROR_TooManyFacilities (Protocol/Protocol.pas:62) — NOT
  // "duplicate building", as some scenario fixtures still claim.
  it('reports failure on a non-zero result code', async () => {
    const { ctx } = makeCtx('res="#33"');

    const result = await placeBuilding(ctx, 'PGISupermarketC', 28, 618);

    expect(result).toEqual({ success: false, buildingId: null });
  });

  it('reports failure when the payload carries no result code at all', async () => {
    const { ctx } = makeCtx('');

    const result = await placeBuilding(ctx, 'PGISupermarketC', 28, 618);

    expect(result).toEqual({ success: false, buildingId: null });
  });

  it('reports failure when the transport rejects', async () => {
    const { ctx, sendRdoRequest } = makeCtx('res="#0"');
    sendRdoRequest.mockRejectedValue(new Error('socket closed'));

    const result = await placeBuilding(ctx, 'PGISupermarketC', 28, 618);

    expect(result).toEqual({ success: false, buildingId: null });
  });

  it('refuses to build without a world context', async () => {
    const { ctx } = makeCtx('res="#0"');
    (ctx as { worldContextId: number | null }).worldContextId = null;

    await expect(placeBuilding(ctx, 'PGISupermarketC', 28, 618)).rejects.toThrow(
      'Not logged into world'
    );
  });

  it('refuses to build without a selected company', async () => {
    const { ctx } = makeCtx('res="#0"');
    (ctx as { currentCompany: unknown }).currentCompany = null;

    await expect(placeBuilding(ctx, 'PGISupermarketC', 28, 618)).rejects.toThrow(
      'No company selected'
    );
  });
});

describe('placeCapitol', () => {
  // The twin defect the audit did not mention: placeCapitol carried the same
  // dead regex at building-templates-handler.ts:590.
  it('reports success with a null id, exactly as placeBuilding does', async () => {
    const { ctx } = makeCtx('res="#0"');

    const result = await placeCapitol(ctx, 100, 200);

    expect(result).toEqual({ success: true, buildingId: null });
  });

  it('does not scrape an id out of a payload that happens to contain "sel"', async () => {
    const { ctx } = makeCtx('res="#0" sel 30430748');

    const result = await placeCapitol(ctx, 100, 200);

    expect(result.buildingId).toBeNull();
  });

  it('reports failure on a non-zero result code', async () => {
    const { ctx } = makeCtx('res="#33"');

    const result = await placeCapitol(ctx, 100, 200);

    expect(result).toEqual({ success: false, buildingId: null });
  });
});
