/**
 * The `company-list` L1 substrate — CompanyPage.asp, checked against a real
 * `StarpeaceSession` driven through `HttpMock`. Proves what the matcher
 * config and the parser cannot each prove alone: that a request naming one
 * company gets that company's tree, that a request for any other company
 * hits the ObjValid=false failure page, and that fetching another company's
 * P&L never changes which company is active on the session.
 */

jest.mock('node-fetch', () => ({ __esModule: true, default: jest.fn() }));

import fetch from 'node-fetch';
import { StarpeaceSession } from '@/server/spo_session';
import { HttpMock } from '../http-mock';
import { createCompanyListScenario, COMPANY_PAGE_TREE } from './company-list-scenario';
import { DEFAULT_VARIABLES } from './scenario-variables';

const fetchMock = fetch as unknown as jest.Mock;

const { http } = createCompanyListScenario();
const mock = new HttpMock();
mock.addScenario(http);

describe('company-list scenario — CompanyPage.asp matching', () => {
  it('a URL naming the served company matches cl-http-004', () => {
    const url = `http://1.2.3.4/Five/0/Visual/Voyager/NewTycoon/CompanyPage.asp?Company=${encodeURIComponent(DEFAULT_VARIABLES.companyName)}&WorldName=${DEFAULT_VARIABLES.worldName}&Tycoon=${DEFAULT_VARIABLES.username}`;
    const result = mock.match('GET', url);
    expect(result).not.toBeNull();
    expect(result!.exchange.id).toBe('cl-http-004');
  });

  it('the same URL without Company matches nothing of id cl-http-004', () => {
    const url = `http://1.2.3.4/Five/0/Visual/Voyager/NewTycoon/CompanyPage.asp?WorldName=${DEFAULT_VARIABLES.worldName}&Tycoon=${DEFAULT_VARIABLES.username}`;
    const result = mock.match('GET', url);
    expect(result).toBeNull();
  });

  it('a URL naming a different company matches cl-http-005, the ObjValid=false page', () => {
    const url = 'http://1.2.3.4/Five/0/Visual/Voyager/NewTycoon/CompanyPage.asp?Company=Red%20Corp.';
    const result = mock.match('GET', url);
    expect(result).not.toBeNull();
    expect(result!.exchange.id).toBe('cl-http-005');
  });
});

describe('company-list scenario — gateway round-trip', () => {
  function makeSession(): StarpeaceSession {
    const session = new StarpeaceSession();
    session.setCurrentWorldInfo({ name: 'Shamba', url: 'http://158.69.153.134', ip: '158.69.153.134', port: 8000 });
    session.setActiveUsername('SPO_test3');
    session.setCachedPassword('test3');
    session.setCurrentCompany({ id: '55', name: 'SPO_test3 - Green', ownerRole: 'SPO_test3' });
    session.setDaAddr('158.69.153.134');
    session.setDaPort(7001);
    session.setInterfaceServerId('8161308');
    return session;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: unknown) => {
      const result = mock.match('GET', String(url));
      return result
        ? { ok: true, status: result.status, statusText: 'OK', text: async () => result.body }
        : { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
    });
  });

  it('fetches the named company and parses it to COMPANY_PAGE_TREE, without switching the active company', async () => {
    const session = makeSession();

    const data = await session.fetchCompanyProfitLoss('Yellow Inc.', 'PGI');

    expect(data).toEqual(COMPANY_PAGE_TREE);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('NewTycoon/CompanyPage.asp');
    expect(calledUrl).toContain('Company=Yellow%20Inc.');
    expect(calledUrl).toContain('CompanyCluster=PGI');
    expect(calledUrl).not.toContain('Company=SPO_test3');
  });

  it('a company the mock does not serve rejects with the failure state, not an empty tree', async () => {
    const session = makeSession();

    await expect(session.fetchCompanyProfitLoss('Red Corp.', 'PGI')).rejects.toThrow(
      /carries no account tree for "Red Corp\."/,
    );
  });

  it('the active company recorded on the session is unchanged after both calls', async () => {
    const session = makeSession();

    await session.fetchCompanyProfitLoss('Yellow Inc.', 'PGI');
    await expect(session.fetchCompanyProfitLoss('Red Corp.', 'PGI')).rejects.toThrow();

    expect(session.currentCompany?.name).toBe('SPO_test3 - Green');
  });
});
