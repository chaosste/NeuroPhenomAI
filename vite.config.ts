import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Azure: users provide API keys in Settings.
  // Cloud Run showcase: VITE_SHOWCASE_MODE=true + server GEMINI_API_KEY proxy.
  define: {
    'import.meta.env.VITE_SHOWCASE_MODE': JSON.stringify(
      process.env.VITE_SHOWCASE_MODE === 'true' ? 'true' : ''
    )
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 8080,
    host: '0.0.0.0'
  },
  preview: {
    port: 8080,
    host: '0.0.0.0'
  }
});
