import React from 'react';
import { Link } from 'react-router-dom';
import {
  HeartHandshake,
  Clock,
  CheckCircle2,
  CalendarCheck2,
  DollarSign,
  Users2,
  LayoutGrid,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  BellRing,
  HelpCircle
} from 'lucide-react';

export default function WeddingPlannerComingSoon() {
  const upcomingModules = [
    {
      icon: CalendarCheck2,
      title: 'Rundown & Timeline Hari-H',
      description: 'Penyusunan jadwal acara menit demi menit yang interaktif dan dapat dibagikan langsung kepada seluruh panitia & vendor melalui tautan khusus.',
      badge: 'Tahap Desain UI',
      accent: 'border-rose-200/80 bg-rose-50/40 text-[#8C3A50]'
    },
    {
      icon: DollarSign,
      title: 'Manajemen Vendor & Anggaran',
      description: 'Pelacakan kontrak, uang muka (DP), jadwal pelunasan, hingga rekapitulasi biaya keseluruhan vendor (Catering, Dekorasi, MUA, Dokumentasi).',
      badge: 'Dalam Riset',
      accent: 'border-amber-200/80 bg-amber-50/40 text-amber-800'
    },
    {
      icon: Users2,
      title: 'Checklist & Tugas Panitia',
      description: 'Pembagian penanggung jawab (PIC) keluarga dan tim Wedding Organizer dengan pengingat notifikasi tugas terintegrasi.',
      badge: 'Perancangan Logika',
      accent: 'border-slate-200 bg-slate-50 text-slate-700'
    },
    {
      icon: LayoutGrid,
      title: 'Denah Meja & Kursi (Seating Chart)',
      description: 'Pengaturan tata letak meja VIP & keluarga yang terhubung langsung dengan kuota dan status kehadiran tamu di sistem buku tamu Guestly.',
      badge: 'Integrasi Database',
      accent: 'border-emerald-200/80 bg-emerald-50/40 text-emerald-800'
    }
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Notice Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-amber-900">Fitur Sedang Dalam Tahap Pengembangan</h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 uppercase tracking-wider">
                <Clock className="w-3 h-3" />
                Segera Hadir • Tahap R&amp;D
              </span>
            </div>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              Kami sedang menyiapkan fitur Wedding Planner ini agar langsung terhubung dengan data acara dan buku tamu digital yang sudah Anda buat di Guestly.
            </p>
          </div>
        </div>
        <Link
          to="/auth/login/events"
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors shrink-0 shadow-xs"
        >
          <span>Buka Daftar Acara</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Upcoming Modules Preview */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-[#8C3A50]" />
            <span>Rencana Modul Utama yang Akan Datang</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Berikut adalah modul-modul unggulan yang sedang kami persiapkan untuk rilis versi pertama.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {upcomingModules.map((item, idx) => (
            <div
              key={idx}
              className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-[#8C3A50] border border-rose-100 flex items-center justify-center">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${item.accent}`}>
                    {item.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Terhubung ke Guestly Core
                </span>
                <span className="text-[#8C3A50] font-semibold">Coming Soon</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Navigation Footer */}
      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Ingin Mengelola Acara yang Sedang Berjalan?</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Anda dapat langsung menggunakan manajemen buku tamu, QR scan, dan RSVP di menu Events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/auth/login"
            className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-white text-slate-700 text-xs font-semibold transition-colors"
          >
            Dashboard
          </Link>
          <Link
            to="/auth/login/events"
            className="px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
          >
            <span>Buka Events</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
