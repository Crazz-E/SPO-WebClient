import { isHtmlContent, extractMetaRefreshUrl } from './mail-html-utils';

describe('isHtmlContent', () => {
  it('returns true for body starting with <HEAD>', () => {
    expect(isHtmlContent(['<HEAD>', '</HEAD>'])).toBe(true);
  });

  it('returns true for body starting with <META', () => {
    expect(isHtmlContent(['<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=http://example.com">'])).toBe(true);
  });

  it('returns true for body starting with <!DOCTYPE', () => {
    expect(isHtmlContent(['<!DOCTYPE html>', '<html>', '</html>'])).toBe(true);
  });

  it('returns true for body starting with <HTML>', () => {
    expect(isHtmlContent(['<HTML>', '<BODY>Hello</BODY>', '</HTML>'])).toBe(true);
  });

  it('returns true for body starting with <BODY>', () => {
    expect(isHtmlContent(['<BODY>', 'content', '</BODY>'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isHtmlContent(['<head>', '</head>'])).toBe(true);
    expect(isHtmlContent(['<Html>', '</Html>'])).toBe(true);
  });

  it('ignores leading whitespace', () => {
    expect(isHtmlContent(['  <HEAD>', '</HEAD>'])).toBe(true);
  });

  it('returns false for plain text messages', () => {
    expect(isHtmlContent(['Hello, this is a test message'])).toBe(false);
  });

  it('returns false for text that contains < but is not HTML', () => {
    expect(isHtmlContent(['I have < 5 items'])).toBe(false);
  });

  it('returns false for empty body', () => {
    expect(isHtmlContent([])).toBe(false);
  });

  it('returns false for body with only whitespace', () => {
    expect(isHtmlContent(['  ', '  '])).toBe(false);
  });

  it('detects real minister notification mail', () => {
    expect(isHtmlContent([
      '<HEAD>',
      '</HEAD>',
      '<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=http://158.69.153.134/Five//0/Visual/Voyager/Mail/SpecialMessages//NotifyMinister.asp?Minister=SPO_test3&Ministry=Defense&President=SPO_test3&WorldName=Shamba">',
    ])).toBe(true);
  });
});

describe('extractMetaRefreshUrl', () => {
  it('extracts URL from META REFRESH tag', () => {
    const html = '<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=http://example.com/page">';
    expect(extractMetaRefreshUrl(html)).toBe('http://example.com/page');
  });

  it('extracts URL from real minister notification', () => {
    const html = [
      '<HEAD>',
      '</HEAD>',
      '<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=http://158.69.153.134/Five//0/Visual/Voyager/Mail/SpecialMessages//NotifyMinister.asp?Minister=SPO_test3&Ministry=Defense&President=SPO_test3&WorldName=Shamba">',
    ].join('\n');
    expect(extractMetaRefreshUrl(html)).toBe(
      'http://158.69.153.134/Five//0/Visual/Voyager/Mail/SpecialMessages//NotifyMinister.asp?Minister=SPO_test3&Ministry=Defense&President=SPO_test3&WorldName=Shamba',
    );
  });

  it('is case-insensitive', () => {
    const html = '<meta http-equiv="refresh" content="0; url=http://example.com/test">';
    expect(extractMetaRefreshUrl(html)).toBe('http://example.com/test');
  });

  it('returns null for HTML without META REFRESH', () => {
    const html = '<HTML><BODY>Hello world</BODY></HTML>';
    expect(extractMetaRefreshUrl(html)).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(extractMetaRefreshUrl('just plain text')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractMetaRefreshUrl('')).toBeNull();
  });

  it('handles META tag with extra attributes', () => {
    const html = '<META NAME="test" HTTP-EQUIV="REFRESH" CONTENT="5; URL=http://example.com/delayed">';
    expect(extractMetaRefreshUrl(html)).toBe('http://example.com/delayed');
  });
});
