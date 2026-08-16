/**
 * Census of `parsePropertyResponse()`'s "return the whole payload" fallback.
 *
 * When no `Name="value"` pair matches the requested property, the parser falls
 * back to returning the payload's first non-empty line "for backward
 * compatibility". That fallback is genuinely load-bearing — several members
 * answer with a bare value and no property name, and those callers depend on it.
 *
 * But it also silently answers the WRONG question. Asking for `Tax.Id` against a
 * payload of `Tax0Id="#5"` matches nothing, so the caller receives `Tax0Id="#5`
 * as if it were a value. There is no way to tell the two situations apart from
 * the return type: both are a non-empty string.
 *
 * Changing the fallback means auditing 60+ call sites, so this follows the P-M3
 * method instead: **measure first**. The payload shape separates the two cases
 * without touching any caller —
 *
 *   - payload contains an `identifier="` pair → the response WAS structured and
 *     we simply failed to find the asked-for name. The returned string is
 *     another property's text. Suspicious.
 *   - payload contains no such pair → a bare value. The fallback is doing its
 *     job. Benign.
 *
 * Read the census at `GET /api/property-fallback`, the same way the P-M3 tally
 * is read at `/api/rdo-error-contract`. Nothing here changes behaviour.
 */

/** One property name whose parse fell through to the whole-payload fallback. */
export interface PropertyFallbackObservation {
  /** The property the caller asked for. */
  propName: string;
  /**
   * True when the payload carried `identifier="…"` pairs but none of them was
   * `propName` — i.e. the returned string belongs to a different property.
   */
  structuredPayload: boolean;
  /** First 120 chars of the payload, for triage. Values are not secrets here. */
  sample: string;
}

const tally = new Map<string, { observation: PropertyFallbackObservation; count: number }>();

/** Does the payload look like `Name="value"` pairs? */
const STRUCTURED_PAYLOAD = /(?:^|[\s,])[A-Za-z_][A-Za-z0-9_.]*\s*=\s*"/;

export function resetPropertyFallbackCensus(): void {
  tally.clear();
}

/** Snapshot, most frequent first. */
export function getPropertyFallbackCensus(): Array<{ observation: PropertyFallbackObservation; count: number }> {
  return [...tally.values()].sort((a, b) => b.count - a.count);
}

/**
 * Record one fallback. Returns nothing and throws nothing — this is measurement
 * only, deliberately kept free of any decision.
 */
export function recordPropertyFallback(propName: string, payload: string): void {
  const structuredPayload = STRUCTURED_PAYLOAD.test(payload);
  // Keyed by name AND shape: the same property can legitimately answer bare in
  // one place and structured in another, and only the structured case is a bug.
  const key = `${propName}:${structuredPayload ? 'structured' : 'bare'}`;
  const existing = tally.get(key);
  if (existing) {
    existing.count++;
    return;
  }
  tally.set(key, {
    observation: { propName, structuredPayload, sample: payload.slice(0, 120) },
    count: 1,
  });
}
