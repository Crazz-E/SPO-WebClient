/**
 * Local-ASP URL translator — Voyager's pseudo-navigation scheme.
 *
 * `MsgZoned.asp` (`~/SPO-ASP/Five/0/Visual/Voyager/Mail/SpecialMessages/MsgZoned.asp:115-119`)
 * prints each zoned building's name as
 * `<a href="http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=<X>&y=<Y>">`.
 * Voyager's own URL router turns that pseudo-URL into a map move
 * (`Kernel/World.pas:3155`, `Voyager/FavView.pas:893` emits the same `SELECT` form). This
 * module is the browser-client equivalent of that router: everything that is not the
 * `SELECT` form translates to `null` and is left inert.
 */

export interface LocalAspSelect {
  readonly action: 'select';
  readonly x: number;
  readonly y: number;
}

const COORD_RE = /^\d{1,5}$/;

/**
 * `http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=<n>&y=<n>` → the tile;
 * anything else (a relative URL, another host, another `frame_Action`, malformed
 * coordinates) → `null`. Never throws.
 */
export function translateLocalAspUrl(href: string): LocalAspSelect | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== 'local.asp') return null;

  const frameId = url.searchParams.get('frame_Id');
  const frameAction = url.searchParams.get('frame_Action');
  if (frameId?.toLowerCase() !== 'mapisoview') return null;
  if (frameAction?.toLowerCase() !== 'select') return null;

  const xRaw = url.searchParams.get('x')?.trim() ?? '';
  const yRaw = url.searchParams.get('y')?.trim() ?? '';
  if (!COORD_RE.test(xRaw) || !COORD_RE.test(yRaw)) return null;

  return { action: 'select', x: Number(xRaw), y: Number(yRaw) };
}
