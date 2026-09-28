import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'leaflet/dist/leaflet.css'; // WICHTIG: CSS für Karte importieren

// Garantiert Favicon im Browser-Tab und Taskleiste (auch bei relativen Vite/iFrame Pfaden)
const setupFavicon = () => {
  try {
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="120" fill="#16a34a"/><path fill="white" d="M112,336c-26.5,0-48,21.5-48,48s21.5,48,48,48s48-21.5,48-48S138.5,336,112,336z M400,256c-44.2,0-80,35.8-80,80s35.8,80,80,80s80-35.8,80-80S444.2,256,400,256z M180,288h-40v-64h-32v64h-20v80h56v35.6c6.2-1.9,12.7-2.9,19.4-3.2c0.2-10.3,1.8-20.4,4.7-30.1c8.4-28,29.3-49.8,56.5-59.5V208c0-8.8,7.2-16,16-16h96c8.8,0,16,7.2,16,16v89.4c17.5,6,33.3,16.5,45.7,30.3V256h-88v-48h-64v80h16.5c-2.4,5.1-4.4,10.4-5.9,15.9c-0.1,0.4-0.2,0.7-0.3,1.1H180V288z M352,208h48v32h-48V208z"/></svg>`;
    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgIcon)}`;

    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = dataUri;

    let appleLink: HTMLLinkElement | null = document.querySelector("link[rel='apple-touch-icon']");
    if (!appleLink) {
      appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleLink);
    }
    appleLink.href = dataUri;
  } catch (e) {
    console.warn("Could not set dynamic favicon", e);
  }
};
setupFavicon();

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