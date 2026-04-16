import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./registerServiceWorker";
import { initializeAdMob } from "./services/admob";
import { initializeOneSignal } from "./services/onesignal";
import { initializeFirebase, recordError } from "./services/firebase";

// Clear stale cache from previous versions (one-time per build)
declare const __BUILD_TIMESTAMP__: string;
const BUILD_VERSION = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev';
if (localStorage.getItem('cache_version') !== BUILD_VERSION) {
  ['offline_providers', 'offline_categories', 'offline_packages', 'offline_payment_providers',
   'offline_delivery_instructions', 'offline_banners', 'offline_app_settings', 'offline_featured_packages'
  ].forEach(key => localStorage.removeItem(key));
  localStorage.setItem('cache_version', BUILD_VERSION);
}

// Register service worker for offline functionality
registerServiceWorker();

// Initialize AdMob for mobile ads
initializeAdMob();

// Initialize OneSignal push notifications
initializeOneSignal();

// Initialize Firebase Analytics & Crashlytics
initializeFirebase();

// Global error handler for Crashlytics
window.onerror = (message, source, lineno, colno, error) => {
  if (error) recordError(error);
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
