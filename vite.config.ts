import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(11, 19)),
    __BUILD_NUMBER__: JSON.stringify(Math.floor(Date.now() / 1000).toString(36)),
  },
  root: '.',
  publicDir: false, // Don't copy public/ into build output
  build: {
    outDir: 'public',
    emptyOutDir: false, // Don't wipe public/ (contains index.html, old CSS, assets)
    rollupOptions: {
      input: 'src/client/main.tsx',
      output: {
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
        manualChunks: undefined,
      },
    },
    sourcemap: process.env.NODE_ENV !== 'production',
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
