export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

export const validateMediaFile = (file: File, options?: { maxSize?: number; allowedTypes?: string[] }): ValidationResult => {
  const maxSize = options?.maxSize || 5 * 1024 * 1024;
  const allowedTypes = options?.allowedTypes || ['image/jpeg', 'image/png', 'image/webp'];

  if (file.size > maxSize) {
    return { isValid: false, errorMessage: `Ukuran file melebihi batas maksimal (${Math.round(maxSize / 1024 / 1024)}MB)` };
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return { isValid: false, errorMessage: 'Tipe file tidak didukung.' };
  }

  return { isValid: true };
};
