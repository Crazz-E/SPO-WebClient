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
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export function App() {
  const status = useGameStore((s) => s.status);

  // Register global keyboard shortcuts (B, E, M, Escape, Cmd+K)
  useKeyboardShortcuts();

  // Cinematic login when not connected
  if (status !== 'connected') {
    return (
      <>
        <LoginScreen />
        <ToastContainer />
      </>
    );
  }

  // Game HUD overlay when connected
  return (
    <>
      <GameScreen />
      <ToastContainer />
    </>
  );
}
