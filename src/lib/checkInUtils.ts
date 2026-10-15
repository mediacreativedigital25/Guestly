/**
 * Helper to encode and decode checkInMethod ('scan' | 'manual')
 * alongside checkInStaff in the Supabase 'check_in_staff' column
 * without needing DDL schema alterations.
 *
 * Format: "[SCAN] Operator Name" or "[MANUAL] Operator Name"
 */

export function encodeCheckInStaff(
  staff?: string | null,
  method?: 'scan' | 'manual'
): string | null {
  if (staff === undefined && method === undefined) return null;
  
  let cleanStaff = typeof staff === 'string' ? staff.trim() : '';
  
  // Extract existing method prefix if present in staff string
  const existingPrefixMatch = cleanStaff.match(/^\[(SCAN|MANUAL)\]\s*(.*)$/i);
  if (existingPrefixMatch) {
    if (!method) {
      method = existingPrefixMatch[1].toUpperCase() === 'MANUAL' ? 'manual' : 'scan';
    }
    cleanStaff = existingPrefixMatch[2].trim();
  }

  // Also extract legacy method:prefix| format
  const legacyMatch = cleanStaff.match(/^method:(scan|manual)\|(.*)$/i);
  if (legacyMatch) {
    if (!method) {
      method = legacyMatch[1].toLowerCase() as 'scan' | 'manual';
    }
    cleanStaff = legacyMatch[2].trim();
  }

  if (!method) {
    return cleanStaff || null;
  }

  const prefix = method === 'manual' ? '[MANUAL]' : '[SCAN]';
  return cleanStaff ? `${prefix} ${cleanStaff}` : prefix;
}

export function decodeCheckInStaff(
  raw?: string | null
): { staff?: string; method?: 'scan' | 'manual' } {
  if (!raw) return {};
  const str = String(raw).trim();
  if (!str) return {};

  const match = str.match(/^\[(SCAN|MANUAL)\]\s*(.*)$/i);
  if (match) {
    const method = match[1].toUpperCase() === 'MANUAL' ? 'manual' : 'scan';
    const staff = match[2].trim() || undefined;
    return { staff, method };
  }

  const legacyMatch = str.match(/^method:(scan|manual)\|(.*)$/i);
  if (legacyMatch) {
    const method = legacyMatch[1].toLowerCase() as 'scan' | 'manual';
    const staff = legacyMatch[2].trim() || undefined;
    return { staff, method };
  }

  const suffixMatch = str.match(/^(.*?)\s*\[(SCAN|MANUAL)\]$/i);
  if (suffixMatch) {
    const method = suffixMatch[2].toUpperCase() === 'MANUAL' ? 'manual' : 'scan';
    const staff = suffixMatch[1].trim() || undefined;
    return { staff, method };
  }

  return { staff: str };
}
