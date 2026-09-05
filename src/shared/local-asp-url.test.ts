import { translateLocalAspUrl } from './local-asp-url';

describe('translateLocalAspUrl', () => {
  it('extracts x/y from the exact MsgZoned form', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=12&y=34')).toEqual({
      action: 'select',
      x: 12,
      y: 34,
    });
  });

  it('accepts lowercase frame_Id / frame_Action', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=mapisoview&frame_Action=select&x=1&y=2')).toEqual({
      action: 'select',
      x: 1,
      y: 2,
    });
  });

  it('returns null for an unrelated frame_Id (the criterion\'s case)', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MailView&frame_Action=SELECT&x=1&y=2')).toBeNull();
  });

  it('returns null for a non-SELECT frame_Action', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MapIsoView&frame_Action=MoveTo&x=1&y=2')).toBeNull();
  });

  it('returns null when y is missing', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=1')).toBeNull();
  });

  it('returns null for a non-numeric x', () => {
    expect(translateLocalAspUrl('http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=abc&y=2')).toBeNull();
  });

  it('returns null for the wrong host', () => {
    expect(
      translateLocalAspUrl('http://example.com/?frame_Id=MapIsoView&frame_Action=SELECT&x=1&y=2'),
    ).toBeNull();
  });

  it.each(['', '?frame_Id=MapIsoView&frame_Action=SELECT&x=1&y=2', 'not a url', 'javascript:alert(1)'])(
    'returns null without throwing for %p',
    input => {
      expect(() => translateLocalAspUrl(input)).not.toThrow();
      expect(translateLocalAspUrl(input)).toBeNull();
    },
  );
});
