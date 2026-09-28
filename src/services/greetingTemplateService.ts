import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { resolveMediaUrl } from '../lib/utils';
import { GreetingScreenTemplate } from '../types';
import defaultGreetingCoupleBg from '../assets/images/greeting_couple_seamless_bg_1790542004102.jpg';
import defaultGreetingStageCleanBg from '../assets/images/greeting_stage_clean_bg_1790553243503.jpg';

const LOCAL_CACHE_KEY = 'guestly_greeting_templates_v4';

export const DEFAULT_GREETING_COUPLE_BG_URL = defaultGreetingCoupleBg;
export const DEFAULT_GREETING_STAGE_CLEAN_BG_URL = defaultGreetingStageCleanBg;

export const DEFAULT_GREETING_TEMPLATES: GreetingScreenTemplate[] = [
  {
    id: 'default-blush-stage',
    name: 'Layar Sapa 1 — Blush Floral & Couple (Default)',
    imageUrl: defaultGreetingCoupleBg,
    primaryColor: '#12392F',
    accentColor: '#C98583',
    coupleNameColor: '#9B6B34',
    guestBoxBg: '#F2E2DC',
    footerColor: '#C48481',
    showFooterStrip: true,
    isDefault: true,
  },
  {
    id: 'default-royal-gold-stage',
    name: 'Layar Sapa 2 — Luxury Royal Gold & Couple',
    imageUrl: defaultGreetingCoupleBg,
    primaryColor: '#4A3519',
    accentColor: '#B38748',
    coupleNameColor: '#8C6226',
    guestBoxBg: '#F5EFE4',
    footerColor: '#9E7840',
    showFooterStrip: true,
    isDefault: false,
  },
  {
    id: 'default-emerald-botanical-stage',
    name: 'Layar Sapa 3 — Emerald Botanical & Couple',
    imageUrl: defaultGreetingCoupleBg,
    primaryColor: '#16382C',
    accentColor: '#4F7A65',
    coupleNameColor: '#8B6532',
    guestBoxBg: '#E6F0EB',
    footerColor: '#3B6652',
    showFooterStrip: true,
    isDefault: false,
  },
];

export const greetingTemplateService = {
  getCachedTemplates(): GreetingScreenTemplate[] {
    if (typeof window === 'undefined') return DEFAULT_GREETING_TEMPLATES;
    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      if (!raw) return DEFAULT_GREETING_TEMPLATES;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t: GreetingScreenTemplate) => ({
          ...t,
          imageUrl: t.imageUrl ? resolveMediaUrl(t.imageUrl) : defaultGreetingCoupleBg,
          couplePhotoUrl: t.couplePhotoUrl ? resolveMediaUrl(t.couplePhotoUrl) : undefined,
        }));
      }
    } catch {
      // ignore
    }
    return DEFAULT_GREETING_TEMPLATES;
  },

  async getTemplates(): Promise<GreetingScreenTemplate[]> {
    try {
      const snap = await getDoc(doc(db, 'settings', 'greetingScreenTemplates'));
      if (snap.exists() && Array.isArray(snap.data()?.templates) && snap.data().templates.length > 0) {
        const list = (snap.data().templates as GreetingScreenTemplate[]).map((t) => ({
          ...t,
          imageUrl: t.imageUrl ? resolveMediaUrl(t.imageUrl) : defaultGreetingCoupleBg,
          couplePhotoUrl: t.couplePhotoUrl ? resolveMediaUrl(t.couplePhotoUrl) : undefined,
        }));
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(list));
        }
        return list;
      }
    } catch (e) {
      console.warn('Fallback to cached Layar Sapa templates:', e);
    }
    return this.getCachedTemplates();
  },

  async saveTemplates(templates: GreetingScreenTemplate[]): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(templates));
    }
    await setDoc(
      doc(db, 'settings', 'greetingScreenTemplates'),
      {
        templates,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },
};
