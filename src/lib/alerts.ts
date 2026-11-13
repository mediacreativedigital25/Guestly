import Swal from 'sweetalert2';
import { toast } from 'sonner';

const guestlyCustomClass = {
  popup: 'guestly-swal-popup',
  title: 'guestly-swal-title',
  htmlContainer: 'guestly-swal-html',
  actions: 'guestly-swal-actions',
  confirmButton: 'guestly-swal-confirm',
  cancelButton: 'guestly-swal-cancel',
};

export const showAlert = (
  title: string,
  text: string = '',
  icon: 'success' | 'error' | 'warning' | 'info' = 'info'
) => {
  if (icon === 'success') {
    toast.success(title, {
      description: text || undefined,
      duration: 3000,
    });
    return Promise.resolve({ isConfirmed: true, isDenied: false, isDismissed: false });
  }

  if (icon === 'info') {
    toast.info(title, {
      description: text || undefined,
      duration: 3500,
    });
    return Promise.resolve({ isConfirmed: true, isDenied: false, isDismissed: false });
  }

  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: 'OK',
    confirmButtonColor: '#8C3A50',
    buttonsStyling: false,
    customClass: guestlyCustomClass,
  });
};

export const showCancelAlert = (
  _text: string = 'Perubahan atau tindakan telah dibatalkan.',
  _title: string = 'Dibatalkan'
) => {
  // Intentionally quiet: closing or canceling a modal should not block the user with another popup.
  return Promise.resolve({ isConfirmed: false, isDenied: false, isDismissed: true });
};

export const showConfirm = async (
  title: string,
  text: string = '',
  showCancelPopup: boolean = false
) => {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#8C3A50',
    cancelButtonColor: '#F1F5F9',
    confirmButtonText: 'Ya, Lanjutkan',
    cancelButtonText: 'Batal',
    reverseButtons: true,
    buttonsStyling: false,
    customClass: guestlyCustomClass,
  });

  if (!result.isConfirmed && showCancelPopup) {
    toast.info('Dibatalkan', { description: 'Tindakan telah dibatalkan.', duration: 2500 });
  }

  return result.isConfirmed;
};
