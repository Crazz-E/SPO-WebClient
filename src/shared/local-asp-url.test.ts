import { translateLocalAspUrl } from './local-asp-url';

const SELECT_URL = 'http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=12&y=34';

describe('translateLocalAspUrl', () => {
  it('extracts x/y from the exact MsgZoned form', () => {
    expect(translateLocalAspUrl(SELECT_URL)).toEqual({ action: 'select', x: 12, y: 34 });
  });

  it('returns null for a different frame_Id (the criterion\'s case)', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MailView&frame_Action=SELECT&x=1&y=2')).toBeNull();
  });

  it('returns null for a different frame_Action', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MapIsoView&frame_Action=MoveTo&x=1&y=2')).toBeNull();
  });

  it('returns null when y is missing', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=1')).toBeNull();
  });

  it('returns null when x is not numeric', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=abc&y=2')).toBeNull();
  });

  it('returns null for the wrong host', () => {
    expect(translateLocalAspUrl('http://example.com/?frame_Id=MapIsoView&frame_Action=SELECT&x=1&y=2')).toBeNull();
  });

  it.each([
    ['', ''],
    ['a relative fragment', '?frame_Id=MapIsoView&frame_Action=SELECT&x=1&y=2'],
    ['garbage', 'not a url'],
    ['javascript:', 'javascript:alert(1)'],
  ])('returns null without throwing for %s', (_label, href) => {
    expect(() => translateLocalAspUrl(href)).not.toThrow();
    expect(translateLocalAspUrl(href)).toBeNull();
  });

  it('accepts a lowercase frame_Id and frame_Action', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=mapisoview&frame_Action=select&x=5&y=6'))
      .toEqual({ action: 'select', x: 5, y: 6 });
  });
});
