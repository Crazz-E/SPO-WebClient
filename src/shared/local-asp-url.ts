/**
 * Translate a Voyager `local.asp` pseudo-URL into the tile it names.
 *
 * `MsgZoned.asp:115-119` (`~/SPO-ASP/Five/0/Visual/Voyager/Mail/SpecialMessages/`) prints
 * each demolished building's name as
 * `<a href="http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=<X>&y=<Y>">`, the same
 * form Voyager's own frame router emits for a map selection (`FavView.pas:893`,
 * `World.pas:3155`). It is not a real URL — the reference client's router matches on
 * `frame_Id` / `frame_Action` and never lets the browser navigate there. Never throws;
 * every unrecognised shape returns null.
 */
export interface LocalAspSelect {
  readonly action: 'select';
  readonly x: number;
  readonly y: number;
}

const COORD = /^\d{1,5}$/;

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
  if (!COORD.test(xRaw) || !COORD.test(yRaw)) return null;

  return { action: 'select', x: Number(xRaw), y: Number(yRaw) };
}
