import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../AuthContext';
import { GuestEditRequest } from '../types';
import { Check, X, Clock, AlertCircle, Eye, History, Filter } from 'lucide-react';
import { canUserAccessEvent, parseFirestoreDate, getOperatorLabel, getUserBusinessId } from '../lib/utils';
import { showAlert } from '../lib/alerts';
import { Modal } from '../components/Modal';
import { sendFonnteMessage } from '../lib/fonnte';

export default function Approvals() {
  const { appUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<GuestEditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<GuestEditRequest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requesterMap, setRequesterMap] = useState<Record<string, string>>({});
  const [clientPhoneMap, setClientPhoneMap] = useState<Record<string, string>>({});

  // Tab & Filter States
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>(() =>
    searchParams.get('tab') === 'history' ? 'history' : 'pending'
  );
  const [typeFilter, setTypeFilter] = useState<'all' | 'add' | 'edit'>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'history') {
      setActiveTab('history');
    } else if (tabParam === 'pending') {
      setActiveTab('pending');
    }
  }, [searchParams]);

  const handleTabChange = (tab: 'pending' | 'history') => {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    if (tab === 'history') {
      nextParams.set('tab', 'history');
    } else {
      nextParams.delete('tab');
    }
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (!appUser) return;

    let q;
    if (
      appUser.role === 'superadmin' ||
      appUser.role === 'owner' ||
      appUser.role === 'admin' ||
      appUser.role === 'partner'
    ) {
      q = query(collection(db, 'guest_edit_requests'));
    } else if (appUser.role === 'client') {
      q = query(collection(db, 'guest_edit_requests'), where('clientId', '==', appUser.clientId || appUser.id || ''));
    } else {
      setLoading(false);
      return;
    }

    const fetchApprovals = async () => {
      try {
        const { getDocs } = await import('firebase/firestore');
        const [snapshot, eventsSnap, clientsSnap, usersSnap] = await Promise.all([
          getDocs(q),
          getDocs(collection(db, 'events')),
          getDocs(collection(db, 'clients')),
          getDocs(collection(db, 'users'))
        ]);

        const isVendorRole = ['owner', 'partner', 'admin'].includes(appUser.role);
        const myBizIds = new Set<string>(
          [appUser.id, appUser.partnerId, getUserBusinessId(appUser)].filter(
            (id): id is string => Boolean(id && id !== 'default-partner')
          )
        );
        const myClientIds = new Set<string>();

        const clientNameById = new Map<string, string>();
        const phoneByClientId = new Map<string, string>();
        const phoneByEmail = new Map<string, string>();
        const phoneByUserId = new Map<string, string>();

        usersSnap.docs.forEach(uDoc => {
          const uData = uDoc.data();
          if (isVendorRole) {
            if (
              (uData?.partnerId && uData.partnerId !== 'default-partner' && myBizIds.has(uData.partnerId)) ||
              (uData?.createdBy && myBizIds.has(uData.createdBy)) ||
              myBizIds.has(uDoc.id)
            ) {
              myBizIds.add(uDoc.id);
              if (uData?.partnerId && uData.partnerId !== 'default-partner') {
                myBizIds.add(uData.partnerId);
              }
            }
          }
          const uPhone = (uData?.phone || '').trim();
          if (uPhone) {
            phoneByUserId.set(uDoc.id, uPhone);
            if (uData?.clientId) {
              phoneByClientId.set(uData.clientId, uPhone);
            }
            if (uData?.email) {
              phoneByEmail.set(String(uData.email).toLowerCase().trim(), uPhone);
            }
          }
        });

        clientsSnap.docs.forEach(d => {
          const cData = d.data();
          if (isVendorRole && cData?.partnerId && cData.partnerId !== 'default-partner' && myBizIds.has(cData.partnerId)) {
            myClientIds.add(d.id);
          }
          if (cData?.name) {
            clientNameById.set(d.id, cData.name);
          }
          const cPhone = (cData?.phone || '').trim();
          if (cPhone) {
            phoneByClientId.set(d.id, cPhone);
          } else if (cData?.contactEmail) {
            const matchedPhone = phoneByEmail.get(String(cData.contactEmail).toLowerCase().trim());
            if (matchedPhone) {
              phoneByClientId.set(d.id, matchedPhone);
            }
          }
        });

        const allowedPartnerIds = Array.from(myBizIds);
        const userPrimaryBizId = getUserBusinessId(appUser) || appUser.id || '';
        const targetClientId = appUser.clientId || appUser.id || '';
        const assignedEventIds = Array.isArray(appUser.assignedEventIds) ? appUser.assignedEventIds : [];

        const eventPartnerMap = new Map<string, string | null>();
        const eventClientNameMap = new Map<string, string>();
        const eventClientPhoneMap = new Map<string, string>();
        const accessibleEventIds = new Set<string>();
        const allEventsSet = new Set<string>();

        eventsSnap.docs.forEach(d => {
          const evData = d.data();
          allEventsSet.add(d.id);
          const rawPartnerId =
            evData?.partnerId && evData.partnerId !== 'default-partner' ? evData.partnerId : null;
          const effectivePartnerId =
            evData?.clientId && myClientIds.has(evData.clientId) ? userPrimaryBizId : rawPartnerId;

          eventPartnerMap.set(d.id, effectivePartnerId);

          if (appUser.role === 'superadmin') {
            accessibleEventIds.add(d.id);
          } else if (appUser.role === 'client') {
            if (
              (targetClientId && evData?.clientId === targetClientId) ||
              assignedEventIds.includes(d.id)
            ) {
              accessibleEventIds.add(d.id);
            }
          } else if (isVendorRole) {
            if (canUserAccessEvent(appUser, d.id, effectivePartnerId, allowedPartnerIds)) {
              accessibleEventIds.add(d.id);
            }
          }

          const cid = evData?.clientId;
          const resolvedClientName =
            (cid && clientNameById.get(cid)) ||
            evData?.coupleName ||
            evData?.title?.replace(/^The Wedding Of\s+/i, '') ||
            'Client';
          eventClientNameMap.set(d.id, resolvedClientName);

          const resolvedPhone =
            (cid && phoneByClientId.get(cid)) ||
            (evData?.clientUid && phoneByUserId.get(evData.clientUid)) ||
            (evData?.clientEmail && phoneByEmail.get(String(evData.clientEmail).toLowerCase().trim())) ||
            '';
          if (resolvedPhone) {
            eventClientPhoneMap.set(d.id, resolvedPhone);
          }
        });

        const rawData = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as any) }));
        const data = rawData.filter(req => {
          if (appUser.role === 'superadmin') return true;
          if (appUser.role === 'client') {
            return (
              (targetClientId && req.clientId === targetClientId) ||
              (req.eventId && accessibleEventIds.has(req.eventId))
            );
          }
          if (req.eventId && allEventsSet.has(req.eventId)) {
            return accessibleEventIds.has(req.eventId);
          }
          const rawReqPartnerId =
            req.partnerId && req.partnerId !== 'default-partner' ? req.partnerId : null;
          const evPartnerId =
            req.clientId && myClientIds.has(req.clientId)
              ? userPrimaryBizId
              : rawReqPartnerId || eventPartnerMap.get(req.eventId) || null;
          return canUserAccessEvent(appUser, req.eventId, evPartnerId, allowedPartnerIds);
        });

        const mappedNames: Record<string, string> = {};
        const mappedPhones: Record<string, string> = {};

        data.forEach(req => {
          const name =
            req.requesterName ||
            req.clientName ||
            (req.clientId && clientNameById.get(req.clientId)) ||
            eventClientNameMap.get(req.eventId) ||
            'Client';
          const phone =
            req.clientPhone ||
            (req.clientId && phoneByClientId.get(req.clientId)) ||
            eventClientPhoneMap.get(req.eventId) ||
            '';
          if (req.id) {
            mappedNames[req.id] = name;
            if (phone) {
              mappedPhones[req.id] = phone;
            }
          }
        });

        setRequesterMap(mappedNames);
        setClientPhoneMap(mappedPhones);
        setRequests(data);
      } catch (err) {
        console.error('Approvals getDocs error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovals();
  }, [appUser]);

  const getRequesterName = (req: GuestEditRequest) => {
    return (
      req.requesterName ||
      req.clientName ||
      (req.id ? requesterMap[req.id] : '') ||
      req.eventTitle?.replace(/^The Wedding Of\s+/i, '') ||
      'Client'
    );
  };

  const getClientPhone = (req: GuestEditRequest) => {
    return req.clientPhone || (req.id ? clientPhoneMap[req.id] : '') || '';
  };

  const notifyClientViaWhatsApp = async (
    request: GuestEditRequest,
    decision: 'approved' | 'rejected'
  ): Promise<{ sent: boolean; error?: string }> => {
    const clientPhone = getClientPhone(request);
    if (!clientPhone) {
      return { sent: false };
    }

    const clientDisplayName = getRequesterName(request);
    const isAdd = request.type === 'add';
    const typeLabel = isAdd ? 'Penambahan Tamu Baru' : 'Perubahan Data Tamu';
    const statusHeader =
      decision === 'approved'
        ? '*✅ Notifikasi Guestly — Pengajuan Disetujui*'
        : '*❌ Notifikasi Guestly — Pengajuan Ditolak*';
    const statusText = decision === 'approved' ? '*DISETUJUI*' : '*DITOLAK*';

    const guestTitle = request.requestedData?.title || '';
    const guestName = request.requestedData?.name || request.originalData?.name || '-';
    const guestCategory = request.requestedData?.category || '-';
    const guestInviteType = request.requestedData?.invitationType || '-';
    const guestSession = request.requestedData?.session || '-';
    const guestPax = request.requestedData?.pax ?? 1;

    const actionClosing =
      decision === 'approved'
        ? 'Data tamu tersebut kini telah otomatis diperbarui pada Daftar Tamu acara Anda di sistem Guestly.'
        : 'Pengajuan perubahan ini tidak diterapkan pada Daftar Tamu acara Anda. Silakan hubungi tim WO/Admin jika memerlukan konfirmasi lebih lanjut.';

    const titleLine = guestTitle ? `\n• Pangkat/Jabatan: ${guestTitle}` : '';
    const message = `${statusHeader}\n\nHalo Kak *${clientDisplayName}*,\nPengajuan data tamu Anda untuk acara *${request.eventTitle}* telah ${statusText}.\n\n*Detail Pengajuan:*\n• Jenis: ${typeLabel}${titleLine}\n• Nama Tamu: *${guestName}*\n• Kategori: ${guestCategory}\n• Tipe Undangan: ${guestInviteType}\n• Sesi: ${guestSession}\n• Jumlah Pax: ${guestPax} Orang\n\n${actionClosing}\n\nTerima kasih,\n_Notifikasi Otomatis Guestly_`;

    try {
      const res = await sendFonnteMessage(null, clientPhone, message);
      return { sent: res.success, error: res.error };
    } catch (err: any) {
      return { sent: false, error: err?.message };
    }
  };

  const handleApprove = async (request: GuestEditRequest) => {
    if (!request.id || isProcessing) return;
    setIsProcessing(true);

    try {
      const resolvedByLabel = getOperatorLabel(appUser);
      const nowIso = new Date().toISOString();

      if (request.type === 'add') {
        await addDoc(collection(db, 'events', request.eventId, 'guests'), {
          ...request.requestedData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'events', request.eventId, 'guests', request.guestId), {
          ...request.requestedData,
          updatedAt: serverTimestamp()
        });
      }

      await updateDoc(doc(db, 'guest_edit_requests', request.id), {
        status: 'approved',
        resolvedAt: serverTimestamp(),
        resolvedBy: resolvedByLabel
      });

      const waNotif = await notifyClientViaWhatsApp(request, 'approved');

      setRequests(prev =>
        prev.map(r =>
          r.id === request.id
            ? { ...r, status: 'approved', resolvedAt: nowIso, resolvedBy: resolvedByLabel }
            : r
        )
      );
      setSelectedRequest(null);

      if (waNotif.sent) {
        showAlert(
          'Berhasil Disetujui',
          'Permintaan telah disetujui, dipindahkan ke tab Riwayat, dan notifikasi WhatsApp telah dikirim ke Client.',
          'success'
        );
      } else {
        showAlert(
          'Berhasil Disetujui',
          'Permintaan perubahan data tamu telah disetujui dan dipindahkan ke tab Riwayat.',
          'success'
        );
      }
    } catch (error) {
      console.error('Error approving request:', error);
      showAlert('Gagal', 'Gagal menyetujui permintaan.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (request: GuestEditRequest) => {
    if (!request.id || isProcessing) return;
    setIsProcessing(true);

    try {
      const resolvedByLabel = getOperatorLabel(appUser);
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, 'guest_edit_requests', request.id), {
        status: 'rejected',
        resolvedAt: serverTimestamp(),
        resolvedBy: resolvedByLabel
      });

      const waNotif = await notifyClientViaWhatsApp(request, 'rejected');

      setRequests(prev =>
        prev.map(r =>
          r.id === request.id
            ? { ...r, status: 'rejected', resolvedAt: nowIso, resolvedBy: resolvedByLabel }
            : r
        )
      );
      setSelectedRequest(null);

      if (waNotif.sent) {
        showAlert(
          'Permintaan Ditolak',
          'Permintaan telah ditolak, dipindahkan ke tab Riwayat, dan notifikasi WhatsApp telah dikirim ke Client.',
          'info'
        );
      } else {
        showAlert(
          'Permintaan Ditolak',
          'Permintaan perubahan data tamu telah ditolak dan dipindahkan ke tab Riwayat.',
          'info'
        );
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      showAlert('Gagal', 'Gagal menolak permintaan.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!appUser) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-medium text-gray-700">Akses Ditolak</h2>
        <p className="text-gray-500 mt-2">Anda harus login untuk mengakses halaman ini.</p>
      </div>
    );
  }

  const pendingRequests = requests
    .filter(r => r.status === 'pending')
    .sort((a, b) => {
      const tA = parseFirestoreDate(a.requestedAt)?.getTime() || 0;
      const tB = parseFirestoreDate(b.requestedAt)?.getTime() || 0;
      return tB - tA;
    });

  const historyRequests = requests
    .filter(r => r.status === 'approved' || r.status === 'rejected')
    .sort((a, b) => {
      const tA =
        parseFirestoreDate(a.resolvedAt)?.getTime() ||
        parseFirestoreDate(a.requestedAt)?.getTime() ||
        0;
      const tB =
        parseFirestoreDate(b.resolvedAt)?.getTime() ||
        parseFirestoreDate(b.requestedAt)?.getTime() ||
        0;
      return tB - tA;
    });

  const baseList = activeTab === 'pending' ? pendingRequests : historyRequests;

  const displayedRequests = baseList.filter(req => {
    const reqType = req.type === 'add' ? 'add' : 'edit';
    if (typeFilter !== 'all' && reqType !== typeFilter) {
      return false;
    }
    if (activeTab === 'history' && historyStatusFilter !== 'all' && req.status !== historyStatusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white shadow-xs rounded-xl overflow-hidden border border-slate-200">
        {/* Header & Deskripsi */}
        <div className="px-4 py-5 border-b border-slate-200 sm:px-6">
          <h3 className="text-lg leading-6 font-semibold text-slate-900">
            Daftar Permintaan ({displayedRequests.length})
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {appUser.role === 'client'
              ? 'Status pengajuan penambahan atau perubahan data tamu beserta riwayat persetujuannya.'
              : 'Kelola permintaan perubahan data tamu dari Client serta lihat riwayat pengajuan yang telah diproses.'}
          </p>
        </div>

        {/* Bar Navigasi Tab (Tab 1: Menunggu | Tab 2: Riwayat) & Filter Jenis Pengajuan */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="inline-flex p-1 bg-slate-200/70 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleTabChange('pending')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Menunggu</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${
                  activeTab === 'pending'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-300/70 text-slate-700'
                }`}
              >
                {pendingRequests.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('history')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${
                  activeTab === 'history'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-slate-300/70 text-slate-700'
                }`}
              >
                {historyRequests.length}
              </span>
            </button>
          </div>

          {/* Filter Jenis Pengajuan (& Filter Status Riwayat jika di Tab 2) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mr-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Filter:</span>
            </div>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as 'all' | 'add' | 'edit')}
              className="border border-slate-300 bg-white text-slate-700 text-xs font-medium rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">Semua Jenis Pengajuan</option>
              <option value="add">Penambahan Tamu</option>
              <option value="edit">Edit Tamu</option>
            </select>

            {activeTab === 'history' && (
              <select
                value={historyStatusFilter}
                onChange={e =>
                  setHistoryStatusFilter(e.target.value as 'all' | 'approved' | 'rejected')
                }
                className="border border-slate-300 bg-white text-slate-700 text-xs font-medium rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">Semua Status Riwayat</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
              </select>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Memuat data...</div>
        ) : displayedRequests.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            {activeTab === 'pending' ? (
              <>
                <Check className="w-12 h-12 text-emerald-200 mb-3" />
                <p className="text-slate-500 text-sm">
                  {typeFilter === 'all'
                    ? 'Tidak ada permintaan pengajuan yang sedang menunggu persetujuan.'
                    : 'Tidak ada permintaan menunggu untuk filter jenis pengajuan ini.'}
                </p>
              </>
            ) : (
              <>
                <History className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-slate-500 text-sm">
                  Belum ada riwayat pengajuan yang sesuai dengan filter.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/90">
                <tr>
                  <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-14">
                    No
                  </th>
                  <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Pengaju
                  </th>
                  <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Nama Acara
                  </th>
                  <th className="px-4 sm:px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Jenis Pengajuan
                  </th>
                  <th className="px-4 sm:px-6 py-3.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {displayedRequests.map((req, index) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-xs font-mono text-slate-500">
                      {index + 1}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-slate-900">
                        {getRequesterName(req)}
                      </div>
                      <div className="text-xs text-slate-400">Client</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {req.eventTitle}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        {req.status === 'pending' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Clock className="w-3 h-3 mr-1" />
                            {req.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Menunggu)
                          </span>
                        )}
                        {req.status === 'approved' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Check className="w-3 h-3 mr-1" />
                            {req.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Disetujui)
                          </span>
                        )}
                        {req.status === 'rejected' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <X className="w-3 h-3 mr-1" />
                            {req.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Ditolak)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => setSelectedRequest(req)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Popup Modal Detail & Approval */}
      <Modal
        isOpen={!!selectedRequest}
        onClose={() => {
          if (!isProcessing) setSelectedRequest(null);
        }}
        title={
          selectedRequest?.status === 'pending'
            ? 'Detail Pengajuan & Approval'
            : 'Detail Riwayat Pengajuan'
        }
        maxWidth="max-w-4xl"
      >
        {selectedRequest && (
          <div className="space-y-5">
            {/* Informasi Umum Pengajuan */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                <span className="text-slate-500 text-xs font-medium min-w-[130px]">Pengaju (Client):</span>
                <span className="font-semibold text-slate-900">{getRequesterName(selectedRequest)}</span>
              </div>
              <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                <span className="text-slate-500 text-xs font-medium min-w-[130px]">Nama Acara:</span>
                <span className="font-medium text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded text-xs">
                  {selectedRequest.eventTitle}
                </span>
              </div>
              <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                <span className="text-slate-500 text-xs font-medium min-w-[130px]">Jenis Pengajuan:</span>
                <div>
                  {selectedRequest.status === 'pending' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      <Clock className="w-3 h-3 mr-1" />
                      {selectedRequest.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Menunggu)
                    </span>
                  )}
                  {selectedRequest.status === 'approved' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <Check className="w-3 h-3 mr-1" />
                      {selectedRequest.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Disetujui)
                    </span>
                  )}
                  {selectedRequest.status === 'rejected' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <X className="w-3 h-3 mr-1" />
                      {selectedRequest.type === 'add' ? 'Penambahan Tamu' : 'Edit Tamu'} (Ditolak)
                    </span>
                  )}
                </div>
              </div>
              {selectedRequest.requestedAt && parseFirestoreDate(selectedRequest.requestedAt) && (
                <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                  <span className="text-slate-500 text-xs font-medium min-w-[130px]">Waktu Pengajuan:</span>
                  <span className="text-xs text-slate-600">
                    {parseFirestoreDate(selectedRequest.requestedAt)!.toLocaleString('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })}
                  </span>
                </div>
              )}
              {selectedRequest.status !== 'pending' &&
                selectedRequest.resolvedAt &&
                parseFirestoreDate(selectedRequest.resolvedAt) && (
                  <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                    <span className="text-slate-500 text-xs font-medium min-w-[130px]">
                      Waktu Diproses:
                    </span>
                    <span className="text-xs font-medium text-slate-700">
                      {parseFirestoreDate(selectedRequest.resolvedAt)!.toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>
                )}
              {selectedRequest.status !== 'pending' && selectedRequest.resolvedBy && (
                <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                  <span className="text-slate-500 text-xs font-medium min-w-[130px]">
                    Diproses Oleh:
                  </span>
                  <span className="text-xs font-semibold text-slate-800">
                    {selectedRequest.resolvedBy}
                  </span>
                </div>
              )}
            </div>

            {/* Rincian Data Perubahan */}
            <div
              className={`grid ${
                selectedRequest.type === 'add' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
              } gap-5 text-sm`}
            >
              {selectedRequest.type !== 'add' && (
                <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
                  <h4 className="font-semibold text-slate-500 mb-3.5 border-b border-slate-200 pb-2 text-xs uppercase tracking-wider">
                    Data Lama
                  </h4>
                  <div className="space-y-2.5 text-slate-700">
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-slate-400">Pangkat/Jabatan:</span>
                      <span>{selectedRequest.originalData?.title || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-slate-400">Nama:</span>
                      <span className="font-medium text-slate-800">{selectedRequest.originalData?.name || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-slate-400">HP:</span>
                      <span>{selectedRequest.originalData?.phone || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-slate-400">Alamat:</span>
                      <span>{selectedRequest.originalData?.address || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-slate-400">Kategori:</span>
                      <span>{selectedRequest.originalData?.category || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-slate-400">Tipe Undangan:</span>
                      <span>{selectedRequest.originalData?.invitationType || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-slate-400">Sesi:</span>
                      <span>{selectedRequest.originalData?.session || '-'}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-slate-400">Jumlah Pax:</span>
                      <span>{selectedRequest.originalData?.pax ?? 1} Orang</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="border border-indigo-100 rounded-xl p-5 bg-white shadow-2xs">
                <h4 className="font-semibold text-indigo-600 mb-3.5 border-b border-indigo-100 pb-2 text-xs uppercase tracking-wider">
                  Data Baru
                </h4>
                <div className="space-y-2.5 text-slate-800">
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-400 font-normal">Pangkat/Jabatan:</span>
                    <span
                      className={
                        selectedRequest.type !== 'add' &&
                        (selectedRequest.originalData?.title || '') !==
                          (selectedRequest.requestedData?.title || '')
                          ? 'font-semibold text-indigo-700'
                          : ''
                      }
                    >
                      {selectedRequest.requestedData?.title || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-400 font-normal">Nama:</span>
                    <span
                      className={
                        selectedRequest.type !== 'add' &&
                        selectedRequest.originalData?.name !== selectedRequest.requestedData?.name
                          ? 'font-semibold text-indigo-700'
                          : 'font-medium'
                      }
                    >
                      {selectedRequest.requestedData?.name || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-400 font-normal">HP:</span>
                    <span
                      className={
                        selectedRequest.type !== 'add' &&
                        selectedRequest.originalData?.phone !== selectedRequest.requestedData?.phone
                          ? 'font-semibold text-indigo-700'
                          : ''
                      }
                    >
                      {selectedRequest.requestedData?.phone || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-400 font-normal">Alamat:</span>
                    <span
                      className={
                        selectedRequest.type !== 'add' &&
                        selectedRequest.originalData?.address !== selectedRequest.requestedData?.address
                          ? 'font-semibold text-indigo-700'
                          : ''
                      }
                    >
                      {selectedRequest.requestedData?.address || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-400 font-normal">Kategori:</span>
                    <span
                      className={
                        selectedRequest.type !== 'add' &&
                        selectedRequest.originalData?.category !== selectedRequest.requestedData?.category
                          ? 'font-semibold text-indigo-700'
                          : ''
                      }
                    >
                      {selectedRequest.requestedData?.category || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-400 font-normal">Tipe Undangan:</span>
                    <span
                      className={
                        selectedRequest.type !== 'add' &&
                        selectedRequest.originalData?.invitationType !==
                          selectedRequest.requestedData?.invitationType
                          ? 'font-semibold text-indigo-700'
                          : ''
                      }
                    >
                      {selectedRequest.requestedData?.invitationType || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-400 font-normal">Sesi:</span>
                    <span
                      className={
                        selectedRequest.type !== 'add' &&
                        selectedRequest.originalData?.session !== selectedRequest.requestedData?.session
                          ? 'font-semibold text-indigo-700'
                          : ''
                      }
                    >
                      {selectedRequest.requestedData?.session || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <span className="text-slate-400 font-normal">Jumlah Pax:</span>
                    <span
                      className={
                        selectedRequest.type !== 'add' &&
                        selectedRequest.originalData?.pax !== selectedRequest.requestedData?.pax
                          ? 'font-semibold text-indigo-700'
                          : ''
                      }
                    >
                      {selectedRequest.requestedData?.pax ?? 1} Orang
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Tutup
              </button>

              {appUser.role === 'client' ? (
                <a
                  href={`https://wa.me/6285158636606?text=Halo%20Admin,%20saya%20ingin%20follow%20up%20pengajuan%20data%20tamu%20untuk%20acara%20${encodeURIComponent(
                    selectedRequest.eventTitle
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
                >
                  Follow up Pengajuan
                </a>
              ) : (
                selectedRequest.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleReject(selectedRequest)}
                      className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold bg-white text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      Tolak
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleApprove(selectedRequest)}
                      className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4 mr-1.5" />
                      Setujui
                    </button>
                  </>
                )
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

