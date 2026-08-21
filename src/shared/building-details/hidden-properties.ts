/**
 * Properties the inspector reads but never shows.
 *
 * These are hidden at RENDER time, not dropped from the templates: several of
 * them still do work off-screen.
 *
 *   - `SecurityId` decides `canGovern` server-side (building-details-handler).
 *   - `MoneyGraph` ("Has Graph") gates whether the revenue chart is drawn at
 *     all (PropertyGroup, GRAPH branch) — the flag is read from the value map,
 *     which is why hiding a ROW is not the same as removing a PROPERTY.
 *
 * The rest are duplicates of what the header already states (`Creator`,
 * `OwnerName`) or raw fields with no reading for a player (`Trouble`,
 * `TradeRole`/`Role`, `TradeLevel`, `UpgradeActions`).
 */
export const HIDDEN_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  // Trade role — declared as `TradeRole` in most templates, `Role` in others
  'TradeRole',
  'Role',
  'TradeLevel',
  // "Has Graph" — the boolean behind the revenue chart, not a fact to display
  'MoneyGraph',
  'UpgradeActions',
  'SecurityId',
  'Trouble',
  // Owner: the header already names the society and the tycoon
  'Creator',
  'OwnerName',
]);

/** Should this property's row be rendered? */
export function isHiddenProperty(rdoName: string): boolean {
  return HIDDEN_PROPERTY_NAMES.has(rdoName);
}
