import { grantAccess } from './security-id';

/**
 * The shapes below are what `TTycoon.GetSecurityId` actually produces
 * (`Kernel/Kernel.pas:11135-11154`), doubled separators included — they are not
 * tidied-up fixtures.
 */
describe('grantAccess', () => {
  // A tycoon holding no role: CollectSecurityId returns '-' + id + '-'.
  const PLAIN_OWNER = '-4711-';
  // A tycoon holding one role: '-' + id + '-' + '-' + roleId + '-' + '-'.
  const OWNER_WITH_ROLE = '-4711--8022--';
  // Two roles, e.g. a mayor who is also a minister.
  const OWNER_WITH_TWO_ROLES = '-4711--8022--9033--';

  it('grants the owner access to their own facility', () => {
    expect(grantAccess('4711', PLAIN_OWNER)).toBe(true);
  });

  it('grants access through an assumed role', () => {
    // The Town Hall is owned by the role tycoon, but the human's id is in the
    // list too — which is what lets the mayor edit the hall they govern.
    expect(grantAccess('4711', OWNER_WITH_ROLE)).toBe(true);
    expect(grantAccess('8022', OWNER_WITH_ROLE)).toBe(true);
  });

  it('grants access through any of several roles', () => {
    expect(grantAccess('9033', OWNER_WITH_TWO_ROLES)).toBe(true);
  });

  it('refuses a tycoon absent from the list', () => {
    // The mayor of another town: a real role holder, wrong facility.
    expect(grantAccess('5150', OWNER_WITH_ROLE)).toBe(false);
  });

  describe('item matching, not substring matching', () => {
    it('refuses a prefix of an authorised id', () => {
      // Without the separators, '47' would match inside '-4711-'.
      expect(grantAccess('47', PLAIN_OWNER)).toBe(false);
    });

    it('refuses a suffix of an authorised id', () => {
      expect(grantAccess('11', PLAIN_OWNER)).toBe(false);
    });

    it('matches a separator-bearing requester exactly as Delphi does', () => {
      // Pinned for parity, not as desirable behaviour: `pos('-4711--8022-', …)`
      // finds it in Delphi too, so we return true as well. Unreachable in
      // practice — a tycoon id is a decimal integer and never contains '-'.
      expect(grantAccess('4711--8022', OWNER_WITH_ROLE)).toBe(true);
    });
  });

  describe('empty inputs', () => {
    it('refuses an empty requester even against a doubled separator', () => {
      // The dangerous case: the needle would be '--', which occurs in the
      // SecurityId of every owner holding a role.
      expect(grantAccess('', OWNER_WITH_ROLE)).toBe(false);
    });

    it('refuses an empty securityId', () => {
      // A facility whose SecurityId did not come back — never fail open.
      expect(grantAccess('4711', '')).toBe(false);
    });

    it('refuses when both are empty', () => {
      expect(grantAccess('', '')).toBe(false);
    });
  });

  it('does not normalise ids', () => {
    // Ids are decimal strings on both sides of the wire; '04711' is not '4711'.
    expect(grantAccess('04711', PLAIN_OWNER)).toBe(false);
  });
});
