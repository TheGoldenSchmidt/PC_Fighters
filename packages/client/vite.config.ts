import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // im WLAN erreichbar, damit Handys die Seite öffnen können
    port: 5173
  }
});
