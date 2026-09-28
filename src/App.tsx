/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { SettingsProvider } from './SettingsContext';
import AppLayout from './AppLayout';
import Dashboard from './pages/Dashboard';
import EventsList from './pages/EventsList';
import EventDetails from './pages/EventDetails';
import ClientsList from './pages/ClientsList';
import WhiteLabelSettings from './pages/WhiteLabelSettings';
import UsersList from './pages/UsersList';
import BusinessesList from './pages/BusinessesList';
import RolesSettings from './pages/RolesSettings';
import RSVP from './pages/RSVP';
import PublicRSVP from './pages/PublicRSVP';
import Scanner from './pages/Scanner';
import Changelog from './pages/Changelog';
import Approvals from './pages/Approvals';
import PublicQR from './pages/PublicQR';
import SalesPage from './pages/SalesPage';

import GreetingScreen from './pages/GreetingScreen';
import UserProfile from './pages/UserProfile';
import AdminServices from './pages/admin/AdminServices';
import AdminInvoice from './pages/admin/AdminInvoice';
import AdminSettings from './pages/admin/AdminSettings';
import AdminCalendar from './pages/admin/AdminCalendar';
import AdminWATemplates from './pages/admin/AdminWATemplates';
import AdminEInviteTemplates from './pages/admin/AdminEInviteTemplates';
import AdminGreetingTemplates from './pages/admin/AdminGreetingTemplates';
import MediaLibrary from './pages/admin/MediaLibrary';
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
          <Route path="/" element={<SalesPage />} />
          <Route path="/auth/login" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="events" element={<EventsList />} />
            <Route path="events/add" element={<EventsList />} />
            <Route path="events/:eventId/edit" element={<EventsList />} />
            <Route path="events/:eventId/tables" element={<EventsList />} />
            <Route path="events/:eventId" element={<EventDetails />} />
            <Route path="events/:eventId/guests/add" element={<EventDetails />} />
            <Route path="events/:eventId/guests/:guestId/edit" element={<EventDetails />} />
            <Route path="events/:eventId/scan" element={<Scanner />} />
            <Route path="clients" element={<ClientsList />} />
            <Route path="clients/add" element={<ClientsList />} />
            <Route path="clients/:clientId/edit" element={<ClientsList />} />
            <Route path="clients/:clientId/view" element={<ClientsList />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="settings" element={<WhiteLabelSettings />} />
            <Route path="businesses" element={<BusinessesList />} />
            <Route path="businesses/add" element={<BusinessesList />} />
            <Route path="businesses/:businessId/edit" element={<BusinessesList />} />
            <Route path="users" element={<UsersList />} />
            <Route path="users/add" element={<UsersList />} />
            <Route path="users/:userId/edit" element={<UsersList />} />
            <Route path="roles" element={<RolesSettings />} />
            <Route path="changelog" element={<Changelog />} />
            
            {/* Informasi Layanan Routes */}
            <Route path="services/dashboard" element={<ServicesDashboard />} />
            <Route path="services/catalog" element={<ServicesCatalog />} />
            <Route path="services/checkout/:serviceId" element={<ServiceCheckout />} />
            <Route path="services/my" element={<MyServices />} />
            <Route path="invoices/my" element={<MyInvoices />} />

            <Route path="profile" element={<UserProfile />} />
            <Route path="admin/services" element={<AdminServices />} />
            <Route path="admin/invoice" element={<AdminInvoice />} />
            <Route path="admin/settings" element={<AdminSettings />} />
            <Route path="admin/calendar" element={<AdminCalendar />} />
            <Route path="admin/wa-templates" element={<AdminWATemplates />} />
            <Route path="admin/e-invitation-templates" element={<AdminEInviteTemplates />} />
            <Route path="admin/greeting-templates" element={<AdminGreetingTemplates />} />
            <Route path="media" element={<MediaLibrary />} />
          </Route>
          {/* Public Route */}
          <Route path="/rsvp/:eventId/:ticketCode" element={<RSVP />} />
          <Route path="/public/rsvp/:eventId" element={<PublicRSVP />} />
          <Route path="/public/qr" element={<PublicQR />} />
          <Route path="/events/:eventId/greeting" element={<GreetingScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </SettingsProvider>
  );
}
