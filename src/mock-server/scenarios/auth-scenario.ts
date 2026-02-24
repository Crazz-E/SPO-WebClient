/**
 * Scenario 1: Authentication
 * RDO exchanges: idof DirectoryServer, RDOOpenSession (get — zero-arg function via COM late-binding),
 * RDOMapSegaUser, RDOLogonUser, RDOEndSession
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

export function createAuthScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  const rdo: RdoScenario = {
    name: 'auth',
    description: 'Directory authentication sequence',
    exchanges: [
      {
        id: 'auth-rdo-001',
        request: `C 0 idof "DirectoryServer"`,
        response: `A0 objid="${vars.directoryServerId}"`,
        matchKeys: { verb: 'idof', targetId: 'DirectoryServer' },
      },
      {
        id: 'auth-rdo-002',
        request: `C 1 sel ${vars.directoryServerId} get RDOOpenSession`,
        response: `A1 RDOOpenSession="#${vars.directorySessionId}"`,
        matchKeys: { verb: 'sel', action: 'get', member: 'RDOOpenSession' },
      },
      {
        id: 'auth-rdo-003',
        request: `C 2 sel ${vars.directorySessionId} call RDOMapSegaUser "^" "%${vars.username}"`,
        response: `A2 res="%"`,
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOMapSegaUser' },
      },
      {
        id: 'auth-rdo-004',
        request: `C 3 sel ${vars.directorySessionId} call RDOLogonUser "^" "%${vars.username}","%${vars.password}"`,
        response: `A3 res="#0"`,
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOLogonUser' },
      },
      {
        id: 'auth-rdo-005',
        request: `C 4 sel ${vars.directorySessionId} call RDOEndSession "*"`,
        response: `A4`,
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOEndSession' },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const ws: WsCaptureScenario = {
    name: 'auth',
    description: 'Directory authentication via WebSocket',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'auth-ws-001',
        timestamp: '2026-02-18T21:21:00.000Z',
        request: {
          type: WsMessageType.REQ_CONNECT_DIRECTORY,
          wsRequestId: 'auth-001',
          username: vars.username,
          password: vars.password,
          zonePath: vars.zonePath,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_CONNECT_SUCCESS,
            wsRequestId: 'auth-001',
            worlds: [
              {
                name: vars.worldName,
                url: vars.worldUrl,
                ip: vars.worldIp,
                port: vars.worldPort,
                population: 91982248,
                investors: 21,
                online: 1,
                date: '2232',
                running: true,
              },
            ],
          } as WsMessage,
        ],
        tags: ['auth'],
      },
    ],
  };

  return { ws, rdo };
}
