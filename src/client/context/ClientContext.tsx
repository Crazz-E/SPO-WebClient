/**
 * ClientContext — React context for client callbacks.
 *
 * Components access callbacks via useClient():
 *   const client = useClient();
 *   client.onSomething(args);
 */

import { createContext, useContext } from 'react';
import type { ClientCallbacks } from '../bridge/client-bridge';

export const ClientContext = createContext<ClientCallbacks | null>(null);

export function useClient(): ClientCallbacks {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClient must be used within ClientContext.Provider');
  return ctx;
}
