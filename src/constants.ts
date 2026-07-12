import { PackageTier } from "./types";


export interface PackageConfig {
  name: string;
  activeDays: number;
  maxEvents: number;
  maxGuests: number;
  maxStaff: number;
  maxSouvenirTypes: number;
  features: string[];
  price: string;
}

export const PACKAGES: Record<PackageTier, PackageConfig> = {
  trial: {
    name: 'Trial (Free)',
    activeDays: 1,
    maxEvents: 1,
    maxGuests: 10,
    maxStaff: 0,
    maxSouvenirTypes: 1,
    features: ['QR Check-in & Souvenir Tracking'],
    price: 'Free'
  },
  lite: {
    name: 'Lite Service',
    activeDays: 30,
    maxEvents: 1,
    maxGuests: 150,
    maxStaff: 0,
    maxSouvenirTypes: 1,
    features: ['QR Check-in & Souvenir Tracking'],
    price: 'Rp 39.000'
  },
  standard: {
    name: 'Standard Service',
    activeDays: 30,
    maxEvents: 5,
    maxGuests: 250,
    maxStaff: 2,
    maxSouvenirTypes: 3,
    features: ['QR Check-in & Souvenir Tracking'],
    price: 'Rp 139.000'
  },
  pro: {
    name: 'Pro Service',
    activeDays: 60,
    maxEvents: 10,
    maxGuests: 500,
    maxStaff: 5,
    maxSouvenirTypes: 5,
    features: ['QR Check-in & Souvenir Tracking', 'WhatsApp Gateway (Notifikasi Check-in)'],
    price: 'Rp 239.000' // Assuming a price, or I can leave it as "Contact Us" or similar. Let's assume 239k.
  }
};
