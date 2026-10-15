import { Html5Qrcode } from 'html5-qrcode';

export interface QrisParsedData {
  raw: string;
  merchantName?: string;
  merchantCity?: string;
  nmid?: string;
  postalCode?: string;
  mcc?: string;
  currency?: string;
  amount?: string;
  merchantPan?: string;
  isQris: boolean;
}

/**
 * Parses EMVCo Tag-Length-Value (TLV) formatted string
 */
export function parseTLV(payload: string): Record<string, string> {
  const result: Record<string, string> = {};
  let index = 0;
  while (index <= payload.length - 4) {
    const tag = payload.substring(index, index + 2);
    const lengthStr = payload.substring(index + 2, index + 4);
    const length = parseInt(lengthStr, 10);
    if (isNaN(length) || length < 0 || index + 4 + length > payload.length) {
      break;
    }
    const value = payload.substring(index + 4, index + 4 + length);
    result[tag] = value;
    index += 4 + length;
  }
  return result;
}

/**
 * Decodes EMVCo Merchant Presented Mode QRIS payload
 */
export function parseQris(rawQr: string): QrisParsedData {
  const trimmed = rawQr.trim();
  const tlv = parseTLV(trimmed);

  const isQris = Boolean(
    tlv['00'] === '01' ||
    tlv['58'] === 'ID' ||
    tlv['59'] ||
    trimmed.includes('ID10') ||
    trimmed.startsWith('000201')
  );

  const merchantName = tlv['59'] ? tlv['59'].trim() : undefined;
  const merchantCity = tlv['60'] ? tlv['60'].trim() : undefined;
  const postalCode = tlv['61'] ? tlv['61'].trim() : undefined;
  const mcc = tlv['52'] ? tlv['52'].trim() : undefined;
  const currency = tlv['53'] ? tlv['53'].trim() : undefined;
  const amount = tlv['54'] ? tlv['54'].trim() : undefined;

  let nmid: string | undefined = undefined;
  let merchantPan: string | undefined = undefined;

  // Search in tags 26 to 51 (Merchant Account Information)
  for (let tagNum = 26; tagNum <= 51; tagNum++) {
    const tagKey = tagNum.toString().padStart(2, '0');
    if (tlv[tagKey]) {
      const subTlv = parseTLV(tlv[tagKey]);
      if (subTlv['02']) {
        const val = subTlv['02'].trim();
        if (!nmid || val.toUpperCase().startsWith('ID')) {
          nmid = val;
        }
      }
      if (subTlv['01']) {
        const pan = subTlv['01'].trim();
        merchantPan = pan;
        if (!nmid && pan.toUpperCase().startsWith('ID')) {
          nmid = pan;
        }
      }
      if (subTlv['03'] && !nmid && subTlv['03'].toUpperCase().startsWith('ID')) {
        nmid = subTlv['03'].trim();
      }
    }
  }

  // Fallback regex for NMID if tag nesting differed: NMID is ID followed by digits
  if (!nmid) {
    const match = trimmed.match(/ID\d{9,16}/i);
    if (match) {
      nmid = match[0].toUpperCase();
    }
  }

  return {
    raw: trimmed,
    merchantName,
    merchantCity,
    nmid,
    postalCode,
    mcc,
    currency,
    amount,
    merchantPan,
    isQris
  };
}

/**
 * Scans an uploaded image File using Html5Qrcode and returns decoded QRIS metadata
 */
export async function scanQrisFromImageFile(file: File): Promise<{
  success: boolean;
  data?: QrisParsedData;
  raw?: string;
  error?: string;
}> {
  const tempElementId = 'qris-scanner-hidden-container';
  let tempDiv = document.getElementById(tempElementId);
  if (!tempDiv) {
    tempDiv = document.createElement('div');
    tempDiv.id = tempElementId;
    tempDiv.style.position = 'fixed';
    tempDiv.style.top = '-9999px';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = '100px';
    tempDiv.style.height = '100px';
    tempDiv.style.opacity = '0';
    tempDiv.style.pointerEvents = 'none';
    document.body.appendChild(tempDiv);
  }

  try {
    const html5QrCode = new Html5Qrcode(tempElementId);
    const decodedText = await html5QrCode.scanFile(file, false);
    try {
      await html5QrCode.clear();
    } catch {
      // ignore cleanup errors
    }

    if (!decodedText || decodedText.trim() === '') {
      return { success: false, error: 'Tidak ada QR Code yang terdeteksi pada gambar.' };
    }

    const parsed = parseQris(decodedText);
    return {
      success: true,
      raw: decodedText,
      data: parsed
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal mendeteksi kode QR dari gambar.'
    };
  }
}
