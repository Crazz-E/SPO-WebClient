/**
 * Client entry point for Vite — React UI layer.
 *
 * Phase 0: Mounts an empty React app to prove the infrastructure works.
 *          The old client.js (esbuild) still handles the game.
 * Phase 1+: React progressively takes over UI rendering.
 * Phase 6: Old client.js is removed entirely.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Global styles (new green design system)
import './styles/design-tokens.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/animations.css';

// Mount React app
const rootElement = document.getElementById('react-root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
