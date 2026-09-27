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

export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  // Convert legacy /api/media/r2/<key> back to the public R2 CDN URL so it works on both dev and Cloudflare Pages
  const apiR2Match = trimmed.match(/^\/api\/media\/r2\/+(.+)$/i);
  if (apiR2Match && apiR2Match[1]) {
    return `https://cdn.guestly.yulovi.com/${apiR2Match[1]}`;
  }
  return trimmed;
}

export function getMediaFallbackUrls(
  urls: Array<string | null | undefined>
): string[] {
  const result: string[] = [];
  const addUnique = (u?: string | null) => {
    if (!u) return;
    const s = u.trim();
    if (!s || result.includes(s)) return;
    result.push(s);
  };

  for (const raw of urls) {
    if (!raw) continue;
    const primary = resolveMediaUrl(raw);
    addUnique(primary);

    // Also add local/Pages R2 proxy path as secondary fallback for any R2 CDN URL
    const r2Match = primary.match(/^https?:\/\/cdn\.guestly\.yulovi\.com\/+(.+)$/i);
    if (r2Match && r2Match[1]) {
      addUnique(`/api/media/r2/${r2Match[1]}`);
    }
  }

  return result;
}

const DEFAULT_FALLBACK_COUPLE_PHOTO =
  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=900&q=80';

async function fetchImageAsDataUrl(rawUrl: string): Promise<string | null> {
  const candidates = getMediaFallbackUrls([rawUrl]);
  if (candidates.length === 0) return null;

  for (const url of candidates) {
    if (url.startsWith('data:')) return url;

    // 1. Try server/Pages proxy first (handles local /uploads, R2 bucket/CDN, and external URLs without CORS issues)
    try {
      const resp = await fetch(`/api/media/proxy?url=${encodeURIComponent(url)}`);
      const contentType = resp.headers.get('content-type') || '';
      if (resp.ok && contentType.includes('application/json')) {
        const json = await resp.json();
        if (json?.success && json?.dataUrl) {
          return json.dataUrl as string;
        }
      }
    } catch {
      // fallback below
    }

    // 2. Fallback: direct browser fetch (works for same-origin /api/media/r2/... and CORS-enabled URLs)
    try {
      const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob.size > 0 && !blob.type.includes('text/html')) {
          const dataUrl = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () =>
              resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
          if (dataUrl) return dataUrl;
        }
      }
    } catch {
      // ignore and try next candidate
    }
  }

  return null;
}

function tryReuseLoadedDomImage(img: HTMLImageElement): HTMLImageElement | null {
  try {
    if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      return null;
    }
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 1;
    testCanvas.height = 1;
    const tctx = testCanvas.getContext('2d');
    if (!tctx) return null;
    tctx.drawImage(img, 0, 0, 1, 1);
    // Verify canvas is not tainted by cross-origin data
    testCanvas.toDataURL('image/png');
    return img;
  } catch {
    return null;
  }
}

async function loadDecodedImage(
  domImg: HTMLImageElement,
  primaryUrl: string,
  fallbackUrl?: string
): Promise<HTMLImageElement | null> {
  const reused = tryReuseLoadedDomImage(domImg);
  if (reused) return reused;

  const candidates = [primaryUrl, fallbackUrl].filter((u): u is string => Boolean(u && u.trim()));
  for (const candidate of candidates) {
    const dataUrl = await fetchImageAsDataUrl(candidate);
    if (!dataUrl) continue;
    try {
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load error'));
      });
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        return img;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function drawImageFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: 'cover' | 'contain',
  alignTop: boolean
) {
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  if (!natW || !natH || !w || !h) return;

  if (fit === 'cover') {
    const scale = Math.max(w / natW, h / natH);
    const drawW = natW * scale;
    const drawH = natH * scale;
    const dx = x + (w - drawW) / 2;
    const dy = alignTop ? y : y + (h - drawH) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();
  } else {
    const scale = Math.min(w / natW, h / natH);
    const drawW = natW * scale;
    const drawH = natH * scale;
    const dx = x + (w - drawW) / 2;
    const dy = y + (h - drawH) / 2;
    ctx.drawImage(img, dx, dy, drawW, drawH);
  }
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
    // 1. Temporarily reset scale transform & ellipsis overflow so we measure true 1:1 coordinates
    if (element.dataset?.exportWidth && element.dataset?.exportHeight) {
      element.style.transform = 'none';
    }
    for (const item of originalTextStyles) {
      item.el.style.overflow = 'visible';
      item.el.style.textOverflow = 'clip';
    }

    const elRect = element.getBoundingClientRect();
    const compositeQueue: {
      decoded: HTMLImageElement;
      x: number;
      y: number;
      w: number;
      h: number;
      fit: 'cover' | 'contain';
      alignTop: boolean;
      isArchPhoto: boolean;
      logoBoxRect?: { bx: number; by: number; bw: number; bh: number };
    }[] = [];

    // 2. Load & prepare all images
    await Promise.all(
      images.map(async (img) => {
        const currentSrc = img.getAttribute('src') || '';
        originalSrcs.push({
          img,
          src: currentSrc,
          crossOrigin: img.getAttribute('crossorigin'),
        });
        img.removeAttribute('crossorigin');

        const computed = window.getComputedStyle(img);
        if (computed.display === 'none' || computed.visibility === 'hidden') {
          img.dataset.exportSkipExternal = 'true';
          return;
        }

        const imgRect = img.getBoundingClientRect();
        const x = imgRect.left - elRect.left;
        const y = imgRect.top - elRect.top;
        const w = imgRect.width || img.clientWidth || 0;
        const h = imgRect.height || img.clientHeight || 0;
        const isArchPhoto = Boolean(img.closest('[data-arch-clip="true"]'));
        const isTemplateBg = img.dataset.exportRole === 'template-bg';
        const logoBoxEl = img.closest('[data-logo-box="true"]') as HTMLElement | null;
        let logoBoxRect: { bx: number; by: number; bw: number; bh: number } | undefined;
        if (logoBoxEl) {
          const bRect = logoBoxEl.getBoundingClientRect();
          logoBoxRect = {
            bx: bRect.left - elRect.left,
            by: bRect.top - elRect.top,
            bw: bRect.width || logoBoxEl.clientWidth || 288,
            bh: bRect.height || logoBoxEl.clientHeight || 78,
          };
        }
        const fit: 'cover' | 'contain' =
          computed.objectFit === 'cover' || isArchPhoto || isTemplateBg ? 'cover' : 'contain';
        const alignTop =
          isArchPhoto || (computed.objectPosition || '').toLowerCase().includes('top');

        const decoded = await loadDecodedImage(
          img,
          currentSrc,
          isArchPhoto ? DEFAULT_FALLBACK_COUPLE_PHOTO : undefined
        );

        if (!decoded) {
          img.dataset.exportSkipExternal = 'true';
          return;
        }

        if (isTemplateBg) {
          // Compact template background so html-to-image renders it behind text layers
          try {
            const off = document.createElement('canvas');
            off.width = 1200;
            off.height = 675;
            const octx = off.getContext('2d');
            if (octx) {
              drawImageFit(octx, decoded, 0, 0, 1200, 675, 'cover', false);
              img.src = off.toDataURL('image/png');
            }
          } catch {
            img.dataset.exportSkipExternal = 'true';
          }
        } else {
          // Composite foreground images (Couple Photo, Guestly Logo, QR Favicon) directly on the 2D Canvas
          img.dataset.exportCompositeOnCanvas = 'true';
          if (w > 0 && h > 0) {
            compositeQueue.push({
              decoded,
              x,
              y,
              w,
              h,
              fit,
              alignTop,
              isArchPhoto,
              logoBoxRect,
            });
          }
        }
      })
    );

    const safeFilter = (node: HTMLElement) => {
      if (!node) return true;
      if (node.dataset?.exportIgnore === 'true') return false;
      if (node.dataset?.exportSkipExternal === 'true') return false;
      if (node.dataset?.exportCompositeOnCanvas === 'true') return false;
      if (node instanceof HTMLStyleElement || node instanceof HTMLLinkElement) return false;
      if (node instanceof HTMLImageElement) {
        const s = node.getAttribute('src') || '';
        if (s.startsWith('http://') || s.startsWith('https://')) return false;
      }
      return true;
    };

    const pixelRatio = 2.5;
    const exportWidth = Number(element.dataset?.exportWidth) || Math.round(elRect.width) || 320;
    const exportHeight = Number(element.dataset?.exportHeight) || Math.round(elRect.height) || 400;
    const exportOptions: any = {
      quality: 1,
      pixelRatio,
      skipFonts: true,
      backgroundColor: element.dataset?.exportWidth ? '#FAF6F2' : '#FFFFFF',
      width: exportWidth,
      height: exportHeight,
      style: {
        transform: 'none',
        width: `${exportWidth}px`,
        height: `${exportHeight}px`,
      },
    };

    const canvas = await htmlToImage.toCanvas(element, {
      ...exportOptions,
      filter: safeFilter as any,
    });

    // 3. Draw all decoded foreground images (Couple Arch Photo, Brand Logo, QR Center Emblem) directly onto the 2D Canvas
    const ctx = canvas.getContext('2d');
    if (ctx && compositeQueue.length > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      for (const item of compositeQueue) {
        if (item.isArchPhoto) {
          ctx.save();
          ctx.scale(pixelRatio, pixelRatio);
          const archPath = new Path2D(
            'M 0,0 L 242,0 C 362,54 432,198 432,340 C 432,428 410,498 386,543 L 0,543 Z'
          );
          ctx.clip(archPath);
          drawImageFit(ctx, item.decoded, item.x, item.y, item.w, item.h, 'cover', true);

          // Redraw top-left botanical leaf ornament over photo corner
          ctx.strokeStyle = '#C67D73';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.75;
          ctx.stroke(new Path2D('M 8,165 C 28,115 62,65 115,22'));
          const leaves = [
            'M 32,120 C 18,104 20,84 34,70 C 46,86 44,106 32,120 Z',
            'M 56,86 C 42,70 44,50 58,36 C 70,52 68,72 56,86 Z',
            'M 48,112 C 66,104 86,108 98,120 C 82,130 62,126 48,112 Z',
            'M 74,76 C 92,68 112,72 124,84 C 108,94 88,90 74,76 Z',
          ];
          for (const lp of leaves) {
            const p2d = new Path2D(lp);
            ctx.fillStyle = 'rgba(251, 234, 231, 0.55)';
            ctx.fill(p2d);
            ctx.stroke(p2d);
          }
          ctx.restore();
        } else {
          if (item.logoBoxRect) {
            const { bx, by, bw, bh } = item.logoBoxRect;
            ctx.save();
            ctx.scale(pixelRatio, pixelRatio);
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(bx, by, bw, bh, 20);
            } else {
              ctx.rect(bx, by, bw, bh);
            }
            ctx.clip();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.filter = 'blur(10px)';
            ctx.drawImage(canvas, 0, 0);
            ctx.filter = 'none';
            ctx.scale(pixelRatio, pixelRatio);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(bx + 0.6, by + 0.6, bw - 1.2, bh - 1.2, 20);
            } else {
              ctx.rect(bx + 0.6, by + 0.6, bw - 1.2, bh - 1.2);
            }
            ctx.stroke();
            ctx.restore();
          }
          ctx.save();
          ctx.scale(pixelRatio, pixelRatio);
          drawImageFit(
            ctx,
            item.decoded,
            item.x,
            item.y,
            item.w,
            item.h,
            item.fit,
            item.alignTop
          );
          ctx.restore();
        }
      }
    }

    const dataUrl = canvas.toDataURL('image/png', 1.0);
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
    for (const item of originalSrcs) {
      delete item.img.dataset.exportSkipExternal;
      delete item.img.dataset.exportCompositeOnCanvas;
      item.img.src = item.src;
      if (item.crossOrigin !== null) {
        item.img.setAttribute('crossorigin', item.crossOrigin);
      }
    }
  }
}


