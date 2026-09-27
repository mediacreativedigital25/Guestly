import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EInviteTemplate } from '../types';

const LOCAL_CACHE_KEY = 'guestly_einvite_templates_v1';

export const DEFAULT_EINVITE_TEMPLATES: EInviteTemplate[] = [
  {
    id: 'default-blush-arch',
    name: 'Card 1 — Blush Floral Arch (Default)',
    imageUrl: '',
    primaryColor: '#153B31',
    accentColor: '#C98583',
    guestBoxBg: '#F3E4E2',
    footerColor: '#C27D7A',
    isDefault: true,
  },
  {
    id: 'default-royal-gold',
    name: 'Card 2 — Luxury Royal Gold Arch',
    imageUrl: '',
    primaryColor: '#4A3519',
    accentColor: '#B38748',
    guestBoxBg: '#F5EFE4',
    footerColor: '#9E7840',
    isDefault: false,
  },
  {
    id: 'default-emerald-sage',
    name: 'Card 3 — Emerald Botanical Arch',
    imageUrl: '',
    primaryColor: '#16382C',
    accentColor: '#4F7A65',
    guestBoxBg: '#E6F0EB',
    footerColor: '#3B6652',
    isDefault: false,
  },
];

export const eInviteTemplateService = {
  getCachedTemplates(): EInviteTemplate[] {
    if (typeof window === 'undefined') return DEFAULT_EINVITE_TEMPLATES;
    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      if (!raw) return DEFAULT_EINVITE_TEMPLATES;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_EINVITE_TEMPLATES;
  },

  async getTemplates(): Promise<EInviteTemplate[]> {
    try {
      const snap = await getDoc(doc(db, 'settings', 'eInviteTemplates'));
      if (snap.exists() && Array.isArray(snap.data()?.templates) && snap.data().templates.length > 0) {
        const list = snap.data().templates as EInviteTemplate[];
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(list));
        }
        return list;
      }
    } catch (e) {
      console.warn('Fallback to cached E-Invitation templates:', e);
    }
    return this.getCachedTemplates();
  },

  async saveTemplates(templates: EInviteTemplate[]): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(templates));
    }
    await setDoc(
      doc(db, 'settings', 'eInviteTemplates'),
      {
        templates,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },
};
