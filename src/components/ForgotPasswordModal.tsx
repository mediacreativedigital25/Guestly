import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from './Modal';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  adminPhone?: string;
  onResetSuccess: (resolvedEmail: string) => void;
}

type Step = 'request' | 'verify' | 'success';

interface AdminFallbackInfo {
  adminPhone: string;
  userEmail?: string;
  userName?: string;
  reason: string;
}

export default function ForgotPasswordModal({
  isOpen,
  onClose,
  initialEmail = '',
  adminPhone = '6285158636606',
  onResetSuccess,
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState(initialEmail);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [adminFallback, setAdminFallback] = useState<AdminFallbackInfo | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  // Reset modal state cleanly whenever opened
  useEffect(() => {
    if (isOpen) {
      setStep('request');
      setIdentifier(initialEmail || '');
      setMaskedPhone('');
      setResolvedEmail('');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setErrorMsg('');
      setAdminFallback(null);
      setCooldownSec(0);
    }
  }, [isOpen, initialEmail]);

  // Resend OTP cooldown countdown
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  const cleanWaDigits = (phone: string) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '6285158636606';
    if (digits.startsWith('62')) return digits;
    if (digits.startsWith('0')) return '62' + digits.slice(1);
    if (digits.startsWith('8')) return '62' + digits;
    return digits;
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) {
      setErrorMsg('Masukkan email atau nomor WhatsApp yang terdaftar.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setAdminFallback(null);

    try {
      const res = await fetch('/api/auth/forgot-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.success) {
        setMaskedPhone(data.maskedPhone || '');
        setResolvedEmail(data.resolvedEmail || (trimmed.includes('@') ? trimmed : ''));
        setCooldownSec(Number(data.cooldownSec || 60));
        setOtp('');
        setStep('verify');
        return;
      }

      if (data.code === 'COOLDOWN') {
        if (data.maskedPhone) setMaskedPhone(data.maskedPhone);
        setCooldownSec(Number(data.retryAfterSec || 30));
        setStep('verify');
        setErrorMsg(data.error || 'Tunggu beberapa detik sebelum meminta kode OTP baru.');
        return;
      }

      if (data.fallbackAdminWa) {
        setAdminFallback({
          adminPhone: data.adminPhone || adminPhone,
          userEmail: data.userEmail || (trimmed.includes('@') ? trimmed : ''),
          userName: data.userName || '',
          reason:
            data.error ||
            'Akun ini belum mendaftarkan nomor WhatsApp. Silakan hubungi Admin via WhatsApp untuk bantuan reset kata sandi.',
        });
        return;
      }

      setErrorMsg(data.error || 'Gagal memproses permintaan reset kata sandi.');
    } catch {
      setAdminFallback({
        adminPhone,
        userEmail: trimmed.includes('@') ? trimmed : '',
        reason:
          'Tidak dapat terhubung ke server OTP saat ini. Anda dapat menghubungi Admin via WhatsApp untuk bantuan reset kata sandi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otp.replace(/\D/g, '').trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorMsg('Masukkan 6 digit kode OTP yang dikirim ke WhatsApp Anda.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok dengan kata sandi baru.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/forgot-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          otp: cleanOtp,
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.success) {
        const finalEmail = data.email || resolvedEmail || (identifier.includes('@') ? identifier.trim() : '');
        setResolvedEmail(finalEmail);
        setStep('success');
        onResetSuccess(finalEmail);
        return;
      }

      setErrorMsg(data.error || 'Kode OTP tidak valid atau sudah kedaluwarsa.');
    } catch {
      setErrorMsg('Gagal terhubung ke server. Periksa koneksi internet Anda lalu coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const buildAdminWaUrl = () => {
    const targetAdmin = cleanWaDigits(adminFallback?.adminPhone || adminPhone);
    const infoLines = [
      'Halo Admin Guestly, saya lupa kata sandi akun saya dan belum dapat menerima OTP WhatsApp.',
      '',
      `Email / Akun: ${adminFallback?.userEmail || identifier.trim() || '-'}`,
      adminFallback?.userName ? `Nama: ${adminFallback.userName}` : null,
      '',
      'Mohon bantuannya untuk reset kata sandi akun saya. Terima kasih!',
    ].filter((line) => line !== null);
    return `https://wa.me/${targetAdmin}?text=${encodeURIComponent(infoLines.join('\n'))}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        step === 'request'
          ? 'Lupa Kata Sandi'
          : step === 'verify'
          ? 'Verifikasi OTP & Kata Sandi Baru'
          : 'Kata Sandi Diperbarui'
      }
      maxWidth="max-w-md"
    >
      {step === 'request' && (
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Masukkan <strong>Email</strong> atau <strong>Nomor WhatsApp</strong> yang terdaftar pada akun Anda. Kami akan mengirimkan kode OTP 6 digit ke WhatsApp Anda untuk mengatur ulang kata sandi.
          </p>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200/80 text-red-700 text-xs sm:text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {adminFallback ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm leading-relaxed">{adminFallback.reason}</p>
                </div>
              </div>

              <a
                href={buildAdminWaUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-10.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Hubungi Admin via WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setAdminFallback(null);
                  setErrorMsg('');
                }}
                className="w-full h-9.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Coba Email / Nomor Lain
              </button>
            </div>
          ) : (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email atau No. WhatsApp Terdaftar
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="email@example.com atau 08123456789"
                  className="w-full h-10 text-sm border border-slate-300 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10.5 flex items-center justify-center gap-2 px-4 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Mengirim OTP...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Kirim Kode OTP via WhatsApp</span>
                    </>
                  )}
                </button>

                <div className="pt-2 border-t border-slate-100 text-center">
                  <a
                    href={buildAdminWaUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-700 font-medium transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Belum mendaftarkan No. WA? Hubungi Admin via WhatsApp</span>
                  </a>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {step === 'verify' && (
        <form onSubmit={handleConfirmReset} className="space-y-4">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs sm:text-sm leading-relaxed">
            Kode OTP 6 digit telah dikirim ke WhatsApp{' '}
            <strong className="font-mono">{maskedPhone || 'terdaftar'}</strong>. Kode berlaku selama{' '}
            <strong>5 menit</strong>.
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200/80 text-red-700 text-xs sm:text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Kode OTP (6 Digit)</label>
                <button
                  type="button"
                  disabled={cooldownSec > 0 || isSubmitting}
                  onClick={() => handleRequestOtp()}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
                >
                  {cooldownSec > 0 ? `Kirim ulang (${cooldownSec}d)` : 'Kirim Ulang OTP'}
                </button>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full h-11 text-center font-mono text-lg tracking-[0.35em] font-bold border border-slate-300 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kata Sandi Baru (Min. 6 karakter)
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Masukkan kata sandi baru"
                  className="w-full h-10 text-sm border border-slate-300 rounded-lg pl-3.5 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((p) => !p)}
                  aria-label={showNewPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Konfirmasi Kata Sandi Baru
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full h-10 text-sm border border-slate-300 rounded-lg pl-3.5 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((p) => !p)}
                  aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi' : 'Lihat konfirmasi'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2">
            <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <span>
              Demi keamanan akun, semua sesi perangkat lama akan otomatis dikeluarkan setelah kata sandi diperbarui.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10.5 flex items-center justify-center gap-2 px-4 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan Kata Sandi...</span>
                </>
              ) : (
                <span>Simpan Kata Sandi Baru</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('request');
                setErrorMsg('');
              }}
              className="w-full h-9 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Ganti Email / Nomor WhatsApp</span>
            </button>
          </div>
        </form>
      )}

      {step === 'success' && (
        <div className="text-center space-y-4 py-2">
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-900">Kata Sandi Berhasil Diperbarui</h4>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Seluruh sesi login di perangkat lama telah otomatis dikeluarkan. Silakan masuk kembali menggunakan kata sandi baru Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-10.5 px-4 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer shadow-xs"
          >
            Kembali ke Halaman Masuk
          </button>
        </div>
      )}
    </Modal>
  );
}
