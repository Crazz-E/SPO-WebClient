/**
 * App — Root React component.
 *
 * Routes between LoginScreen (cinematic full-screen auth) and
 * GameScreen (map-first HUD overlay) based on connection status.
 * Keyboard shortcuts are registered globally here.
 */

import { useGameStore } from './store';
import { LoginScreen } from './layouts/LoginScreen';
import { GameScreen } from './layouts/GameScreen';
import { ToastContainer } from './components/common';
import { CompanyCreationModal } from './components/modals';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useClient } from './context';

export function App() {
  const status = useGameStore((s) => s.status);
  const client = useClient();

  // Register global keyboard shortcuts (B, E, M, R, D, Escape, Cmd+K)
  useKeyboardShortcuts(client);

  return (
    <>
      {status !== 'connected' ? <LoginScreen /> : <GameScreen />}
      <CompanyCreationModal />
      <ToastContainer />
    </>
  );
}
