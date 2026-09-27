import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Safely parse Firestore timestamp or serialized representation
export function parseFirestoreDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (typeof timestamp === 'number') return new Date(timestamp);
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) return d;
  }
  if (timestamp.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000);
  }
  if (timestamp._seconds !== undefined) {
    return new Date(timestamp._seconds * 1000); 
  }
  return null;
}

export function getExpirationDate(input: string | { date?: string; activeUntil?: string }): Date {
  const dateString = typeof input === 'string' ? input : (input?.activeUntil || input?.date || new Date().toISOString());
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return new Date();
  date.setDate(date.getDate() + 30); // Or whatever default
  return date;
}

export function getDaysRemaining(input: string | { date?: string; activeUntil?: string }): number {
  if (!input) return 0;
  const diff = getExpirationDate(input).getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 3600 * 24)));
}

export function isEventExpired(input: string | { date?: string; activeUntil?: string }): boolean {
  return getDaysRemaining(input) <= 0;
}

export function getRoleLabel(role?: string, staffType?: string): string {
  switch (role) {
    case 'superadmin':
      return 'Super Admin';
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'partner':
      return 'Partner';
    case 'client':
      return 'Client';
    case 'staff':
      if (staffType === 'checkin') return 'Staff Scan Kehadiran';
      if (staffType === 'souvenir') return 'Staff Souvenir';
      return 'Staff All-in (Scan & Souvenir)';
    default:
      return role || 'User';
  }
}

export function getOperatorLabel(user?: { name?: string; email?: string; role?: string; staffType?: string } | null): string {
  if (!user) return 'Petugas';
  const name = user.name || user.email || 'Petugas';
  const roleLabel = getRoleLabel(user.role, user.staffType);
  return `${name} (${roleLabel})`;
}

export function getUserBusinessId(
  user?: { id?: string; role?: string; partnerId?: string | null } | null
): string | null {
  if (!user) return null;
  if (user.role === 'superadmin') return null;
  if (user.role === 'owner' || user.role === 'partner') {
    return user.partnerId || user.id || null;
  }
  return user.partnerId || null;
}

export function shouldHideServiceInfo(
  user?: { role?: string; partnerId?: string | null; businessName?: string; hideServiceInfo?: boolean } | null
): boolean {
  if (!user) return true;
  if (user.role === 'superadmin') return false;
  if (user.role === 'staff' || user.role === 'admin') return true;
  if (user.hideServiceInfo === true) return true;
  if (
    user.role === 'client' &&
    (Boolean(user.partnerId && user.partnerId !== 'default-partner') || Boolean(user.businessName))
  ) {
    return true;
  }
  return false;
}

export function canUserCreateEvent(
  user?: { role?: string } | null
): boolean {
  if (!user) return false;
  if (user.role === 'staff' || user.role === 'client') return false;
  return ['superadmin', 'owner', 'admin', 'partner'].includes(user.role || '');
}

export function isPartnerBusinessRegistered(
  user?: {
    role?: string;
    businessName?: string;
    businessAddress?: string;
  } | null,
  ownerProfile?: {
    businessName?: string;
    businessAddress?: string;
  } | null
): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  if (user.role === 'owner' || user.role === 'partner') {
    const bizName = (user.businessName || ownerProfile?.businessName || '').trim();
    const bizAddr = (user.businessAddress || ownerProfile?.businessAddress || '').trim();
    return Boolean(bizName.length > 0 && bizAddr.length > 0);
  }
  if (user.role === 'admin') {
    const bizName = (ownerProfile?.businessName || user.businessName || '').trim();
    const bizAddr = (ownerProfile?.businessAddress || user.businessAddress || '').trim();
    return Boolean(bizName.length > 0 && bizAddr.length > 0);
  }
  return false;
}

export function canUserAccessEvent(
  user?: { id?: string; role?: string; clientId?: string | null; partnerId?: string | null; assignedEventIds?: string[] } | null,
  eventId?: string,
  eventPartnerId?: string | null,
  extraAllowedPartnerIds?: string[]
): boolean {
  if (!user || !eventId) return false;
  if (user.role === 'superadmin') return true;

  const assigned = Array.isArray(user.assignedEventIds) ? user.assignedEventIds : [];
  if (assigned.includes(eventId)) return true;

  const userBizId = getUserBusinessId(user);

  if (user.role === 'owner' || user.role === 'partner') {
    // When eventPartnerId is undefined (e.g. while event detail or scanner is still loading), do not block access
    if (eventPartnerId === undefined) return true;
    if (!eventPartnerId) return false;
    if (
      eventPartnerId === userBizId ||
      eventPartnerId === user.id ||
      (user.partnerId && eventPartnerId === user.partnerId)
    ) {
      return true;
    }
    if (extraAllowedPartnerIds && extraAllowedPartnerIds.includes(eventPartnerId)) {
      return true;
    }
    return false;
  }

  if (user.role === 'admin') {
    if (assigned.length > 0) {
      return assigned.includes(eventId);
    }
    if (eventPartnerId === undefined) return true;
    if (!eventPartnerId) return false;
    if (
      (userBizId && eventPartnerId === userBizId) ||
      (user.partnerId && eventPartnerId === user.partnerId) ||
      eventPartnerId === user.id
    ) {
      return true;
    }
    if (extraAllowedPartnerIds && extraAllowedPartnerIds.includes(eventPartnerId)) {
      return true;
    }
    return false;
  }

  if (user.role === 'staff') {
    return assigned.includes(eventId);
  }

  return true;
}

export async function exportCardToPng(element: HTMLElement, fileName: string): Promise<void> {
  const htmlToImage = await import('html-to-image');
  const images = Array.from(element.querySelectorAll('img'));
  const originalSrcs: { img: HTMLImageElement; src: string; crossOrigin: string | null }[] = [];
  const originalTransform = element.style.transform;
  const textNodes = Array.from(
    element.querySelectorAll<HTMLElement>('h1, h2, h3, h4, p, span')
  );
  const originalTextStyles = textNodes.map((el) => ({
    el,
    overflow: el.style.overflow,
    textOverflow: el.style.textOverflow,
  }));

  try {
    // Temporarily reset scale transform & ellipsis overflow so html-to-image measures true 1:1 widths without clipping
    if (element.dataset?.exportWidth && element.dataset?.exportHeight) {
      element.style.transform = 'none';
    }
    for (const item of originalTextStyles) {
      item.el.style.overflow = 'visible';
      item.el.style.textOverflow = 'clip';
    }

    // Convert external images via server proxy to base64 Data URLs to prevent browser CORS canvas tainting
    await Promise.all(
      images.map(async (img) => {
        const currentSrc = img.getAttribute('src') || '';
        originalSrcs.push({
          img,
          src: currentSrc,
          crossOrigin: img.getAttribute('crossorigin'),
        });
        img.removeAttribute('crossorigin');

        if (currentSrc.startsWith('http://') || currentSrc.startsWith('https://')) {
          let proxied = false;
          try {
            const resp = await fetch(`/api/media/proxy?url=${encodeURIComponent(currentSrc)}`);
            const contentType = resp.headers.get('content-type') || '';
            if (resp.ok && contentType.includes('application/json')) {
              const json = await resp.json();
              if (json?.success && json?.dataUrl) {
                img.src = json.dataUrl;
                if (typeof img.decode === 'function') {
                  await img.decode().catch(() => {});
                }
                proxied = true;
              }
            }
          } catch {
            // Ignore proxy failure and mark image to skip below
          }
          if (!proxied) {
            img.dataset.exportSkipExternal = 'true';
          }
        }
      })
    );

    const safeFilter = (node: HTMLElement) => {
      if (!node) return true;
      if (node.dataset?.exportIgnore === 'true') return false;
      if (node.dataset?.exportSkipExternal === 'true') return false;
      if (node instanceof HTMLStyleElement || node instanceof HTMLLinkElement) return false;
      if (node instanceof HTMLImageElement) {
        const s = node.getAttribute('src') || '';
        if (s.startsWith('http://') || s.startsWith('https://')) return false;
      }
      return true;
    };

    const exportWidth = Number(element.dataset?.exportWidth) || undefined;
    const exportHeight = Number(element.dataset?.exportHeight) || undefined;
    const exportOptions: any = {
      quality: 1,
      pixelRatio: 2.5,
      skipFonts: true,
      backgroundColor: exportWidth ? '#FAF6F2' : '#FFFFFF',
      ...(exportWidth && exportHeight
        ? {
            width: exportWidth,
            height: exportHeight,
            style: {
              transform: 'none',
              width: `${exportWidth}px`,
              height: `${exportHeight}px`,
            },
          }
        : {}),
    };

    let dataUrl: string;
    try {
      dataUrl = await htmlToImage.toPng(element, {
        ...exportOptions,
        filter: safeFilter as any,
      });
    } catch {
      // Fallback: skip all images if any image still failed decoding
      dataUrl = await htmlToImage.toPng(element, {
        ...exportOptions,
        filter: ((node: HTMLElement) => {
          if (!safeFilter(node)) return false;
          if (node instanceof HTMLImageElement) return false;
          return true;
        }) as any,
      });
    }

    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  } finally {
    element.style.transform = originalTransform;
    for (const item of originalTextStyles) {
      item.el.style.overflow = item.overflow;
      item.el.style.textOverflow = item.textOverflow;
    }
    // Restore original image attributes
    for (const item of originalSrcs) {
      delete item.img.dataset.exportSkipExternal;
      item.img.src = item.src;
      if (item.crossOrigin !== null) {
        item.img.setAttribute('crossorigin', item.crossOrigin);
      }
    }
  }
}


