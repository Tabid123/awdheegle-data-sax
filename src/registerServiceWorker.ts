declare const __BUILD_TIMESTAMP__: string;

const BUILD_VERSION = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev';

export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('[SW] Registered, build version:', BUILD_VERSION);
      
      // Force update check on every load
      registration.update();
      
      // Send build version to SW so it can bust old caches
      const sendVersion = (sw: ServiceWorker) => {
        sw.postMessage({ type: 'SET_VERSION', version: BUILD_VERSION });
      };

      // Send to active SW immediately
      if (registration.active) {
        sendVersion(registration.active);
      }

      // Check for updates when user returns to the tab
      const checkForUpdate = () => { registration.update(); };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('focus', checkForUpdate);
      
      // Listen for NEW_VERSION_AVAILABLE message — auto-reload
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NEW_VERSION_AVAILABLE') {
          console.log('[SW] New content available, reloading...');
          window.location.reload();
        }
      });
      
      // When a new SW is installed, activate it immediately and send version
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] New SW installed, activating...');
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
            if (newWorker.state === 'activated') {
              sendVersion(newWorker);
            }
          });
        }
      });
      
      // Reload when the new service worker takes over
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[SW] Controller changed, refreshing...');
          window.location.reload();
        }
      });
      
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
};