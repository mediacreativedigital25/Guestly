import React, { createContext, useContext, useState, useEffect } from 'react';
import { GuestlyService } from './types';

export interface CartAddonItem {
  service: GuestlyService;
  quantity: number;
}

interface CartContextType {
  mainPackage: GuestlyService | null;
  addons: CartAddonItem[];
  setMainPackage: (pkg: GuestlyService | null) => void;
  addAddon: (addon: GuestlyService) => void;
  removeAddon: (serviceId: string) => void;
  toggleAddon: (addon: GuestlyService) => void;
  updateAddonQuantity: (serviceId: string, quantity: number) => void;
  clearCart: () => void;
  isAddonInCart: (serviceId: string) => boolean;
  isPackageInCart: (serviceId: string) => boolean;
  itemCount: number;
  totalPrice: number;
  totalNormalPrice: number;
  totalDiscount: number;
  totalEventQuota: number;
  totalClientQuota: number;
  totalGuestQuota: number;
  totalWaBlastQuota: number;
  totalActivePeriodDays: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = 'guestly_service_cart_v1';

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mainPackage, setMainPackageState] = useState<GuestlyService | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.mainPackage || null;
      }
    } catch (e) {
      console.warn('Failed to read cart from localStorage', e);
    }
    return null;
  });

  const [addons, setAddonsState] = useState<CartAddonItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed.addons) ? parsed.addons : [];
      }
    } catch (e) {
      console.warn('Failed to read cart addons from localStorage', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mainPackage,
          addons,
        })
      );
    } catch (e) {
      console.warn('Failed to save cart to localStorage', e);
    }
  }, [mainPackage, addons]);

  const setMainPackage = (pkg: GuestlyService | null) => {
    setMainPackageState(pkg);
  };

  const addAddon = (addon: GuestlyService) => {
    if (!addon.id) return;
    setAddonsState((prev) => {
      const existing = prev.find((item) => item.service.id === addon.id);
      if (existing) {
        return prev.map((item) =>
          item.service.id === addon.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { service: addon, quantity: 1 }];
    });
  };

  const removeAddon = (serviceId: string) => {
    setAddonsState((prev) => prev.filter((item) => item.service.id !== serviceId));
  };

  const toggleAddon = (addon: GuestlyService) => {
    if (!addon.id) return;
    setAddonsState((prev) => {
      const exists = prev.some((item) => item.service.id === addon.id);
      if (exists) {
        return prev.filter((item) => item.service.id !== addon.id);
      }
      return [...prev, { service: addon, quantity: 1 }];
    });
  };

  const updateAddonQuantity = (serviceId: string, quantity: number) => {
    if (quantity <= 0) {
      removeAddon(serviceId);
      return;
    }
    setAddonsState((prev) =>
      prev.map((item) => (item.service.id === serviceId ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setMainPackageState(null);
    setAddonsState([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  };

  const isAddonInCart = (serviceId: string) => {
    return addons.some((item) => item.service.id === serviceId);
  };

  const isPackageInCart = (serviceId: string) => {
    return mainPackage?.id === serviceId;
  };

  // Calculations
  const packagePrice = mainPackage ? mainPackage.price : 0;
  const addonsPrice = addons.reduce(
    (sum, item) => sum + (item.service.price || 0) * (item.quantity || 1),
    0
  );
  const totalPrice = packagePrice + addonsPrice;

  const packageNormal = mainPackage
    ? (mainPackage.normalPrice && mainPackage.normalPrice > mainPackage.price ? mainPackage.normalPrice : mainPackage.price)
    : 0;
  const addonsNormal = addons.reduce((sum, item) => {
    const normal = item.service.normalPrice && item.service.normalPrice > item.service.price
      ? item.service.normalPrice
      : item.service.price;
    return sum + normal * (item.quantity || 1);
  }, 0);
  const totalNormalPrice = packageNormal + addonsNormal;
  const totalDiscount = Math.max(0, totalNormalPrice - totalPrice);

  const totalEventQuota =
    (mainPackage?.eventQuota || 0) +
    addons.reduce((sum, item) => sum + (item.service.eventQuota || 0) * (item.quantity || 1), 0);

  const totalClientQuota =
    (mainPackage?.clientQuota || 0) +
    addons.reduce((sum, item) => sum + (item.service.clientQuota || 0) * (item.quantity || 1), 0);

  const totalGuestQuota =
    (mainPackage?.guestQuota || 0) +
    addons.reduce((sum, item) => sum + (item.service.guestQuota || 0) * (item.quantity || 1), 0);

  const totalWaBlastQuota =
    (mainPackage?.waBlastQuota || 0) +
    addons.reduce((sum, item) => sum + (item.service.waBlastQuota || 0) * (item.quantity || 1), 0);

  const totalActivePeriodDays =
    (mainPackage?.activePeriodDays || 0) +
    addons.reduce((sum, item) => sum + (item.service.activePeriodDays || 0) * (item.quantity || 1), 0);

  const itemCount = (mainPackage ? 1 : 0) + addons.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        mainPackage,
        addons,
        setMainPackage,
        addAddon,
        removeAddon,
        toggleAddon,
        updateAddonQuantity,
        clearCart,
        isAddonInCart,
        isPackageInCart,
        itemCount,
        totalPrice,
        totalNormalPrice,
        totalDiscount,
        totalEventQuota,
        totalClientQuota,
        totalGuestQuota,
        totalWaBlastQuota,
        totalActivePeriodDays,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
