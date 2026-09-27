import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Hard-disable any legacy connection or cached state pointing to backup-guestly / Firebase
if (typeof window !== 'undefined') {
  try {
    // Purge legacy Firebase localStorage keys
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.includes('firebase') || key.includes('backup-guestly') || key.includes('firestore'))) {
        localStorage.removeItem(key);
      }
    }
    // Purge legacy Firebase IndexedDB databases
    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
      window.indexedDB.databases().then((dbs) => {
        dbs.forEach((dbInfo) => {
          if (
            dbInfo.name &&
            (dbInfo.name.includes('firebase') ||
              dbInfo.name.includes('firestore') ||
              dbInfo.name.includes('backup-guestly'))
          ) {
            window.indexedDB.deleteDatabase(dbInfo.name);
          }
        });
      }).catch(() => {});
    }
    // Block any outgoing fetch requests to backup-guestly or firestore.googleapis.com
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (
        url.includes('backup-guestly') ||
        url.includes('firestore.googleapis.com') ||
        url.includes('identitytoolkit.googleapis.com')
      ) {
        throw new Error('Legacy Firebase/backup-guestly connection is permanently disabled. Using Supabase.');
      }
      return originalFetch(input, init);
    };
  } catch {
    // Ignore cleanup errors
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register Offline-First Service Worker in production; in dev mode, purge stale SW caches so module edits take effect immediately
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if ((import.meta as any).env?.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => reg.unregister());
    }).catch(() => {});
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((k) => {
          if (k.startsWith('guestly-offline-shell')) {
            caches.delete(k);
          }
        });
      }).catch(() => {});
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore registration error in restricted environments
      });
    });
  }
}

