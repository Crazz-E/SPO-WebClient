import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
  ],
  root: '.',
  publicDir: false, // Don't copy public/ into build output
  build: {
    outDir: 'public',
    emptyOutDir: false, // Don't wipe public/ (contains index.html, old CSS, assets)
    rollupOptions: {
      input: 'src/client/main.tsx',
      output: {
        // Phase 0: Output as react-app.js alongside old client.js
        // Phase 6: Rename to client.js once old code is removed
        entryFileNames: 'react-app.js',
        // CSS in a predictable location (no hash)
        assetFileNames: 'react-app.[ext]',
        // No code splitting in Phase 0
        manualChunks: undefined,
      },
    },
    sourcemap: true,
    target: 'es2020',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@server': path.resolve(__dirname, 'src/server'),
      '@client': path.resolve(__dirname, 'src/client'),
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
});
