/**
 * "Write to <name>" — the mail addresses the model server actually registers.
 *
 * A company / CEO address is deliberately not offered anywhere: the two
 * `NewMailAccount('company@…')` / `NewMailAccount('CEO@…')` calls in
 * `Kernel/World.pas:6089-6094` sit inside a comment block and never run, so
 * those accounts do not exist on the server.
 */

import { useMailStore } from '../../store/mail-store';
import { useUiStore } from '../../store/ui-store';

/** `<Name>@<World>.net` — the account `TWorld.NewTycoon` registers (`Kernel/World.pas:6137`). */
export function tycoonAddress(name: string, worldName: string): string {
  return `${name}@${worldName}.net`;
}

/**
 * `mayor@<Town>.gov` — the town's mayor box (`Kernel/Kernel.pas:9250`, mailbox
 * name `mayor` from `Kernel/Kernel.pas:13489`). Not the mayor's display title.
 */
export function mayorAddress(townName: string): string {
  return `mayor@${townName}.gov`;
}

/** Open the mail panel in compose with `address` already in To, stacked over whatever is open. */
export function writeTo(address: string): void {
  useMailStore.getState().startCompose(address);
  useUiStore.getState().pushSurface({ kind: 'mail' });
}
