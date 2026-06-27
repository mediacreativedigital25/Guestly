import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { LayoutDashboard, Users, CalendarDays, Settings, LogOut, FileText, ChevronDown, ChevronRight, ChevronLeft, UserCog, Menu, X, Shield, User, Briefcase, CreditCard, ShoppingBag, Package, Receipt, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from './lib/utils';
import { auth, db } from './lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function AppLayout() {
  const { currentUser, appUser, loading, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPartnerMenuOpen, setIsPartnerMenuOpen] = useState(false);
  const [isAdminPanelMenuOpen, setIsAdminPanelMenuOpen] = useState(false);
  const [isServiceInfoMenuOpen, setIsServiceInfoMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = {
          role: email === '64.iklas@gmail.com' ? 'superadmin' : 'client',
          name: name || 'Unnamed User',
          email: email,
          phone: phone || null,
          partnerId: null,
          clientId: null,
          eventQuota: 1,
          guestQuota: 10,
          activeUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', userCredential.user.uid), newUser);
        
        // Send WhatsApp Notification for new registration
        if (phone) {
          import('./lib/fonnte').then(({ sendFonnteMessage }) => {
            const loginUrl = `${window.location.origin}/auth/login`;
            const message = `🔐 *Informasi Akun Guestly*

Halo Kak *${name}*,

Terima kasih telah bergabung dengan Guestly. Berikut informasi akun yang dapat digunakan untuk mengakses layanan Guestly:

📧 *Email* : ${email}
🔑 *Password* : ${password}
🌐 *Login* : ${loginUrl}

Mohon simpan informasi akun ini dengan baik dan jangan membagikannya kepada pihak lain untuk menjaga keamanan akun.

Jika mengalami kendala atau memerlukan bantuan, silakan hubungi tim support kami:

📞 0851-5863-6606

─────────────────
*Guestly*
Smart Digital Guestbook & Event Management

🌐 guestly.yulovi.com
📧 support@guestly.yulovi.com
💬 Layanan Bantuan: 0851-5863-6606

Terima kasih telah mempercayakan kebutuhan manajemen tamu Anda kepada Guestly.
─────────────────`;
            sendFonnteMessage(null, phone, message);
          });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      setLoginError(error.message || 'Otentikasi gagal. Periksa kembali data Anda.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center justify-center space-y-4">
          <img 
            src={settings?.faviconUrl || settings?.logoUrl || "/favicon.ico"} 
            alt="Guestly Logo" 
            className="w-16 h-16 object-contain animate-pulse"
            onError={(e) => {
              // Hide image if favicon doesn't exist to prevent broken image icon
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="text-gray-500 font-medium">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!currentUser || !appUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="w-full max-w-md p-6 sm:p-8 space-y-8 bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="text-center">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-auto max-h-24 w-auto max-w-[240px] mx-auto object-contain" />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">Guestly</h1>
            )}
            <p className="mt-2 text-sm text-gray-500">
              {isRegistering ? 'Daftar untuk membuat akun baru' : 'Masuk untuk mengelola acara dan tamu Anda'}
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleEmailAuth}>
            {loginError && (
              <div className="bg-red-50 text-red-600 p-3 rounded text-sm text-center">
                {loginError}
              </div>
            )}
            <div className="space-y-4">
              {isRegistering && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Nama Lengkap</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nama Anda"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">No. WhatsApp / HP</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="08123456789"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoggingIn ? 'Memproses...' : (isRegistering ? 'Daftar' : 'Masuk')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
            >
              {isRegistering ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', path: '/auth/login', icon: LayoutDashboard },
    { name: 'Clients', path: '/auth/login/clients', icon: Users, role: ['superadmin', 'partner'] },
    { name: 'Events', path: '/auth/login/events', icon: CalendarDays },
    { name: 'Approvals', path: '/auth/login/approvals', icon: FileText, role: ['superadmin', 'partner'] },
    { name: 'White Label', path: '/auth/login/settings', icon: Settings, role: ['superadmin', 'partner'] },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform bg-white flex flex-col border-r border-gray-200 transition-all duration-300 ease-in-out md:relative md:translate-x-0 md:flex-shrink-0",
          isSidebarCollapsed ? "md:w-20" : "md:w-64",
          isMobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-gray-200 md:border-b-0", isSidebarCollapsed ? "justify-center px-0" : "justify-between px-6")}>
          {!isSidebarCollapsed && (
            <div className="font-bold text-xl tracking-tight text-indigo-600 truncate">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-auto max-h-12 w-auto max-w-[140px] object-contain" />
              ) : (
                "Guestly"
              )}
            </div>
          )}
          {isSidebarCollapsed && settings?.faviconUrl && (
             <img src={settings.faviconUrl} alt="Logo" className="w-8 h-8 object-contain" />
          )}
          
          <button 
            className="hidden md:flex p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          
          <button 
            className="md:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <nav className="flex-1 flex flex-col gap-1 p-4 overflow-y-auto">
          {navItems.filter(item => !item.role || item.role.includes(appUser.role)).map((item) => (
            <Link
              key={item.name}
              to={item.path}
              title={isSidebarCollapsed ? item.name : undefined}
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isSidebarCollapsed ? "justify-center px-0" : "",
                location.pathname === item.path
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <item.icon className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
              {!isSidebarCollapsed && <span>{item.name}</span>}
            </Link>
          ))}

           {/* Informasi Layanan Dropdown */}
          <div className="mt-2">
            <button 
              onClick={() => {
                if (isSidebarCollapsed) {
                  setIsSidebarCollapsed(false);
                  setIsServiceInfoMenuOpen(true);
                } else {
                  setIsServiceInfoMenuOpen(!isServiceInfoMenuOpen);
                }
              }}
              title={isSidebarCollapsed ? "Informasi Layanan" : undefined}
              className={cn("w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors", isSidebarCollapsed ? "justify-center px-0" : "")}
            >
              <div className="flex items-center gap-3">
                 <ShoppingBag className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                 {!isSidebarCollapsed && <span>Informasi Layanan</span>}
              </div>
              {!isSidebarCollapsed && (isServiceInfoMenuOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
            </button>
            {!isSidebarCollapsed && isServiceInfoMenuOpen && (
              <div className="ml-8 mt-1 flex flex-col gap-1 space-y-1">
                 <Link
                   to="/auth/login/services/dashboard"
                   className={cn(
                     "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                     location.pathname === '/auth/login/services/dashboard' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                   )}
                 >
                   <div className="flex items-center gap-2">
                     <ShoppingBag className="h-4 w-4" />
                     Dashboard
                   </div>
                 </Link>
                 <Link
                   to="/auth/login/services/catalog"
                   className={cn(
                     "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                     location.pathname === '/auth/login/services/catalog' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                   )}
                 >
                   <div className="flex items-center gap-2">
                     <Package className="h-4 w-4" />
                     Layanan
                   </div>
                 </Link>
                 <Link
                   to="/auth/login/invoices/my"
                   className={cn(
                     "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                     location.pathname === '/auth/login/invoices/my' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                   )}
                 >
                   <div className="flex items-center gap-2">
                     <Receipt className="h-4 w-4" />
                     Invoice
                   </div>
                 </Link>
                 
                 {/* Conditionally display "Layanan Saya" based on active status/quotas */}
                 {!!(appUser && (
                    (appUser.eventQuota && appUser.eventQuota > 0) || 
                    (appUser.clientQuota && appUser.clientQuota > 0) || 
                    (appUser.guestQuota && appUser.guestQuota > 0) ||
                    appUser.activeUntil
                 )) && (
                   <Link
                     to="/auth/login/services/my"
                     className={cn(
                       "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                       location.pathname === '/auth/login/services/my' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                     )}
                   >
                     <div className="flex items-center gap-2">
                       <Briefcase className="h-4 w-4" />
                       Layanan Saya
                     </div>
                   </Link>
                 )}
              </div>
            )}
          </div>


          {appUser.role === 'superadmin' && (
             <>
               <div className="mt-2">
               <button 
                 onClick={() => {
                   if (isSidebarCollapsed) {
                     setIsSidebarCollapsed(false);
                     setIsUserMenuOpen(true);
                   } else {
                     setIsUserMenuOpen(!isUserMenuOpen);
                   }
                 }}
                 title={isSidebarCollapsed ? "Manajemen User" : undefined}
                 className={cn("w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors", isSidebarCollapsed ? "justify-center px-0" : "")}
               >
                 <div className="flex items-center gap-3">
                    <UserCog className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                    {!isSidebarCollapsed && <span>Manajemen User</span>}
                 </div>
                 {!isSidebarCollapsed && (isUserMenuOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
               </button>
               {!isSidebarCollapsed && isUserMenuOpen && (
                 <div className="ml-8 mt-1 flex flex-col gap-1 space-y-1">
                    <Link
                      to="/auth/login/users"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/auth/login/users' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      User
                    </Link>
                    <Link
                      to="/auth/login/roles"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/auth/login/roles' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      Role / Hak akses Custom
                    </Link>
                 </div>
               )}
             </div>

             <div className="mt-2">
               <button 
                 onClick={() => {
                   if (isSidebarCollapsed) {
                     setIsSidebarCollapsed(false);
                     setIsAdminPanelMenuOpen(true);
                   } else {
                     setIsAdminPanelMenuOpen(!isAdminPanelMenuOpen);
                   }
                 }}
                 title={isSidebarCollapsed ? "Admin Panel" : undefined}
                 className={cn("w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors", isSidebarCollapsed ? "justify-center px-0" : "")}
               >
                 <div className="flex items-center gap-3">
                    <Shield className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                    {!isSidebarCollapsed && <span>Admin Panel</span>}
                 </div>
                 {!isSidebarCollapsed && (isAdminPanelMenuOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
               </button>
               {!isSidebarCollapsed && isAdminPanelMenuOpen && (
                 <div className="ml-8 mt-1 flex flex-col gap-1 space-y-1">
                    <Link
                      to="/auth/login/admin/services"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/auth/login/admin/services' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Layanan
                      </div>
                    </Link>
                    <Link
                      to="/auth/login/admin/invoice"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/auth/login/admin/invoice' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Invoice
                      </div>
                    </Link>
                    <Link
                      to="/auth/login/admin/settings"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/auth/login/admin/settings' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Admin Setting
                      </div>
                    </Link>
                    <Link
                      to="/auth/login/admin/calendar"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/auth/login/admin/calendar' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Kalender Acara
                      </div>
                    </Link>
                    <Link
                      to="/auth/login/admin/wa-templates"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/auth/login/admin/wa-templates' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Template WA
                      </div>
                    </Link>
                 </div>
               )}
             </div>
             </>
          )}

        </nav>
        <div className="p-4 border-t border-gray-200">
          <Link
            to="/auth/login/changelog"
            onClick={() => setIsMobileMenuOpen(false)}
            title={isSidebarCollapsed ? "Changelog" : undefined}
            className={cn(
              "w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium mb-1 transition-colors",
              isSidebarCollapsed ? "justify-center px-0" : "",
              location.pathname === '/auth/login/changelog' ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <FileText className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
            {!isSidebarCollapsed && <span>Changelog</span>}
          </Link>
          <Link
            to="/auth/login/profile"
            title={isSidebarCollapsed ? "Profil Saya" : undefined}
            className={cn(
              "w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium mb-1 transition-colors",
              isSidebarCollapsed ? "justify-center px-0" : "",
              location.pathname === '/auth/login/profile' ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <User className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
            {!isSidebarCollapsed && <span>Profil Saya</span>}
          </Link>
          <button
            onClick={logout}
            title={isSidebarCollapsed ? "Keluar" : undefined}
            className={cn(
              "w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors",
              isSidebarCollapsed ? "justify-center px-0" : ""
            )}
          >
            <LogOut className={cn("flex-shrink-0", isSidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
            {!isSidebarCollapsed && <span>Keluar</span>}
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <div className="font-bold text-lg tracking-tight text-indigo-600">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-auto max-h-10 w-auto max-w-[140px] object-contain" />
            ) : (
              "Guestly"
            )}
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
          >
            <Menu className="h-6 w-6" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
