/**
 * App — Root React component.
 *
 * Routes between LoginScreen (cinematic full-screen auth) and
 * GameScreen (map-first HUD overlay) based on connection status.
 * Keyboard shortcuts are registered globally here.
 */

import { lazy, Suspense } from 'react';
import { useGameStore } from './store';
import { LoginScreen } from './layouts/LoginScreen';
import { GameScreen } from './layouts/GameScreen';
import { ToastContainer } from './components/common';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useClient } from './context';

// Lazy-loaded modal — not needed on initial render
const CompanyCreationModal = lazy(() =>
  import('./components/modals/CompanyCreationModal').then(m => ({ default: m.CompanyCreationModal }))
);

export function App() {
  const status = useGameStore((s) => s.status);
  const client = useClient();

  // Register global keyboard shortcuts (B, E, M, R, D, Escape, Cmd+K)
  useKeyboardShortcuts(client);

  return (
    <>
      {status !== 'connected' ? <LoginScreen /> : <GameScreen />}
      <Suspense fallback={null}>
        <CompanyCreationModal />
      </Suspense>
      <ToastContainer />
    </>
  );
}
