import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';

interface GlobalSettings {
  logoUrl?: string;
  faviconUrl?: string;
  fonnteToken?: string;
  fonnteTemplates?: {
    orderCreated?: string;
    orderPaid?: string;
    orderCancelled?: string;
  };
  activePaymentMethod?: 'manual' | 'tripay';
  paymentGateway?: {
    serverKey?: string;
    clientKey?: string;
  };
  manualPayment?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    instructions?: string;
  };
  salespage?: {
    heroTitle?: string;
    heroHighlight?: string;
    heroSubtitle?: string;
    heroImage?: string;
    
    stat1Value?: string; stat1Label?: string;
    stat2Value?: string; stat2Label?: string;
    stat3Value?: string; stat3Label?: string;
    stat4Value?: string; stat4Label?: string;

    problemTitle?: string;
    problemItems?: string;
    problemImage?: string;

    solutionTitle?: string;
    solutionDesc?: string;

    stepsTitle?: string;
    s1Title?: string; s1Desc?: string;
    s2Title?: string; s2Desc?: string;
    s3Title?: string; s3Desc?: string;
    s4Title?: string; s4Desc?: string;

    ctaTitle?: string;
    ctaDesc?: string;
    ctaImage?: string;
  };
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
    const loadSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'global'));
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
      } catch (err: any) {
        if (err?.message?.includes('Quota') || err?.message?.includes('quota') || String(err).includes('Quota')) {
          console.warn('Failed to load settings (Quota Exceeded):', err);
        } else {
          console.error('Failed to load settings:', err);
        }
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
        {children}
    </SettingsContext.Provider>
  );
};
