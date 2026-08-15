import { KNOWN_RDO_COMMANDS } from './building-property-handler';
import * as templateGroups from '../../shared/building-details/template-groups';
import type { RdoCommandMapping } from '../../shared/building-details/property-definitions';

/**
 * The UI and the gateway must agree on the command vocabulary.
 *
 * Since M-D, an unmapped property name is refused instead of being forwarded to
 * the server verbatim. That is the right behaviour — the old fallback turned a
 * mapping bug into a silent no-op on the wire — but it means a command declared
 * in a UI mapping and missing from KNOWN_RDO_COMMANDS now fails at runtime, in
 * front of the user, on a control that used to appear to work.
 *
 * This test is the compile-time-ish guard for that: it fails the moment the two
 * sides drift, instead of waiting for someone to click the control.
 */

/** Every `command` string declared across the shared rdoCommands mappings. */
function declaredCommands(): Set<string> {
  const found = new Set<string>();

  for (const group of Object.values(templateGroups)) {
    const rdoCommands = (group as { rdoCommands?: Record<string, RdoCommandMapping> })?.rdoCommands;
    if (!rdoCommands) continue;
    for (const mapping of Object.values(rdoCommands)) {
      if (mapping?.command) found.add(mapping.command);
    }
  }
  return found;
}

describe('UI command vocabulary vs gateway allowlist', () => {
  it('declares at least the commands we know the UI ships', () => {
    // Sanity: if the scan finds nothing, the assertion below is vacuous.
    expect(declaredCommands().size).toBeGreaterThan(20);
  });

  it('has no UI command the gateway would refuse', () => {
    // `property` is not an RDO member — it is the marker for a direct SET, and
    // setBuildingProperty handles it before the allowlist is consulted.
    const orphans = [...declaredCommands()]
      .filter(command => command !== 'property')
      .filter(command => !KNOWN_RDO_COMMANDS.has(command));

    expect(orphans).toEqual([]);
  });
});
