/**
 * The SaveIndicator key for a connection write (B6).
 *
 * `RDOConnectInput` / `RDODisconnectOutput` and their siblings carry a `connectionList` of
 * coordinates, so the default key — member plus parameters — is different on every click and
 * no control can watch it. What the panel shows is one gate: this supply, this product. So the
 * key is the member plus the fluid, and the indicator sits once, in that gate's action row.
 */

export type ConnectionRdoCommand =
  | 'RDOConnectInput'
  | 'RDOConnectOutput'
  | 'RDODisconnectInput'
  | 'RDODisconnectOutput';

export function connectionPendingKey(command: ConnectionRdoCommand, fluidId: string): string {
  return `${command}:${fluidId}`;
}
