/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { CheckCircle2, XCircle, HelpCircle, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { GuestbookEntry } from '../types';

interface GuestbookListProps {
  entries: GuestbookEntry[];
  isLoading: boolean;
}

export default function GuestbookList({ entries, isLoading }: GuestbookListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-olive/20 border-t-olive rounded-full animate-spin" />
        <p className="text-gray-500 font-sans">Memuat pesan...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-20 bg-white/50 rounded-[32px] border border-dashed border-olive/20">
        <p className="text-gray-500 font-sans italic">Belum ada pesan. Jadilah yang pertama!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h3 className="text-xl font-serif mb-6 text-center text-olive">Pesan & Doa ({entries.length})</h3>
      
      <AnimatePresence mode="popLayout">
        {entries.map((entry, index) => (
          <motion.div
            key={entry.id || index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white p-5 rounded-2xl shadow-sm border border-olive/5 flex gap-3"
          >
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-cream rounded-xl flex items-center justify-center text-olive">
                <User className="w-5 h-5" />
              </div>
            </div>
            
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-lg font-semibold text-gray-800">{entry.name}</h4>
                <div className="flex items-center gap-1.5 text-[10px] font-sans">
                  {entry.attendance === 'hadir' && (
                    <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Hadir
                    </span>
                  )}
                  {entry.attendance === 'tidak_hadir' && (
                    <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full">
                      <XCircle className="w-3 h-3" /> Tidak Hadir
                    </span>
                  )}
                  {entry.attendance === 'ragu_ragu' && (
                    <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                      <HelpCircle className="w-3 h-3" /> Ragu-ragu
                    </span>
                  )}
                </div>
              </div>
              
              <p className="text-gray-600 font-sans leading-relaxed whitespace-pre-wrap text-sm">
                {entry.message}
              </p>
              
              {entry.reply && (
                <div className="mt-3 bg-cream/50 p-3 rounded-xl border border-olive/5 relative">
                  <div className="absolute -top-2 left-4 w-4 h-4 bg-cream/50 border-t border-l border-olive/5 rotate-45" />
                  <p className="text-[9px] font-bold text-olive uppercase tracking-widest mb-1">Balasan Penyelenggara:</p>
                  <p className="text-xs text-gray-700 italic font-sans leading-relaxed">{entry.reply}</p>
                </div>
              )}
              
              <div className="pt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-400 font-sans font-medium">
                <span>{entry.timestamp ? formatDistanceToNow(entry.timestamp.toDate(), { addSuffix: true, locale: id }) : 'Baru saja'}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
