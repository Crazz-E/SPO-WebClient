/**
 * Capability exceptions — doc/E2E-POLICY.md §7.
 *
 * A change can only be driven live if the test account is AUTHORISED to perform it on the
 * server. That is a property of the account, read from the server — never of the UI: a
 * control that is missing because of a rendering bug is a FAIL to fix; an action the
 * server refuses because the account does not hold the role is an exception, recorded as
 * such, with the evidence that says so.
 *
 * For the President members the authority is twofold and both are read live:
 *   - `IsPresident` in the tycoon cache (`Tycoons\<name>.five\`, written by
 *     `StoreRoleInfoToCache`) — what the server records about the account;
 *   - `canGovern` on the Capitol itself — the server's own `grantAccess` decision on the
 *     presidential hall (domain-types.ts:637), the guard every write goes through.
 * `granted` follows `canGovern`; `IsPresident` rides along as evidence.
 *
 * No human override exists. If the server grants the capability, the members must be
 * exercised by a flow (the gate fails closed until one exists); if it refuses, the gate
 * continues with the exception listed in the artifact and the PR.
 */

import { toErrorMessage } from '../shared/error-utils';
import {
  WsMessageType,
  type WsRespCapitolCoords,
  type WsRespTycoonRole,
} from '../shared/types/message-types';
import { PRESIDENT_MEMBERS, PRIMARY_ACCOUNT, TIMEOUTS } from './config';
import { login, logoff, readBuildingDetails, resolveVisualClass } from './session';

export type Capability = 'president';

export interface CapabilityCheck {
  what: string;
  value: string;
}

export interface CapabilityEvidence {
  capability: Capability;
  account: string;
  /** The members a diff may touch that need this capability. */
  members: readonly string[];
  /** True when the server answered; false when the check itself failed (see `error`). */
  determined: boolean;
  /** The server grants the capability — the members can, and therefore must, be exercised. */
  granted: boolean;
  checks: CapabilityCheck[];
  checkedAt: string;
  error?: string;
}

export const CAPABILITIES: Record<Capability, { members: readonly string[]; what: string }> = {
  president: {
    members: PRESIDENT_MEMBERS,
    what: 'govern the Capitol (TPresidentialHall members)',
  },
};

/** The capabilities a set of touched members requires, in catalogue order. */
export function capabilitiesFor(members: readonly string[]): Capability[] {
  const touched = new Set(members);
  return (Object.keys(CAPABILITIES) as Capability[]).filter(capability =>
    CAPABILITIES[capability].members.some(member => touched.has(member)),
  );
}

/**
 * Read, from the server, whether the primary account holds the capability. Never mutates
 * anything; needs no world lock.
 */
export async function checkCapability(capability: Capability): Promise<CapabilityEvidence> {
  const evidence: CapabilityEvidence = {
    capability,
    account: PRIMARY_ACCOUNT.username,
    members: CAPABILITIES[capability].members,
    determined: false,
    granted: false,
    checks: [],
    checkedAt: new Date().toISOString(),
  };

  let session;
  try {
    session = await login(PRIMARY_ACCOUNT);
  } catch (err: unknown) {
    evidence.error = `login failed: ${toErrorMessage(err)}`;
    return evidence;
  }

  try {
    // The Capitol's coordinates are pushed once the search menu exists; login already
    // waited for that push, so this resolves from the buffer.
    const coords = (await session.driver.waitFor(
      msg => msg.type === WsMessageType.RESP_CAPITOL_COORDS,
      TIMEOUTS.request,
      'RESP_CAPITOL_COORDS',
    )) as WsRespCapitolCoords;

    if (!coords.hasCapitol) {
      evidence.checks.push({ what: 'the world has a Capitol', value: 'false' });
      evidence.determined = true;
      return evidence;
    }
    evidence.checks.push({ what: 'the world has a Capitol', value: `(${coords.x},${coords.y})` });

    const role = await session.driver.request<WsRespTycoonRole>(
      { type: WsMessageType.REQ_TYCOON_ROLE, tycoonName: PRIMARY_ACCOUNT.username },
      WsMessageType.RESP_TYCOON_ROLE,
    );
    evidence.checks.push({
      what: 'tycoon cache IsPresident',
      value: String(role.role.isPresident),
    });

    const visualClass = await resolveVisualClass(session, coords.x, coords.y);
    const details = await readBuildingDetails(session, coords.x, coords.y, visualClass);
    evidence.checks.push({
      what: 'canGovern on the Capitol (server grantAccess)',
      value: String(details.canGovern),
    });

    evidence.determined = true;
    evidence.granted = details.canGovern === true;
    return evidence;
  } catch (err: unknown) {
    evidence.error = toErrorMessage(err);
    return evidence;
  } finally {
    await logoff(session);
  }
}
