
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Umgebungsvariablen aus der .env-Datei laden
    // `process.cwd()` stellt sicher, dass die .env-Datei im aktuellen Arbeitsverzeichnis gesucht wird
    const env = loadEnv(mode, process.cwd(), '');

    return {
      server: {
        port: 3000,
        host: '0.0.0.0', // Erlaubt den Zugriff von Netzwerkgeräten für lokales Testen
      },
      plugins: [react()],
      define: {
        // Umgebungsvariablen für den Client-Side-Code verfügbar machen
        // Stelle sicher, dass GEMINI_API_KEY in deiner .env-Datei definiert ist!
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          // Pfad-Alias für einfachere Imports einrichten
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

