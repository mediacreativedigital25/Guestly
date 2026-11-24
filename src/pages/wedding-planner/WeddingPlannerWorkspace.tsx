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
  Search,
  X,
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

interface SeatingRowItem {
  table: NonNullable<EventRecord['seatingTables']>[number];
  assignedGuests: Guest[];
  occupiedSeats: number;
  pct: number;
  isFull: boolean;
  isEmpty: boolean;
}

function paginateList<T>(items: T[], currentPage: number, itemsPerPage: number): {
  totalPages: number;
  safeCurrentPage: number;
  startIndex: number;
  endIndex: number;
  paginatedItems: T[];
} {
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, items.length);
  return {
    totalPages,
    safeCurrentPage,
    startIndex,
    endIndex,
    paginatedItems: items.slice(startIndex, endIndex),
  };
}

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

  // Filters, Search, Pagination & Modals
  const [searchTerm, setSearchTerm] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL');
  const [checklistStatusFilter, setChecklistStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<string>('ALL');
  const [vendorStatusFilter, setVendorStatusFilter] = useState<string>('ALL');
  const [rundownSegmentFilter, setRundownSegmentFilter] = useState<string>('ALL');
  const [seatingZoneFilter, setSeatingZoneFilter] = useState<string>('ALL');
  const [seatingStatusFilter, setSeatingStatusFilter] = useState<'all' | 'available' | 'full' | 'empty'>('all');
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
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

  // Reset search & pagination when switching menu or active project
  useEffect(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, [section, selectedEventId]);

  // Reset pagination when any filter or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    phaseFilter,
    checklistStatusFilter,
    vendorCategoryFilter,
    vendorStatusFilter,
    rundownSegmentFilter,
    seatingZoneFilter,
    seatingStatusFilter,
    itemsPerPage,
  ]);

  // Filtered datasets across all 6 menus
  const filteredChecklist = useMemo<PlannerChecklistItem[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    return plan.checklist.filter((task) => {
      if (phaseFilter !== 'ALL' && task.phase !== phaseFilter) return false;
      if (checklistStatusFilter === 'pending' && task.completed) return false;
      if (checklistStatusFilter === 'completed' && !task.completed) return false;
      if (!q) return true;
      const haystack = [task.title, task.pic, task.phase, task.dueDate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [plan.checklist, phaseFilter, checklistStatusFilter, searchTerm]);

  const filteredVendors = useMemo<PlannerVendorItem[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    return plan.vendors.filter((v) => {
      if (vendorCategoryFilter !== 'ALL' && v.category !== vendorCategoryFilter) return false;
      if (vendorStatusFilter !== 'ALL' && v.status !== vendorStatusFilter) return false;
      if (!q) return true;
      const haystack = [v.name, v.category, v.picName, v.phone, v.status, v.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [plan.vendors, vendorCategoryFilter, vendorStatusFilter, searchTerm]);

  const filteredBudgetTotals = useMemo(() => {
    const committed = filteredVendors.reduce((acc, v) => acc + (Number(v.contractValue) || 0), 0);
    const paid = filteredVendors.reduce((acc, v) => acc + (Number(v.paidAmount) || 0), 0);
    return {
      committed,
      paid,
      remaining: Math.max(0, committed - paid),
    };
  }, [filteredVendors]);

  const filteredRundown = useMemo<PlannerRundownItem[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    return sortedRundown.filter((item) => {
      if (rundownSegmentFilter !== 'ALL' && item.segment !== rundownSegmentFilter) return false;
      if (!q) return true;
      const haystack = [
        item.startTime,
        item.endTime,
        item.segment,
        item.activity,
        item.pic,
        item.location,
        item.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sortedRundown, rundownSegmentFilter, searchTerm]);

  const seatingRows = useMemo<SeatingRowItem[]>(() => {
    const tables = selectedEvent?.seatingTables || [];
    return tables.map((tbl) => {
      const assignedGuests = eventGuests.filter((g) => g.tableNumber === tbl.name);
      const occupiedSeats = assignedGuests.reduce((acc, g) => acc + (Number(g.pax) || 1), 0);
      const pct = tbl.capacity > 0 ? Math.min(100, Math.round((occupiedSeats / tbl.capacity) * 100)) : 0;
      const isFull = tbl.capacity > 0 && occupiedSeats >= tbl.capacity;
      const isEmpty = occupiedSeats === 0;
      return {
        table: tbl,
        assignedGuests,
        occupiedSeats,
        pct,
        isFull,
        isEmpty,
      };
    });
  }, [selectedEvent?.seatingTables, eventGuests]);

  const seatingSummary = useMemo(() => {
    const totalTables = seatingRows.length;
    const totalCapacity = seatingRows.reduce((acc, r) => acc + (Number(r.table.capacity) || 0), 0);
    const totalOccupied = seatingRows.reduce((acc, r) => acc + r.occupiedSeats, 0);
    const tableNames = new Set(seatingRows.map((r) => r.table.name));
    const unassignedGuestsCount = eventGuests.filter(
      (g) => !g.tableNumber || !tableNames.has(g.tableNumber)
    ).length;
    return { totalTables, totalCapacity, totalOccupied, unassignedGuestsCount };
  }, [seatingRows, eventGuests]);

  const filteredSeatingRows = useMemo<SeatingRowItem[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    return seatingRows.filter((row) => {
      if (seatingZoneFilter !== 'ALL' && row.table.zone !== seatingZoneFilter) return false;
      if (seatingStatusFilter === 'full' && !row.isFull) return false;
      if (seatingStatusFilter === 'empty' && !row.isEmpty) return false;
      if (seatingStatusFilter === 'available' && row.isFull) return false;
      if (!q) return true;
      const guestNames = row.assignedGuests.map((g) => g.name).join(' ');
      const haystack = [row.table.name, row.table.zone, row.table.locationNote, guestNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [seatingRows, seatingZoneFilter, seatingStatusFilter, searchTerm]);

  const filteredOverviewChecklist = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const pending = plan.checklist.filter((t) => !t.completed);
    if (!q) return pending.slice(0, 6);
    return pending
      .filter((t) =>
        [t.title, t.pic, t.phase, t.dueDate].filter(Boolean).join(' ').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [plan.checklist, searchTerm]);

  const filteredOverviewRundown = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sortedRundown.slice(0, 6);
    return sortedRundown
      .filter((r) =>
        [r.activity, r.pic, r.segment, r.location, r.startTime, r.endTime]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 6);
  }, [sortedRundown, searchTerm]);

  // Checklist actions
  const openCreateChecklistTask = () => {
    setEditingTaskId(null);
    setNewTaskTitle('');
    setNewTaskPhase('H-1 Bulan');
    setNewTaskPic('');
    setNewTaskDueDate('');
    setIsChecklistModalOpen(true);
  };

  const openEditChecklistTask = (task: PlannerChecklistItem) => {
    setEditingTaskId(task.id);
    setNewTaskTitle(task.title);
    setNewTaskPhase(task.phase);
    setNewTaskPic(task.pic || '');
    setNewTaskDueDate(task.dueDate || '');
    setIsChecklistModalOpen(true);
  };

  const handleToggleTask = (id: string) => {
    const nextChecklist = plan.checklist.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    persistPlan({ ...plan, checklist: nextChecklist });
  };

  const handleAddChecklistTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    if (editingTaskId) {
      const nextChecklist = plan.checklist.map((item) =>
        item.id === editingTaskId
          ? {
              ...item,
              title: newTaskTitle.trim(),
              phase: newTaskPhase,
              pic: newTaskPic.trim() || 'Tim WO',
              dueDate: newTaskDueDate || undefined,
            }
          : item
      );
      await persistPlan({ ...plan, checklist: nextChecklist }, 'Tugas checklist diperbarui.');
    } else {
      const newItem: PlannerChecklistItem = {
        id: makeId(),
        title: newTaskTitle.trim(),
        phase: newTaskPhase,
        pic: newTaskPic.trim() || 'Tim WO',
        dueDate: newTaskDueDate || undefined,
        completed: false,
      };
      await persistPlan({ ...plan, checklist: [newItem, ...plan.checklist] }, 'Tugas checklist ditambahkan.');
    }
    setEditingTaskId(null);
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs py-16 flex flex-col items-center justify-center text-gray-500 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
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
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-gray-100 border border-gray-200">
          <button
            type="button"
            onClick={() => setEnrollMode('existing')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              enrollMode === 'existing'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pilih Client &amp; Acara Ada
          </button>
          <button
            type="button"
            onClick={() => setEnrollMode('new')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              enrollMode === 'new'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Buat Client &amp; Acara Baru
          </button>
        </div>

        {enrollMode === 'existing' ? (
          <div className="space-y-3.5">
            {unenrolledEvents.length === 0 ? (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Semua client &amp; acara yang ada sudah aktif di Wedding Planner.</p>
                <p>Gunakan tab <strong>Buat Client &amp; Acara Baru</strong> di atas untuk mendaftarkan client baru.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    1. Pilih Client <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={enrollClientId}
                    onChange={(e) => handleSelectEnrollClient(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    2. Pilih Acara <span className="text-red-600">*</span>
                  </label>
                  <select
                    required
                    value={enrollEventId}
                    onChange={(e) => setEnrollEventId(e.target.value)}
                    disabled={!enrollClientId || unenrolledEventsForSelectedClient.length === 0}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Bisnis / Partner Naungan
                </label>
                <select
                  value={newProjectPartnerId}
                  onChange={(e) => setNewProjectPartnerId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Nama Client / Mempelai <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={newClientNameInput}
                onChange={(e) => setNewClientNameInput(e.target.value)}
                placeholder="Contoh: Raka & Nadia"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">No. WhatsApp (Opsional)</label>
                <input
                  type="text"
                  value={newClientPhoneInput}
                  onChange={(e) => setNewClientPhoneInput(e.target.value)}
                  placeholder="0812..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email (Opsional)</label>
                <input
                  type="email"
                  value={newClientEmailInput}
                  onChange={(e) => setNewClientEmailInput(e.target.value)}
                  placeholder="client@email.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Judul Acara Pernikahan <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={newEventTitleInput}
                onChange={(e) => setNewEventTitleInput(e.target.value)}
                placeholder="Contoh: The Wedding Of Raka & Nadia"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tanggal Acara <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={newEventDateInput}
                  onChange={(e) => setNewEventDateInput(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Lokasi / Venue</label>
                <input
                  type="text"
                  value={newEventLocationInput}
                  onChange={(e) => setNewEventLocationInput(e.target.value)}
                  placeholder="Gedung / Hotel"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Shared Initial Settings */}
        <div className="pt-2 border-t border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Pagu Anggaran Awal (Rp)</label>
            <input
              type="number"
              min="0"
              value={enrollBudget}
              onChange={(e) => setEnrollBudget(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enrollLoadChecklist}
                onChange={(e) => setEnrollLoadChecklist(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Langsung muat 7 template Checklist persiapan pernikahan</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enrollLoadRundown}
                onChange={(e) => setEnrollLoadRundown(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Langsung muat 5 template Rundown Akad &amp; Resepsi</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setIsEnrollModalOpen(false)}
            className="h-9 px-3.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={enrolling || (enrollMode === 'existing' && !enrollEventId)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
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
      <div className="space-y-4">
        {isSelfClient ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="text-center space-y-2.5">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mx-auto">
                <HeartHandshake className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-indigo-600 flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>{userEventCredit > 0 ? 'Satu Langkah Lagi' : 'Terkunci Hingga Top-Up Paket'}</span>
              </p>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                {userEventCredit > 0
                  ? 'Kuota Aktif! Buat Acara Pertama untuk Membuka Wedding Planner'
                  : 'Wedding Planner Siap Membantu Persiapan Pernikahan Anda'}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
                {userEventCredit > 0
                  ? 'Anda sudah memiliki kuota acara aktif. Buat acara pernikahan Anda sekarang agar seluruh 6 modul Wedding Planner otomatis terbuka dan tersinkronisasi dengan daftar tamu.'
                  : 'Sebagai akun Client Mandiri, seluruh 6 modul Wedding Planner di bawah ini akan otomatis terbuka segera setelah Anda melakukan Top-Up Paket dan membuat acara pernikahan Anda.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                    className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-white text-indigo-600 border border-gray-200 flex items-center justify-center">
                        <FeatIcon className="w-4 h-4" />
                      </div>
                      <Lock className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 pt-1">{feat.title}</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">{feat.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
              {userEventCredit > 0 ? (
                <Link
                  to="/auth/login/events/add"
                  className="h-9 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium transition-colors shadow-xs w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Acara Pertama Anda</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  to="/auth/login/services/catalog"
                  className="h-9 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium transition-colors shadow-xs w-full sm:w-auto"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Top-Up Paket untuk Membuka</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
              <Link
                to="/auth/login/events"
                className="h-9 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-xs sm:text-sm font-medium transition-colors w-full sm:w-auto"
              >
                <span>Lihat Daftar Acara</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-10 text-center space-y-3.5 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mx-auto">
              <HeartHandshake className="w-6 h-6" />
            </div>
            {isClientRole ? (
              <>
                <h2 className="text-base sm:text-lg font-bold text-gray-900">Paket Acara Belum Mencakup Wedding Planner</h2>
                <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
                  Acara Anda saat ini hanya terdaftar untuk layanan Buku Tamu Digital di bawah naungan Vendor / Owner. Silakan hubungi tim <strong>Wedding Organizer / Vendor</strong> Anda apabila ingin mengaktifkan paket Wedding Planner.
                </p>
                <div className="pt-1">
                  <Link
                    to="/auth/login/events"
                    className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium transition-colors shadow-xs"
                  >
                    <span>Kembali ke Daftar Acara</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base sm:text-lg font-bold text-gray-900">Belum Ada Client di Layanan Wedding Planner</h2>
                <p className="text-xs sm:text-sm text-gray-500 max-w-lg mx-auto leading-relaxed">
                  Hanya client &amp; acara yang didaftarkan ke layanan Wedding Planner yang akan muncul pada seluruh menu (<strong>Overview</strong> hingga <strong>Denah Meja</strong>), terpisah dari client buku tamu reguler.
                </p>
                <div className="pt-1">
                  {section === 'overview' ? (
                    <button
                      type="button"
                      onClick={openEnrollModal}
                      className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium transition-colors shadow-xs cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Tambah Client Wedding Planner</span>
                    </button>
                  ) : (
                    <Link
                      to="/auth/login/wedding-planner"
                      className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium transition-colors shadow-xs"
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
      </div>
    );
  }

  const renderPaginationFooter = (
    filteredCount: number,
    totalCount: number,
    itemLabel: string,
    hasActiveFilter: boolean,
    onReset: () => void,
    startIndex: number,
    endIndex: number,
    safeCurrentPage: number,
    totalPages: number
  ) => (
    <div className="px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 sm:px-5 gap-3 bg-gray-50/50">
      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-600">
        <span>
          Menampilkan{' '}
          <span className="font-semibold text-gray-900 tabular-nums">
            {filteredCount === 0 ? 0 : startIndex + 1}
          </span>{' '}
          – <span className="font-semibold text-gray-900 tabular-nums">{endIndex}</span> dari{' '}
          <span className="font-semibold text-indigo-600 tabular-nums">{filteredCount}</span> {itemLabel}
        </span>
        {hasActiveFilter && (
          <>
            <span className="text-xs text-gray-400 tabular-nums">({totalCount} total)</span>
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline cursor-pointer"
            >
              Reset
            </button>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrentPage(1)}
            disabled={safeCurrentPage === 1}
            className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Halaman Pertama"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage === 1}
            className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Sebelumnya
          </button>
          <span className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg tabular-nums">
            Hal <span className="text-indigo-600 font-bold">{safeCurrentPage}</span> / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage === totalPages}
            className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Selanjutnya
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage(totalPages)}
            disabled={safeCurrentPage === totalPages}
            className="px-2.5 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Halaman Terakhir"
          >
            »
          </button>
        </div>
      )}
    </div>
  );

  const renderLimitSelect = () => (
    <div className="flex items-center gap-1.5 h-8.5 px-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition shrink-0">
      <span className="text-xs text-gray-500 whitespace-nowrap">Tampilkan</span>
      <select
        value={itemsPerPage}
        onChange={(e) => setItemsPerPage(Number(e.target.value))}
        className="bg-transparent text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer pr-0.5"
        title="Jumlah baris per halaman"
      >
        <option value={10}>10</option>
        <option value={25}>25</option>
        <option value={50}>50</option>
      </select>
    </div>
  );

  // Active filter flags & resets per section
  const hasChecklistFilter =
    searchTerm.trim() !== '' || phaseFilter !== 'ALL' || checklistStatusFilter !== 'all';
  const resetChecklistFilters = () => {
    setSearchTerm('');
    setPhaseFilter('ALL');
    setChecklistStatusFilter('all');
    setCurrentPage(1);
  };

  const hasVendorFilter =
    searchTerm.trim() !== '' || vendorCategoryFilter !== 'ALL' || vendorStatusFilter !== 'ALL';
  const resetVendorFilters = () => {
    setSearchTerm('');
    setVendorCategoryFilter('ALL');
    setVendorStatusFilter('ALL');
    setCurrentPage(1);
  };

  const hasRundownFilter = searchTerm.trim() !== '' || rundownSegmentFilter !== 'ALL';
  const resetRundownFilters = () => {
    setSearchTerm('');
    setRundownSegmentFilter('ALL');
    setCurrentPage(1);
  };

  const hasSeatingFilter =
    searchTerm.trim() !== '' || seatingZoneFilter !== 'ALL' || seatingStatusFilter !== 'all';
  const resetSeatingFilters = () => {
    setSearchTerm('');
    setSeatingZoneFilter('ALL');
    setSeatingStatusFilter('all');
    setCurrentPage(1);
  };

  const checklistPagination = paginateList<PlannerChecklistItem>(filteredChecklist, currentPage, itemsPerPage);
  const vendorsPagination = paginateList<PlannerVendorItem>(filteredVendors, currentPage, itemsPerPage);
  const rundownPagination = paginateList<PlannerRundownItem>(filteredRundown, currentPage, itemsPerPage);
  const seatingPagination = paginateList<SeatingRowItem>(filteredSeatingRows, currentPage, itemsPerPage);

  const searchPlaceholder =
    section === 'overview'
      ? 'Cari tugas prioritas atau agenda rundown...'
      : section === 'checklist'
      ? 'Cari nama tugas, penanggung jawab (PIC), atau tahap...'
      : section === 'vendors'
      ? 'Cari nama vendor, PIC, nomor WA, kategori, atau catatan...'
      : section === 'budget'
      ? 'Cari nama vendor, kategori, atau status pembayaran...'
      : section === 'rundown'
      ? 'Cari kegiatan, jam, PIC, lokasi, atau catatan rundown...'
      : 'Cari nama meja, zona, atau nama tamu...';

  const getVendorStatusColor = (status: PlannerVendorStatus) => {
    if (status === 'Lunas') return 'text-emerald-700';
    if (status === 'DP Dibayar') return 'text-amber-700';
    if (status === 'Booking') return 'text-indigo-700';
    return 'text-gray-600';
  };

  const getCountdownMeta = () => {
    if (daysUntilWedding === null) return null;
    if (daysUntilWedding < 0) {
      return {
        label: `Selesai ${Math.abs(daysUntilWedding)} hari lalu`,
        tone: 'text-gray-500',
      };
    }
    if (daysUntilWedding === 0) {
      return {
        label: 'Hari-H Berlangsung',
        tone: 'text-rose-600 font-semibold',
      };
    }
    if (daysUntilWedding <= 7) {
      return {
        label: `H-${daysUntilWedding} Menuju Hari-H`,
        tone: 'text-amber-700 font-semibold',
      };
    }
    return {
      label: `H-${daysUntilWedding} Menuju Hari-H`,
      tone: 'text-emerald-700 font-semibold',
    };
  };

  const countdownMeta = getCountdownMeta();

  return (
    <div className="space-y-4">
      {/* Box 1: Unified Project Context & Filter Box (Create Event Pattern) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-2.5 sm:p-3">
        {/* Row 1: Active Project Switcher & Compact Metadata */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap shrink-0">
              {isClientRole ? 'Acara Aktif' : 'Proyek Planner'}
            </span>
            {isClientRole && events.length === 1 ? (
              <div className="inline-flex items-center gap-2 h-8.5 px-3 rounded-lg border border-gray-200 bg-gray-50/70 text-xs sm:text-sm font-semibold text-gray-900 truncate">
                <HeartHandshake className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">{getEventOptionLabel(events[0])}</span>
              </div>
            ) : (
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full sm:max-w-md h-8.5 pl-2.5 pr-7 text-xs sm:text-sm font-semibold bg-gray-50/70 border border-gray-200 rounded-lg text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
                title="Pilih proyek Wedding Planner aktif"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {getEventOptionLabel(ev)}
                  </option>
                ))}
              </select>
            )}

            {/* Clean unboxed metadata strip */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 min-w-0">
              {countdownMeta && (
                <span className={`inline-flex items-center gap-1 whitespace-nowrap tabular-nums ${countdownMeta.tone}`}>
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>{countdownMeta.label}</span>
                </span>
              )}
              {selectedEvent?.location && (
                <>
                  {countdownMeta && <span aria-hidden="true" className="text-gray-300">·</span>}
                  <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{selectedEvent.location}</span>
                  </span>
                </>
              )}
              {appUser?.role === 'superadmin' &&
                selectedEvent?.partnerId &&
                partnerNameMap[selectedEvent.partnerId] && (
                  <>
                    <span aria-hidden="true" className="text-gray-300">·</span>
                    <span className="inline-flex items-center gap-1 truncate max-w-[180px] text-gray-600 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{partnerNameMap[selectedEvent.partnerId]}</span>
                    </span>
                  </>
                )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {saving && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 whitespace-nowrap">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </span>
            )}
            {selectedEvent?.id && section !== 'overview' && (
              <Link
                to={`/auth/login/events/${selectedEvent.id}`}
                className="inline-flex items-center gap-1.5 h-8.5 px-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors whitespace-nowrap"
              >
                <span>Detail Acara</span>
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              </Link>
            )}
          </div>
        </div>

        {/* Row 2: Search, Contextual Filters & Tampilkan 10/25/50 */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-8.5 pl-8.5 pr-7 text-xs sm:text-sm bg-gray-50/70 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Contextual Dropdowns per Menu */}
          {section === 'checklist' && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[135px]"
                title="Filter tahap persiapan"
              >
                <option value="ALL">Semua Tahap ({plan.checklist.length})</option>
                {CHECKLIST_PHASES.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph} ({plan.checklist.filter((t) => t.phase === ph).length})
                  </option>
                ))}
              </select>

              <select
                value={checklistStatusFilter}
                onChange={(e) =>
                  setChecklistStatusFilter(e.target.value as 'all' | 'pending' | 'completed')
                }
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[130px]"
                title="Filter status tugas"
              >
                <option value="all">Semua Status</option>
                <option value="pending">Belum Selesai</option>
                <option value="completed">Selesai</option>
              </select>

              {renderLimitSelect()}
            </div>
          )}

          {(section === 'vendors' || section === 'budget') && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={vendorCategoryFilter}
                onChange={(e) => setVendorCategoryFilter(e.target.value)}
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[140px]"
                title="Filter kategori vendor"
              >
                <option value="ALL">Semua Kategori ({plan.vendors.length})</option>
                {VENDOR_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({plan.vendors.filter((v) => v.category === cat).length})
                  </option>
                ))}
              </select>

              <select
                value={vendorStatusFilter}
                onChange={(e) => setVendorStatusFilter(e.target.value)}
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[130px]"
                title="Filter status pembayaran"
              >
                <option value="ALL">Semua Status</option>
                {VENDOR_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              {renderLimitSelect()}
            </div>
          )}

          {section === 'rundown' && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={rundownSegmentFilter}
                onChange={(e) => setRundownSegmentFilter(e.target.value)}
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[150px]"
                title="Filter segmen rundown"
              >
                <option value="ALL">Semua Segmen ({plan.rundown.length})</option>
                {RUNDOWN_SEGMENTS.map((seg) => (
                  <option key={seg} value={seg}>
                    {seg} ({plan.rundown.filter((r) => r.segment === seg).length})
                  </option>
                ))}
              </select>

              {renderLimitSelect()}
            </div>
          )}

          {section === 'seating' && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={seatingZoneFilter}
                onChange={(e) => setSeatingZoneFilter(e.target.value)}
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[130px]"
                title="Filter zona meja"
              >
                <option value="ALL">Semua Zona ({seatingRows.length})</option>
                <option value="VVIP">VVIP</option>
                <option value="VIP">VIP</option>
                <option value="Keluarga">Keluarga</option>
                <option value="Reguler">Reguler</option>
              </select>

              <select
                value={seatingStatusFilter}
                onChange={(e) =>
                  setSeatingStatusFilter(e.target.value as 'all' | 'available' | 'full' | 'empty')
                }
                className="h-8.5 pl-2.5 pr-7 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer flex-1 sm:flex-none min-w-[135px]"
                title="Filter kapasitas meja"
              >
                <option value="all">Semua Kapasitas</option>
                <option value="available">Tersedia</option>
                <option value="full">Penuh</option>
                <option value="empty">Kosong</option>
              </select>

              {renderLimitSelect()}
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Bar (Between Filter Box & Content/Table Box, Left Aligned) */}
      <div className="flex flex-wrap items-center justify-start gap-2">
        {section === 'overview' && (
          <>
            {isManagerRole && (
              <button
                type="button"
                onClick={openEnrollModal}
                className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Tambah Client</span>
              </button>
            )}
            {selectedEvent?.id && (
              <Link
                to={`/auth/login/events/${selectedEvent.id}`}
                className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 shadow-2xs transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4 text-gray-500" />
                <span>Detail Acara</span>
              </Link>
            )}
            {isManagerRole && (
              <button
                type="button"
                onClick={handleArchiveFromPlanner}
                title="Keluarkan dari daftar Wedding Planner (data Client & Acara tetap aman)"
                className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:border-red-200 hover:bg-red-50 hover:text-red-700 shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
              >
                <Archive className="w-4 h-4" />
                <span>Lepas dari Planner</span>
              </button>
            )}
          </>
        )}

        {section === 'checklist' && (
          <>
            <button
              type="button"
              onClick={openCreateChecklistTask}
              className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Tugas</span>
            </button>
            {plan.checklist.length === 0 && (
              <button
                type="button"
                onClick={handleLoadChecklistTemplate}
                className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Muat Template Standar</span>
              </button>
            )}
          </>
        )}

        {section === 'vendors' && (
          <button
            type="button"
            onClick={openCreateVendor}
            className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Vendor</span>
          </button>
        )}

        {section === 'budget' && (
          <>
            <button
              type="button"
              onClick={openCreateVendor}
              className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Item Vendor</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBudgetInput(String(plan.totalBudget || 0));
                setIsBudgetModalOpen(true);
              }}
              className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Wallet className="w-4 h-4 text-gray-500" />
              <span>Atur Pagu Anggaran</span>
            </button>
          </>
        )}

        {section === 'rundown' && (
          <>
            <button
              type="button"
              onClick={openCreateRundown}
              className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Sesi</span>
            </button>
            {sortedRundown.length > 0 && (
              <button
                type="button"
                onClick={handleCopyRundownText}
                className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedRundown ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-500" />
                )}
                <span>{copiedRundown ? 'Tersalin' : 'Salin ke WA'}</span>
              </button>
            )}
            {plan.rundown.length === 0 && (
              <button
                type="button"
                onClick={handleLoadRundownTemplate}
                className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Muat Template Rundown</span>
              </button>
            )}
          </>
        )}

        {section === 'seating' && (
          <Link
            to={`/auth/login/events/${selectedEventId}/tables`}
            className="h-9 px-3.5 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-xs transition-colors whitespace-nowrap"
          >
            <Armchair className="w-4 h-4" />
            <span>Kelola Meja di Events</span>
          </Link>
        )}
      </div>

      {loadingPlan ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs py-12 flex items-center justify-center text-gray-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
          <span className="text-sm">Memuat rencana pernikahan...</span>
        </div>
      ) : (
        <>
          {/* ================= SECTION 1: OVERVIEW ================= */}
          {section === 'overview' && (
            <div className="space-y-4">
              {/* Compact 4-Card KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Link
                  to="/auth/login/wedding-planner/checklist"
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs hover:border-indigo-300 transition-colors space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Checklist Tugas</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <ListChecks className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900 tabular-nums">
                      {completedTasksCount}{' '}
                      <span className="text-xs font-medium text-gray-400">/ {totalTasksCount}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all"
                        style={{ width: `${checklistProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
                      {checklistProgress}% persiapan selesai
                    </p>
                  </div>
                </Link>

                <Link
                  to="/auth/login/wedding-planner/vendors"
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs hover:border-indigo-300 transition-colors space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Vendor Terdaftar</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <Store className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900 tabular-nums">
                      {plan.vendors.length} Vendor
                    </div>
                    <p className="text-xs text-gray-500 mt-1 tabular-nums">
                      {plan.vendors.filter((v) => v.status === 'Lunas').length} Lunas ·{' '}
                      {plan.vendors.filter((v) => v.status === 'DP Dibayar').length} DP Dibayar
                    </p>
                  </div>
                </Link>

                <Link
                  to="/auth/login/wedding-planner/budget"
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs hover:border-indigo-300 transition-colors space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Realisasi Anggaran</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                      <Wallet className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-bold font-mono tabular-nums text-gray-900 truncate">
                      Rp {totalPaid.toLocaleString('id-ID')}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate tabular-nums">
                      Kontrak Rp {totalCommitted.toLocaleString('id-ID')} · {budgetUsagePct}% pagu
                    </p>
                  </div>
                </Link>

                <Link
                  to="/auth/login/wedding-planner/rundown"
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs hover:border-indigo-300 transition-colors space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Rundown &amp; Meja</span>
                    <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center">
                      <CalendarClock className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900 tabular-nums">
                      {plan.rundown.length} Sesi
                    </div>
                    <p className="text-xs text-gray-500 mt-1 tabular-nums">
                      {(selectedEvent?.seatingTables || []).length} Meja · {eventGuests.length} Tamu
                    </p>
                  </div>
                </Link>
              </div>

              {/* Two-Column Standardized Preview Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Preview 1: Checklist Prioritas */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60 flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-indigo-600" />
                      <span>Prioritas Checklist Belum Selesai</span>
                    </h3>
                    <Link
                      to="/auth/login/wedding-planner/checklist"
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                    >
                      Kelola Semua &rarr;
                    </Link>
                  </div>

                  {filteredOverviewChecklist.length === 0 ? (
                    <div className="p-8 text-center space-y-2.5 flex-1 flex flex-col items-center justify-center">
                      <p className="text-xs sm:text-sm font-medium text-gray-700">
                        {searchTerm.trim()
                          ? 'Tidak ada tugas yang cocok dengan pencarian'
                          : plan.checklist.length === 0
                          ? 'Belum ada daftar tugas persiapan.'
                          : 'Semua tugas checklist telah diselesaikan.'}
                      </p>
                      {plan.checklist.length === 0 && !searchTerm.trim() && (
                        <button
                          type="button"
                          onClick={handleLoadChecklistTemplate}
                          className="h-8.5 px-3.5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Muat Template Checklist</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10">
                              No
                            </th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Tugas &amp; PIC
                            </th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Tahap
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredOverviewChecklist.map((task, idx) => (
                            <tr
                              key={task.id}
                              onClick={() => handleToggleTask(task.id)}
                              className="hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                              <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-2.5">
                                  <Circle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="text-xs sm:text-sm font-medium text-gray-900">
                                      {task.title}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      PIC: {task.pic}
                                      {task.dueDate ? ` · ${task.dueDate}` : ''}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right text-xs font-medium text-indigo-700">
                                {task.phase}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Preview 2: Cuplikan Rundown */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60 flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-indigo-600" />
                      <span>Cuplikan Rundown Hari-H</span>
                    </h3>
                    <Link
                      to="/auth/login/wedding-planner/rundown"
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                    >
                      Buka Rundown &rarr;
                    </Link>
                  </div>

                  {filteredOverviewRundown.length === 0 ? (
                    <div className="p-8 text-center space-y-2.5 flex-1 flex flex-col items-center justify-center">
                      <p className="text-xs sm:text-sm font-medium text-gray-700">
                        {searchTerm.trim()
                          ? 'Tidak ada agenda rundown yang cocok dengan pencarian'
                          : 'Susunan acara Hari-H belum diisi.'}
                      </p>
                      {sortedRundown.length === 0 && !searchTerm.trim() && (
                        <button
                          type="button"
                          onClick={handleLoadRundownTemplate}
                          className="h-8.5 px-3.5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Muat Template Rundown</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10">
                              No
                            </th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Waktu
                            </th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Kegiatan &amp; PIC
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredOverviewRundown.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-mono text-xs font-semibold text-indigo-700 tabular-nums">
                                  {item.startTime} - {item.endTime}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">{item.segment}</div>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs sm:text-sm font-medium text-gray-900">
                                  {item.activity}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  PIC: {item.pic}
                                  {item.location ? ` · ${item.location}` : ''}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= SECTION 2: CHECKLIST & TUGAS ================= */}
          {section === 'checklist' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {filteredChecklist.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                    {hasChecklistFilter ? <Search className="w-5 h-5" /> : <ListChecks className="w-5 h-5" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {hasChecklistFilter ? 'Tidak ada tugas yang cocok' : 'Belum ada tugas checklist'}
                    </p>
                    <p className="text-xs text-gray-500 max-w-md mx-auto">
                      {hasChecklistFilter
                        ? 'Coba ubah kata kunci pencarian, tahap persiapan, atau status tugas.'
                        : 'Tambahkan tugas persiapan atau muat template checklist pernikahan standar.'}
                    </p>
                  </div>
                  {hasChecklistFilter ? (
                    <button
                      type="button"
                      onClick={resetChecklistFilters}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Reset Pencarian &amp; Filter
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLoadChecklistTemplate}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Muat Template Checklist Pernikahan</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                            No
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Tugas Persiapan
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Tahap
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            PIC
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Target Tgl
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {checklistPagination.paginatedItems.map((task, idx) => (
                          <tr
                            key={task.id}
                            className={`transition-colors ${
                              task.completed ? 'bg-gray-50/70' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                              {checklistPagination.startIndex + idx + 1}
                            </td>
                            <td className="px-4 py-3.5">
                              <button
                                type="button"
                                onClick={() => handleToggleTask(task.id)}
                                className="flex items-start gap-2.5 text-left cursor-pointer group"
                              >
                                {task.completed ? (
                                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                                ) : (
                                  <Circle className="w-4.5 h-4.5 text-gray-400 group-hover:text-indigo-600 shrink-0 mt-0.5" />
                                )}
                                <span
                                  className={`text-sm font-medium ${
                                    task.completed ? 'line-through text-gray-400' : 'text-gray-900'
                                  }`}
                                >
                                  {task.title}
                                </span>
                              </button>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm font-medium text-indigo-700">
                              {task.phase}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-700">
                              {task.pic || '-'}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                              {task.dueDate ? (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                  {task.dueDate}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold">
                              <span
                                className={
                                  task.completed ? 'text-emerald-700' : 'text-amber-700'
                                }
                              >
                                {task.completed ? 'Selesai' : 'Belum Selesai'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditChecklistTask(task)}
                                  className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                  title="Edit tugas"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Hapus tugas"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {renderPaginationFooter(
                    filteredChecklist.length,
                    plan.checklist.length,
                    'tugas',
                    hasChecklistFilter,
                    resetChecklistFilters,
                    checklistPagination.startIndex,
                    checklistPagination.endIndex,
                    checklistPagination.safeCurrentPage,
                    checklistPagination.totalPages
                  )}
                </>
              )}
            </div>
          )}

          {/* ================= SECTION 3: VENDOR & KONTRAK ================= */}
          {section === 'vendors' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {filteredVendors.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                    {hasVendorFilter ? <Search className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {hasVendorFilter ? 'Tidak ada vendor yang cocok' : 'Belum ada vendor terdaftar'}
                    </p>
                    <p className="text-xs text-gray-500 max-w-md mx-auto">
                      {hasVendorFilter
                        ? 'Coba ubah kata kunci pencarian, kategori vendor, atau status pembayaran.'
                        : 'Catat seluruh vendor (Venue, Catering, Dekorasi, MUA, Dokumentasi, MC) lengkap dengan nilai kontrak & status pembayarannya.'}
                    </p>
                  </div>
                  {hasVendorFilter && (
                    <button
                      type="button"
                      onClick={resetVendorFilters}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Reset Pencarian &amp; Filter
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                            No
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Vendor &amp; Kontak
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Kategori
                          </th>
                          <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Nilai Kontrak
                          </th>
                          <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Terbayar
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {vendorsPagination.paginatedItems.map((v, idx) => {
                          const pct =
                            v.contractValue > 0
                              ? Math.min(100, Math.round((v.paidAmount / v.contractValue) * 100))
                              : 0;
                          return (
                            <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                                {vendorsPagination.startIndex + idx + 1}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="text-sm font-medium text-gray-900">{v.name}</div>
                                {(v.picName || v.phone) && (
                                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                                    <span>
                                      {v.picName || 'PIC'}
                                      {v.phone ? ` · ${v.phone}` : ''}
                                    </span>
                                  </div>
                                )}
                                {v.notes && (
                                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 max-w-xs">
                                    {v.notes}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-700">
                                {v.category}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-sm font-medium text-gray-900 tabular-nums">
                                Rp {v.contractValue.toLocaleString('id-ID')}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-right">
                                <div className="font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                                  Rp {v.paidAmount.toLocaleString('id-ID')}
                                </div>
                                <div className="mt-1 flex items-center justify-end gap-2">
                                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-indigo-600 rounded-full"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] text-gray-500 tabular-nums">{pct}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold">
                                <span className={getVendorStatusColor(v.status)}>{v.status}</span>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex items-center justify-end space-x-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditVendor(v)}
                                    className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                    title="Edit vendor & pembayaran"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteVendor(v.id)}
                                    className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                    title="Hapus vendor"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {renderPaginationFooter(
                    filteredVendors.length,
                    plan.vendors.length,
                    'vendor',
                    hasVendorFilter,
                    resetVendorFilters,
                    vendorsPagination.startIndex,
                    vendorsPagination.endIndex,
                    vendorsPagination.safeCurrentPage,
                    vendorsPagination.totalPages
                  )}
                </>
              )}
            </div>
          )}

          {/* ================= SECTION 4: ANGGARAN & PEMBAYARAN ================= */}
          {section === 'budget' && (
            <div className="space-y-4">
              {/* Compact 4-Card Budget KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Pagu Anggaran</span>
                    <button
                      type="button"
                      onClick={() => {
                        setBudgetInput(String(plan.totalBudget || 0));
                        setIsBudgetModalOpen(true);
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                    >
                      Ubah
                    </button>
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-gray-900">
                    Rp {plan.totalBudget.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1.5">
                  <span className="text-xs font-medium text-gray-500 block">Total Komitmen Vendor</span>
                  <div className="text-lg font-bold font-mono tabular-nums text-indigo-700">
                    Rp {totalCommitted.toLocaleString('id-ID')}
                  </div>
                  <p className="text-xs text-gray-500 tabular-nums">{budgetUsagePct}% dari total pagu</p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1.5">
                  <span className="text-xs font-medium text-gray-500 block">Sudah Dibayarkan</span>
                  <div className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                    Rp {totalPaid.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1.5">
                  <span className="text-xs font-medium text-gray-500 block">Sisa Kewajiban Bayar</span>
                  <div className="text-lg font-bold font-mono tabular-nums text-amber-700">
                    Rp {totalRemaining.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              {/* Box 2: Budget Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {filteredVendors.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                      {hasVendorFilter ? <Search className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-800">
                        {hasVendorFilter ? 'Tidak ada item anggaran yang cocok' : 'Belum ada rincian anggaran'}
                      </p>
                      <p className="text-xs text-gray-500 max-w-md mx-auto">
                        {hasVendorFilter
                          ? 'Coba ubah kata kunci pencarian, kategori, atau status pembayaran.'
                          : 'Tambahkan item vendor untuk melacak komitmen biaya, DP, dan sisa pembayaran secara otomatis.'}
                      </p>
                    </div>
                    {hasVendorFilter && (
                      <button
                        type="button"
                        onClick={resetVendorFilters}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Reset Pencarian &amp; Filter
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                              No
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Vendor
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Kategori
                            </th>
                            <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Nilai Kontrak
                            </th>
                            <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Terbayar
                            </th>
                            <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Sisa
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Aksi
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {vendorsPagination.paginatedItems.map((v, idx) => {
                            const sisa = Math.max(0, (v.contractValue || 0) - (v.paidAmount || 0));
                            return (
                              <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                                  {vendorsPagination.startIndex + idx + 1}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {v.name}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-600">
                                  {v.category}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-sm font-medium text-gray-900 tabular-nums">
                                  Rp {v.contractValue.toLocaleString('id-ID')}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                                  Rp {v.paidAmount.toLocaleString('id-ID')}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-sm font-semibold text-amber-700 tabular-nums">
                                  Rp {sisa.toLocaleString('id-ID')}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold">
                                  <span className={getVendorStatusColor(v.status)}>{v.status}</span>
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium">
                                  <div className="flex items-center justify-end space-x-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openEditVendor(v)}
                                      className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                      title="Update pembayaran"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteVendor(v.id)}
                                      className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                      title="Hapus item"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50/80 border-t border-gray-200">
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-700">
                              Total ({filteredVendors.length} item)
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right font-mono text-xs sm:text-sm font-bold text-gray-900 tabular-nums">
                              Rp {filteredBudgetTotals.committed.toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right font-mono text-xs sm:text-sm font-bold text-emerald-700 tabular-nums">
                              Rp {filteredBudgetTotals.paid.toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right font-mono text-xs sm:text-sm font-bold text-amber-700 tabular-nums">
                              Rp {filteredBudgetTotals.remaining.toLocaleString('id-ID')}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {renderPaginationFooter(
                      filteredVendors.length,
                      plan.vendors.length,
                      'item anggaran',
                      hasVendorFilter,
                      resetVendorFilters,
                      vendorsPagination.startIndex,
                      vendorsPagination.endIndex,
                      vendorsPagination.safeCurrentPage,
                      vendorsPagination.totalPages
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ================= SECTION 5: RUNDOWN HARI-H ================= */}
          {section === 'rundown' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {filteredRundown.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                    {hasRundownFilter ? <Search className="w-5 h-5" /> : <CalendarClock className="w-5 h-5" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {hasRundownFilter ? 'Tidak ada sesi rundown yang cocok' : 'Rundown masih kosong'}
                    </p>
                    <p className="text-xs text-gray-500 max-w-md mx-auto">
                      {hasRundownFilter
                        ? 'Coba ubah kata kunci pencarian atau filter segmen acara.'
                        : 'Susun timeline acara menit per menit untuk dibagikan kepada panitia, MC, dan vendor.'}
                    </p>
                  </div>
                  {hasRundownFilter ? (
                    <button
                      type="button"
                      onClick={resetRundownFilters}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Reset Pencarian &amp; Filter
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLoadRundownTemplate}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Muat Template Rundown Akad &amp; Resepsi</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                            No
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Waktu
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Segmen
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Kegiatan &amp; Catatan
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            PIC
                          </th>
                          <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Lokasi
                          </th>
                          <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {rundownPagination.paginatedItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                              {rundownPagination.startIndex + idx + 1}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-sm font-semibold text-indigo-700 tabular-nums">
                              {item.startTime} - {item.endTime}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-700">
                              {item.segment}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="text-sm font-medium text-gray-900">{item.activity}</div>
                              {item.notes && (
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 max-w-md">
                                  {item.notes}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-700">
                              {item.pic || '-'}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-600">
                              {item.location ? (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                  <span>{item.location}</span>
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditRundown(item)}
                                  className="text-blue-600 hover:text-blue-900 flex items-center justify-center p-1.5 rounded-full hover:bg-blue-50 transition-colors cursor-pointer"
                                  title="Edit sesi rundown"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRundown(item.id)}
                                  className="text-red-600 hover:text-red-900 flex items-center justify-center p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Hapus sesi rundown"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {renderPaginationFooter(
                    filteredRundown.length,
                    plan.rundown.length,
                    'sesi rundown',
                    hasRundownFilter,
                    resetRundownFilters,
                    rundownPagination.startIndex,
                    rundownPagination.endIndex,
                    rundownPagination.safeCurrentPage,
                    rundownPagination.totalPages
                  )}
                </>
              )}
            </div>
          )}

          {/* ================= SECTION 6: DENAH MEJA & TAMU ================= */}
          {section === 'seating' && (
            <div className="space-y-4">
              {/* Compact 4-Card Seating KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Total Meja</span>
                    <LayoutGrid className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-xl font-bold text-gray-900 tabular-nums">
                    {seatingSummary.totalTables}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Total Kapasitas</span>
                    <Armchair className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="text-xl font-bold text-gray-900 tabular-nums">
                    {seatingSummary.totalCapacity} <span className="text-xs font-normal text-gray-500">kursi</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Kursi Terisi</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-emerald-700 tabular-nums">
                    {seatingSummary.totalOccupied} <span className="text-xs font-normal text-gray-500">kursi</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Tamu Tanpa Meja</span>
                    <Users className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-xl font-bold text-amber-700 tabular-nums">
                    {seatingSummary.unassignedGuestsCount} <span className="text-xs font-normal text-gray-500">tamu</span>
                  </div>
                </div>
              </div>

              {/* Box 2: Seating Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loadingGuests ? (
                  <div className="py-12 flex items-center justify-center text-gray-500 gap-2 text-xs sm:text-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Memuat data meja &amp; tamu...</span>
                  </div>
                ) : filteredSeatingRows.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                      {hasSeatingFilter ? <Search className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-800">
                        {hasSeatingFilter
                          ? 'Tidak ada meja yang cocok'
                          : 'Belum ada denah meja untuk acara ini'}
                      </p>
                      <p className="text-xs text-gray-500 max-w-md mx-auto">
                        {hasSeatingFilter
                          ? 'Coba ubah kata kunci pencarian, zona meja, atau filter kapasitas.'
                          : 'Klik tombol Kelola Meja di Events untuk membuat meja VVIP, VIP, Keluarga, atau Reguler dan menempatkan tamu ke setiap kursi.'}
                      </p>
                    </div>
                    {hasSeatingFilter && (
                      <button
                        type="button"
                        onClick={resetSeatingFilters}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Reset Pencarian &amp; Filter
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">
                              No
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Nama Meja
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Zona
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Kapasitas Terisi
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Daftar Tamu Ditempatkan
                            </th>
                            <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Aksi
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {seatingPagination.paginatedItems.map((row, idx) => {
                            const { table, assignedGuests, occupiedSeats, pct, isFull, isEmpty } = row;
                            return (
                              <tr key={table.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                                  {seatingPagination.startIndex + idx + 1}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">{table.name}</div>
                                  {table.locationNote && (
                                    <div className="text-xs text-gray-500 mt-0.5">{table.locationNote}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-sm font-medium text-indigo-700">
                                  {table.zone}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  <div className="flex items-center gap-2.5">
                                    <span
                                      className={`text-sm font-semibold tabular-nums ${
                                        isFull ? 'text-rose-600' : 'text-gray-900'
                                      }`}
                                    >
                                      {occupiedSeats} / {table.capacity}
                                    </span>
                                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          isFull ? 'bg-rose-600' : 'bg-indigo-600'
                                        }`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5">
                                  {assignedGuests.length > 0 ? (
                                    <div className="text-xs text-gray-700 max-w-md leading-relaxed">
                                      {assignedGuests
                                        .slice(0, 5)
                                        .map((g) => `${g.name} (${g.pax || 1})`)
                                        .join(', ')}
                                      {assignedGuests.length > 5 && (
                                        <span className="text-gray-500 font-medium">
                                          {' '}
                                          +{assignedGuests.length - 5} lainnya
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">Belum ada tamu</span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold">
                                  <span
                                    className={
                                      isFull
                                        ? 'text-rose-600'
                                        : isEmpty
                                        ? 'text-gray-500'
                                        : 'text-emerald-700'
                                    }
                                  >
                                    {isFull ? 'Penuh' : isEmpty ? 'Kosong' : 'Tersedia'}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm font-medium">
                                  <div className="flex items-center justify-end">
                                    <Link
                                      to={`/auth/login/events/${selectedEventId}/tables`}
                                      className="text-indigo-600 hover:text-indigo-900 flex items-center justify-center p-1.5 rounded-full hover:bg-indigo-50 transition-colors"
                                      title="Kelola meja & penempatan tamu"
                                    >
                                      <Armchair className="w-4 h-4" />
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {renderPaginationFooter(
                      filteredSeatingRows.length,
                      seatingRows.length,
                      'meja',
                      hasSeatingFilter,
                      resetSeatingFilters,
                      seatingPagination.startIndex,
                      seatingPagination.endIndex,
                      seatingPagination.safeCurrentPage,
                      seatingPagination.totalPages
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= MODALS ================= */}
      {/* 1. Checklist Add / Edit Modal */}
      <Modal
        isOpen={isChecklistModalOpen}
        onClose={() => {
          setIsChecklistModalOpen(false);
          setEditingTaskId(null);
        }}
        title={editingTaskId ? 'Edit Tugas Checklist' : 'Tambah Tugas Checklist'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddChecklistTask} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nama Tugas <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Contoh: Fitting akhir busana pengantin"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tahap Persiapan</label>
              <select
                value={newTaskPhase}
                onChange={(e) => setNewTaskPhase(e.target.value as PlannerChecklistPhase)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {CHECKLIST_PHASES.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Target Tanggal</label>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Penanggung Jawab (PIC)</label>
            <input
              type="text"
              value={newTaskPic}
              onChange={(e) => setNewTaskPic(e.target.value)}
              placeholder="Contoh: Leader WO / Mempelai"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setIsChecklistModalOpen(false);
                setEditingTaskId(null);
              }}
              className="h-9 px-3.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
            >
              {editingTaskId ? 'Simpan Perubahan' : 'Simpan Tugas'}
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
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Nama Vendor <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="Contoh: Royal Catering"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Kategori</label>
              <select
                value={vendorCategory}
                onChange={(e) => setVendorCategory(e.target.value as PlannerVendorCategory)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
              <label className="block text-xs font-semibold text-gray-700 mb-1">Nama PIC Vendor</label>
              <input
                type="text"
                value={vendorPicName}
                onChange={(e) => setVendorPicName(e.target.value)}
                placeholder="Nama kontak vendor"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">No. WhatsApp / Telepon</label>
              <input
                type="text"
                value={vendorPhone}
                onChange={(e) => setVendorPhone(e.target.value)}
                placeholder="0812..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Nilai Kontrak (Rp)</label>
              <input
                type="number"
                min="0"
                value={vendorContractValue}
                onChange={(e) => setVendorContractValue(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Sudah Dibayar (Rp)</label>
              <input
                type="number"
                min="0"
                value={vendorPaidAmount}
                onChange={(e) => setVendorPaidAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
              <select
                value={vendorStatus}
                onChange={(e) => setVendorStatus(e.target.value as PlannerVendorStatus)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
            <label className="block text-xs font-semibold text-gray-700 mb-1">Catatan Kontrak</label>
            <textarea
              rows={2}
              value={vendorNotes}
              onChange={(e) => setVendorNotes(e.target.value)}
              placeholder="Detail paket, jadwal pelunasan, atau permintaan khusus..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsVendorModalOpen(false)}
              className="h-9 px-3.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
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
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Target Maksimal Anggaran (Rp)
            </label>
            <input
              type="number"
              min="0"
              required
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsBudgetModalOpen(false)}
              className="h-9 px-3.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
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
              <label className="block text-xs font-semibold text-gray-700 mb-1">Jam Mulai</label>
              <input
                type="time"
                required
                value={rdStartTime}
                onChange={(e) => setRdStartTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Jam Selesai</label>
              <input
                type="time"
                required
                value={rdEndTime}
                onChange={(e) => setRdEndTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Segmen Acara</label>
            <select
              value={rdSegment}
              onChange={(e) => setRdSegment(e.target.value as PlannerRundownSegment)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {RUNDOWN_SEGMENTS.map((seg) => (
                <option key={seg} value={seg}>
                  {seg}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nama Kegiatan <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={rdActivity}
              onChange={(e) => setRdActivity(e.target.value)}
              placeholder="Contoh: Kirab Pengantin Memasuki Pelaminan"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">PIC / Petugas</label>
              <input
                type="text"
                value={rdPic}
                onChange={(e) => setRdPic(e.target.value)}
                placeholder="MC & Leader WO"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Area / Lokasi</label>
              <input
                type="text"
                value={rdLocation}
                onChange={(e) => setRdLocation(e.target.value)}
                placeholder="Panggung Utama"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Catatan Teknis</label>
            <textarea
              rows={2}
              value={rdNotes}
              onChange={(e) => setRdNotes(e.target.value)}
              placeholder="Instruksi audio, lighting, atau pendampingan tamu VIP..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsRundownModalOpen(false)}
              className="h-9 px-3.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
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
