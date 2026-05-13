import Swal from 'sweetalert2';

export const showAlert = (title: string, text: string = '', icon: 'success' | 'error' | 'warning' | 'info' = 'info') => {
  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonColor: '#4f46e5',
  });
};

export const showConfirm = async (title: string, text: string = 'Tindakan ini tidak dapat dibatalkan.') => {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#4f46e5',
    cancelButtonColor: '#d1d5db',
    confirmButtonText: 'Ya, Lanjutkan',
    cancelButtonText: 'Batal'
  });
  return result.isConfirmed;
};
