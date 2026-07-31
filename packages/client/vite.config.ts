/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // im WLAN erreichbar, damit Handys die Seite öffnen können
    port: 5173
  },
  test: {
    // GameScreen rendert echtes DOM (Overlays, Fokus, Animationen), deshalb
    // jsdom statt der Node-Umgebung der Engine- und Server-Suiten.
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.tsx', 'test/**/*.test.ts']
  }
});
