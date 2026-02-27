/**
 * Single entry point — boots StarpeaceClient and mounts React UI.
 *
 * Vite bundles this into app.js. The client instance is created first,
 * then React renders with callbacks passed directly via ClientContext.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ClientContext } from './context';
import { StarpeaceClient } from './client';
import './styles/design-tokens.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/animations.css';

const client = new StarpeaceClient();

const rootElement = document.getElementById('react-root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ClientContext.Provider value={client.callbacks}>
        <App />
      </ClientContext.Provider>
    </StrictMode>
  );
}
