/**
 * Scenario 8: RefreshObject Server Push
 * Server-initiated push sent when SwitchFocusEx is active.
 * Contains building status refresh + tycoon financial update.
 *
 * Captured RDO (no sequence number = server push):
 *   C sel 40133496 call RefreshObject "*" "#127839460","#0","%10\nYellow Inc.\n..."
 *   C sel 40133496 call RefreshTycoon "*" "%4666243913","%10508","#2","#33","#70";
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured RefreshObject building data */
export interface CapturedRefreshObjectData {
  tycoonProxyId: string;
  buildingId: string;
  statusFlag: string;
  companyName: string;
  salesSummary: string;
  revenue: string;
  detailsText: string;
  hintsText: string;
}

/** Captured RefreshTycoon financial data */
export interface CapturedRefreshTycoonData {
  tycoonProxyId: string;
  cash: string;
  incomePerHour: string;
  ranking: number;
  buildingCount: number;
  maxBuildings: number;
}

export const CAPTURED_REFRESH_OBJECT: CapturedRefreshObjectData = {
  tycoonProxyId: '40133496',
  buildingId: '127839460',
  statusFlag: '0',
  companyName: 'Yellow Inc.',
  salesSummary: 'Pharmaceutics sales at 1%',
  revenue: '(-$36/h)',
  detailsText: 'Drug Store.  Upgrade Level: 1  Items Sold: 1/h  Potential customers (per day): 0 hi, 1 mid, 1 low. Actual customers: 0 hi, 1 mid, 1 low.  Efficiency: 87%  Desirability: 46',
  hintsText: 'Hint: Try to attract more customers by offering better quality and prices.',
};

export const CAPTURED_REFRESH_TYCOON: CapturedRefreshTycoonData = {
  tycoonProxyId: '40133496',
  cash: '4666243913',
  incomePerHour: '10508',
  ranking: 2,
  buildingCount: 33,
  maxBuildings: 70,
};

/**
 * Build the raw RefreshObject RDO push string.
 *
 * Per Protocol.pas: RefreshObject(ObjId: integer, KindOfChange: integer, ExtraInfo: widestring)
 *   KindOfChange: 0=fchStatus, 1=fchStructure, 2=fchDestruction
 *
 * ExtraInfo format for fchStatus (from InterfaceServer.pas GetFacilityExtraInfo):
 *   "<shortName>\n<companyName>\n<salesSummary>\n<revenue>:-:<details>:-:<hints>:-:"
 *   The leading "10" is the building's short display name (Drug Store's name is "10").
 */
function buildRefreshObjectPush(vars: ScenarioVariables): string {
  const textBlock = [
    `${CAPTURED_REFRESH_OBJECT.companyName}`,
    `${CAPTURED_REFRESH_OBJECT.salesSummary}`,
    `${CAPTURED_REFRESH_OBJECT.revenue}:-:${CAPTURED_REFRESH_OBJECT.detailsText}:-:${CAPTURED_REFRESH_OBJECT.hintsText}:-:`,
  ].join('\n');

  return `C sel ${vars.tycoonProxyId} call RefreshObject "*" "#${CAPTURED_REFRESH_OBJECT.buildingId}","#${CAPTURED_REFRESH_OBJECT.statusFlag}","%10\n${textBlock}";`;
}

/** Build the raw RefreshTycoon RDO push string */
function buildRefreshTycoonPush(vars: ScenarioVariables): string {
  return `C sel ${vars.tycoonProxyId} call RefreshTycoon "*" "%${CAPTURED_REFRESH_TYCOON.cash}","%${CAPTURED_REFRESH_TYCOON.incomePerHour}","#${CAPTURED_REFRESH_TYCOON.ranking}","#${CAPTURED_REFRESH_TYCOON.buildingCount}","#${CAPTURED_REFRESH_TYCOON.maxBuildings}";`;
}

export function createRefreshObjectScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  const refreshObjectPush = buildRefreshObjectPush(vars);
  const refreshTycoonPush = buildRefreshTycoonPush(vars);

  const rdo: RdoScenario = {
    name: 'refresh-object',
    description: 'Server push: RefreshObject + RefreshTycoon (sent during SwitchFocusEx)',
    exchanges: [
      {
        id: 'ro-rdo-001',
        // Server-initiated push: no client request, not matchable
        request: '',
        response: refreshObjectPush,
        pushes: [refreshTycoonPush],
        matchKeys: { verb: 'sel', action: 'call', member: 'RefreshObject' },
        pushOnly: true,
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const ws: WsCaptureScenario = {
    name: 'refresh-object',
    description: 'Server push: building refresh + tycoon financial update',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [],
    scheduledEvents: [
      {
        afterMs: 5000,
        event: {
          type: WsMessageType.EVENT_BUILDING_REFRESH,
          building: {
            buildingId: CAPTURED_REFRESH_OBJECT.buildingId,
            buildingName: 'Drug Store',
            ownerName: CAPTURED_REFRESH_OBJECT.companyName,
            salesInfo: CAPTURED_REFRESH_OBJECT.salesSummary,
            revenue: CAPTURED_REFRESH_OBJECT.revenue,
            detailsText: CAPTURED_REFRESH_OBJECT.detailsText,
            hintsText: CAPTURED_REFRESH_OBJECT.hintsText,
            x: 0,
            y: 0,
          },
          kindOfChange: 0,
        } as WsMessage,
        repeat: { intervalMs: 15000, count: 10 },
      },
      {
        afterMs: 5000,
        event: {
          type: WsMessageType.EVENT_TYCOON_UPDATE,
          cash: CAPTURED_REFRESH_TYCOON.cash,
          incomePerHour: CAPTURED_REFRESH_TYCOON.incomePerHour,
          ranking: CAPTURED_REFRESH_TYCOON.ranking,
          buildingCount: CAPTURED_REFRESH_TYCOON.buildingCount,
          maxBuildings: CAPTURED_REFRESH_TYCOON.maxBuildings,
        } as WsMessage,
        repeat: { intervalMs: 15000, count: 10 },
      },
    ],
  };

  return { ws, rdo };
}
