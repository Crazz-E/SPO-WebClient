/**
 * Unit Tests for HttpMock
 * Tests HTTP request matching: path, query, variables, response properties, and reset.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { HttpMock } from './http-mock';
import type { HttpExchange, HttpScenario } from './types/http-exchange-types';

function makeExchange(overrides: Partial<HttpExchange> = {}): HttpExchange {
  return {
    id: 'test-1',
    method: 'GET',
    urlPattern: '/test/path',
    status: 200,
    contentType: 'text/html',
    body: '<html>Hello</html>',
    ...overrides,
  };
}

function makeScenario(exchanges: HttpExchange[]): HttpScenario {
  return {
    name: 'test-scenario',
    exchanges,
    variables: {},
  };
}

describe('HttpMock', () => {
  let mock: HttpMock;

  beforeEach(() => {
    mock = new HttpMock();
  });

  describe('addScenario / addExchange', () => {
    it('adds exchanges from scenario', () => {
      const scenario = makeScenario([
        makeExchange({ id: 'ex-1' }),
        makeExchange({ id: 'ex-2', urlPattern: '/other' }),
      ]);

      mock.addScenario(scenario);

      expect(mock.getExchangeCount()).toBe(2);
    });

    it('adds individual exchange', () => {
      mock.addExchange(makeExchange());

      expect(mock.getExchangeCount()).toBe(1);
    });
  });

  describe('match - path matching', () => {
    it('matches exact path', () => {
      mock.addExchange(makeExchange({ urlPattern: '/test/path' }));

      const result = mock.match('GET', '/test/path');

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('test-1');
    });

    it('matches case-insensitively', () => {
      mock.addExchange(makeExchange({ urlPattern: '/Test/Path' }));

      const result = mock.match('GET', '/test/path');

      expect(result).not.toBeNull();
    });

    it('matches partial path (request ends with pattern)', () => {
      mock.addExchange(makeExchange({ urlPattern: '/path' }));

      const result = mock.match('GET', '/some/prefix/path');

      expect(result).not.toBeNull();
    });

    it('matches wildcard patterns', () => {
      mock.addExchange(makeExchange({ urlPattern: '/api/*/data' }));

      const result = mock.match('GET', '/api/users/data');

      expect(result).not.toBeNull();
    });

    it('returns null when no match', () => {
      mock.addExchange(makeExchange({ urlPattern: '/specific/path' }));

      const result = mock.match('GET', '/completely/different');

      expect(result).toBeNull();
    });

    it('matches correct method (GET only, rejects POST)', () => {
      mock.addExchange(makeExchange({ method: 'GET', urlPattern: '/test' }));

      const getResult = mock.match('GET', '/test');
      const postResult = mock.match('POST', '/test');

      expect(getResult).not.toBeNull();
      expect(postResult).toBeNull();
    });
  });

  describe('match - query matching', () => {
    it('matches when all query patterns present', () => {
      mock.addExchange(makeExchange({
        urlPattern: '/page',
        queryPatterns: { WorldName: 'Shamba', UserName: 'SPO_test3' },
      }));

      const result = mock.match('GET', '/page?WorldName=Shamba&UserName=SPO_test3');

      expect(result).not.toBeNull();
    });

    it('rejects when required query param missing', () => {
      mock.addExchange(makeExchange({
        urlPattern: '/page',
        queryPatterns: { WorldName: 'Shamba', UserName: 'SPO_test3' },
      }));

      const result = mock.match('GET', '/page?WorldName=Shamba');

      expect(result).toBeNull();
    });

    it('rejects when query param has wrong value', () => {
      mock.addExchange(makeExchange({
        urlPattern: '/page',
        queryPatterns: { WorldName: 'Shamba' },
      }));

      const result = mock.match('GET', '/page?WorldName=OtherWorld');

      expect(result).toBeNull();
    });

    it('ignores extra query params in request', () => {
      mock.addExchange(makeExchange({
        urlPattern: '/page',
        queryPatterns: { WorldName: 'Shamba' },
      }));

      const result = mock.match('GET', '/page?WorldName=Shamba&Extra=yes&Another=123');

      expect(result).not.toBeNull();
    });

    it('wildcard * matches any query value', () => {
      mock.addExchange(makeExchange({
        urlPattern: '/page',
        queryPatterns: { WorldName: '*' },
      }));

      const result = mock.match('GET', '/page?WorldName=AnyValue');

      expect(result).not.toBeNull();
    });
  });

  describe('match - variable substitution', () => {
    it('substitutes {{worldName}} in body', () => {
      mock.addExchange(makeExchange({
        body: '<html>Welcome to {{worldName}}</html>',
      }));

      const result = mock.match('GET', '/test/path', { worldName: 'Shamba' });

      expect(result).not.toBeNull();
      expect(result!.body).toBe('<html>Welcome to Shamba</html>');
    });

    it('substitutes {{username}} in URL pattern', () => {
      mock.addExchange(makeExchange({
        urlPattern: '/profile/{{username}}',
        body: '<html>Profile for {{username}}</html>',
      }));

      const result = mock.match('GET', '/profile/SPO_test3', { username: 'SPO_test3' });

      expect(result).not.toBeNull();
      expect(result!.body).toBe('<html>Profile for SPO_test3</html>');
    });
  });

  describe('match - response properties', () => {
    it('returns correct status code', () => {
      mock.addExchange(makeExchange({ status: 302 }));

      const result = mock.match('GET', '/test/path');

      expect(result!.status).toBe(302);
    });

    it('returns correct content type', () => {
      mock.addExchange(makeExchange({ contentType: 'application/json' }));

      const result = mock.match('GET', '/test/path');

      expect(result!.contentType).toBe('application/json');
    });

    it('returns correct body', () => {
      mock.addExchange(makeExchange({ body: '<html>Hello {{username}}</html>' }));

      const result = mock.match('GET', '/test/path', { username: 'TestUser' });

      expect(result!.body).toBe('<html>Hello TestUser</html>');
    });

    it('returns headers when defined', () => {
      mock.addExchange(makeExchange({
        headers: { Location: '/redirect/target', 'X-Custom': 'value' },
      }));

      const result = mock.match('GET', '/test/path');

      expect(result!.headers).toEqual({
        Location: '/redirect/target',
        'X-Custom': 'value',
      });
    });
  });

  describe('getExchangeCount / reset', () => {
    it('returns count of exchanges', () => {
      mock.addExchange(makeExchange({ id: 'ex-1' }));
      mock.addExchange(makeExchange({ id: 'ex-2', urlPattern: '/other' }));

      expect(mock.getExchangeCount()).toBe(2);
    });

    it('reset clears all exchanges', () => {
      mock.addExchange(makeExchange());
      mock.addExchange(makeExchange({ id: 'ex-2', urlPattern: '/other' }));

      expect(mock.getExchangeCount()).toBe(2);

      mock.reset();

      expect(mock.getExchangeCount()).toBe(0);
      expect(mock.match('GET', '/test/path')).toBeNull();
    });
  });
});
