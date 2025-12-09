import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

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
    rootElement.innerHTML = `<div style="color:red; padding: 20px;"><h3>App Crash</h3><pre>${error}</pre></div>`;
}
