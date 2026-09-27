/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { showCancelAlert } from '../lib/alerts';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Hapus",
  cancelText = "Batal",
  variant = 'danger'
}: ConfirmModalProps) {
  const handleCancel = () => {
    onClose();
    showCancelAlert('Tindakan telah dibatalkan.');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="relative w-full max-w-md bg-white rounded-2xl border border-gray-200 p-7 shadow-2xl font-sans"
          >
            <button
              onClick={handleCancel}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 border",
                variant === 'danger' ? "bg-rose-50 text-rose-500 border-rose-100" : 
                variant === 'warning' ? "bg-indigo-50 text-indigo-600 border-indigo-100" : 
                "bg-indigo-50 text-indigo-600 border-indigo-100"
              )}>
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-600 mt-2 mb-6 leading-relaxed">
                {message}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-indigo-50 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-all"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl font-semibold text-sm text-white shadow-sm transition-all active:scale-[0.98]",
                  variant === 'danger' ? "bg-rose-500 hover:bg-rose-600" : 
                  variant === 'warning' ? "bg-indigo-600 hover:bg-indigo-700" : 
                  "bg-indigo-600 hover:bg-indigo-700"
                )}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
