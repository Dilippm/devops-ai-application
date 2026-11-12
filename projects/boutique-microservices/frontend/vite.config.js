import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, /api is proxied to the gateway, just as nginx does in the
// container, so the app always calls same-origin /api URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': process.env.GATEWAY_URL || 'http://localhost:3001',
    },
  },
});
