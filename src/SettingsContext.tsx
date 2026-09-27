import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot, collection, getDocs, query, where } from 'firebase/firestore';
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

const SETTINGS_CACHE_KEY = 'guestly_global_settings_v1';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<GlobalSettings | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      return raw ? (JSON.parse(raw) as GlobalSettings) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applyFavicon = (faviconUrl?: string) => {
      if (!faviconUrl || typeof document === 'undefined') return;
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
    };

    if (settings?.faviconUrl) {
      applyFavicon(settings.faviconUrl);
    }

    const resolveMediaFallbackIfNeeded = async (baseData: GlobalSettings): Promise<GlobalSettings> => {
      if (baseData.logoUrl && baseData.faviconUrl) return baseData;
      try {
        const mediaSnap = await getDocs(collection(db, 'media'));
        const items = mediaSnap.docs.map((d) => d.data() as any);
        const sortNewest = (a: any, b: any) => {
          const tA = a.uploadedAt?.toMillis ? a.uploadedAt.toMillis() : Date.parse(String(a.uploadedAt || '')) || 0;
          const tB = b.uploadedAt?.toMillis ? b.uploadedAt.toMillis() : Date.parse(String(b.uploadedAt || '')) || 0;
          return tB - tA;
        };
        const next: GlobalSettings = { ...baseData };
        if (!next.faviconUrl) {
          const favs = items.filter((m) => m.category === 'favicon' && m.url).sort(sortNewest);
          if (favs.length > 0) next.faviconUrl = favs[0].url;
        }
        if (!next.logoUrl) {
          const logos = items.filter((m) => m.category === 'logo' && m.url).sort(sortNewest);
          if (logos.length > 0) next.logoUrl = logos[0].url;
        }
        return next;
      } catch {
        return baseData;
      }
    };

    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'global'),
      async (docSnap) => {
        const rawData = docSnap.exists() ? (docSnap.data() as GlobalSettings) : {};
        const data = await resolveMediaFallbackIfNeeded(rawData);
        setSettings(data);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
          } catch {
            // ignore storage quota errors
          }
        }
        applyFavicon(data.faviconUrl);
        setLoading(false);
      },
      (err: any) => {
        setSettings((prev) => prev || {});
        setLoading(false);
        if (err?.message?.includes('Missing or insufficient permissions') || err?.code === 'permission-denied') {
          console.warn('Settings not accessible (using default settings):', err?.message || err);
        } else if (err?.message?.includes('Quota') || err?.message?.includes('quota') || String(err).includes('Quota')) {
          console.warn('Failed to load settings (Quota Exceeded):', err);
        } else {
          console.warn('Could not load custom settings, falling back to defaults:', err);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
        {children}
    </SettingsContext.Provider>
  );
};
