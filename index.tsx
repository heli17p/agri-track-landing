
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
} catch (error) {
    console.error("CRITICAL APP CRASH:", error);
    // Display a user-friendly error message if the app fails to mount
    rootElement.innerHTML = `<div style="color:red; padding: 20px; font-family: sans-serif;">
                                <h3>AgriTrack Austria: Kritischer Fehler beim Start</h3>
                                <p>Entschuldigung, die Anwendung konnte nicht geladen werden.</p>
                                <p>Bitte versuche es später noch einmal oder kontaktiere den Support.</p>
                                <pre style="background-color: #eee; padding: 10px; border-radius: 5px; white-space: pre-wrap; word-break: break-all;">${error}</pre>
                            </div>`;
}

