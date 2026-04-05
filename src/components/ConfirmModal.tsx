/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';

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
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[32px] p-8 shadow-2xl font-sans"
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-2 hover:bg-cream rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner",
                variant === 'danger' ? "bg-red-50 text-red-500" : 
                variant === 'warning' ? "bg-amber-50 text-amber-500" : 
                "bg-blue-50 text-blue-500"
              )}>
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-serif font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 mt-2 mb-8 leading-relaxed">
                {message}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  "flex-1 py-3.5 rounded-2xl font-bold text-sm text-white shadow-lg transition-all active:scale-[0.98]",
                  variant === 'danger' ? "bg-red-500 hover:bg-red-600" : 
                  variant === 'warning' ? "bg-amber-500 hover:bg-amber-600" : 
                  "bg-olive hover:bg-olive/90"
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
