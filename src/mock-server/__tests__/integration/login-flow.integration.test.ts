/**
 * Integration test: full auth -> world-list -> company-list -> select-company sequence.
 * Tests that the WS, RDO, and HTTP layers produce consistent scenario data
 * that can be loaded together for a complete login flow.
 */
import { describe, it, expect } from '@jest/globals';
import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import { MockWebSocketClient } from '../../mock-ws-client';
import { RdoMock } from '../../rdo-mock';
import { HttpMock } from '../../http-mock';
import { createAuthScenario } from '../../scenarios/auth-scenario';
import { createWorldListScenario } from '../../scenarios/world-list-scenario';
import { createCompanyListScenario } from '../../scenarios/company-list-scenario';
import { createSelectCompanyScenario } from '../../scenarios/select-company-scenario';

describe('Login Flow Integration', () => {
  // Pre-build all scenario bundles once for each nested describe
  const authBundle = createAuthScenario();
  const worldListBundle = createWorldListScenario();
  const companyListBundle = createCompanyListScenario();
  const selectCompanyBundle = createSelectCompanyScenario();

  describe('WS layer', () => {
    it('connects to directory and receives world list', async () => {
      const client = new MockWebSocketClient([
        authBundle.ws,
        worldListBundle.ws,
      ]);

      const response = await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'auth-001',
        username: 'Crazz',
        password: 'Simcity99',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(response.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
      const resp = response as unknown as Record<string, unknown>;
      const worlds = resp.worlds as Array<Record<string, unknown>>;
      expect(worlds).toBeDefined();
      expect(worlds.length).toBeGreaterThan(0);
    });

    it('logs into world and receives company list', async () => {
      const client = new MockWebSocketClient([
        companyListBundle.ws,
      ]);

      const response = await client.send({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'cl-001',
        username: 'Crazz',
        password: 'Simcity99',
        worldName: 'Shamba',
      } as WsMessage);

      expect(response.type).toBe(WsMessageType.RESP_LOGIN_SUCCESS);
      const resp = response as unknown as Record<string, unknown>;
      expect(resp.companyCount).toBe(1);
      const companies = resp.companies as Array<Record<string, unknown>>;
      expect(companies).toBeDefined();
      expect(companies[0].name).toBe('Yellow Inc.');
    });

    it('selects company and receives confirmation', async () => {
      const client = new MockWebSocketClient([
        selectCompanyBundle.ws,
      ]);

      const response = await client.send({
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 'sc-001',
        companyId: '28',
      } as WsMessage);

      expect(response.type).toBe(WsMessageType.RESP_RDO_RESULT);
      const resp = response as unknown as Record<string, unknown>;
      expect(resp.result).toBe('OK');
    });

    it('session state progresses through phases', async () => {
      const client = new MockWebSocketClient([
        authBundle.ws,
        companyListBundle.ws,
        selectCompanyBundle.ws,
      ]);

      // Send auth request
      await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'auth-001',
        username: 'Crazz',
        password: 'Simcity99',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      const sentMessages = client.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].type).toBe(WsMessageType.REQ_CONNECT_DIRECTORY);

      const receivedMessages = client.getReceivedMessages();
      expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('RDO layer', () => {
    it('auth RDO exchanges match correctly', () => {
      const rdoMock = new RdoMock();
      rdoMock.addScenario(authBundle.rdo);

      // Match the idof DirectoryServer command
      const idofResult = rdoMock.match('C 0 idof "DirectoryServer"');
      expect(idofResult).not.toBeNull();
      expect(idofResult!.response).toContain('objid=');

      // Match the OpenSession command (get — zero-arg function via COM late-binding)
      const openResult = rdoMock.match('C 1 sel 39751288 get RDOOpenSession');
      expect(openResult).not.toBeNull();
      expect(openResult!.response).toContain('RDOOpenSession=');
    });

    it('world-list RDO exchanges match correctly', () => {
      const rdoMock = new RdoMock();
      rdoMock.addScenario(worldListBundle.rdo);

      // Match the RDOQueryKey command for America
      const americaResult = rdoMock.match(
        'C 9 sel 166125200 call RDOQueryKey "^" "%Root/Areas/America/Worlds","%General/Population"'
      );
      expect(americaResult).not.toBeNull();
      expect(americaResult!.response).toContain('Count=');
    });
  });

  describe('HTTP layer', () => {
    it('toolbar.asp matches and contains company name', () => {
      const httpMock = new HttpMock();
      httpMock.addScenario(selectCompanyBundle.http);

      const result = httpMock.match(
        'GET',
        '/Five/0/visual/voyager/toolbar/toolbar.asp?WorldName=Shamba&Tycoon=Crazz'
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain('Yellow Inc.');
      expect(result!.body).toContain('btnBuild');
    });

    it('chooseCompany.asp matches and contains company data', () => {
      const httpMock = new HttpMock();
      httpMock.addScenario(companyListBundle.http);

      const result = httpMock.match(
        'GET',
        '/Five/0/Visual/Voyager/NewLogon/chooseCompany.asp?WorldName=Shamba&UserName=Crazz'
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain('Yellow Inc.');
      expect(result!.body).toContain('companyId="28"');
    });
  });

  describe('cross-layer consistency', () => {
    it('all three layers can be loaded together', () => {
      const rdoMock = new RdoMock();
      rdoMock.addScenario(authBundle.rdo);
      rdoMock.addScenario(worldListBundle.rdo);
      rdoMock.addScenario(selectCompanyBundle.rdo);

      const httpMock = new HttpMock();
      httpMock.addScenario(companyListBundle.http);
      httpMock.addScenario(selectCompanyBundle.http);

      const wsClient = new MockWebSocketClient([
        authBundle.ws,
        worldListBundle.ws,
        companyListBundle.ws,
        selectCompanyBundle.ws,
      ]);

      // All three mock layers should be functional after loading
      expect(rdoMock.match('C 0 idof "DirectoryServer"')).not.toBeNull();
      expect(httpMock.getExchangeCount()).toBeGreaterThanOrEqual(4);
      expect(wsClient.getMessageLog()).toHaveLength(0); // No messages sent yet
    });

    it('variable overrides work across layers', () => {
      const overrides = { username: 'TestUser', companyName: 'Test Corp.' };
      const auth = createAuthScenario(overrides);
      const companyList = createCompanyListScenario(overrides);
      const selectCompany = createSelectCompanyScenario(overrides);

      // WS layer uses the override
      const wsRequest = auth.ws.exchanges[0].request as unknown as Record<string, unknown>;
      expect(wsRequest.username).toBe('TestUser');

      // HTTP layer uses the override
      const chooseCompanyHtml = companyList.http.exchanges[2].body;
      expect(chooseCompanyHtml).toContain('Test Corp.');
      expect(chooseCompanyHtml).not.toContain('Yellow Inc.');

      // RDO layer uses the override
      const mapSegaUser = auth.rdo.exchanges[2];
      expect(mapSegaUser.request).toContain('%TestUser');

      // Toolbar HTML uses the override
      const toolbar = selectCompany.http.exchanges[0];
      expect(toolbar.body).toContain('Test Corp.');
    });
  });
});
