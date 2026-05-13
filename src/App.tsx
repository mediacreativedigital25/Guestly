/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { SettingsProvider } from './SettingsContext';
import AppLayout from './AppLayout';
import Dashboard from './pages/Dashboard';
import EventsList from './pages/EventsList';
import EventDetails from './pages/EventDetails';
import ClientsList from './pages/ClientsList';
import WhiteLabelSettings from './pages/WhiteLabelSettings';
import UsersList from './pages/UsersList';
import RolesSettings from './pages/RolesSettings';
import RSVP from './pages/RSVP';
import Scanner from './pages/Scanner';
import Changelog from './pages/Changelog';

import GreetingScreen from './pages/GreetingScreen';
import AdminProfile from './pages/admin/AdminProfile';
import AdminServices from './pages/admin/AdminServices';
import AdminInvoice from './pages/admin/AdminInvoice';
import AdminSettings from './pages/admin/AdminSettings';
import ServicesCatalog from './pages/services/ServicesCatalog';
import MyServices from './pages/services/MyServices';
import ServiceCheckout from './pages/services/ServiceCheckout';
import MyInvoices from './pages/invoices/MyInvoices';

import ServicesDashboard from './pages/services/ServicesDashboard';

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="events" element={<EventsList />} />
            <Route path="events/:eventId" element={<EventDetails />} />
            <Route path="events/:eventId/scan" element={<Scanner />} />
            <Route path="clients" element={<ClientsList />} />
            <Route path="settings" element={<WhiteLabelSettings />} />
            <Route path="users" element={<UsersList />} />
            <Route path="roles" element={<RolesSettings />} />
            <Route path="changelog" element={<Changelog />} />
            
            {/* Informasi Layanan Routes */}
            <Route path="services/dashboard" element={<ServicesDashboard />} />
            <Route path="services/catalog" element={<ServicesCatalog />} />
            <Route path="services/checkout/:serviceId" element={<ServiceCheckout />} />
            <Route path="services/my" element={<MyServices />} />
            <Route path="invoices/my" element={<MyInvoices />} />

            <Route path="admin/profile" element={<AdminProfile />} />
            <Route path="admin/services" element={<AdminServices />} />
            <Route path="admin/invoice" element={<AdminInvoice />} />
            <Route path="admin/settings" element={<AdminSettings />} />
          </Route>
          {/* Public Route */}
          <Route path="/rsvp/:eventId/:ticketCode" element={<RSVP />} />
          <Route path="/events/:eventId/greeting" element={<GreetingScreen />} />
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </SettingsProvider>
  );
}
