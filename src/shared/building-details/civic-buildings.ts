/** Visual class prefixes that represent civic government buildings (Capitol, TownHall). */
const CIVIC_VISUAL_CLASS_PREFIXES = ['PGICapitol', 'PGITownHall'] as const;

/** Returns true if the visual class represents a Capitol or TownHall building. */
export function isCivicBuilding(visualClass: string): boolean {
  return CIVIC_VISUAL_CLASS_PREFIXES.some(prefix => visualClass.startsWith(prefix));
}
