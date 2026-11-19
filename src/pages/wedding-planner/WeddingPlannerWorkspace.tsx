import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../AuthContext';
import {
  Client,
  EventRecord,
  Guest,
  PlannerChecklistItem,
  PlannerChecklistPhase,
  PlannerRundownItem,
  PlannerRundownSegment,
  PlannerVendorCategory,
  PlannerVendorItem,
  PlannerVendorStatus,
  WeddingPlannerData,
} from '../../types';
import {
  canUserAccessEvent,
  computeDefaultActiveUntil,
  DEFAULT_EVENT_ACTIVE_DAYS,
  getUserBusinessId,
  isEventInactiveOrExpired,
  isSelfRegisteredClient,
  isVendorManagedClient,
  parseFirestoreDate,
} from '../../lib/utils';
import { showAlert, showConfirm } from '../../lib/alerts';
import { Modal } from '../../components/Modal';
import {
  HeartHandshake,
  ListChecks,
  Store,
  Wallet,
  CalendarClock,
  LayoutGrid,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Calendar,
  MapPin,
  Users,
  Phone,
  Sparkles,
  ArrowRight,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Pencil,
  Loader2,
  Armchair,
  UserPlus,
  Archive,
  Building2,
  Lock,
  ShoppingBag,
} from 'lucide-react';

export type WeddingPlannerSection =
  | 'overview'
  | 'checklist'
  | 'vendors'
  | 'budget'
  | 'rundown'
  | 'seating';

interface WeddingPlannerWorkspaceProps {
  section: WeddingPlannerSection;
}

const CHECKLIST_PHASES: PlannerChecklistPhase[] = [
  'H-6 Bulan',
  'H-3 Bulan',
  'H-1 Bulan',
  'H-7 Hari',
  'Hari-H',
];

const VENDOR_CATEGORIES: PlannerVendorCategory[] = [
  'Venue',
  'Catering',
  'Dekorasi',
  'MUA & Busana',
  'Dokumentasi',
  'Entertainment & MC',
  'WO & Lainnya',
];

const VENDOR_STATUSES: PlannerVendorStatus[] = [
  'Survey',
  'Booking',
  'DP Dibayar',
  'Lunas',
];

const RUNDOWN_SEGMENTS: PlannerRundownSegment[] = [
  'Persiapan',
  'Akad / Pemberkatan',
  'Resepsi',
  'Penutup',
];

const DEFAULT_CHECKLIST_TEMPLATE: Omit<PlannerChecklistItem, 'id'>[] = [
  { title: 'Kunci tanggal acara & booking venue utama', phase: 'H-6 Bulan', pic: 'Mempelai & WO', completed: false },
  { title: 'Finalisasi jumlah tamu & daftar undangan VIP/VVIP', phase: 'H-3 Bulan', pic: 'Keluarga & Mempelai', completed: false },
  { title: 'Konfirmasi vendor Catering, Dekorasi, MUA & Dokumentasi', phase: 'H-3 Bulan', pic: 'Leader WO', completed: false },
  { title: 'Technical Meeting seluruh vendor & panitia keluarga', phase: 'H-1 Bulan', pic: 'Koordinator Lapangan', completed: false },
  { title: 'Import daftar tamu ke Guestly & uji coba kirim undangan WA', phase: 'H-1 Bulan', pic: 'Admin Operasional', completed: false },
  { title: 'Finalisasi denah meja VIP/Keluarga & stok souvenir', phase: 'H-7 Hari', pic: 'PIC Logistik', completed: false },
  { title: 'Persiapan perangkat Scanner QR & TV Layar Sapa di venue', phase: 'Hari-H', pic: 'Tim Gate & IT', completed: false },
];

const DEFAULT_RUNDOWN_TEMPLATE: Omit<PlannerRundownItem, 'id'>[] = [
  { startTime: '06:00', endTime: '07:30', segment: 'Persiapan', activity: 'Persiapan & Make Up Mempelai + Keluarga Inti', pic: 'MUA & PIC Keluarga', location: 'Ruang Rias', notes: 'Tim dekorasi & sound system final check' },
  { startTime: '08:00', endTime: '09:30', segment: 'Akad / Pemberkatan', activity: 'Prosesi Akad / Pemberkatan & Sungkeman', pic: 'MC & Penghulu/Pendeta', location: 'Area Utama', notes: 'Registrasi tamu keluarga via QR Gate' },
  { startTime: '10:30', endTime: '11:00', segment: 'Resepsi', activity: 'Briefing Petugas Buku Tamu, Souvenir & Layar Sapa', pic: 'Koordinator WO', location: 'Meja Registrasi', notes: 'Pastikan mode Offline Sync Scanner siap' },
  { startTime: '11:00', endTime: '13:30', segment: 'Resepsi', activity: 'Kirab Pengantin, Jamuan Makan & Foto Bersama Tamu', pic: 'MC, WO & Dokumentasi', location: 'Ballroom / Pendopo', notes: 'Sambutan tamu VVIP didampingi Usher' },
  { startTime: '13:30', endTime: '14:00', segment: 'Penutup', activity: 'Serah Terima Souvenir Sisa & Penutupan Acara', pic: 'PIC Logistik & WO', location: 'Area Registrasi', notes: 'Ekspor rekap kehadiran Guestly' },
];

const makeId = () => `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function WeddingPlannerWorkspace({ section }: WeddingPlannerWorkspaceProps) {
  const { appUser } = useAuth();

  const isManagerRole = ['superadmin', 'owner', 'admin', 'partner'].includes(appUser?.role || '');
  const isClientRole = appUser?.role === 'client';
  const isSelfClient = isSelfRegisteredClient(appUser);
  const isManagedClient = isVendorManagedClient(appUser);
  const userEventCredit =
    appUser?.eventCredit !== undefined ? appUser.eventCredit : (appUser?.eventQuota || 0);

  const [allAccessibleEvents, setAllAccessibleEvents] = useState<EventRecord[]>([]);
  const [accessibleClients, setAccessibleClients] = useState<Client[]>([]);
  const [plannerMap, setPlannerMap] = useState<Record<string, Partial<WeddingPlannerData>>>({});
  const [partnerNameMap, setPartnerNameMap] = useState<Record<string, string>>({});
  const [partnersList, setPartnersList] = useState<Array<{ id: string; label: string }>>([]);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [saving, setSaving] = useState(false);

  const [plan, setPlan] = useState<WeddingPlannerData>({
    eventId: '',
    totalBudget: 100000000,
    checklist: [],
    vendors: [],
    rundown: [],
  });

  // Seating & guest stats for selected event
  const [eventGuests, setEventGuests] = useState<Guest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);

  // Filters & Modals
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL');
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<string>('ALL');
  const [rundownSegmentFilter, setRundownSegmentFilter] = useState<string>('ALL');
  const [copiedRundown, setCopiedRundown] = useState(false);

  // Enroll / Add Wedding Planner Project Modal (Dual Mode)
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollMode, setEnrollMode] = useState<'existing' | 'new'>('existing');
  const [enrollClientId, setEnrollClientId] = useState<string>('');
  const [enrollEventId, setEnrollEventId] = useState<string>('');
  const [enrollBudget, setEnrollBudget] = useState<string>('100000000');
  const [enrollLoadChecklist, setEnrollLoadChecklist] = useState(true);
  const [enrollLoadRundown, setEnrollLoadRundown] = useState(true);
  const [newClientNameInput, setNewClientNameInput] = useState('');
  const [newClientPhoneInput, setNewClientPhoneInput] = useState('');
  const [newClientEmailInput, setNewClientEmailInput] = useState('');
  const [newEventTitleInput, setNewEventTitleInput] = useState('');
  const [newEventDateInput, setNewEventDateInput] = useState('');
  const [newEventLocationInput, setNewEventLocationInput] = useState('');
  const [newProjectPartnerId, setNewProjectPartnerId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  // Checklist Form
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPhase, setNewTaskPhase] = useState<PlannerChecklistPhase>('H-1 Bulan');
  const [newTaskPic, setNewTaskPic] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  // Vendor Form
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorCategory, setVendorCategory] = useState<PlannerVendorCategory>('Venue');
  const [vendorPicName, setVendorPicName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorContractValue, setVendorContractValue] = useState('');
  const [vendorPaidAmount, setVendorPaidAmount] = useState('');
  const [vendorStatus, setVendorStatus] = useState<PlannerVendorStatus>('Booking');
  const [vendorNotes, setVendorNotes] = useState('');

  // Budget Modal
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  // Rundown Form
  const [isRundownModalOpen, setIsRundownModalOpen] = useState(false);
  const [editingRundownId, setEditingRundownId] = useState<string | null>(null);
  const [rdStartTime, setRdStartTime] = useState('08:00');
  const [rdEndTime, setRdEndTime] = useState('09:00');
  const [rdSegment, setRdSegment] = useState<PlannerRundownSegment>('Resepsi');
  const [rdActivity, setRdActivity] = useState('');
  const [rdPic, setRdPic] = useState('');
  const [rdLocation, setRdLocation] = useState('');
  const [rdNotes, setRdNotes] = useState('');

  // 1. Load accessible clients, events, and enrolled wedding_planners
  useEffect(() => {
    const fetchWorkspaceData = async () => {
      if (!appUser) return;
      try {
        setLoadingEvents(true);
        const [evSnap, clientsSnap, wpSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'events')),
          getDocs(collection(db, 'clients')),
          getDocs(collection(db, 'wedding_planners')),
          ['superadmin', 'owner', 'partner', 'admin'].includes(appUser.role)
            ? getDocs(collection(db, 'users'))
            : Promise.resolve(null),
        ]);

        const myBizIds = new Set<string>(
          [appUser.id, appUser.partnerId, getUserBusinessId(appUser)].filter(
            (id): id is string => Boolean(id && id !== 'default-partner')
          )
        );

        const nextPartnerNameMap: Record<string, string> = {};
        const nextPartnersList: Array<{ id: string; label: string }> = [];

        usersSnap?.docs.forEach((uDoc) => {
          const u = uDoc.data() as any;
          if (['owner', 'partner'].includes(u.role)) {
            const label = u.businessName || u.brandName || u.name || u.email || 'Partner';
            nextPartnerNameMap[uDoc.id] = label;
            if (u.partnerId) nextPartnerNameMap[u.partnerId] = label;
            nextPartnersList.push({ id: uDoc.id, label });
          }
          if (
            appUser.role !== 'superadmin' &&
            ((u.partnerId && u.partnerId !== 'default-partner' && myBizIds.has(u.partnerId)) ||
              (u.createdBy && myBizIds.has(u.createdBy)) ||
              myBizIds.has(uDoc.id))
          ) {
            myBizIds.add(uDoc.id);
            if (u.partnerId && u.partnerId !== 'default-partner') {
              myBizIds.add(u.partnerId);
            }
          }
        });

        const allowedPartnerIds = Array.from(myBizIds);
        const userPrimaryBizId = getUserBusinessId(appUser) || appUser.id || '';
        const myClientIds = new Set<string>();
        const allClientsList: Client[] = [];

        clientsSnap.forEach((d) => {
          const c = { id: d.id, ...d.data() } as Client;
          allClientsList.push(c);
          if (appUser.role === 'superadmin') {
            myClientIds.add(d.id);
          } else if (c.partnerId && myBizIds.has(c.partnerId)) {
            myClientIds.add(d.id);
          }
        });

        const assignedEventIds = Array.isArray(appUser.assignedEventIds)
          ? appUser.assignedEventIds
          : [];
        const targetClientId = appUser.clientId || appUser.id || '';

        const accessibleEvList: EventRecord[] = [];
        evSnap.forEach((d) => {
          const ev = { id: d.id, ...d.data() } as EventRecord;
          if (appUser.role === 'superadmin') {
            accessibleEvList.push(ev);
          } else if (appUser.role === 'client') {
            if (
              (targetClientId && ev.clientId === targetClientId) ||
              ev.clientUid === appUser.id ||
              assignedEventIds.includes(d.id)
            ) {
              accessibleEvList.push(ev);
            }
          } else {
            const rawPid =
              ev.partnerId && ev.partnerId !== 'default-partner' ? ev.partnerId : null;
            const effectivePid =
              ev.clientId && myClientIds.has(ev.clientId) ? userPrimaryBizId : rawPid;
            if (canUserAccessEvent(appUser, d.id, effectivePid, allowedPartnerIds)) {
              accessibleEvList.push(ev);
            }
          }
        });

        accessibleEvList.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        const filteredClients = allClientsList
          .filter((c) => {
            if (appUser.role === 'superadmin') return true;
            if (appUser.role === 'client') return c.id === targetClientId;
            return (
              (c.id && myClientIds.has(c.id)) ||
              accessibleEvList.some((ev) => ev.clientId === c.id)
            );
          })
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const nextPlannerMap: Record<string, Partial<WeddingPlannerData>> = {};
        wpSnap.forEach((d) => {
          const data = d.data() as Partial<WeddingPlannerData>;
          const evId = data.eventId || d.id;
          nextPlannerMap[evId] = { ...data, id: d.id };
        });

        const isEventUnlockedForPlanner = (ev: EventRecord) => {
          if (!ev.id) return false;
          const pData = nextPlannerMap[ev.id];
          if (Boolean(pData) && pData?.plannerStatus !== 'archived') return true;
          if (isSelfClient && !isEventInactiveOrExpired(ev)) return true;
          if (isManagedClient && (ev.includeWeddingPlanner === true || appUser.includeWeddingPlanner === true)) return true;
          return false;
        };

        const enrolledList = accessibleEvList.filter(isEventUnlockedForPlanner);

        setPartnerNameMap(nextPartnerNameMap);
        setPartnersList(nextPartnersList);
        setAccessibleClients(filteredClients);
        setAllAccessibleEvents(accessibleEvList);
        setPlannerMap(nextPlannerMap);

        const savedId = localStorage.getItem('guestly_planner_selected_event');
        setSelectedEventId((prevId) => {
          if (prevId && enrolledList.some((e) => e.id === prevId)) return prevId;
          if (savedId && enrolledList.some((e) => e.id === savedId)) return savedId;
          return enrolledList[0]?.id || '';
        });
      } catch (err) {
        console.error('Error loading workspace data for planner:', err);
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchWorkspaceData();
  }, [appUser, reloadTrigger]);

  // Events that are enrolled & active in Wedding Planner (or unlocked by package/top-up for Client)
  const events = useMemo(() => {
    return allAccessibleEvents.filter((ev) => {
      if (!ev.id) return false;
      const pData = plannerMap[ev.id];
      if (Boolean(pData) && pData?.plannerStatus !== 'archived') return true;
      if (isSelfClient && !isEventInactiveOrExpired(ev)) return true;
      if (isManagedClient && (ev.includeWeddingPlanner === true || appUser?.includeWeddingPlanner === true)) return true;
      return false;
    });
  }, [allAccessibleEvents, plannerMap, isSelfClient, isManagedClient, appUser?.includeWeddingPlanner]);

  const clientsById = useMemo(() => {
    const map: Record<string, Client> = {};
    accessibleClients.forEach((c) => {
      if (c.id) map[c.id] = c;
    });
    return map;
  }, [accessibleClients]);

  const getEventOptionLabel = (ev: EventRecord) => {
    const datePart = ev.date ? ` (${ev.date})` : '';
    if (isClientRole) {
      return `${ev.title}${datePart}`;
    }
    const pDoc = ev.id ? plannerMap[ev.id] : undefined;
    const cName = (ev.clientId && clientsById[ev.clientId]?.name) || pDoc?.clientName || '';
    const base = cName ? `${cName} — ${ev.title}${datePart}` : `${ev.title}${datePart}`;
    if (appUser?.role === 'superadmin') {
      const bizLabel =
        (ev.partnerId && partnerNameMap[ev.partnerId]) || pDoc?.partnerName || '';
      return bizLabel ? `${base} • [${bizLabel}]` : base;
    }
    return base;
  };

  // Unenrolled accessible events for Add Modal (Tab 1)
  const unenrolledEvents = useMemo(() => {
    return allAccessibleEvents.filter((ev) => {
      if (!ev.id) return false;
      const pData = plannerMap[ev.id];
      return !pData || pData.plannerStatus === 'archived';
    });
  }, [allAccessibleEvents, plannerMap]);

  const unenrolledEventsForSelectedClient = useMemo(() => {
    if (!enrollClientId) return [];
    if (enrollClientId === '__UNASSIGNED__') {
      return unenrolledEvents.filter((ev) => !ev.clientId || !clientsById[ev.clientId]);
    }
    return unenrolledEvents.filter((ev) => ev.clientId === enrollClientId);
  }, [enrollClientId, unenrolledEvents, clientsById]);

  // 2. Load planner document & guests when selectedEventId changes
  useEffect(() => {
    if (!selectedEventId) {
      setPlan({
        eventId: '',
        totalBudget: 100000000,
        checklist: [],
        vendors: [],
        rundown: [],
      });
      setEventGuests([]);
      return;
    }
    localStorage.setItem('guestly_planner_selected_event', selectedEventId);

    const loadPlanner = async () => {
      setLoadingPlan(true);
      try {
        const snap = await getDoc(doc(db, 'wedding_planners', selectedEventId));
        if (snap.exists()) {
          const data = snap.data() as Partial<WeddingPlannerData>;
          setPlan({
            id: snap.id,
            eventId: selectedEventId,
            clientId: data.clientId,
            clientName: data.clientName,
            partnerId: data.partnerId,
            partnerName: data.partnerName,
            plannerStatus: data.plannerStatus || 'active',
            totalBudget: typeof data.totalBudget === 'number' ? data.totalBudget : 100000000,
            checklist: Array.isArray(data.checklist) ? data.checklist : [],
            vendors: Array.isArray(data.vendors) ? data.vendors : [],
            rundown: Array.isArray(data.rundown) ? data.rundown : [],
          });
        } else {
          setPlan({
            eventId: selectedEventId,
            plannerStatus: 'active',
            totalBudget: 100000000,
            checklist: [],
            vendors: [],
            rundown: [],
          });
        }
      } catch (err) {
        console.error('Failed loading wedding planner data:', err);
      } finally {
        setLoadingPlan(false);
      }
    };

    const loadGuests = async () => {
      setLoadingGuests(true);
      try {
        const snap = await getDocs(collection(db, `events/${selectedEventId}/guests`));
        const list: Guest[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Guest));
        setEventGuests(list);
      } catch {
        setEventGuests([]);
      } finally {
        setLoadingGuests(false);
      }
    };

    loadPlanner();
    loadGuests();
  }, [selectedEventId]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const persistPlan = async (updated: WeddingPlannerData, successMsg?: string) => {
    if (!selectedEventId) return;
    setPlan(updated);
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'wedding_planners', selectedEventId),
        {
          ...updated,
          eventId: selectedEventId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (successMsg) showAlert('Tersimpan', successMsg, 'success');
    } catch (err) {
      console.error('Error saving planner:', err);
      showAlert('Gagal', 'Gagal menyimpan data Wedding Planner.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Computed metrics
  const completedTasksCount = plan.checklist.filter((t) => t.completed).length;
  const totalTasksCount = plan.checklist.length;
  const checklistProgress = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  const totalCommitted = plan.vendors.reduce((acc, v) => acc + (Number(v.contractValue) || 0), 0);
  const totalPaid = plan.vendors.reduce((acc, v) => acc + (Number(v.paidAmount) || 0), 0);
  const totalRemaining = Math.max(0, totalCommitted - totalPaid);
  const budgetUsagePct = plan.totalBudget > 0 ? Math.min(100, Math.round((totalCommitted / plan.totalBudget) * 100)) : 0;

  const sortedRundown = useMemo(
    () => [...plan.rundown].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [plan.rundown]
  );

  const daysUntilWedding = useMemo(() => {
    if (!selectedEvent?.date) return null;
    const target = parseFirestoreDate(selectedEvent.date);
    if (!target) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [selectedEvent]);

  // Checklist actions
  const handleToggleTask = (id: string) => {
    const nextChecklist = plan.checklist.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    persistPlan({ ...plan, checklist: nextChecklist });
  };

  const handleAddChecklistTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const newItem: PlannerChecklistItem = {
      id: makeId(),
      title: newTaskTitle.trim(),
      phase: newTaskPhase,
      pic: newTaskPic.trim() || 'Tim WO',
      dueDate: newTaskDueDate || undefined,
      completed: false,
    };
    await persistPlan({ ...plan, checklist: [newItem, ...plan.checklist] }, 'Tugas checklist ditambahkan.');
    setNewTaskTitle('');
    setNewTaskPic('');
    setNewTaskDueDate('');
    setIsChecklistModalOpen(false);
  };

  const handleDeleteTask = async (id: string) => {
    const ok = await showConfirm('Hapus tugas ini dari checklist?');
    if (!ok) return;
    await persistPlan({ ...plan, checklist: plan.checklist.filter((t) => t.id !== id) });
  };

  const handleLoadChecklistTemplate = async () => {
    const ok =
      plan.checklist.length === 0 ||
      (await showConfirm('Tambahkan 7 tugas standar pernikahan ke dalam checklist acara ini?'));
    if (!ok) return;
    const added: PlannerChecklistItem[] = DEFAULT_CHECKLIST_TEMPLATE.map((t) => ({
      ...t,
      id: makeId(),
    }));
    await persistPlan(
      { ...plan, checklist: [...plan.checklist, ...added] },
      'Template checklist pernikahan berhasil dimuat.'
    );
  };

  // Vendor actions
  const openCreateVendor = () => {
    setEditingVendorId(null);
    setVendorName('');
    setVendorCategory('Venue');
    setVendorPicName('');
    setVendorPhone('');
    setVendorContractValue('');
    setVendorPaidAmount('');
    setVendorStatus('Booking');
    setVendorNotes('');
    setIsVendorModalOpen(true);
  };

  const openEditVendor = (v: PlannerVendorItem) => {
    setEditingVendorId(v.id);
    setVendorName(v.name);
    setVendorCategory(v.category);
    setVendorPicName(v.picName || '');
    setVendorPhone(v.phone || '');
    setVendorContractValue(String(v.contractValue || ''));
    setVendorPaidAmount(String(v.paidAmount || ''));
    setVendorStatus(v.status);
    setVendorNotes(v.notes || '');
    setIsVendorModalOpen(true);
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) return;
    const contractNum = Number(vendorContractValue) || 0;
    const paidNum = Number(vendorPaidAmount) || 0;
    const payload: PlannerVendorItem = {
      id: editingVendorId || makeId(),
      name: vendorName.trim(),
      category: vendorCategory,
      picName: vendorPicName.trim(),
      phone: vendorPhone.trim(),
      contractValue: contractNum,
      paidAmount: paidNum,
      status: paidNum >= contractNum && contractNum > 0 ? 'Lunas' : vendorStatus,
      notes: vendorNotes.trim(),
    };

    const nextVendors = editingVendorId
      ? plan.vendors.map((v) => (v.id === editingVendorId ? payload : v))
      : [...plan.vendors, payload];

    await persistPlan(
      { ...plan, vendors: nextVendors },
      editingVendorId ? 'Data vendor diperbarui.' : 'Vendor baru ditambahkan.'
    );
    setIsVendorModalOpen(false);
  };

  const handleDeleteVendor = async (id: string) => {
    const ok = await showConfirm('Hapus vendor ini dari daftar kontrak & anggaran?');
    if (!ok) return;
    await persistPlan({ ...plan, vendors: plan.vendors.filter((v) => v.id !== id) });
  };

  // Budget action
  const handleSaveTotalBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Math.max(0, Number(budgetInput) || 0);
    await persistPlan({ ...plan, totalBudget: val }, 'Pagu anggaran diperbarui.');
    setIsBudgetModalOpen(false);
  };

  // Rundown actions
  const openCreateRundown = () => {
    setEditingRundownId(null);
    setRdStartTime('08:00');
    setRdEndTime('09:00');
    setRdSegment('Resepsi');
    setRdActivity('');
    setRdPic('');
    setRdLocation('');
    setRdNotes('');
    setIsRundownModalOpen(true);
  };

  const openEditRundown = (item: PlannerRundownItem) => {
    setEditingRundownId(item.id);
    setRdStartTime(item.startTime);
    setRdEndTime(item.endTime);
    setRdSegment(item.segment);
    setRdActivity(item.activity);
    setRdPic(item.pic);
    setRdLocation(item.location || '');
    setRdNotes(item.notes || '');
    setIsRundownModalOpen(true);
  };

  const handleSaveRundown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rdActivity.trim()) return;
    const payload: PlannerRundownItem = {
      id: editingRundownId || makeId(),
      startTime: rdStartTime,
      endTime: rdEndTime,
      segment: rdSegment,
      activity: rdActivity.trim(),
      pic: rdPic.trim() || 'MC & WO',
      location: rdLocation.trim(),
      notes: rdNotes.trim(),
    };
    const nextRundown = editingRundownId
      ? plan.rundown.map((r) => (r.id === editingRundownId ? payload : r))
      : [...plan.rundown, payload];

    await persistPlan(
      { ...plan, rundown: nextRundown },
      editingRundownId ? 'Sesi rundown diperbarui.' : 'Agenda rundown ditambahkan.'
    );
    setIsRundownModalOpen(false);
  };

  const handleDeleteRundown = async (id: string) => {
    const ok = await showConfirm('Hapus agenda ini dari rundown hari-H?');
    if (!ok) return;
    await persistPlan({ ...plan, rundown: plan.rundown.filter((r) => r.id !== id) });
  };

  const handleLoadRundownTemplate = async () => {
    const ok =
      plan.rundown.length === 0 ||
      (await showConfirm('Tambahkan template susunan acara (Akad & Resepsi) ke rundown ini?'));
    if (!ok) return;
    const added: PlannerRundownItem[] = DEFAULT_RUNDOWN_TEMPLATE.map((r) => ({
      ...r,
      id: makeId(),
    }));
    await persistPlan(
      { ...plan, rundown: [...plan.rundown, ...added] },
      'Template rundown hari-H berhasil dimuat.'
    );
  };

  const handleCopyRundownText = () => {
    if (sortedRundown.length === 0) return;
    const lines = [
      `RUNDOWN HARI-H: ${selectedEvent?.title || 'Acara Pernikahan'}`,
      selectedEvent?.date ? `Tanggal: ${selectedEvent.date}` : '',
      selectedEvent?.location ? `Lokasi: ${selectedEvent.location}` : '',
      '',
      ...sortedRundown.map(
        (r, idx) =>
          `${idx + 1}. [${r.startTime} - ${r.endTime}] (${r.segment}) ${r.activity} — PIC: ${r.pic}${
            r.location ? ` @ ${r.location}` : ''
          }`
      ),
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedRundown(true);
    setTimeout(() => setCopiedRundown(false), 2000);
    showAlert('Disalin', 'Teks rundown siap ditempel ke WhatsApp panitia/vendor.', 'success');
  };


  const openEnrollModal = () => {
    const firstClientWithEvents = accessibleClients.find((c) =>
      unenrolledEvents.some((ev) => ev.clientId === c.id)
    );
    if (firstClientWithEvents?.id) {
      setEnrollMode('existing');
      setEnrollClientId(firstClientWithEvents.id);
      const firstEv = unenrolledEvents.find((ev) => ev.clientId === firstClientWithEvents.id);
      setEnrollEventId(firstEv?.id || '');
    } else if (unenrolledEvents.length > 0) {
      setEnrollMode('existing');
      setEnrollClientId('__UNASSIGNED__');
      setEnrollEventId(unenrolledEvents[0]?.id || '');
    } else {
      setEnrollMode('new');
      setEnrollClientId('');
      setEnrollEventId('');
    }
    setEnrollBudget('100000000');
    setEnrollLoadChecklist(true);
    setEnrollLoadRundown(true);
    setNewClientNameInput('');
    setNewClientPhoneInput('');
    setNewClientEmailInput('');
    setNewEventTitleInput('');
    setNewEventDateInput('');
    setNewEventLocationInput('');
    setNewProjectPartnerId(getUserBusinessId(appUser) || appUser?.id || '');
    setIsEnrollModalOpen(true);
  };

  const handleSelectEnrollClient = (clientIdVal: string) => {
    setEnrollClientId(clientIdVal);
    if (clientIdVal === '__UNASSIGNED__') {
      const firstUnassigned = unenrolledEvents.find((ev) => !ev.clientId || !clientsById[ev.clientId]);
      setEnrollEventId(firstUnassigned?.id || '');
    } else {
      const firstEv = unenrolledEvents.find((ev) => ev.clientId === clientIdVal);
      setEnrollEventId(firstEv?.id || '');
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser || !isManagerRole) return;

    const initialBudget = Math.max(0, Number(enrollBudget) || 0);
    const starterChecklist: PlannerChecklistItem[] = enrollLoadChecklist
      ? DEFAULT_CHECKLIST_TEMPLATE.map((t) => ({ ...t, id: makeId() }))
      : [];
    const starterRundown: PlannerRundownItem[] = enrollLoadRundown
      ? DEFAULT_RUNDOWN_TEMPLATE.map((r) => ({ ...r, id: makeId() }))
      : [];

    setEnrolling(true);
    try {
      if (enrollMode === 'existing') {
        const targetEv = unenrolledEvents.find((ev) => ev.id === enrollEventId);
        if (!targetEv || !targetEv.id) {
          showAlert('Pilih Acara', 'Silakan pilih acara yang akan didaftarkan ke Wedding Planner.', 'warning');
          setEnrolling(false);
          return;
        }
        const matchedClient = targetEv.clientId ? clientsById[targetEv.clientId] : undefined;
        const resolvedClientName = matchedClient?.name || targetEv.coupleName || targetEv.title;
        const prevDoc = plannerMap[targetEv.id];
        const resolvedPartnerId =
          targetEv.partnerId || getUserBusinessId(appUser) || appUser.id || 'default-partner';
        const resolvedPartnerName =
          partnerNameMap[resolvedPartnerId] || appUser.businessName || '';

        const payload: WeddingPlannerData = {
          eventId: targetEv.id,
          clientId: targetEv.clientId || '',
          clientName: resolvedClientName,
          partnerId: resolvedPartnerId,
          partnerName: resolvedPartnerName,
          plannerStatus: 'active',
          totalBudget: initialBudget,
          checklist:
            prevDoc?.checklist && prevDoc.checklist.length > 0
              ? prevDoc.checklist
              : starterChecklist,
          vendors: prevDoc?.vendors && prevDoc.vendors.length > 0 ? prevDoc.vendors : [],
          rundown:
            prevDoc?.rundown && prevDoc.rundown.length > 0 ? prevDoc.rundown : starterRundown,
          createdAt: prevDoc?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'wedding_planners', targetEv.id), payload, { merge: true });
        setSelectedEventId(targetEv.id);
        setReloadTrigger((prev) => prev + 1);
        window.dispatchEvent(new CustomEvent('guestly-planner-updated'));
        setIsEnrollModalOpen(false);
        showAlert(
          'Client Ditambahkan',
          `${resolvedClientName} berhasil diaktifkan di Wedding Planner.`,
          'success'
        );
      } else {
        // Create New Client + New Event + Activate Wedding Planner
        if (!newClientNameInput.trim() || !newEventTitleInput.trim() || !newEventDateInput) {
          showAlert(
            'Data Belum Lengkap',
            'Nama Client, Judul Acara, dan Tanggal Acara wajib diisi.',
            'warning'
          );
          setEnrolling(false);
          return;
        }

        const resolvedPartnerId =
          appUser.role === 'superadmin'
            ? newProjectPartnerId || appUser.id || 'default-partner'
            : getUserBusinessId(appUser) || appUser.id || 'default-partner';
        const resolvedPartnerName =
          partnerNameMap[resolvedPartnerId] || appUser.businessName || '';

        const clientPayload = {
          name: newClientNameInput.trim(),
          phone: newClientPhoneInput.trim(),
          contactEmail: newClientEmailInput.trim(),
          partnerId: resolvedPartnerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const newClientRef = await addDoc(collection(db, 'clients'), clientPayload);

        const defaultActiveUntil = computeDefaultActiveUntil(
          new Date(),
          DEFAULT_EVENT_ACTIVE_DAYS
        );
        const eventPayload: any = {
          title: newEventTitleInput.trim(),
          coupleName: newClientNameInput.trim(),
          date: newEventDateInput,
          location: newEventLocationInput.trim(),
          clientId: newClientRef.id,
          partnerId: resolvedPartnerId,
          status: 'published',
          subscriptionStatus: 'active',
          activeDays: DEFAULT_EVENT_ACTIVE_DAYS,
          activeUntil: defaultActiveUntil,
          guestCategories: ['Reguler', 'VIP', 'VVIP', 'Keluarga'],
          invitationTypes: ['Digital (WhatsApp)', 'Fisik / Cetak'],
          sessions: ['Akad / Pemberkatan', 'Resepsi'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const newEventRef = await addDoc(collection(db, 'events'), eventPayload);

        const plannerPayload: WeddingPlannerData = {
          eventId: newEventRef.id,
          clientId: newClientRef.id,
          clientName: newClientNameInput.trim(),
          partnerId: resolvedPartnerId,
          partnerName: resolvedPartnerName,
          plannerStatus: 'active',
          totalBudget: initialBudget,
          checklist: starterChecklist,
          vendors: [],
          rundown: starterRundown,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'wedding_planners', newEventRef.id), plannerPayload, { merge: true });
        setSelectedEventId(newEventRef.id);
        setReloadTrigger((prev) => prev + 1);
        window.dispatchEvent(new CustomEvent('guestly-planner-updated'));
        setIsEnrollModalOpen(false);
        showAlert(
          'Proyek Planner Dibuat',
          `Client ${newClientNameInput.trim()} dan acara ${newEventTitleInput.trim()} berhasil ditambahkan.`,
          'success'
        );
      }
    } catch (err) {
      console.error('Error enrolling Wedding Planner project:', err);
      showAlert('Gagal', 'Gagal menambahkan client ke Wedding Planner.', 'error');
    } finally {
      setEnrolling(false);
    }
  };

  const handleArchiveFromPlanner = async () => {
    if (!isManagerRole || !selectedEventId || !selectedEvent) return;
    const cName =
      (selectedEvent.clientId && clientsById[selectedEvent.clientId]?.name) ||
      plan.clientName ||
      selectedEvent.title;
    const ok = await showConfirm(
      `Keluarkan "${cName}" dari daftar Wedding Planner? Data client & acara di menu Clients/Events tetap aman tidak terhapus.`
    );
    if (!ok) return;

    try {
      await setDoc(
        doc(db, 'wedding_planners', selectedEventId),
        { plannerStatus: 'archived', updatedAt: serverTimestamp() },
        { merge: true }
      );
      localStorage.removeItem('guestly_planner_selected_event');
      setSelectedEventId('');
      setReloadTrigger((prev) => prev + 1);
      window.dispatchEvent(new CustomEvent('guestly-planner-updated'));
      showAlert('Berhasil', `${cName} dinonaktifkan dari layanan Wedding Planner.`, 'success');
    } catch (err) {
      console.error('Error archiving planner project:', err);
      showAlert('Gagal', 'Gagal menonaktifkan proyek dari Wedding Planner.', 'error');
    }
  };

  if (loadingEvents) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#8C3A50]" />
        <span className="text-sm font-medium">Memuat workspace Wedding Planner...</span>
      </div>
    );
  }

  const enrollModalNode = isManagerRole && (
    <Modal
      isOpen={isEnrollModalOpen}
      onClose={() => setIsEnrollModalOpen(false)}
      title="Tambah Client ke Wedding Planner"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleEnrollSubmit} className="space-y-4">
        {/* Mode Switcher inside Modal */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200/80">
          <button
            type="button"
            onClick={() => setEnrollMode('existing')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              enrollMode === 'existing'
                ? 'bg-white text-[#8C3A50] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pilih Client &amp; Acara Ada
          </button>
          <button
            type="button"
            onClick={() => setEnrollMode('new')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              enrollMode === 'new'
                ? 'bg-white text-[#8C3A50] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Buat Client &amp; Acara Baru
          </button>
        </div>

        {enrollMode === 'existing' ? (
          <div className="space-y-3.5">
            {unenrolledEvents.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <p className="font-bold">Semua client &amp; acara yang ada sudah aktif di Wedding Planner.</p>
                <p>Gunakan tab <strong>Buat Client &amp; Acara Baru</strong> di atas untuk mendaftarkan client baru.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    1. Pilih Client <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={enrollClientId}
                    onChange={(e) => handleSelectEnrollClient(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-[#8C3A50] focus:ring-[#8C3A50]"
                  >
                    <option value="">-- Pilih Client --</option>
                    {accessibleClients.map((c) => {
                      const availableCount = unenrolledEvents.filter((ev) => ev.clientId === c.id).length;
                      if (availableCount === 0) return null;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({availableCount} acara tersedia)
                        </option>
                      );
                    })}
                    {unenrolledEvents.some((ev) => !ev.clientId || !clientsById[ev.clientId]) && (
                      <option value="__UNASSIGNED__">Acara Tanpa Tautan Client</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    2. Pilih Acara <span className="text-rose-600">*</span>
                  </label>
                  <select
                    required
                    value={enrollEventId}
                    onChange={(e) => setEnrollEventId(e.target.value)}
                    disabled={!enrollClientId || unenrolledEventsForSelectedClient.length === 0}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white disabled:bg-slate-100 focus:border-[#8C3A50] focus:ring-[#8C3A50]"
                  >
                    <option value="">-- Pilih Acara --</option>
                    {unenrolledEventsForSelectedClient.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} {ev.date ? `(${ev.date})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {appUser?.role === 'superadmin' && partnersList.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bisnis / Partner Naungan
                </label>
                <select
                  value={newProjectPartnerId}
                  onChange={(e) => setNewProjectPartnerId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-[#8C3A50] focus:ring-[#8C3A50]"
                >
                  <option value={appUser.id || 'default-partner'}>Guestly Official (Super Admin)</option>
                  {partnersList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Client / Mempelai <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={newClientNameInput}
                onChange={(e) => setNewClientNameInput(e.target.value)}
                placeholder="Contoh: Raka & Nadia"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">No. WhatsApp (Opsional)</label>
                <input
                  type="text"
                  value={newClientPhoneInput}
                  onChange={(e) => setNewClientPhoneInput(e.target.value)}
                  placeholder="0812..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email (Opsional)</label>
                <input
                  type="email"
                  value={newClientEmailInput}
                  onChange={(e) => setNewClientEmailInput(e.target.value)}
                  placeholder="client@email.com"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Judul Acara Pernikahan <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={newEventTitleInput}
                onChange={(e) => setNewEventTitleInput(e.target.value)}
                placeholder="Contoh: The Wedding Of Raka & Nadia"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Acara <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={newEventDateInput}
                  onChange={(e) => setNewEventDateInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lokasi / Venue</label>
                <input
                  type="text"
                  value={newEventLocationInput}
                  onChange={(e) => setNewEventLocationInput(e.target.value)}
                  placeholder="Gedung / Hotel"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Shared Initial Settings */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Pagu Anggaran Awal (Rp)</label>
            <input
              type="number"
              min="0"
              value={enrollBudget}
              onChange={(e) => setEnrollBudget(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono font-bold focus:border-[#8C3A50] focus:ring-[#8C3A50]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enrollLoadChecklist}
                onChange={(e) => setEnrollLoadChecklist(e.target.checked)}
                className="rounded border-slate-300 text-[#8C3A50] focus:ring-[#8C3A50]"
              />
              <span>Langsung muat 7 template Checklist persiapan pernikahan</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enrollLoadRundown}
                onChange={(e) => setEnrollLoadRundown(e.target.checked)}
                className="rounded border-slate-300 text-[#8C3A50] focus:ring-[#8C3A50]"
              />
              <span>Langsung muat 5 template Rundown Akad &amp; Resepsi</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setIsEnrollModalOpen(false)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={enrolling || (enrollMode === 'existing' && !enrollEventId)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
          >
            {enrolling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{enrollMode === 'existing' ? 'Aktifkan di Planner' : 'Simpan & Aktifkan'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );

  if (events.length === 0) {
    return (
      <>
        {isSelfClient ? (
          <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-8">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-[#8C3A50] border border-rose-200 text-xs font-bold">
                <Lock className="w-3.5 h-3.5" />
                <span>{userEventCredit > 0 ? 'Satu Langkah Lagi' : 'Terkunci Hingga Top-Up Paket'}</span>
              </div>
              <div className="w-16 h-16 rounded-2xl bg-rose-50 text-[#8C3A50] border border-rose-200 flex items-center justify-center mx-auto">
                <HeartHandshake className="w-8 h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                {userEventCredit > 0
                  ? 'Kuota Aktif! Buat Acara Pertama untuk Membuka Wedding Planner'
                  : 'Wedding Planner Siap Membantu Persiapan Pernikahan Anda'}
              </h2>
              <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
                {userEventCredit > 0
                  ? 'Anda sudah memiliki kuota acara aktif. Buat acara pernikahan Anda sekarang agar seluruh 6 modul Wedding Planner otomatis terbuka dan tersinkronisasi dengan daftar tamu.'
                  : 'Sebagai akun Client Mandiri, seluruh 6 modul Wedding Planner di bawah ini akan otomatis terbuka segera setelah Anda melakukan Top-Up Paket dan membuat acara pernikahan Anda.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {[
                {
                  icon: HeartHandshake,
                  title: '1. Overview & Countdown',
                  desc: 'Pantau sisa hari menuju Hari-H, progres tugas, dan ringkasan kesiapan acara.',
                },
                {
                  icon: ListChecks,
                  title: '2. Checklist & Tugas',
                  desc: 'Template timeline persiapan H-6 Bulan sampai Hari-H lengkap dengan penanggung jawab.',
                },
                {
                  icon: Store,
                  title: '3. Vendor & Kontrak',
                  desc: 'Catat kontak Venue, Catering, Dekorasi, MUA, hingga status DP & pelunasan.',
                },
                {
                  icon: Wallet,
                  title: '4. Anggaran & Pembayaran',
                  desc: 'Kontrol total budget pernikahan, realisasi biaya, dan sisa anggaran secara otomatis.',
                },
                {
                  icon: CalendarClock,
                  title: '5. Rundown Hari-H',
                  desc: 'Susun jadwal Persiapan, Akad/Pemberkatan, hingga Resepsi yang siap dibagikan.',
                },
                {
                  icon: LayoutGrid,
                  title: '6. Denah Meja & Tamu',
                  desc: 'Kelola kapasitas meja VVIP, VIP & Keluarga yang terhubung langsung ke buku tamu.',
                },
              ].map((feat) => {
                const FeatIcon = feat.icon;
                return (
                  <div
                    key={feat.title}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-1.5 relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-rose-50 text-[#8C3A50] border border-rose-200/70 flex items-center justify-center">
                        <FeatIcon className="w-4 h-4" />
                      </div>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 pt-1">{feat.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{feat.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              {userEventCredit > 0 ? (
                <Link
                  to="/auth/login/events/add"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-bold transition-colors shadow-xs w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Acara Pertama Anda</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  to="/auth/login/services/catalog"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-bold transition-colors shadow-xs w-full sm:w-auto"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Top-Up Paket untuk Membuka</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
              <Link
                to="/auth/login/events"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-semibold transition-colors w-full sm:w-auto"
              >
                <span>Lihat Daftar Acara</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-[#8C3A50] border border-rose-200 flex items-center justify-center mx-auto">
              <HeartHandshake className="w-7 h-7" />
            </div>
            {isClientRole ? (
              <>
                <h2 className="text-lg font-bold text-slate-900">Paket Acara Belum Mencakup Wedding Planner</h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Acara Anda saat ini hanya terdaftar untuk layanan Buku Tamu Digital di bawah naungan Vendor / Owner. Silakan hubungi tim <strong>Wedding Organizer / Vendor</strong> Anda apabila ingin mengaktifkan paket Wedding Planner.
                </p>
                <div>
                  <Link
                    to="/auth/login/events"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-semibold transition-colors shadow-xs"
                  >
                    <span>Kembali ke Daftar Acara</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900">Belum Ada Client di Layanan Wedding Planner</h2>
                <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                  Hanya client &amp; acara yang didaftarkan ke layanan Wedding Planner yang akan muncul pada dropdown seluruh menu (<strong>Overview</strong> hingga <strong>Denah Meja</strong>), terpisah dari client buku tamu reguler.
                </p>
                <div>
                  {section === 'overview' ? (
                    <button
                      type="button"
                      onClick={openEnrollModal}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-semibold transition-colors shadow-xs cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Tambah Client Wedding Planner</span>
                    </button>
                  ) : (
                    <Link
                      to="/auth/login/wedding-planner"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-sm font-semibold transition-colors shadow-xs"
                    >
                      <span>Buka 1. Overview untuk Tambah Client</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {enrollModalNode}
      </>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Bar: Role-Scoped Active Planner Project Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              {isClientRole ? 'Acara Pernikahan Anda (Wedding Planner)' : 'Client & Proyek Wedding Planner Aktif'}
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              {isClientRole && events.length === 1 ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/50 px-3.5 py-2 text-sm font-bold text-slate-900">
                  <HeartHandshake className="w-4 h-4 text-[#8C3A50] shrink-0" />
                  <span>{getEventOptionLabel(events[0])}</span>
                </div>
              ) : (
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full sm:max-w-lg rounded-xl border border-slate-300 bg-slate-50/70 px-3.5 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:border-[#8C3A50] focus:ring-[#8C3A50]"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {getEventOptionLabel(ev)}
                    </option>
                  ))}
                </select>
              )}

              {daysUntilWedding !== null && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border w-fit shrink-0 ${
                    daysUntilWedding < 0
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : daysUntilWedding <= 7
                      ? 'bg-rose-50 text-[#8C3A50] border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {daysUntilWedding < 0
                    ? `Selesai ${Math.abs(daysUntilWedding)} hari lalu`
                    : daysUntilWedding === 0
                    ? 'Hari-H Berlangsung!'
                    : `H-${daysUntilWedding} Menuju Hari-H`}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {saving && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 px-2.5 py-1 bg-slate-100 rounded-lg">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8C3A50]" />
                Menyimpan...
              </span>
            )}
            {appUser?.role === 'superadmin' && selectedEvent?.partnerId && partnerNameMap[selectedEvent.partnerId] && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl max-w-[210px] truncate">
                <Building2 className="w-3.5 h-3.5 text-[#8C3A50] shrink-0" />
                <span className="truncate">{partnerNameMap[selectedEvent.partnerId]}</span>
              </span>
            )}
            {selectedEvent?.location && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl max-w-[220px] truncate">
                <MapPin className="w-3.5 h-3.5 text-[#8C3A50] shrink-0" />
                <span className="truncate">{selectedEvent.location}</span>
              </span>
            )}
            {selectedEvent?.id && (
              <Link
                to={`/auth/login/events/${selectedEvent.id}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50/60 text-slate-700 hover:text-[#8C3A50] text-xs font-semibold transition-colors"
              >
                <span>Detail Acara</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
            {isManagerRole && section === 'overview' && (
              <>
                <button
                  type="button"
                  onClick={handleArchiveFromPlanner}
                  title="Keluarkan dari daftar Wedding Planner (data Client & Acara tetap aman)"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Lepas</span>
                </button>
                <button
                  type="button"
                  onClick={openEnrollModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Tambah Client</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {loadingPlan ? (
        <div className="py-12 flex items-center justify-center text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#8C3A50]" />
          <span className="text-sm">Memuat rencana pernikahan...</span>
        </div>
      ) : (
        <>
          {/* ================= SECTION 1: OVERVIEW ================= */}
          {section === 'overview' && (
            <div className="space-y-6">
              {/* Summary KPI Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link
                  to="/auth/login/wedding-planner/checklist"
                  className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-rose-200 hover:shadow-sm transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Checklist Tugas</span>
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-[#8C3A50] flex items-center justify-center">
                      <ListChecks className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900">
                      {completedTasksCount} <span className="text-sm font-semibold text-slate-400">/ {totalTasksCount}</span>
                    </div>
                    <div className="mt-2 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#8C3A50] rounded-full transition-all"
                        style={{ width: `${checklistProgress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 font-medium">{checklistProgress}% persiapan selesai</p>
                  </div>
                </Link>

                <Link
                  to="/auth/login/wedding-planner/vendors"
                  className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-rose-200 hover:shadow-sm transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor Terdaftar</span>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <Store className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900">{plan.vendors.length} Vendor</div>
                    <p className="text-xs text-slate-500 mt-1">
                      {plan.vendors.filter((v) => v.status === 'Lunas').length} Lunas •{' '}
                      {plan.vendors.filter((v) => v.status === 'DP Dibayar').length} DP Dibayar
                    </p>
                  </div>
                </Link>

                <Link
                  to="/auth/login/wedding-planner/budget"
                  className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-rose-200 hover:shadow-sm transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Realisasi Anggaran</span>
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                      <Wallet className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xl font-black font-mono text-slate-900 truncate">
                      Rp {totalPaid.toLocaleString('id-ID')}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      Dari kontrak Rp {totalCommitted.toLocaleString('id-ID')} ({budgetUsagePct}% pagu)
                    </p>
                  </div>
                </Link>

                <Link
                  to="/auth/login/wedding-planner/rundown"
                  className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-rose-200 hover:shadow-sm transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rundown &amp; Meja</span>
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                      <CalendarClock className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900">{plan.rundown.length} Sesi</div>
                    <p className="text-xs text-slate-500 mt-1">
                      {(selectedEvent?.seatingTables || []).length} Meja • {eventGuests.length} Undangan Tamu
                    </p>
                  </div>
                </Link>
              </div>

              {/* Two-column quick preview: Next Tasks & Upcoming Rundown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-[#8C3A50]" />
                      Prioritas Checklist Belum Selesai
                    </h3>
                    <Link
                      to="/auth/login/wedding-planner/checklist"
                      className="text-xs font-semibold text-[#8C3A50] hover:underline"
                    >
                      Kelola Semua &rarr;
                    </Link>
                  </div>

                  {plan.checklist.filter((t) => !t.completed).length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                      <p className="text-xs text-slate-500">
                        {plan.checklist.length === 0
                          ? 'Belum ada daftar tugas persiapan.'
                          : 'Semua tugas checklist telah diselesaikan!'}
                      </p>
                      {plan.checklist.length === 0 && (
                        <button
                          type="button"
                          onClick={handleLoadChecklistTemplate}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Muat Template Checklist Pernikahan</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {plan.checklist
                        .filter((t) => !t.completed)
                        .slice(0, 5)
                        .map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => handleToggleTask(task.id)}
                            className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200/80 hover:border-rose-200 hover:bg-rose-50/30 text-left transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-900 truncate">{task.title}</p>
                                <p className="text-[11px] text-slate-500">PIC: {task.pic}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-[#8C3A50] border border-rose-200 shrink-0">
                              {task.phase}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-[#8C3A50]" />
                      Cuplikan Rundown Hari-H
                    </h3>
                    <Link
                      to="/auth/login/wedding-planner/rundown"
                      className="text-xs font-semibold text-[#8C3A50] hover:underline"
                    >
                      Buka Rundown &rarr;
                    </Link>
                  </div>

                  {sortedRundown.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                      <p className="text-xs text-slate-500">Susunan acara Hari-H belum diisi.</p>
                      <button
                        type="button"
                        onClick={handleLoadRundownTemplate}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Muat Template Rundown Akad &amp; Resepsi</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortedRundown.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#8C3A50]">
                                {item.startTime} - {item.endTime}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                                {item.segment}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-900 mt-1 truncate">{item.activity}</p>
                            <p className="text-[11px] text-slate-500">PIC: {item.pic}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= SECTION 2: CHECKLIST & TUGAS ================= */}
          {section === 'checklist' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPhaseFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      phaseFilter === 'ALL'
                        ? 'bg-[#8C3A50] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua ({plan.checklist.length})
                  </button>
                  {CHECKLIST_PHASES.map((ph) => {
                    const count = plan.checklist.filter((t) => t.phase === ph).length;
                    return (
                      <button
                        key={ph}
                        type="button"
                        onClick={() => setPhaseFilter(ph)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                          phaseFilter === ph
                            ? 'bg-[#8C3A50] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {ph} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {plan.checklist.length === 0 && (
                    <button
                      type="button"
                      onClick={handleLoadChecklistTemplate}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-[#8C3A50] hover:bg-rose-100 text-xs font-semibold cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Template Standar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsChecklistModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Tugas</span>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                {plan.checklist.filter((t) => phaseFilter === 'ALL' || t.phase === phaseFilter).length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <ListChecks className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-900">Belum ada tugas pada tahap ini</p>
                    <p className="text-xs text-slate-500">
                      Tambahkan tugas persiapan atau muat template checklist pernikahan otomatis.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {plan.checklist
                      .filter((t) => phaseFilter === 'ALL' || t.phase === phaseFilter)
                      .map((task) => (
                        <div
                          key={task.id}
                          className={`p-4 flex items-center justify-between gap-3 transition-colors ${
                            task.completed ? 'bg-slate-50/70' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleTask(task.id)}
                            className="flex items-start gap-3 text-left flex-1 min-w-0 cursor-pointer"
                          >
                            {task.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <Circle className="w-5 h-5 text-slate-400 hover:text-[#8C3A50] shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <p
                                className={`text-sm font-semibold ${
                                  task.completed ? 'line-through text-slate-400' : 'text-slate-900'
                                }`}
                              >
                                {task.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-[#8C3A50] border border-rose-200 text-[10px] font-bold">
                                  {task.phase}
                                </span>
                                <span>PIC: <strong className="text-slate-700">{task.pic}</strong></span>
                                {task.dueDate && (
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> {task.dueDate}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer shrink-0"
                            title="Hapus tugas"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= SECTION 3: VENDOR & KONTRAK ================= */}
          {section === 'vendors' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
                  <button
                    type="button"
                    onClick={() => setVendorCategoryFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
                      vendorCategoryFilter === 'ALL'
                        ? 'bg-[#8C3A50] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua ({plan.vendors.length})
                  </button>
                  {VENDOR_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setVendorCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
                        vendorCategoryFilter === cat
                          ? 'bg-[#8C3A50] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={openCreateVendor}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold shadow-xs cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Vendor</span>
                </button>
              </div>

              {plan.vendors.filter((v) => vendorCategoryFilter === 'ALL' || v.category === vendorCategoryFilter)
                .length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center space-y-3">
                  <Store className="w-10 h-10 text-slate-300 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-900">Belum Ada Vendor Terdaftar</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Catat seluruh vendor (Venue, Catering, Dekorasi, MUA, Dokumentasi, MC) lengkap dengan nilai kontrak & status pembayarannya.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plan.vendors
                    .filter((v) => vendorCategoryFilter === 'ALL' || v.category === vendorCategoryFilter)
                    .map((v) => {
                      const pct =
                        v.contractValue > 0
                          ? Math.min(100, Math.round((v.paidAmount / v.contractValue) * 100))
                          : 0;
                      return (
                        <div
                          key={v.id}
                          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between space-y-4"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                {v.category}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                  v.status === 'Lunas'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : v.status === 'DP Dibayar'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : v.status === 'Booking'
                                    ? 'bg-rose-50 text-[#8C3A50] border-rose-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {v.status}
                              </span>
                            </div>

                            <div>
                              <h4 className="text-base font-bold text-slate-900">{v.name}</h4>
                              {(v.picName || v.phone) && (
                                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>
                                    {v.picName || 'PIC'} {v.phone ? `• ${v.phone}` : ''}
                                  </span>
                                </p>
                              )}
                            </div>

                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Nilai Kontrak</span>
                                <span className="font-mono font-bold text-slate-900">
                                  Rp {v.contractValue.toLocaleString('id-ID')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Sudah Dibayar</span>
                                <span className="font-mono font-bold text-emerald-700">
                                  Rp {v.paidAmount.toLocaleString('id-ID')}
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#8C3A50] rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>

                            {v.notes && <p className="text-xs text-slate-500 line-clamp-2">{v.notes}</p>}
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditVendor(v)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteVendor(v.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ================= SECTION 4: ANGGARAN & PEMBAYARAN ================= */}
          {section === 'budget' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pagu Anggaran</span>
                    <button
                      type="button"
                      onClick={() => {
                        setBudgetInput(String(plan.totalBudget || 0));
                        setIsBudgetModalOpen(true);
                      }}
                      className="text-xs font-semibold text-[#8C3A50] hover:underline cursor-pointer"
                    >
                      Ubah
                    </button>
                  </div>
                  <div className="text-xl font-black font-mono text-slate-900">
                    Rp {plan.totalBudget.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Komitmen Vendor</span>
                  <div className="text-xl font-black font-mono text-[#8C3A50]">
                    Rp {totalCommitted.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[11px] text-slate-500">{budgetUsagePct}% dari total pagu</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Sudah Dibayarkan</span>
                  <div className="text-xl font-black font-mono text-emerald-700">
                    Rp {totalPaid.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Sisa Kewajiban Bayar</span>
                  <div className="text-xl font-black font-mono text-amber-700">
                    Rp {totalRemaining.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Rincian Anggaran per Vendor</h3>
                  <button
                    type="button"
                    onClick={openCreateVendor}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Item</span>
                  </button>
                </div>

                {plan.vendors.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Tambahkan vendor di menu <strong>Vendor &amp; Kontrak</strong> atau klik tombol <strong>Tambah Item</strong> untuk melacak anggaran secara otomatis.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Vendor</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Kategori</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Nilai Kontrak</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Terbayar</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Sisa</th>
                          <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {plan.vendors.map((v) => {
                          const sisa = Math.max(0, (v.contractValue || 0) - (v.paidAmount || 0));
                          return (
                            <tr key={v.id} className="hover:bg-slate-50/60">
                              <td className="px-5 py-3.5 font-semibold text-slate-900">{v.name}</td>
                              <td className="px-5 py-3.5 text-slate-600">{v.category}</td>
                              <td className="px-5 py-3.5 text-right font-mono font-semibold text-slate-900">
                                Rp {v.contractValue.toLocaleString('id-ID')}
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono font-semibold text-emerald-700">
                                Rp {v.paidAmount.toLocaleString('id-ID')}
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono font-semibold text-amber-700">
                                Rp {sisa.toLocaleString('id-ID')}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                    v.status === 'Lunas'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : v.status === 'DP Dibayar'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-rose-50 text-[#8C3A50] border-rose-200'
                                  }`}
                                >
                                  {v.status}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => openEditVendor(v)}
                                  className="text-xs font-semibold text-[#8C3A50] hover:underline cursor-pointer"
                                >
                                  Update Bayar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= SECTION 5: RUNDOWN HARI-H ================= */}
          {section === 'rundown' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
                  <button
                    type="button"
                    onClick={() => setRundownSegmentFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
                      rundownSegmentFilter === 'ALL'
                        ? 'bg-[#8C3A50] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua Sesi ({plan.rundown.length})
                  </button>
                  {RUNDOWN_SEGMENTS.map((seg) => (
                    <button
                      key={seg}
                      type="button"
                      onClick={() => setRundownSegmentFilter(seg)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
                        rundownSegmentFilter === seg
                          ? 'bg-[#8C3A50] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {seg}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {sortedRundown.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCopyRundownText}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      {copiedRundown ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedRundown ? 'Tersalin' : 'Salin ke WA'}</span>
                    </button>
                  )}
                  {plan.rundown.length === 0 && (
                    <button
                      type="button"
                      onClick={handleLoadRundownTemplate}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-[#8C3A50] hover:bg-rose-100 text-xs font-semibold cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Template Rundown</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openCreateRundown}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Sesi</span>
                  </button>
                </div>
              </div>

              {sortedRundown.filter((r) => rundownSegmentFilter === 'ALL' || r.segment === rundownSegmentFilter)
                .length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center space-y-3">
                  <CalendarClock className="w-10 h-10 text-slate-300 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-900">Rundown Masih Kosong</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Susun timeline acara menit per menit untuk dibagikan kepada panitia, MC, dan vendor.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedRundown
                    .filter((r) => rundownSegmentFilter === 'ALL' || r.segment === rundownSegmentFilter)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-center shrink-0 min-w-[105px]">
                            <div className="font-mono text-xs font-extrabold text-[#8C3A50]">
                              {item.startTime} - {item.endTime}
                            </div>
                            <div className="text-[10px] font-bold text-[#722B3E] mt-0.5">{item.segment}</div>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <h4 className="text-sm font-bold text-slate-900">{item.activity}</h4>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>
                                PIC: <strong className="text-slate-700">{item.pic}</strong>
                              </span>
                              {item.location && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-[#8C3A50]" />
                                  {item.location}
                                </span>
                              )}
                            </div>
                            {item.notes && <p className="text-xs text-slate-500">{item.notes}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditRundown(item)}
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                            title="Edit sesi"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRundown(item.id)}
                            className="p-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                            title="Hapus sesi"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ================= SECTION 6: DENAH MEJA & TAMU ================= */}
          {section === 'seating' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-[#8C3A50]" />
                    <span>Sinkronisasi Meja &amp; Kursi Tamu</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Data meja dan penempatan tamu terhubung langsung dengan pengaturan meja pada acara <strong>{selectedEvent?.title}</strong>.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/auth/login/events/${selectedEventId}/tables`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold shadow-xs"
                  >
                    <Armchair className="w-4 h-4" />
                    <span>Kelola Meja di Events</span>
                  </Link>
                </div>
              </div>

              {loadingGuests ? (
                <div className="py-10 text-center text-xs text-slate-500">Memuat data meja &amp; tamu...</div>
              ) : (selectedEvent?.seatingTables || []).length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center space-y-3">
                  <LayoutGrid className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-900">Belum Ada Denah Meja untuk Acara Ini</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Klik tombol <strong>Kelola Meja di Events</strong> untuk membuat meja VVIP, VIP, Keluarga, atau Reguler dan menempatkan tamu ke setiap kursi.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(selectedEvent?.seatingTables || []).map((tbl) => {
                    const assignedGuests = eventGuests.filter((g) => g.tableNumber === tbl.name);
                    const occupiedSeats = assignedGuests.reduce((acc, g) => acc + (Number(g.pax) || 1), 0);
                    const pct = tbl.capacity > 0 ? Math.min(100, Math.round((occupiedSeats / tbl.capacity) * 100)) : 0;
                    const isFull = occupiedSeats >= tbl.capacity;

                    return (
                      <div
                        key={tbl.id}
                        className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{tbl.name}</h4>
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-[#8C3A50] border border-rose-200">
                            {tbl.zone}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between text-slate-600">
                            <span>Kapasitas Terisi</span>
                            <span className={`font-bold ${isFull ? 'text-rose-600' : 'text-slate-900'}`}>
                              {occupiedSeats} / {tbl.capacity} Kursi
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isFull ? 'bg-rose-600' : 'bg-[#8C3A50]'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {assignedGuests.length > 0 ? (
                          <div className="pt-2 border-t border-slate-100 space-y-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400">
                              Tamu Ditempatkan ({assignedGuests.length})
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {assignedGuests.slice(0, 6).map((g) => (
                                <span
                                  key={g.id}
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium"
                                >
                                  {g.name} ({g.pax || 1})
                                </span>
                              ))}
                              {assignedGuests.length > 6 && (
                                <span className="text-[11px] px-2 py-0.5 text-slate-500">
                                  +{assignedGuests.length - 6} lainnya
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic pt-2 border-t border-slate-100">
                            Belum ada tamu ditempatkan di meja ini.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ================= MODALS ================= */}
      {/* 1. Checklist Add Modal */}
      <Modal
        isOpen={isChecklistModalOpen}
        onClose={() => setIsChecklistModalOpen(false)}
        title="Tambah Tugas Checklist"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddChecklistTask} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Tugas <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Contoh: Fitting akhir busana pengantin"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tahap Persiapan</label>
              <select
                value={newTaskPhase}
                onChange={(e) => setNewTaskPhase(e.target.value as PlannerChecklistPhase)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              >
                {CHECKLIST_PHASES.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Tanggal</label>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Penanggung Jawab (PIC)</label>
            <input
              type="text"
              value={newTaskPic}
              onChange={(e) => setNewTaskPic(e.target.value)}
              placeholder="Contoh: Leader WO / Mempelai"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsChecklistModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold cursor-pointer"
            >
              Simpan Tugas
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Vendor Modal */}
      <Modal
        isOpen={isVendorModalOpen}
        onClose={() => setIsVendorModalOpen(false)}
        title={editingVendorId ? 'Edit Vendor & Pembayaran' : 'Tambah Vendor Baru'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveVendor} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Vendor <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="Contoh: Royal Catering"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori</label>
              <select
                value={vendorCategory}
                onChange={(e) => setVendorCategory(e.target.value as PlannerVendorCategory)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama PIC Vendor</label>
              <input
                type="text"
                value={vendorPicName}
                onChange={(e) => setVendorPicName(e.target.value)}
                placeholder="Nama kontak vendor"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">No. WhatsApp / Telepon</label>
              <input
                type="text"
                value={vendorPhone}
                onChange={(e) => setVendorPhone(e.target.value)}
                placeholder="0812..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nilai Kontrak (Rp)</label>
              <input
                type="number"
                min="0"
                value={vendorContractValue}
                onChange={(e) => setVendorContractValue(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sudah Dibayar (Rp)</label>
              <input
                type="number"
                min="0"
                value={vendorPaidAmount}
                onChange={(e) => setVendorPaidAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={vendorStatus}
                onChange={(e) => setVendorStatus(e.target.value as PlannerVendorStatus)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              >
                {VENDOR_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Kontrak</label>
            <textarea
              rows={2}
              value={vendorNotes}
              onChange={(e) => setVendorNotes(e.target.value)}
              placeholder="Detail paket, jadwal pelunasan, atau permintaan khusus..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsVendorModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold cursor-pointer"
            >
              Simpan Vendor
            </button>
          </div>
        </form>
      </Modal>

      {/* 3. Pagu Budget Modal */}
      <Modal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        title="Atur Pagu Anggaran Acara"
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleSaveTotalBudget} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Maksimal Anggaran (Rp)
            </label>
            <input
              type="number"
              min="0"
              required
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono font-bold focus:border-[#8C3A50] focus:ring-[#8C3A50]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsBudgetModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold cursor-pointer"
            >
              Simpan Pagu
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Rundown Modal */}
      <Modal
        isOpen={isRundownModalOpen}
        onClose={() => setIsRundownModalOpen(false)}
        title={editingRundownId ? 'Edit Sesi Rundown' : 'Tambah Agenda Rundown'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveRundown} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Mulai</label>
              <input
                type="time"
                required
                value={rdStartTime}
                onChange={(e) => setRdStartTime(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Selesai</label>
              <input
                type="time"
                required
                value={rdEndTime}
                onChange={(e) => setRdEndTime(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Segmen Acara</label>
            <select
              value={rdSegment}
              onChange={(e) => setRdSegment(e.target.value as PlannerRundownSegment)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:border-[#8C3A50] focus:ring-[#8C3A50]"
            >
              {RUNDOWN_SEGMENTS.map((seg) => (
                <option key={seg} value={seg}>
                  {seg}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Kegiatan <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={rdActivity}
              onChange={(e) => setRdActivity(e.target.value)}
              placeholder="Contoh: Kirab Pengantin Memasuki Pelaminan"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">PIC / Petugas</label>
              <input
                type="text"
                value={rdPic}
                onChange={(e) => setRdPic(e.target.value)}
                placeholder="MC & Leader WO"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Area / Lokasi</label>
              <input
                type="text"
                value={rdLocation}
                onChange={(e) => setRdLocation(e.target.value)}
                placeholder="Panggung Utama"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Teknis</label>
            <textarea
              rows={2}
              value={rdNotes}
              onChange={(e) => setRdNotes(e.target.value)}
              placeholder="Instruksi audio, lighting, atau pendampingan tamu VIP..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-[#8C3A50] focus:ring-[#8C3A50]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsRundownModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#8C3A50] hover:bg-[#722B3E] text-white text-xs font-semibold cursor-pointer"
            >
              Simpan Agenda
            </button>
          </div>
        </form>
      </Modal>

      {enrollModalNode}
    </div>
  );
}
