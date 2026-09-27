import Swal from 'sweetalert2';

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
  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: 'OK',
    confirmButtonColor: '#C98F9D',
    buttonsStyling: false,
    customClass: guestlyCustomClass,
  });
};

export const showCancelAlert = (
  text: string = 'Perubahan atau tindakan telah dibatalkan.',
  title: string = 'Dibatalkan'
) => {
  return showAlert(title, text, 'info');
};

export const showConfirm = async (
  title: string,
  text: string = 'Tindakan ini tidak dapat dibatalkan.',
  showCancelPopup: boolean = true
) => {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#C98F9D',
    cancelButtonColor: '#f5eff5',
    confirmButtonText: 'Ya, Lanjutkan',
    cancelButtonText: 'Batal',
    reverseButtons: true,
    buttonsStyling: false,
    customClass: guestlyCustomClass,
  });

  if (!result.isConfirmed && showCancelPopup) {
    await showAlert('Dibatalkan', 'Tindakan telah dibatalkan.', 'info');
  }

  return result.isConfirmed;
};
