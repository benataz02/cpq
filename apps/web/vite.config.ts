import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    // router plugin MUST come before react() (else FoundPluginInBeforeCode #6410)
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
  optimizeDeps: { include: ['ajv', 'ajv-formats', 'lodash'] },
  build: { commonjsOptions: { include: [/@jsonforms/, /node_modules/] } }, // JSONForms ships CJS
  resolve: { dedupe: ['react', 'react-dom', '@ui5/webcomponents', '@ui5/webcomponents-base'] },
  server: {
    port: 5173,
    // dev: forward the API surfaces to apps/api so `${location.origin}/rpc` round-trips.
    // (in Docker, caddy/nginx does this; see Task 9.)
    proxy: {
      '/rpc': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    },
  },
});
