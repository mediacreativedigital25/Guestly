import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { LayoutDashboard, Users, CalendarDays, Settings, LogOut, FileText, ChevronDown, ChevronRight, UserCog, Menu, X, Shield, User, Briefcase, CreditCard, ShoppingBag, Package, Receipt } from 'lucide-react';
import { cn } from './lib/utils';
import { loginWithGoogle, auth } from './lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function AppLayout() {
  const { currentUser, appUser, loading, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPartnerMenuOpen, setIsPartnerMenuOpen] = useState(false);
  const [isAdminPanelMenuOpen, setIsAdminPanelMenuOpen] = useState(false);
  const [isServiceInfoMenuOpen, setIsServiceInfoMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setLoginError(error.message || 'Login gagal. Periksa kembali email dan password Anda.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Memuat...</div>;
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
            <p className="mt-2 text-sm text-gray-500">Masuk untuk mengelola acara dan tamu Anda</p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleEmailLogin}>
            {loginError && (
              <div className="bg-red-50 text-red-600 p-3 rounded text-sm text-center">
                {loginError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Email / Username</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="admin@example.com"
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
              {isLoggingIn ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Atau masuk dengan</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={loginWithGoogle}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                  />
                </svg>
                Google
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Clients', path: '/clients', icon: Users, role: ['superadmin', 'partner'] },
    { name: 'Events', path: '/events', icon: CalendarDays },
    { name: 'White Label', path: '/settings', icon: Settings, role: ['superadmin', 'partner'] },
    { name: 'Changelog', path: '/changelog', icon: FileText },
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
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-white flex flex-col border-r border-gray-200 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:flex-shrink-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200 md:border-b-0">
          <div className="font-bold text-xl tracking-tight text-indigo-600">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-auto max-h-12 w-auto max-w-[160px] object-contain" />
            ) : (
              "Guestly"
            )}
          </div>
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
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === item.path
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          ))}

           {/* Informasi Layanan Dropdown */}
          <div className="mt-2">
            <button 
              onClick={() => setIsServiceInfoMenuOpen(!isServiceInfoMenuOpen)}
              className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <div className="flex items-center gap-3">
                 <ShoppingBag className="h-5 w-5" />
                 Informasi Layanan
              </div>
              {isServiceInfoMenuOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {isServiceInfoMenuOpen && (
              <div className="ml-8 mt-1 flex flex-col gap-1 space-y-1">
                 <Link
                   to="/services/dashboard"
                   className={cn(
                     "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                     location.pathname === '/services/dashboard' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                   )}
                 >
                   <div className="flex items-center gap-2">
                     <ShoppingBag className="h-4 w-4" />
                     Dashboard
                   </div>
                 </Link>
                 <Link
                   to="/services/catalog"
                   className={cn(
                     "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                     location.pathname === '/services/catalog' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                   )}
                 >
                   <div className="flex items-center gap-2">
                     <Package className="h-4 w-4" />
                     Layanan
                   </div>
                 </Link>
                 <Link
                   to="/invoices/my"
                   className={cn(
                     "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                     location.pathname === '/invoices/my' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                   )}
                 >
                   <div className="flex items-center gap-2">
                     <Receipt className="h-4 w-4" />
                     Invoice
                   </div>
                 </Link>
                 <Link
                   to="/services/my"
                   className={cn(
                     "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                     location.pathname === '/services/my' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                   )}
                 >
                   <div className="flex items-center gap-2">
                     <Briefcase className="h-4 w-4" />
                     Layanan Saya
                   </div>
                 </Link>
              </div>
            )}
          </div>

          {appUser.role === 'superadmin' && (
             <>
               <div className="mt-2">
               <button 
                 onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                 className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
               >
                 <div className="flex items-center gap-3">
                    <UserCog className="h-5 w-5" />
                    Manajemen User
                 </div>
                 {isUserMenuOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
               </button>
               {isUserMenuOpen && (
                 <div className="ml-8 mt-1 flex flex-col gap-1 space-y-1">
                    <Link
                      to="/users"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/users' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      User
                    </Link>
                    <Link
                      to="/roles"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/roles' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      Role / Hak akses Custom
                    </Link>
                 </div>
               )}
             </div>

             <div className="mt-2">
               <button 
                 onClick={() => setIsAdminPanelMenuOpen(!isAdminPanelMenuOpen)}
                 className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
               >
                 <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5" />
                    Admin Panel
                 </div>
                 {isAdminPanelMenuOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
               </button>
               {isAdminPanelMenuOpen && (
                 <div className="ml-8 mt-1 flex flex-col gap-1 space-y-1">
                    <Link
                      to="/admin/profile"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/admin/profile' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Profil
                      </div>
                    </Link>
                    <Link
                      to="/admin/services"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/admin/services' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Layanan
                      </div>
                    </Link>
                    <Link
                      to="/admin/invoice"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/admin/invoice' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Invoice
                      </div>
                    </Link>
                    <Link
                      to="/admin/settings"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        location.pathname === '/admin/settings' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Admin Setting
                      </div>
                    </Link>
                 </div>
               )}
             </div>
             </>
          )}

        </nav>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Keluar
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
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
