import path from 'node:path';

jest.mock('node:dns/promises');

import {
  sanitizeImageFilename,
  resolveSafeCachePath,
  isPrivateIp,
  assertPublicImageUrl,
} from './proxy-image';
import dns from 'node:dns/promises';

describe('sanitizeImageFilename', () => {
  it('rejects a plain traversal filename', () => {
    expect(sanitizeImageFilename('http://h/../../etc/passwd')).toBeNull();
  });

  it('rejects an encoded traversal filename', () => {
    expect(sanitizeImageFilename('http://h/..%2F..%2Fetc%2Fpasswd')).toBeNull();
  });

  it('rejects an encoded separator inside the last segment', () => {
    expect(sanitizeImageFilename('http://h/a%2Fb.png')).toBeNull();
  });

  it('rejects a disallowed extension', () => {
    expect(sanitizeImageFilename('http://h/evil.html')).toBeNull();
  });

  it('rejects a nul-byte filename', () => {
    expect(sanitizeImageFilename('http://h/evil.png%00.html')).toBeNull();
  });

  it('accepts a normal filename', () => {
    expect(sanitizeImageFilename('http://h/building.png')).toBe('building.png');
  });

  it('accepts a mixed-case extension', () => {
    expect(sanitizeImageFilename('http://h/building.PNG')).toBe('building.PNG');
  });

  it('accepts a .bmp filename', () => {
    expect(sanitizeImageFilename('http://h/icon.bmp')).toBe('icon.bmp');
  });

  it('defaults an empty last segment to unknown.gif', () => {
    expect(sanitizeImageFilename('http://h/')).toBe('unknown.gif');
  });

  it('rejects an unparseable percent-encoding', () => {
    expect(sanitizeImageFilename('http://h/%E0%A4%A')).toBeNull();
  });
});

describe('resolveSafeCachePath', () => {
  const root = '/tmp/spo-cache';

  it('rejects a traversal filename', () => {
    expect(resolveSafeCachePath(root, '../../etc/passwd')).toBeNull();
  });

  it('rejects a decoded traversal filename', () => {
    expect(resolveSafeCachePath(root, decodeURIComponent('..%2F..%2Fetc%2Fpasswd'))).toBeNull();
  });

  it('resolves a normal filename inside the root', () => {
    const result = resolveSafeCachePath(root, 'building.png');
    expect(result).not.toBeNull();
    expect(result!.startsWith(path.resolve(root) + path.sep)).toBe(true);
  });
});

describe('isPrivateIp', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd00::1',
    '::ffff:10.0.0.1',
  ])('flags %s as private', (addr) => {
    expect(isPrivateIp(addr)).toBe(true);
  });

  it('does not flag a public v4 address', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });

  it('does not flag a public v6 address', () => {
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });

  it('does not flag a non-IP string', () => {
    expect(isPrivateIp('not-an-ip')).toBe(false);
  });
});

describe('assertPublicImageUrl', () => {
  const mockedLookup = dns.lookup as jest.MockedFunction<typeof dns.lookup>;

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('rejects a hostname resolving to a private address', async () => {
    mockedLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }] as never);
    expect(await assertPublicImageUrl('http://internal.example.com/x.png')).toBe(false);
  });

  it('accepts a hostname resolving to a public address', async () => {
    mockedLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    expect(await assertPublicImageUrl('http://public.example.com/x.png')).toBe(true);
  });

  it('rejects on DNS lookup failure', async () => {
    mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await assertPublicImageUrl('http://nowhere.example.com/x.png')).toBe(false);
  });

  it('rejects a private IP literal without touching DNS', async () => {
    expect(await assertPublicImageUrl('http://192.168.1.1/x.png')).toBe(false);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('rejects an invalid URL', async () => {
    expect(await assertPublicImageUrl('not a url')).toBe(false);
  });

  it('rejects the localhost hostname without touching DNS', async () => {
    expect(await assertPublicImageUrl('http://localhost/x.png')).toBe(false);
    expect(mockedLookup).not.toHaveBeenCalled();
  });
});
