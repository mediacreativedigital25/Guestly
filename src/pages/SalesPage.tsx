import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Heart, CheckCircle2, PlayCircle, Star, LayoutDashboard, 
  Users, Mail, QrCode, PieChart, CreditCard, Download,
  Calendar, Check, ArrowRight, Instagram, Facebook, Youtube, 
  MapPin, Phone, MessageCircle, Shield, Building,
  ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { collection, query, getDocs, where, addDoc, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GuestlyService, Testimonial } from '../types';
import { useSettings } from '../SettingsContext';

export default function SalesPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [services, setServices] = useState<GuestlyService[]>([]);
  const sliderRef = useRef<HTMLDivElement>(null);

  const [loadingServices, setLoadingServices] = useState(true);

  const scrollSlider = (direction: 'left' | 'right') => {
    if (sliderRef.current) {
      const scrollAmount = 320; // card width + gap
      sliderRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loadingTesti, setLoadingTesti] = useState(true);

  // Testimonial Form State
  const [isTestiModalOpen, setIsTestiModalOpen] = useState(false);
  const [testiForm, setTestiForm] = useState({ name: '', role: '', content: '', rating: 5 });
  const [submittingTesti, setSubmittingTesti] = useState(false);
  const [testiSuccess, setTestiSuccess] = useState(false);

  // Realtime Stats State
  const [realStats, setRealStats] = useState<{totalEvents: number, totalGuests: number} | null>(null);

  useEffect(() => {
    const fetchClientServices = async () => {
      try {
        const servicesRef = collection(db, 'services');
        const q = query(servicesRef, where('isActive', '==', true));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GuestlyService));
        
        // Filter only client packages (or 'all' target role)
        const clientPackages = data.filter(s => (s.targetRole === 'client' || s.targetRole === 'all') && s.type === 'package');
        // Sort by price ascending
        clientPackages.sort((a, b) => a.price - b.price);
        
        if (clientPackages.length > 0) {
          setServices(clientPackages);
        } else {
          throw new Error("No services found");
        }
      } catch (error) {
        console.warn("Failed to fetch services (might be permissions or empty). Falling back to default packages.", error);
        // Fallback to default client packages so the public page doesn't break
        setServices([
          {
            id: 'basic',
            name: 'Basic',
            description: 'Untuk acara intimate & sederhana\n- Undangan Digital\n- Kelola Tamu & RSVP\n- Laporan Dasar\n- Export Excel',
            type: 'package',
            targetRole: 'client',
            price: 99000,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: 'pro',
            name: 'Pro',
            description: 'Untuk acara menengah & besar\n- Semua Fitur Basic\n- Check-in Scanner (QR)\n- Laporan Lengkap & Analitik\n- Export PDF & Excel\n- Dukungan Prioritas',
            type: 'package',
            targetRole: 'client',
            price: 199000,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: 'premium',
            name: 'Premium',
            description: 'Untuk acara premium & eksklusif\n- Semua Fitur Pro\n- Multi Event Management\n- Integrasi API\n- Custom Domain Undangan\n- Account Manager Dedicated',
            type: 'package',
            targetRole: 'client',
            price: 399000,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]);
      } finally {
        setLoadingServices(false);
      }
    };
    
    const fetchTestimonials = async () => {
      try {
        const q = query(collection(db, 'testimonials'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Testimonial));
        // Sort by newest first
        data.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setTestimonials(data);
      } catch (err) {
        console.warn("Failed to fetch testimonials", err);
      } finally {
        setLoadingTesti(false);
      }
    };

    const docRef = doc(db, 'settings', 'publicStats');
    const unsubStats = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRealStats({ totalEvents: data.totalEvents || 0, totalGuests: data.totalGuests || 0 });
      }
    }, (err) => {
      console.warn("Failed to listen to real stats", err);
    });

    fetchClientServices();
    fetchTestimonials();
    
    return () => {
      unsubStats();
    };
  }, []);

  const handleSubmitTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testiForm.name || !testiForm.content) return;
    
    setSubmittingTesti(true);
    try {
      await addDoc(collection(db, 'testimonials'), {
        name: testiForm.name,
        role: testiForm.role || 'Klien Guestly',
        content: testiForm.content,
        rating: testiForm.rating,
        status: 'approved',
        createdAt: new Date()
      });
      setTestiSuccess(true);
      setTestiForm({ name: '', role: '', content: '', rating: 5 });
      setTimeout(() => {
        setIsTestiModalOpen(false);
        setTestiSuccess(false);
      }, 3000);
    } catch (error) {
      console.error("Error submitting testimonial:", error);
      alert("Gagal mengirim ulasan. Silakan coba lagi.");
    } finally {
      setSubmittingTesti(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-800 overflow-x-hidden selection:bg-rose-100 selection:text-rose-900">
      
      {/* Decorative Background Blobs */}
      <div className="absolute top-0 left-0 w-full h-[800px] overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-pink-50/60 rounded-full blur-[120px]"></div>
        <div className="absolute top-[10%] right-[-5%] w-[40%] h-[60%] bg-rose-50/50 rounded-full blur-[100px]"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-[76px]">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
              ) : (
                <div className="font-bold text-xl tracking-tight text-indigo-600">
                  Guestly
                </div>
              )}
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#fitur" className="text-[15px] font-medium text-gray-600 hover:text-[#F46279] transition-colors">Fitur</a>
              <a href="#harga" className="text-[15px] font-medium text-gray-600 hover:text-[#F46279] transition-colors">Harga</a>
              <a href="#testimoni" className="text-[15px] font-medium text-gray-600 hover:text-[#F46279] transition-colors">Testimoni</a>
              <a href="#blog" className="text-[15px] font-medium text-gray-600 hover:text-[#F46279] transition-colors">Blog</a>
              <a href="#kontak" className="text-[15px] font-medium text-gray-600 hover:text-[#F46279] transition-colors">Kontak</a>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate('/auth/login')}
                className="hidden md:flex text-[14px] font-medium px-4 py-2 rounded-full text-[#F46279] border border-rose-200 hover:bg-rose-50 transition-colors"
              >
                Login
              </button>
              <button 
                onClick={() => navigate('/auth/login')}
                className="text-[14px] font-medium px-5 py-2 rounded-full bg-[#F46279] text-white hover:bg-[#e04f66] transition-all shadow-md shadow-rose-200"
              >
                Coba Gratis
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-28 pb-16 lg:pt-40 lg:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8">
            
            {/* Left Content */}
            <div className="lg:w-1/2 text-center lg:text-left z-10">
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-3xl sm:text-4xl md:text-5xl lg:text-[54px] font-bold text-gray-900 leading-[1.15] mb-6 tracking-tight whitespace-pre-line"
              >
                {settings?.salespage?.heroTitle ? (
                  <>
                    {settings.salespage.heroTitle.split(settings.salespage.heroHighlight || '').map((part, i, arr) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="text-[#F46279]">
                            {settings.salespage.heroHighlight}
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </>
                ) : (
                  <>
                    Buku Tamu Digital <br/>
                    Modern untuk Acara <br/>
                    yang Lebih <span className="text-[#F46279]">Rapi & <br/> Profesional</span>
                  </>
                )}
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-base sm:text-lg text-gray-600 mb-8 leading-relaxed max-w-[540px] mx-auto lg:mx-0"
              >
                {settings?.salespage?.heroSubtitle || 'Kelola kehadiran tamu, check-in QR Code, souvenir, dan laporan acara dalam satu dashboard yang mudah digunakan.'}
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-8"
              >
                <button 
                  onClick={() => navigate('/auth/login')}
                  className="w-full sm:w-auto px-6 py-2.5 text-[14px] rounded-full bg-[#F46279] text-white font-medium hover:bg-[#e04f66] transition-all shadow-xl shadow-rose-200"
                >
                  Coba Gratis Sekarang
                </button>
                <button 
                  onClick={() => document.getElementById('fitur')?.scrollIntoView({ behavior: 'smooth' })}
                  className="w-full sm:w-auto px-6 py-2.5 text-[14px] rounded-full bg-white text-gray-700 border border-gray-200 font-medium hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                   Lihat Demo
                </button>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-[13px] font-medium text-gray-500"
              >
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#F46279]" /> Mudah Digunakan</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#F46279]" /> Aman & Terpercaya</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#F46279]" /> Cloud Based</div>
              </motion.div>
            </div>

            {/* Right Content - Dashboard Mockup */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="lg:w-1/2 w-full mt-10 lg:mt-0 relative z-10"
            >
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden relative w-full overflow-x-auto sm:overflow-hidden">
                <div className="min-w-[500px]">
                  {/* Mockup Header */}
                  <div className="h-10 border-b border-gray-50 flex items-center px-4 gap-2 bg-gray-50/50">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                    </div>
                  </div>
                  
                  {/* Mockup Body */}
                  <div className="flex h-[420px]">
                    {/* Sidebar */}
                    <div className="w-40 border-r border-gray-50 bg-[#FDF8F9] p-4 flex flex-col gap-1">
                      <div className="flex items-center gap-2 mb-6 px-1">
                        {settings?.logoUrl ? (
                          <img src={settings.logoUrl} alt="Logo" className="h-6 w-auto object-contain" />
                        ) : (
                          <div className="font-bold text-lg tracking-tight text-indigo-600">
                            Guestly
                          </div>
                        )}
                      </div>
                      {[
                        { icon: <LayoutDashboard size={14}/>, text: 'Dashboard', active: true },
                        { icon: <Calendar size={14}/>, text: 'Events' },
                        { icon: <Users size={14}/>, text: 'Tamu' },
                        { icon: <Mail size={14}/>, text: 'Undangan' },
                        { icon: <CheckCircle2 size={14}/>, text: 'RSVP' },
                        { icon: <QrCode size={14}/>, text: 'Check-in' },
                        { icon: <PieChart size={14}/>, text: 'Laporan' },
                      ].map((item, idx) => (
                        <div key={idx} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer ${item.active ? 'bg-rose-100/50 text-[#F46279]' : 'text-gray-500 hover:bg-gray-100'}`}>
                          {item.icon} {item.text}
                        </div>
                      ))}
                    </div>
                    
                    {/* Main UI */}
                    <div className="flex-1 p-4 sm:p-5 bg-[#fafafa]">
                      <div className="flex justify-between items-center mb-5">
                        <div>
                          <h3 className="text-[13px] font-bold text-gray-800">Selamat pagi, Admin Guestly 👋</h3>
                          <p className="text-[10px] text-gray-500">Semoga harimu menyenangkan!</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="bg-white border text-gray-400 border-gray-200 rounded-lg px-2 py-1 text-[10px] flex items-center w-24 sm:w-32 shadow-sm">
                            <CheckCircle2 className="w-3 h-3 mr-1 opacity-50 shrink-0"/> Cari tamu..
                          </div>
                          <img src="https://i.pravatar.cc/100?img=5" alt="Avatar" className="w-6 h-6 rounded-full border border-gray-200 shrink-0"/>
                        </div>
                      </div>

                      {/* Stats Row */}
                      <div className="grid grid-cols-4 gap-2 mb-5">
                        {[
                          { title: 'Total Event', val: '128', sub: '16%', icon: 'bg-rose-50 text-rose-500' },
                          { title: 'Tamu', val: '4.860', sub: '24%', icon: 'bg-green-50 text-green-500' },
                          { title: 'RSVP\nDiterima', val: '3.280', sub: '20%', icon: 'bg-blue-50 text-blue-500' },
                          { title: 'Pendapatan', val: 'Rp24M', sub: '32%', icon: 'bg-amber-50 text-amber-500' }
                        ].map((stat, idx) => (
                          <div key={idx} className="bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                            <div className="text-[8px] sm:text-[9px] text-gray-500 mb-1 leading-tight whitespace-pre-line">{stat.title}</div>
                            <div className="text-sm sm:text-lg font-bold text-gray-800 leading-none mb-1.5">{stat.val}</div>
                            <div className="text-[6px] sm:text-[7px] text-emerald-500 flex items-center gap-0.5">↑ {stat.sub}</div>
                            <div className={`absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center ${stat.icon}`}>
                              <span className="block w-2 h-2 bg-current rounded-sm"></span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-3 gap-3 sm:gap-4">
                        {/* Chart Area */}
                        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-3 shadow-sm h-32 relative">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-gray-800">Ringkasan Event</span>
                            <span className="text-[8px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">Tahun ▾</span>
                          </div>
                          {/* Fake Chart Lines */}
                          <svg className="w-full h-16 mt-2" viewBox="0 0 200 50" preserveAspectRatio="none">
                            <path d="M0,45 C20,35 40,45 60,30 C80,15 100,25 120,10 C140,-5 160,20 180,15 C190,12 195,5 200,5" fill="none" stroke="#e9d5ff" strokeWidth="2" />
                            <path d="M0,40 C25,20 50,50 75,25 C100,0 125,30 150,15 C175,0 190,30 200,20" fill="none" stroke="#F46279" strokeWidth="2.5" />
                            <path d="M0,40 C25,20 50,50 75,25 C100,0 125,30 150,15 C175,0 190,30 200,20 L200,50 L0,50 Z" fill="url(#pinkGrad)" opacity="0.3"/>
                            <defs>
                              <linearGradient id="pinkGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F46279" stopOpacity="0.4"/>
                                <stop offset="100%" stopColor="#F46279" stopOpacity="0"/>
                              </linearGradient>
                            </defs>
                          </svg>
                        </div>

                        {/* Event List */}
                        <div className="col-span-1 bg-white rounded-xl border border-gray-100 p-2 sm:p-3 shadow-sm h-32 flex flex-col">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-gray-800">Event</span>
                            <span className="text-[7px] text-[#F46279] cursor-pointer hidden sm:block">Lihat</span>
                          </div>
                          <div className="flex-1 overflow-hidden space-y-2">
                            {[
                              { n: 'The Wedding...', d: '24 Mei 2026' },
                              { n: 'The Wedding...', d: '24 Mei 2026' },
                              { n: 'The Wedding...', d: '27 Jun 2026', draft: true }
                            ].map((ev, i) => (
                              <div key={i} className="flex gap-1.5 sm:gap-2 items-center">
                                <div className="hidden sm:block w-6 h-6 rounded bg-gray-100 overflow-hidden shrink-0">
                                  <img src={`https://source.unsplash.com/random/50x50/?wedding&sig=${i}`} alt="wed" className="w-full h-full object-cover opacity-80" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[8px] font-semibold text-gray-800 truncate">{ev.n}</div>
                                  <div className="text-[7px] text-gray-500">{ev.d}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative elements around mockup */}
              <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-rose-200/40 rounded-full blur-xl -z-10"></div>
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-purple-200/40 rounded-full blur-lg -z-10"></div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust Badges & Stats */}
      <section className="py-10 lg:py-14 border-y border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
            {/* Left side: Acara */}
            <div className="lg:w-1/2">
              <p className="text-center lg:text-left text-sm font-semibold text-gray-900 mb-6">Dipercaya oleh Berbagai Acara</p>
              <div className="flex justify-center lg:justify-start gap-4 sm:gap-8 flex-wrap items-center text-[#F46279]">
                <div className="flex flex-col items-center gap-2"><div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center"><Users size={20} /></div><span className="text-[10px] font-bold text-gray-600 uppercase">Wedding Organizer</span></div>
                <div className="flex flex-col items-center gap-2"><div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center"><Calendar size={20} /></div><span className="text-[10px] font-bold text-gray-600 uppercase">Event Organizer</span></div>
                <div className="flex flex-col items-center gap-2"><div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center"><LayoutDashboard size={20} /></div><span className="text-[10px] font-bold text-gray-600 uppercase">Seminar</span></div>
                <div className="flex flex-col items-center gap-2"><div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center"><Building size={20} /></div><span className="text-[10px] font-bold text-gray-600 uppercase">Perusahaan</span></div>
              </div>
            </div>

            {/* Right side: Stats */}
            <div className="lg:w-1/2 flex items-center justify-center lg:justify-end">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-12 text-center">
                <div>
                  <div className="flex justify-center mb-2"><Calendar className="w-6 h-6 text-[#F46279]" /></div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">{realStats !== null ? realStats.totalEvents.toLocaleString('id-ID') : (settings?.salespage?.stat1Value || '1.000+')}</div>
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{settings?.salespage?.stat1Label || 'Event'}</div>
                </div>
                <div>
                  <div className="flex justify-center mb-2"><Users className="w-6 h-6 text-[#F46279]" /></div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">{realStats !== null ? realStats.totalGuests.toLocaleString('id-ID') : (settings?.salespage?.stat2Value || '50.000+')}</div>
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{settings?.salespage?.stat2Label || 'Tamu Tercatat'}</div>
                </div>
                <div>
                  <div className="flex justify-center mb-2"><Shield className="w-6 h-6 text-[#F46279]" /></div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">{settings?.salespage?.stat3Value || '99,9%'}</div>
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{settings?.salespage?.stat3Label || 'Data Aman'}</div>
                </div>
                <div>
                  <div className="flex justify-center mb-2"><Calendar className="w-6 h-6 text-[#F46279]" /></div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">{settings?.salespage?.stat4Value || '24/7'}</div>
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{settings?.salespage?.stat4Label || 'Online'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Solution Section */}
      <section className="py-12 lg:py-20 bg-[#FAFAF9] border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-center">
            
            {/* Left: Problem */}
            <div className="lg:w-1/2">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 md:mb-6 font-serif leading-tight">
                {settings?.salespage?.problemTitle || 'Masih Menggunakan Buku Tamu Manual?'}
              </h2>
              
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
                <img src={settings?.salespage?.problemImage || "https://queinvite.yulovi.com/wp-content/uploads/2026/06/BUku.webp"} alt="Buku tamu manual" className="w-full h-56 md:h-64 object-cover" />
                
                <div className="p-6 lg:p-8">
                  <ul className="space-y-3">
                    {(settings?.salespage?.problemItems ? settings.salespage.problemItems.split('\n') : [
                      'Tulisan sulit dibaca',
                      'Data tamu tercecer',
                      'Sulit menghitung jumlah kehadiran',
                      'Tidak tahu siapa yang sudah datang',
                      'Souvenir tidak terkontrol',
                      'Rekap acara memakan waktu lama'
                    ]).filter(item => item.trim() !== '').map((item, idx) => (
                      <li key={idx} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <span className="text-red-500 font-bold text-xs">x</span>
                        </div>
                        <span className="text-gray-700 font-medium">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Right: Solution */}
            <div className="lg:w-1/2">
              <div className="bg-white p-8 lg:p-10 rounded-[32px] border border-rose-100 shadow-xl shadow-rose-50/50">
                <h2 className="text-2xl lg:text-3xl font-bold text-[#F46279] mb-4">
                  {settings?.salespage?.solutionTitle || 'Semua Kebutuhan Buku Tamu dalam Satu Platform'}
                </h2>
                <p className="text-gray-600 mb-8 text-lg leading-relaxed">
                  {settings?.salespage?.solutionDesc || 'Guestly membantu Anda mengelola tamu secara digital mulai dari registrasi hingga laporan akhir acara.'}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-8 gap-x-4">
                  {[
                    { icon: <QrCode />, label: 'QR Check-In' },
                    { icon: <CheckCircle2 />, label: 'Real-Time Kehadiran' },
                    { icon: <LayoutDashboard />, label: 'Dashboard Event' },
                    { icon: <Users />, label: 'Souvenir Tracking' },
                    { icon: <Download />, label: 'Export Data' },
                    { icon: <Calendar />, label: 'Multi Event' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center text-center gap-3 group">
                      <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-[#F46279] group-hover:bg-[#F46279] group-hover:text-white transition-all shadow-sm">
                        {React.cloneElement(item.icon as React.ReactElement, { size: 24, strokeWidth: 1.5 })}
                      </div>
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Features Carousel (Kelola Acara dengan Mudah - Static Placeholder layout for image) */}
      <section className="py-16 lg:py-24 bg-white border-b border-gray-100 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <div className="lg:w-1/3 z-10">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 font-serif">{settings?.salespage?.featuresCarouselTitle || 'Kelola Acara dengan Mudah'}</h2>
              <p className="text-gray-600 text-lg mb-8 leading-relaxed">{settings?.salespage?.featuresCarouselDesc || 'Semua data tersaji rapi dalam dashboard yang intuitif dan mudah digunakan.'}</p>
              <button onClick={() => navigate('/auth/login')} className="px-6 py-2.5 text-[14px] bg-[#F46279] text-white font-medium rounded-full shadow-lg shadow-rose-200 hover:bg-[#e04f66] transition-all">
                Lihat Demo
              </button>
            </div>
            <div className="lg:w-2/3 flex gap-4 overflow-x-auto pb-8 snap-x relative lg:-mr-32 pt-8">
               <div className="h-full absolute left-0 top-0 w-16 bg-gradient-to-r from-white to-transparent z-10"></div>
               {(settings?.salespage?.featuresCarouselData && settings.salespage.featuresCarouselData.length > 0 ? settings.salespage.featuresCarouselData : [
                 { title: 'Dashboard Utama', img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', link: '' },
                 { title: 'Data Tamu', img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', link: '' },
                 { title: 'Scan QR', img: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', link: '' },
               ]).map((item: any, i: number) => {
                 const CardContent = (
                   <>
                     <div className="h-48 overflow-hidden bg-gray-100">
                        <img src={item.img} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                     </div>
                     <div className="p-4 text-center border-t border-gray-50">
                       <span className="font-bold text-gray-800">{item.title}</span>
                     </div>
                   </>
                 );
                 
                 return item.link ? (
                   <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="block min-w-[280px] md:min-w-[320px] bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden snap-center group cursor-pointer hover:shadow-2xl transition-all">
                     {CardContent}
                   </a>
                 ) : (
                   <div key={i} className="min-w-[280px] md:min-w-[320px] bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden snap-center group">
                     {CardContent}
                   </div>
                 );
               })}
               <div className="h-full absolute right-0 top-0 w-16 bg-gradient-to-l from-white to-transparent z-10"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="fitur" className="py-16 lg:py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10 lg:mb-16">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-12 h-px bg-rose-200"></div>
              <span className="text-[#F46279] text-sm font-semibold tracking-widest uppercase">Fitur Lengkap</span>
              <div className="w-12 h-px bg-rose-200"></div>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-[38px] font-bold text-gray-900 mb-5 font-serif leading-tight">Semua yang Kamu Butuhkan dalam Satu Platform</h2>
            <p className="text-gray-600 text-lg">Dari pembuatan undangan hingga laporan acara, semua lebih mudah dengan Guestly.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                icon: <Mail className="w-6 h-6 text-[#F46279]" />,
                title: "Undangan Digital Interaktif",
                desc: "Buat undangan digital yang cantik, modern, dan bisa dibagikan ke tamu melalui berbagai platform.",
                link: "Lihat Fitur"
              },
              {
                icon: <Users className="w-6 h-6 text-[#F46279]" />,
                title: "Kelola Tamu & RSVP",
                desc: "Kelola daftar tamu, konfirmasi kehadiran, dan kategori tamu dengan mudah dan cepat.",
                link: "Lihat Fitur"
              },
              {
                icon: <QrCode className="w-6 h-6 text-[#F46279]" />,
                title: "Check-in Scanner",
                desc: "QR Code check-in untuk memudahkan proses registrasi tamu di hari acara secara kilat.",
                link: "Lihat Fitur"
              },
              {
                icon: <PieChart className="w-6 h-6 text-[#F46279]" />,
                title: "Laporan & Analitik",
                desc: "Pantau statistik tamu, kehadiran, dan pendapatan acara secara real-time dan akurat.",
                link: "Lihat Fitur"
              },
              {
                icon: <CreditCard className="w-6 h-6 text-[#F46279]" />,
                title: "Manajemen Keuangan",
                desc: "Catat pemasukan, pengeluaran, dan kelola anggaran acara dengan rapi dan terorganisir.",
                link: "Lihat Fitur"
              },
              {
                icon: <Download className="w-6 h-6 text-[#F46279]" />,
                title: "Integrasi & Ekspor Data",
                desc: "Ekspor data tamu ke Excel/PDF dan integrasi dengan berbagai layanan party planner lainnya.",
                link: "Lihat Fitur"
              }
            ].map((feature, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-white p-8 rounded-[24px] shadow-sm border border-gray-100 hover:shadow-lg transition-all hover:border-rose-100 group"
              >
                <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-[19px] font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed mb-6 block min-h-[72px]">{feature.desc}</p>
                <button className="text-[#F46279] font-medium text-sm flex items-center gap-1.5 hover:gap-2 transition-all">
                  {feature.link} <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 lg:py-24 bg-[#FDF8F9] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 lg:mb-20">
            <h2 className="text-2xl sm:text-3xl md:text-[38px] font-bold text-gray-900 mb-5 font-serif leading-tight">
              {settings?.salespage?.stepsTitle || 'Cara Kerja Penggunaan Aplikasi Guestly'}
            </h2>
            <p className="text-gray-600 text-lg">Ikuti 4 langkah mudah berikut untuk mengelola tamu acara Anda dengan lebih profesional dan efisien.</p>
          </div>

          <div className="relative">
            {/* Connecting Dashed Line (Desktop Only) */}
            <div className="hidden lg:block absolute top-[52px] left-[10%] right-[10%] h-px border-t-[2px] border-dashed border-rose-300 -z-0"></div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 text-center relative z-10">
              {[
                { 
                  step: 1, 
                  icon: <Calendar className="w-10 h-10 text-[#F46279]" />, 
                  title: settings?.salespage?.s1Title || 'Buat & Konfigurasi Acara', 
                  desc: settings?.salespage?.s1Desc || 'Mulailah dengan membuat acara baru di dalam dashboard. Anda cukup memasukkan detail acara seperti nama, tanggal, serta lokasi dengan sangat cepat dan mudah.' 
                },
                { 
                  step: 2, 
                  icon: <Users className="w-10 h-10 text-[#F46279]" />, 
                  title: settings?.salespage?.s2Title || 'Kelola Daftar Tamu', 
                  desc: settings?.salespage?.s2Desc || 'Tambahkan daftar tamu secara praktis melalui unggahan file Excel atau masukkan secara manual. Seluruh data tamu terorganisir rapi dalam satu sistem.' 
                },
                { 
                  step: 3, 
                  icon: <QrCode className="w-10 h-10 text-[#F46279]" />, 
                  title: settings?.salespage?.s3Title || 'Distribusi Tiket QR Code', 
                  desc: settings?.salespage?.s3Desc || 'Sistem akan menghasilkan QR Code unik secara otomatis untuk setiap tamu. Anda dapat langsung membagikannya secara personal sebagai akses registrasi.' 
                },
                { 
                  step: 4, 
                  icon: <PieChart className="w-10 h-10 text-[#F46279]" />, 
                  title: settings?.salespage?.s4Title || 'Pantau Kehadiran Real-time', 
                  desc: settings?.salespage?.s4Desc || 'Pindai QR Code tamu dengan perangkat Anda di lokasi acara dan pantau terus statistik jumlah persentase kehadiran tamu secara langsung kapan saja.' 
                },
              ].map((item, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-[#F46279] text-white text-xs flex items-center justify-center font-bold mb-4 relative z-10">{item.step}</div>
                  <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-100 mb-6 border border-rose-50 rotate-3 hover:rotate-0 transition-transform">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600 px-2 lg:px-4">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimoni" className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10 lg:mb-16">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-12 h-px bg-rose-200"></div>
              <span className="text-[#F46279] text-sm font-semibold tracking-widest uppercase">Testimoni</span>
              <div className="w-12 h-px bg-rose-200"></div>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-[38px] font-bold text-gray-900 font-serif leading-tight mb-4">Apa Kata Mereka?</h2>
            <button 
              onClick={() => setIsTestiModalOpen(true)}
              className="mt-6 text-[14px] font-medium px-6 py-2.5 rounded-full border border-rose-200 text-[#F46279] hover:bg-rose-50 transition-colors"
            >
              Berikan Ulasan Anda
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* Fake Carousel Arrows */}
            <button className="hidden lg:flex absolute -left-12 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-gray-100 shadow-sm rounded-full items-center justify-center text-gray-400 hover:text-[#F46279] hover:border-[#F46279] transition-all z-10">
              <ArrowRight className="w-5 h-5 rotate-180" />
            </button>
            <button className="hidden lg:flex absolute -right-12 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-gray-100 shadow-sm rounded-full items-center justify-center text-gray-400 hover:text-[#F46279] hover:border-[#F46279] transition-all z-10">
              <ArrowRight className="w-5 h-5" />
            </button>

            {loadingTesti ? (
              <div className="col-span-3 text-center py-12 text-gray-500">Memuat testimoni...</div>
            ) : testimonials.length > 0 ? (
              testimonials.slice(0, 3).map((testi, idx) => (
                <div key={testi.id || idx} className="bg-white p-8 rounded-3xl border border-rose-100 shadow-sm shadow-rose-50 flex flex-col justify-between">
                  <div>
                    <span className="text-5xl text-[#F46279] opacity-20 font-serif leading-none block mb-2">“</span>
                    <p className="text-gray-700 leading-relaxed font-medium mb-8 pt-2 line-clamp-4">{testi.content}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(testi.name)}&background=F46279&color=fff`} alt={testi.name} className="w-12 h-12 rounded-full object-cover shadow-sm bg-rose-50" />
                    <div>
                      <h4 className="font-bold text-gray-900">{testi.name}</h4>
                      <p className="text-sm text-gray-500">{testi.role || "Klien Guestly"}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 text-center py-10 lg:py-16 text-gray-500 bg-gray-50 rounded-3xl border border-gray-100">
                <p className="mb-4 text-lg">Belum ada testimoni saat ini.</p>
                <p className="text-sm">Jadilah yang pertama memberikan ulasan untuk layanan kami!</p>
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2 mt-8">
            <div className="w-2.5 h-2.5 rounded-full bg-[#F46279]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-rose-200"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-rose-200"></div>
          </div>
        </div>
      </section>

      {/* Testimonial Form Modal */}
      {isTestiModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">Berikan Ulasan</h3>
              <button 
                onClick={() => setIsTestiModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-5 sm:p-6 overflow-y-auto">
              {testiSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Terima Kasih!</h4>
                  <p className="text-gray-600">Ulasan Anda telah dikirim dan akan direview oleh admin kami.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitTestimonial} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 pb-1.5">Nama Anda</label>
                    <input 
                      type="text" 
                      required
                      value={testiForm.name}
                      onChange={e => setTestiForm({...testiForm, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F46279]/20 focus:border-[#F46279] transition-all"
                      placeholder="Contoh: Winda & Fajri"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 pb-1.5">Acara / Keterangan</label>
                    <input 
                      type="text" 
                      value={testiForm.role}
                      onChange={e => setTestiForm({...testiForm, role: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F46279]/20 focus:border-[#F46279] transition-all"
                      placeholder="Contoh: Pernikahan Mei 2026"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 pb-1.5">Ulasan</label>
                    <textarea 
                      required
                      value={testiForm.content}
                      onChange={e => setTestiForm({...testiForm, content: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F46279]/20 focus:border-[#F46279] transition-all resize-none h-28"
                      placeholder="Ceritakan pengalaman Anda menggunakan Guestly..."
                    ></textarea>
                  </div>
                  <button 
                    type="submit" 
                    disabled={submittingTesti}
                    className="w-full mt-4 py-3 bg-[#F46279] text-white rounded-lg font-bold hover:bg-[#e04f66] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {submittingTesti ? 'Mengirim...' : 'Kirim Ulasan'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Why Choose Us */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-[#FAFAFA] border border-gray-100 rounded-[32px] md:rounded-[48px] px-6 sm:px-10 lg:px-16 pt-8 lg:py-0 w-full relative overflow-hidden flex flex-col lg:flex-row items-center justify-between min-h-[450px]">
            
            {/* Left Content */}
            <div className="lg:w-[60%] relative z-10 w-full lg:py-16 xl:py-20 pb-12 lg:pb-8 pt-6 lg:pt-0">
              <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-bold text-[#3A3F58] mb-4 leading-tight">Mengapa Memilih Guestly?</h2>
              <p className="text-[#3A3F58] font-medium mb-10 lg:mb-12 text-lg sm:text-xl">Lebih dari Sekadar Buku Tamu</p>
              
              <ul className="grid sm:grid-cols-2 gap-y-6 gap-x-6 sm:gap-x-8">
                {[
                  'Modern & Profesional',
                  'Mudah Digunakan',
                  'Tidak Perlu Instalasi',
                  'Bisa Diakses dari Mana Saja',
                  'Data Tersimpan Aman',
                  'Support Tim Guestly'
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#F46279] flex items-center justify-center shrink-0 shadow-md shadow-rose-200">
                      <Check className="w-4 h-4 text-white" strokeWidth={3.5} />
                    </div>
                    <span className="text-[#3A3F58] font-bold text-[15px] sm:text-[17px]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right Decorative Image */}
            <img 
              src="https://queinvite.yulovi.com/wp-content/uploads/2026/06/Perempuan.webp" 
              alt="Business woman" 
              className="w-full max-w-[280px] sm:max-w-[340px] md:max-w-[400px] lg:max-w-[460px] xl:max-w-[540px] mt-auto object-contain object-bottom self-center lg:absolute lg:bottom-0 lg:-right-4 xl:right-[2%] pointer-events-none drop-shadow-2xl z-0"
            />
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section id="harga" className="py-12 lg:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-[#FFF5F7] rounded-[32px] md:rounded-[48px] p-6 sm:p-10 lg:p-12 xl:p-16 flex flex-col w-full relative overflow-hidden border border-rose-50">
            <div className="text-center mb-10 lg:mb-12 flex flex-col sm:flex-row justify-between items-center relative z-20">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mx-auto">Pilih Paket yang Sesuai Kebutuhan Anda</h2>
              
              {/* Desktop Slider Controls */}
              <div className="hidden lg:flex gap-3 absolute right-0">
                <button onClick={() => scrollSlider('left')} className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-gray-600 hover:text-[#F46279] shadow-sm border border-rose-100 hover:border-[#F46279] transition-colors"><ChevronLeft size={24} /></button>
                <button onClick={() => scrollSlider('right')} className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-gray-600 hover:text-[#F46279] shadow-sm border border-rose-100 hover:border-[#F46279] transition-colors"><ChevronRight size={24} /></button>
              </div>
            </div>

            <div ref={sliderRef} className="flex overflow-x-auto gap-4 xl:gap-6 pb-12 pt-8 -mt-4 snap-x snap-mandatory relative z-10 hide-scrollbar -mx-6 px-6 sm:-mx-10 sm:px-10 lg:-mx-12 lg:px-12 scroll-smooth" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {loadingServices ? (
                <div className="w-full text-center py-12 text-gray-500">Memuat paket harga...</div>
              ) : services.length === 0 ? (
                <div className="w-full text-center py-12 text-gray-500">Belum ada paket yang tersedia untuk saat ini.</div>
              ) : (
                services.map((service, index) => {
                  const isPopular = service.name.toLowerCase().includes('diamond');
                  const normalPrice = service.normalPrice || (service.price > 0 ? Math.round((service.price * 1.5) / 1000) * 1000 : 0);
                  
                  return (
                    <div key={service.id} className={`min-w-[260px] sm:min-w-[280px] lg:min-w-[290px] w-[260px] sm:w-[280px] lg:w-[290px] min-h-[460px] lg:min-h-[520px] shrink-0 snap-center bg-white rounded-3xl lg:rounded-[32px] px-6 py-8 lg:px-8 lg:py-10 flex flex-col relative border transition-transform duration-300 ${isPopular ? 'border-[#F46279] shadow-xl shadow-rose-200/50 z-20 lg:scale-105' : 'border-gray-100 shadow-sm'}`}>
                      {isPopular && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#F46279] text-white text-[12px] font-bold px-6 py-1.5 rounded-full z-10 whitespace-nowrap">
                          Populer
                        </div>
                      )}
                      <div className="text-center mb-8 pt-2">
                        <h3 className="text-base lg:text-lg font-bold text-gray-900 mb-4">{service.name}</h3>
                        <div className="flex flex-col items-center justify-center">
                          {service.price > 0 && normalPrice > service.price ? (
                            <div className="text-[13px] sm:text-[14px] text-gray-400 line-through font-medium mb-1.5 h-5 flex items-center">
                              Rp {normalPrice.toLocaleString('id-ID')}
                            </div>
                          ) : (
                            <div className="h-[21px] mb-1.5 flex items-center"></div>
                          )}
                          <div className="text-3xl sm:text-[34px] lg:text-[40px] tracking-tight whitespace-nowrap font-bold text-gray-900 leading-none py-1">
                            {service.price === 0 ? 'GRATIS' : `Rp ${service.price.toLocaleString('id-ID')}`}
                          </div>
                          <div className="h-5 mt-2">
                            {service.price > 0 && <div className="text-[13px] text-gray-500 font-medium">/event</div>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 mt-4">
                        <ul className="space-y-4 mb-8">
                          {service.eventQuota ? (
                             <li className="flex items-center gap-3 text-[13.5px] lg:text-[14.5px] text-gray-800">
                               <Check className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-500 shrink-0" strokeWidth={3} /> <span className="font-semibold">{service.eventQuota}</span> Event
                             </li>
                          ) : null}
                          {service.guestQuota ? (
                             <li className="flex items-center gap-3 text-[13.5px] lg:text-[14.5px] text-gray-800">
                               <Check className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-500 shrink-0" strokeWidth={3} /> Maks <span className="font-semibold">{service.guestQuota}</span> Tamu
                             </li>
                          ) : null}
                          {service.description.split('\n').map((line, i) => line.trim() !== '' && (
                             <li key={i} className="flex items-start gap-3 text-[13.5px] lg:text-[14.5px] text-gray-800">
                               <Check className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-500 shrink-0 mt-0.5 lg:mt-0" strokeWidth={3} /> <span>{line.replace(/^- /, '')}</span>
                             </li>
                          ))}
                        </ul>
                      </div>
                      <button 
                        onClick={() => navigate(`/services/checkout/${service.id}`)}
                        className="w-full mt-auto py-2 lg:py-2.5 rounded-xl text-white bg-[#F46279] hover:bg-[#e04f66] text-sm font-semibold transition-colors shadow-sm shadow-rose-200"
                      >
                        {service.price === 0 ? 'Mulai Gratis' : 'Pilih Paket'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Mobile Slider Controls */}
            <div className="flex lg:hidden justify-center gap-4 mt-2">
                <button onClick={() => scrollSlider('left')} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-600 hover:text-[#F46279] shadow-sm border border-rose-100 transition-colors"><ChevronLeft size={20} /></button>
                <button onClick={() => scrollSlider('right')} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-600 hover:text-[#F46279] shadow-sm border border-rose-100 transition-colors"><ChevronRight size={20} /></button>
            </div>

            <p className="text-gray-500 text-[14px] lg:text-[15px] text-center mt-6 lg:mt-8">Semua paket dapat di-upgrade kapan saja.</p>
          </div>

        </div>
      </section>

      {/* Bottom CTA & FAQ combined section */}
      <section className="py-16 lg:py-24 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">
            
            {/* Left: FAQ */}
            <div className="lg:w-1/2 w-full">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 font-serif leading-tight">Pertanyaan yang Sering Diajukan</h2>
              <div className="space-y-4">
                {[
                  { q: 'Apakah harus instal aplikasi?', a: 'Tidak. Guestly berjalan melalui browser, jadi tidak perlu instalasi apapun.' },
                  { q: 'Apakah bisa digunakan untuk wedding?', a: 'Tentu. Guestly sangat cocok untuk acara pernikahan dari skala kecil hingga besar.' },
                  { q: 'Apakah tamu wajib scan QR?', a: 'Tidak wajib. Tim pendaftaran bisa mencari nama tamu secara manual jika QR tidak dibawa.' },
                  { q: 'Apakah bisa import Excel?', a: 'Bisa. Tersedia fitur import data untuk memasukkan ribuan tamu sekaligus.' },
                  { q: 'Apakah data aman?', a: 'Data Anda dienkripsi dan disimpan di server cloud dengan tingkat keamanan tinggi.' }
                ].map((faq, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                    <details className="group">
                      <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-5 text-gray-900 hover:text-[#F46279] transition-colors">
                        <span>{faq.q}</span>
                        <span className="transition group-open:rotate-180">
                          <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" w="24"><path d="M6 9l6 6 6-6"></path></svg>
                        </span>
                      </summary>
                      <div className="text-gray-600 px-5 pb-5 leading-relaxed text-sm">
                        {faq.a}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: CTA Box */}
            <div className="lg:w-1/2 w-full">
              <div className="bg-rose-50 rounded-[32px] p-10 relative overflow-hidden h-full flex flex-col justify-center">
                <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-white/40 rounded-full blur-2xl"></div>
                <div className="relative z-10">
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#F46279] mb-4 font-serif leading-tight">
                    {settings?.salespage?.ctaTitle || 'Siap Membuat Acara Lebih Profesional?'}
                  </h2>
                  <p className="text-gray-700 mb-8 text-lg">
                    {settings?.salespage?.ctaDesc || 'Kelola tamu, check-in QR, dan laporan acara dalam satu platform modern.'}
                  </p>
                  
                  <div className="flex gap-6 mb-8 pt-2">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 bg-white rounded-full flex justify-center items-center text-[#F46279] shadow-sm"><CheckCircle2 size={18} /></div>
                      <span className="text-[10px] font-bold text-gray-700 uppercase text-center w-16">Mudah Digunakan</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 bg-white rounded-full flex justify-center items-center text-[#F46279] shadow-sm"><LayoutDashboard size={18} /></div>
                      <span className="text-[10px] font-bold text-gray-700 uppercase text-center w-20">Real-Time Monitoring</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 bg-white rounded-full flex justify-center items-center text-[#F46279] shadow-sm"><PieChart size={18} /></div>
                      <span className="text-[10px] font-bold text-gray-700 uppercase text-center w-16">Laporan Lengkap</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => navigate('/auth/login')}
                    className="w-full sm:w-auto px-6 py-2.5 text-[14px] bg-[#F46279] text-white font-medium rounded-full shadow-lg shadow-rose-200 hover:bg-[#e04f66] transition-all flex items-center justify-center gap-2"
                  >
                    Coba Gratis Sekarang <ArrowRight size={18} />
                  </button>
                </div>
                
                {/* Person image (Stock placeholder) */}
                <img 
                  src="https://queinvite.yulovi.com/wp-content/uploads/2026/06/cowo.webp" 
                  alt="Happy person" 
                  className="absolute bottom-0 right-[-30px] lg:right-[0%] w-64 md:w-80 lg:w-[380px] xl:w-[420px] max-h-[120%] lg:max-h-[140%] opacity-95 object-contain rounded-tl-[80px] hidden md:block z-0 pointer-events-none drop-shadow-xl" 
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row justify-between gap-12 mb-12">
          
          <div className="lg:w-1/3">
            <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => navigate('/')}>
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
              ) : (
                <div className="font-bold text-xl tracking-tight text-indigo-600">
                  Guestly
                </div>
              )}
            </div>
            <p className="text-gray-500 text-[15px] mb-8 max-w-sm leading-relaxed">
              Kelola acara, buat momen <br/> tak terlupakan.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-[#F46279] hover:bg-[#F46279] hover:text-white transition-all"><Instagram size={18} /></a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-[#F46279] hover:bg-[#F46279] hover:text-white transition-all"><Facebook size={18} /></a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-[#F46279] hover:bg-[#F46279] hover:text-white transition-all"><Youtube size={18} /></a>
            </div>
          </div>

          <div className="lg:w-2/3 grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Produk</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Fitur</a></li>
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Harga</a></li>
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Undangan Digital</a></li>
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Laporan</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Perusahaan</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Tentang Kami</a></li>
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Blog</a></li>
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Karir</a></li>
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Kebijakan Privasi</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Bantuan</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Pusat Bantuan</a></li>
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">Panduan</a></li>
                <li><a href="#" className="text-[14px] text-gray-500 hover:text-[#F46279]">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Kontak</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-[#F46279] shrink-0 mt-0.5" />
                  <span className="text-[14px] text-gray-500">support@yulovi.com</span>
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="w-4 h-4 text-[#F46279] shrink-0 mt-0.5" />
                  <span className="text-[14px] text-gray-500">085158636606</span>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#F46279] shrink-0 mt-0.5" />
                  <span className="text-[14px] text-gray-500">Semarang, Indonesia</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 border-t border-gray-100 text-center">
          <p className="text-[13px] text-gray-400">&copy; {new Date().getFullYear()} Guestly. Memancarkan keanggunan di setiap undangan.</p>
        </div>
      </footer>
    </div>
  );
}
