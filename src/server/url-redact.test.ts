import { redactUrlCredentials } from './url-redact';

describe('redactUrlCredentials', () => {
  it('redacts the password of a politics ASP URL', () => {
    const url = 'http://1.2.3.4/Five/0/Visual/Voyager/Politics/politics.asp'
      + '?WorldName=planitia&TycoonName=SPO_test3&Password=hunter2&TownName=Helartia';
    expect(redactUrlCredentials(url)).toBe(
      'http://1.2.3.4/Five/0/Visual/Voyager/Politics/politics.asp'
      + '?WorldName=planitia&TycoonName=SPO_test3&Password=***&TownName=Helartia',
    );
  });

  it('keeps everything that is not a credential', () => {
    // The log must still say which world, which tycoon and which page failed.
    const out = redactUrlCredentials('http://h/p.asp?Password=x&Tycoon=Bob');
    expect(out).toContain('Tycoon=Bob');
    expect(out).toContain('http://h/p.asp');
    expect(out).not.toContain('=x');
  });

  it('redacts the parameter when it is first in the query', () => {
    expect(redactUrlCredentials('http://h/p.asp?Password=s3cret&A=1'))
      .toBe('http://h/p.asp?Password=***&A=1');
  });

  it('redacts the parameter when it is last', () => {
    expect(redactUrlCredentials('http://h/p.asp?A=1&Password=s3cret'))
      .toBe('http://h/p.asp?A=1&Password=***');
  });

  it('is case-insensitive — the ASP pages are inconsistent', () => {
    expect(redactUrlCredentials('http://h/p.asp?password=a&PASSWORD=b'))
      .toBe('http://h/p.asp?password=***&PASSWORD=***');
  });

  it('redacts the alternate spellings', () => {
    expect(redactUrlCredentials('http://h/p.asp?pwd=a&passwd=b'))
      .toBe('http://h/p.asp?pwd=***&passwd=***');
  });

  it('stops at the fragment', () => {
    expect(redactUrlCredentials('http://h/p.asp?Password=s3cret#frag'))
      .toBe('http://h/p.asp?Password=***#frag');
  });

  it('leaves a URL with no credentials byte-identical', () => {
    const url = 'http://h/p.asp?WorldName=planitia&X=1';
    expect(redactUrlCredentials(url)).toBe(url);
  });

  it('does not match a parameter that merely ends in the word', () => {
    // `OldPassword=` is not one of ours; only a whole parameter name counts,
    // which the leading [?&] enforces.
    const url = 'http://h/p.asp?OldPassword=keepme';
    expect(redactUrlCredentials(url)).toBe(url);
  });

  it('does not throw on a malformed or relative URL', () => {
    expect(redactUrlCredentials('not a url at all')).toBe('not a url at all');
    expect(redactUrlCredentials('/rel/p.asp?Password=x')).toBe('/rel/p.asp?Password=***');
  });

  it('handles an empty password value', () => {
    expect(redactUrlCredentials('http://h/p.asp?Password=&A=1'))
      .toBe('http://h/p.asp?Password=***&A=1');
  });
});
