import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';

interface GlobalSettings {
  logoUrl?: string;
  faviconUrl?: string;
  fonnteToken?: string;
  paymentGateway?: {
    serverKey?: string;
    clientKey?: string;
  }
}

interface SettingsContextType {
  settings: GlobalSettings | null;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({ settings: null, loading: true });

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as GlobalSettings);
        
        // Apply favicon
        const faviconUrl = docSnap.data().faviconUrl;
        if (faviconUrl) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = faviconUrl;
        }
      } else {
        setSettings({});
      }
      setLoading(false);
    }, (err: any) => {
      console.error('Failed to load settings:', err);
      if (err.code !== 'unavailable') {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
        {children}
    </SettingsContext.Provider>
  );
};
