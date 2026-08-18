/**
 * Scenario 3: Server Selection + Company List
 * HTTP: chooseCompany.asp → company HTML with name, id, ownerRole
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { HttpScenario } from '../types/http-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Extracted company data from chooseCompany.asp HTML */
export interface CapturedCompanyData {
  name: string;
  id: string;
  ownerRole: string;
  cluster: string;
  status: string;
  facilityCount: number;
}

const CAPTURED_COMPANY: CapturedCompanyData = {
  name: 'Yellow Inc.',
  id: '28',
  ownerRole: 'SPO_test3',
  cluster: 'PGI',
  status: 'Private',
  facilityCount: 38,
};

function buildChooseCompanyHtml(vars: ScenarioVariables): string {
  return `<html>
<head><title> Company List </title>
<link rel="STYLESHEET" href="../voyager.css" type="text/css">
</head>
<body style="margin-top: 20px; padding-left: 20px" onLoad="onPageLoad()">
<div id=allStuff style="display: none">
<div class=header2>Companies</div>
<div class=value style="margin-left: 20px; margin-top: 10px">
You have registered the following companies in ${vars.worldName}.<br>
Choose one from the list or create a new one.
</div>
<div style="margin-top: 25px; text-align: center">
<table style="padding: 5px">
<tr><tr>
<td align="center" valign="bottom"
style="border-style: solid; border-width: 2px; border-color: black"
companyOwnerRole="${vars.companyOwnerRole}"
companyName="${vars.companyName}"
companyId="${vars.companyId}">
<img src="images/comp-${vars.companyCluster}.gif" style="cursor: hand" border="0">
<div class=header3>${vars.companyName}</div>
<a href="../NewTycoon/CompanyPage.asp?Company=${encodeURIComponent(vars.companyName)}&Tycoon=${vars.username}&WorldName=${vars.worldName}&CompanyCluster=${vars.companyCluster}">more info</a>
<div class=data>
<nobr> ${CAPTURED_COMPANY.status} </nobr><br>
<nobr> ${CAPTURED_COMPANY.facilityCount} Facilities </nobr><br>
</div>
</td>
</tr>
</table>
</div>
</div>
</body>
</html>`;
}

function buildPleaseWaitHtml(): string {
  return `<html>
<head><title> Company List </title>
<link rel="STYLESHEET" href="logon.css" type="text/css">
</head>
<body style="margin-top: 20px; padding-left: 20px">
<div id=allStuff style="display: none">
<font size=2>PLEASE WAIT</p>If this page doesn't clear please try to join the planet again!</font>
</div>
</body>
</html>`;
}

export function createCompanyListScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; http: HttpScenario } {
  const vars = mergeVariables(overrides);

  const http: HttpScenario = {
    name: 'company-list',
    exchanges: [
      {
        id: 'cl-http-001',
        method: 'GET',
        urlPattern: '/Five/0/Visual/Voyager/NewLogon/pleasewait.asp',
        status: 200,
        contentType: 'text/html',
        body: buildPleaseWaitHtml(),
      },
      {
        id: 'cl-http-002',
        method: 'GET',
        urlPattern: '/Five/0/Visual/Voyager/NewLogon/logonComplete.asp',
        queryPatterns: {
          WorldName: vars.worldName,
          UserName: vars.username,
        },
        status: 302,
        contentType: 'text/html',
        body: '',
        headers: {
          Location: `chooseCompany.asp?ClientViewId=${vars.clientViewId}&PA=&Ooopsy=0&WorldName=${vars.worldName}&UserName=${vars.username}&Logon=FALSE&ISAddr=${vars.worldIp}&ISPort=${vars.worldPort}`,
        },
      },
      {
        id: 'cl-http-003',
        method: 'GET',
        urlPattern: '/Five/0/Visual/Voyager/NewLogon/chooseCompany.asp',
        queryPatterns: {
          WorldName: vars.worldName,
          UserName: vars.username,
        },
        status: 200,
        contentType: 'text/html',
        body: buildChooseCompanyHtml(vars),
      },
    ],
    variables: {},
  };

  const ws: WsCaptureScenario = {
    name: 'company-list',
    description: 'Login to world and receive company list',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'cl-ws-001',
        timestamp: '2026-02-18T21:21:27.000Z',
        request: {
          type: WsMessageType.REQ_LOGIN_WORLD,
          wsRequestId: 'cl-001',
          username: vars.username,
          password: vars.password,
          worldName: vars.worldName,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_LOGIN_SUCCESS,
            wsRequestId: 'cl-001',
            tycoonId: '22',
            contextId: vars.clientViewId,
            companyCount: 1,
            companies: [
              {
                id: vars.companyId,
                name: vars.companyName,
                ownerRole: vars.companyOwnerRole,
              },
            ],
          } as WsMessage,
        ],
        tags: ['auth'],
      },
    ],
  };

  return { ws, http };
}

export { CAPTURED_COMPANY };
