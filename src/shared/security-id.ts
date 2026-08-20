/**
 * SecurityId — Voyager's per-facility authorisation check.
 *
 * A facility carries a `SecurityId` property built by `TTycoon.GetSecurityId`
 * (`Kernel/Kernel.pas:11135-11154`). It is the owning tycoon's id list: the
 * human owner first, then every role that human has assumed, recursively, each
 * item wrapped in the separator.
 *
 *     CollectSecurityId(t) = '-' + id(t) + ( '-' + CollectSecurityId(role) )* + '-'
 *
 * So a player who owns a company and holds the "Mayor of Helartia" role
 * produces `-<humanId>--<mayorRoleId>--`, and the Town Hall that role owns
 * carries exactly that string. Note the doubled separators: they fall out of the
 * recursion and are harmless to the match below, but see `requesterId` guard.
 *
 * The requester id is the player's own tycoon id in decimal — Voyager's
 * `ClientView.getSecurityId` is nothing more than that:
 *
 *     function TServerCnxHandler.getSecurityId : string;
 *       begin
 *         result := IntToStr(integer(fTycoonId));
 *       end;
 *
 * `Voyager/URLHandlers/ServerCnxHandler.pas:2524-2527`. There is no separate
 * credential to obtain; `WsRespLoginSuccess.tycoonId` already carries it.
 *
 * Access is granted when the requester's id appears as a whole item in the list
 * — `Protocol/Protocol.pas:428-431`:
 *
 *     result := system.pos( SecIdItemSeparator + RequesterId + SecIdItemSeparator, SecurityId ) > 0;
 *
 * The separators are what make this an item match instead of a substring match:
 * without them tycoon `12` would be granted access to a facility owned by `123`.
 *
 * This is the only correct scoping for a civic control. A role label such as
 * `'Mayor'` says the player governs *somewhere*; this says whether they govern
 * *this* facility.
 */

/** `Protocol/Protocol.pas:353` — `SecIdItemSeparator = '-'`. */
const SEC_ID_ITEM_SEPARATOR = '-';

/**
 * Does `requesterId` appear as a whole item in `securityId`?
 *
 * Mirrors `Protocol.GrantAccess`. Both arguments are compared verbatim: the ids
 * are decimal strings on both sides of the wire and are never normalised.
 *
 * @param requesterId the player's own tycoon id, e.g. `WsRespLoginSuccess.tycoonId`
 * @param securityId  the facility's `SecurityId` property
 */
export function grantAccess(requesterId: string, securityId: string): boolean {
  // An empty requester must never match. Without this guard the needle would be
  // '--', which occurs in every SecurityId of an owner that holds a role — an
  // unauthenticated client would be granted access to precisely the civic
  // facilities this check exists to protect.
  if (requesterId === '' || securityId === '') return false;
  return securityId.includes(SEC_ID_ITEM_SEPARATOR + requesterId + SEC_ID_ITEM_SEPARATOR);
}
