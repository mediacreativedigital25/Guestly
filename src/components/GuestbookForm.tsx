/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'motion/react';
import { Send, User, MessageSquare, CheckCircle2, XCircle, HelpCircle, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { AttendanceStatus } from '../types';

const guestbookSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  message: z.string().min(5, 'Pesan minimal 5 karakter'),
  attendance: z.enum(['hadir', 'tidak_hadir', 'ragu_ragu'] as const),
});

type GuestbookFormData = z.infer<typeof guestbookSchema>;

interface GuestbookFormProps {
  onSubmit: (data: GuestbookFormData) => Promise<void>;
  isSubmitting: boolean;
}

export default function GuestbookForm({ onSubmit, isSubmitting }: GuestbookFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<GuestbookFormData>({
    resolver: zodResolver(guestbookSchema),
    defaultValues: {
      attendance: 'hadir',
    },
  });

  const currentAttendance = watch('attendance');

  const handleFormSubmit = async (data: GuestbookFormData) => {
    await onSubmit(data);
    reset();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-[32px] p-8 shadow-sm border border-olive/10 max-w-2xl mx-auto mb-16"
    >
      <h2 className="text-xl font-serif mb-6 text-center">Kirim Pesan & Doa</h2>
      
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 font-sans">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 flex items-center gap-2">
            <User className="w-3 h-3" /> Nama Lengkap
          </label>
          <input
            {...register('name')}
            className={cn(
              "w-full px-4 py-2.5 rounded-2xl border bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 transition-all text-sm",
              errors.name ? "border-red-300" : "border-olive/10"
            )}
            placeholder="Masukkan nama Anda"
          />
          {errors.name && <p className="text-[10px] text-red-500">{errors.name.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 flex items-center gap-2">
            <MessageSquare className="w-3 h-3" /> Pesan & Doa
          </label>
          <textarea
            {...register('message')}
            rows={3}
            className={cn(
              "w-full px-4 py-2.5 rounded-2xl border bg-cream/30 focus:outline-none focus:ring-2 focus:ring-olive/20 transition-all resize-none text-sm",
              errors.message ? "border-red-300" : "border-olive/10"
            )}
            placeholder="Tuliskan pesan dan doa terbaik Anda"
          />
          {errors.message && <p className="text-[10px] text-red-500">{errors.message.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Konfirmasi Kehadiran</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'hadir', label: 'Hadir', icon: CheckCircle2, color: 'text-green-600' },
              { id: 'tidak_hadir', label: 'Tidak Hadir', icon: XCircle, color: 'text-red-600' },
              { id: 'ragu_ragu', label: 'Ragu-ragu', icon: HelpCircle, color: 'text-amber-600' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setValue('attendance', option.id as AttendanceStatus)}
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all gap-1",
                  currentAttendance === option.id 
                    ? "bg-olive text-white border-olive shadow-md scale-[1.02]" 
                    : "bg-cream/30 border-olive/10 text-gray-500 hover:bg-cream/50"
                )}
              >
                <option.icon className={cn("w-5 h-5", currentAttendance === option.id ? "text-white" : option.color)} />
                <span className="text-[10px] font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "w-full bg-olive text-white py-3 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 transition-all hover:shadow-lg active:scale-[0.98]",
            isSubmitting && "opacity-70 cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Kirim Pesan <Send className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
