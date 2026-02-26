/**
 * Scenario 16: Politics Data
 * WS: REQ_POLITICS_DATA → RESP_POLITICS_DATA for Town Hall politics page
 *
 * Based on captured politics.asp HTML: mayor data, popular ratings,
 * IFEL ratings, opposition data, and campaign status.
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { PoliticsData } from '@/shared/types/domain-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

// =============================================================================
// MOCK POLITICS DATA (from captured politics.asp responses)
// =============================================================================

const MOCK_POLITICS_DATA: PoliticsData = {
  townName: 'Paraiso',
  yearsToElections: 33,
  mayorName: 'Mayor Chen',
  mayorPrestige: 620,
  mayorRating: 68,
  tycoonsRating: 55,
  campaignCount: 2,
  popularRatings: [
    { name: 'Campaign Accomplishment', value: 0 },
    { name: 'Colleges', value: 18 },
    { name: 'Garbage Disposal', value: 204 },
    { name: 'Fire Coverage', value: 253 },
    { name: 'Health Coverage', value: 28 },
    { name: 'Jails', value: 204 },
    { name: 'Museums', value: 67 },
    { name: 'Police Coverage', value: 207 },
    { name: 'City Growth', value: 100 },
    { name: 'School Coverage', value: 213 },
    { name: 'Services and Amusement', value: 90 },
    { name: 'Recreation Facilities', value: 209 },
    { name: 'Taxes', value: 88 },
    { name: 'Employment', value: 85 },
    { name: 'Economic Wealth', value: 66 },
  ],
  ifelRatings: [
    { name: 'Infrastructure', value: 72 },
    { name: 'Public Services', value: 85 },
    { name: 'Economy', value: 61 },
    { name: 'Security', value: 78 },
    { name: 'Environment', value: 55 },
  ],
  tycoonsRatings: [
    { name: 'Mayor Chen', value: 68 },
    { name: 'SPO_test3', value: 45 },
    { name: 'TradeMaster', value: 32 },
  ],
  campaigns: [],
  canLaunchCampaign: true,
  campaignMessage: 'You are not participating in the coming elections. Click on the button below to launch your political campaign. To be accepted, your prestige should be higher than 200 points.',
};

// =============================================================================
// SCENARIO FACTORY
// =============================================================================

export function createPoliticsScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario } {
  const _vars = mergeVariables(overrides);

  const wsExchanges = [
    {
      id: 'pol-ws-001',
      timestamp: '2026-02-22T22:00:00.000Z',
      request: {
        type: WsMessageType.REQ_POLITICS_DATA,
        wsRequestId: 'pol-001',
        townName: MOCK_POLITICS_DATA.townName,
        buildingX: 520,
        buildingY: 430,
      } as WsMessage,
      responses: [
        {
          type: WsMessageType.RESP_POLITICS_DATA,
          wsRequestId: 'pol-001',
          data: MOCK_POLITICS_DATA,
        } as WsMessage,
      ],
      tags: ['politics'],
    },
  ];

  return {
    ws: {
      name: 'politics',
      description: 'Politics page data for Town Hall',
      capturedAt: '2026-02-22',
      serverInfo: { world: 'Shamba', zone: 'BETA', date: '2026-02-22' },
      exchanges: wsExchanges,
    },
  };
}
