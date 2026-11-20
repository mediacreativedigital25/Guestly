import React, { useState } from 'react';
import {
  Users,
  RefreshCw,
  Send,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
} from 'lucide-react';
import { fetchFonnteGroups, FonnteGroupItem } from '../lib/fonnte';
import {
  DEFAULT_GROUP_REMINDER_TIME,
  DEFAULT_GROUP_REMINDER_H0_TIME,
  sendTestGroupMessage,
} from '../lib/waGroupReminder';

export interface WaGroupSettingsValue {
  waGroupId: string;
  waGroupName: string;
  waGroupReminderEnabled: boolean;
  waGroupReminderH3: boolean;
  waGroupReminderH1: boolean;
  waGroupReminderH0: boolean;
  waGroupReminderTime: string;
  waGroupReminderH0Time: string;
}

interface WaGroupSettingsPanelProps {
  value: WaGroupSettingsValue;
  onChange: (next: WaGroupSettingsValue) => void;
  vendorFonnteToken?: string | null;
  businessName?: string;
  compact?: boolean;
}

export function WaGroupSettingsPanel({
  value,
  onChange,
  vendorFonnteToken,
  businessName,
  compact = false,
}: WaGroupSettingsPanelProps) {
  const [fetchingGroups, setFetchingGroups] = useState(false);
  const [groups, setGroups] = useState<FonnteGroupItem[]>([]);
  const [fetchFeedback, setFetchFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [testingGroup, setTestingGroup] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const hasVendorToken = Boolean(vendorFonnteToken && vendorFonnteToken.trim());

  const updateField = <K extends keyof WaGroupSettingsValue>(
    key: K,
    val: WaGroupSettingsValue[K]
  ) => {
    onChange({ ...value, [key]: val });
  };

  const handleFetchGroups = async () => {
    setFetchingGroups(true);
    setFetchFeedback(null);
    try {
      const res = await fetchFonnteGroups(vendorFonnteToken || null, !hasVendorToken, true);
      if (res.success) {
        setGroups(res.groups);
        if (res.groups.length === 0) {
          setFetchFeedback({
            type: 'error',
            text: `Koneksi berhasil (${res.tokenSource || 'Fonnte'}), namun belum ada Grup WA yang terdeteksi pada nomor ini.`,
          });
        } else {
          setFetchFeedback({
            type: 'success',
            text: `Berhasil memuat ${res.groups.length} Grup WA via ${res.tokenSource || 'Fonnte'}. Silakan pilih grup di bawah.`,
          });
        }
      } else {
        setFetchFeedback({
          type: 'error',
          text: res.error || 'Gagal mengambil daftar grup dari Fonnte.',
        });
      }
    } finally {
      setFetchingGroups(false);
    }
  };

  const handleTestSendGroup = async () => {
    if (!value.waGroupId.trim()) {
      setTestFeedback({ type: 'error', text: 'Isi atau pilih Kode Grup WhatsApp terlebih dahulu.' });
      return;
    }
    setTestingGroup(true);
    setTestFeedback(null);
    try {
      const res = await sendTestGroupMessage({
        groupId: value.waGroupId.trim(),
        groupName: value.waGroupName.trim(),
        businessName: businessName || 'Guestly',
        vendorToken: vendorFonnteToken || null,
      });
      if (res.success) {
        setTestFeedback({
          type: 'success',
          text: `Pesan tes berhasil dikirim ke grup via ${res.tokenSource}!`,
        });
      } else {
        setTestFeedback({
          type: 'error',
          text: res.error || 'Gagal mengirim pesan tes ke grup.',
        });
      }
    } finally {
      setTestingGroup(false);
    }
  };

  return (
    <div
      className={`bg-emerald-50/60 border border-emerald-200 rounded-xl ${
        compact ? 'p-3.5 space-y-3' : 'p-4 space-y-3.5'
      }`}
    >
      {/* Header + Master Toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                Pengingat Grup WhatsApp Tim (H-3, H-1 &amp; Hari H)
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white text-emerald-800 border border-emerald-200">
                {hasVendorToken ? 'Token Vendor' : 'Otomatis: Token Global'}
              </span>
            </div>
            <p className="text-[11px] text-emerald-900/80 mt-0.5 leading-relaxed">
              Kirim pengingat jadwal acara &amp; daftar Staff yang bertugas secara otomatis ke Grup WA tim via Fonnte.
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
          <input
            type="checkbox"
            checked={value.waGroupReminderEnabled}
            onChange={(e) => updateField('waGroupReminderEnabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
        </label>
      </div>

      {/* Group ID + Fetch from Fonnte */}
      <div className="space-y-2.5 pt-1 border-t border-emerald-200/70">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
            <label className="block text-xs font-semibold text-gray-700">
              Kode / ID Grup WhatsApp (Fonnte)
            </label>
            <button
              type="button"
              onClick={handleFetchGroups}
              disabled={fetchingGroups}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-50 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-60"
            >
              {fetchingGroups ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span>{fetchingGroups ? 'Mengambil Grup...' : 'Ambil Daftar Grup dari Fonnte'}</span>
            </button>
          </div>

          <input
            type="text"
            value={value.waGroupId}
            onChange={(e) => updateField('waGroupId', e.target.value)}
            placeholder="Contoh: 120363042812345678@g.us"
            className="w-full border border-emerald-300 rounded-md px-3 py-2 bg-white text-xs sm:text-sm font-mono focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {/* Selectable group dropdown when fetched */}
        {groups.length > 0 && (
          <div className="bg-white border border-emerald-200 rounded-lg p-2.5 space-y-1.5">
            <label className="block text-[11px] font-semibold text-emerald-900">
              Pilih dari Daftar Grup Fonnte ({groups.length} grup ditemukan):
            </label>
            <select
              value={groups.some((g) => g.id === value.waGroupId) ? value.waGroupId : ''}
              onChange={(e) => {
                const selectedId = e.target.value;
                const matched = groups.find((g) => g.id === selectedId);
                if (matched) {
                  onChange({
                    ...value,
                    waGroupId: matched.id,
                    waGroupName: matched.name,
                    waGroupReminderEnabled: true,
                  });
                }
              }}
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs bg-white focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">-- Pilih Grup WhatsApp --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.id})
                </option>
              ))}
            </select>
          </div>
        )}

        {fetchFeedback && (
          <div
            className={`text-[11px] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5 border ${
              fetchFeedback.type === 'success'
                ? 'bg-emerald-100/70 text-emerald-900 border-emerald-300'
                : 'bg-amber-50 text-amber-900 border-amber-200'
            }`}
          >
            {fetchFeedback.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <span>{fetchFeedback.text}</span>
          </div>
        )}

        {/* Group Name + Send Times */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Nama Grup <span className="text-gray-400 font-normal">(Opsional)</span>
          </label>
          <input
            type="text"
            value={value.waGroupName}
            onChange={(e) => updateField('waGroupName', e.target.value)}
            placeholder="Contoh: Tim Operasional WO"
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-xs sm:text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              Jam Kirim H-3 &amp; H-1 (WIB)
            </label>
            <input
              type="time"
              value={value.waGroupReminderTime || DEFAULT_GROUP_REMINDER_TIME}
              onChange={(e) =>
                updateField('waGroupReminderTime', e.target.value || DEFAULT_GROUP_REMINDER_TIME)
              }
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-xs sm:text-sm font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-rose-600" />
              Jam Kirim Hari H (WIB)
            </label>
            <input
              type="time"
              value={value.waGroupReminderH0Time || DEFAULT_GROUP_REMINDER_H0_TIME}
              onChange={(e) =>
                updateField('waGroupReminderH0Time', e.target.value || DEFAULT_GROUP_REMINDER_H0_TIME)
              }
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 bg-white text-xs sm:text-sm font-medium"
            />
          </div>
        </div>

        {/* H-3, H-1 & Hari H checkboxes + Test Send Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3.5">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={value.waGroupReminderH3}
                onChange={(e) => updateField('waGroupReminderH3', e.target.checked)}
                className="h-4 w-4 rounded text-emerald-600 border-gray-300 focus:ring-emerald-500"
              />
              <span>H-3</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={value.waGroupReminderH1}
                onChange={(e) => updateField('waGroupReminderH1', e.target.checked)}
                className="h-4 w-4 rounded text-emerald-600 border-gray-300 focus:ring-emerald-500"
              />
              <span>H-1</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={value.waGroupReminderH0}
                onChange={(e) => updateField('waGroupReminderH0', e.target.checked)}
                className="h-4 w-4 rounded text-rose-600 border-gray-300 focus:ring-rose-500"
              />
              <span>Hari H</span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleTestSendGroup}
            disabled={testingGroup || !value.waGroupId.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {testingGroup ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{testingGroup ? 'Mengirim Tes...' : 'Tes Kirim ke Grup'}</span>
          </button>
        </div>

        {testFeedback && (
          <div
            className={`text-[11px] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5 border ${
              testFeedback.type === 'success'
                ? 'bg-emerald-100/80 text-emerald-900 border-emerald-300'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {testFeedback.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
            )}
            <span>{testFeedback.text}</span>
          </div>
        )}

        <div className="flex items-start gap-1.5 text-[11px] text-emerald-900/75 bg-white/70 border border-emerald-100 rounded-lg px-2.5 py-2">
          <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            Pastikan nomor WhatsApp pengirim Fonnte sudah bergabung (menjadi anggota) di Grup WA tersebut. Default kirim H-3 &amp; H-1 pukul <strong>07:00 WIB</strong>, dan Hari H pukul <strong>05:30 WIB</strong>.
          </span>
        </div>
      </div>
    </div>
  );
}
