import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { SuperAdminLayout } from './components/layout/SuperAdminLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { BookingsPage } from './pages/BookingsPage';
import { ClientsPage } from './pages/ClientsPage';
import { StaffPage } from './pages/StaffPage';
import { ServicesPage } from './pages/ServicesPage';
import { PublicBookingPage } from './pages/PublicBookingPage';
import { SettingsPage } from './pages/SettingsPage';
import { LockedPage } from './pages/LockedPage';
import { SuperAdminOverview } from './pages/superadmin/SuperAdminOverview';
import { SuperAdminTenants } from './pages/superadmin/SuperAdminTenants';
import { SuperAdminAnalytics as SuperAdminAnalyticsPage } from './pages/superadmin/SuperAdminAnalytics';
import { SuperAdminAuditLogs } from './pages/superadmin/SuperAdminAuditLogs';
import { SuperAdminSettings } from './pages/superadmin/SuperAdminSettings';
import { SuperAdminBilling } from './pages/superadmin/SuperAdminBilling';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { ClientPortalPage } from './pages/portal/ClientPortalPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { DispatchPage } from './pages/DispatchPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { TeamHubPage } from './pages/TeamHubPage';
import { SalesPage } from './pages/SalesPage';
import { QualityPage } from './pages/QualityPage';
import { ClientProfilePage } from './pages/ClientProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { ActivityPage } from './pages/ActivityPage';
import { BusinessPage } from './pages/BusinessPage';
import { AiManagerPage } from './pages/AiManagerPage';
import { ReviewPage } from './pages/ReviewPage';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SyncStatus } from './components/shared/SyncStatus';
import { SheetKeys } from './components/shared/SheetKeys';
import { can, firstAllowed } from './services/permissions';
import type { PageKey } from './services/permissions';

const ProtectedRoute = ({ children, requireRole, forbidRole, allowLocked }: { children: React.ReactNode, requireRole?: 'superadmin', forbidRole?: 'superadmin', allowLocked?: boolean }) => {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (user?.status === 'locked' && !allowLocked) return <Navigate to="/locked" replace />;
  if (user?.status === 'active' && allowLocked) return <Navigate to={user?.role === 'superadmin' ? '/admin' : '/app'} replace />;

  if (requireRole && user?.role !== requireRole) return <Navigate to="/app" replace />;
  if (forbidRole && user?.role === forbidRole) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

/** Page-level permission gate. Roles and their pages live in services/permissions.ts. */
const Gate = ({ page, children }: { page: PageKey, children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!can(user?.role, page)) return <Navigate to={firstAllowed(user?.role)} replace />;
  return <>{children}</>;
};

const AppIndexRoute = () => {
  const { user } = useAuth();
  if (!can(user?.role, 'overview')) return <Navigate to={firstAllowed(user?.role)} replace />;
  return <DashboardPage />;
};

function App() {
  return (
    <AuthProvider>
      <SyncStatus />
      <SheetKeys />
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/book" element={<PublicBookingPage />} />
          <Route path="/store/:companyId" element={<PublicBookingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/portal" element={<ClientPortalPage />} />
          <Route path="/review/:token" element={<ReviewPage />} />
          <Route path="/locked" element={<ProtectedRoute allowLocked><LockedPage /></ProtectedRoute>} />

          {/* Super Admin Route */}
          <Route path="/admin" element={<ProtectedRoute requireRole="superadmin"><SuperAdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/overview" replace />} />
            <Route path="overview" element={<SuperAdminOverview />} />
            <Route path="tenants" element={<SuperAdminTenants />} />
            <Route path="billing" element={<SuperAdminBilling />} />
            <Route path="analytics" element={<SuperAdminAnalyticsPage />} />
            <Route path="audit-logs" element={<SuperAdminAuditLogs />} />
            <Route path="settings" element={<SuperAdminSettings />} />
            <Route path="*" element={<Navigate to="/admin/overview" replace />} />
          </Route>

          {/* Company dashboard */}
          <Route path="/app" element={<ProtectedRoute forbidRole="superadmin"><Layout /></ProtectedRoute>}>
            <Route index element={<AppIndexRoute />} />
            <Route path="ai" element={<Gate page="ai"><AiManagerPage /></Gate>} />
            <Route path="analytics" element={<Gate page="analytics"><AnalyticsPage /></Gate>} />
            <Route path="bookings" element={<Gate page="bookings"><BookingsPage /></Gate>} />
            <Route path="dispatch" element={<Gate page="dispatch"><DispatchPage /></Gate>} />
            <Route path="subscriptions" element={<Gate page="subscriptions"><SubscriptionsPage /></Gate>} />
            <Route path="clients" element={<Gate page="clients"><ClientsPage /></Gate>} />
            <Route path="clients/:id" element={<Gate page="clients"><ClientProfilePage /></Gate>} />
            <Route path="sales" element={<Gate page="sales"><SalesPage /></Gate>} />
            <Route path="quality" element={<Gate page="quality"><QualityPage /></Gate>} />
            <Route path="staff" element={<Gate page="staff"><StaffPage /></Gate>} />
            <Route path="team" element={<Gate page="team"><TeamHubPage /></Gate>} />
            <Route path="services" element={<Gate page="services"><ServicesPage /></Gate>} />
            <Route path="resources" element={<Gate page="resources"><ResourcesPage /></Gate>} />
            <Route path="invoices" element={<Gate page="invoices"><InvoicesPage /></Gate>} />
            <Route path="expenses" element={<Gate page="expenses"><ExpensesPage /></Gate>} />
            <Route path="reports" element={<Gate page="reports"><ReportsPage /></Gate>} />
            <Route path="activity" element={<Gate page="activity"><ActivityPage /></Gate>} />
            <Route path="business" element={<Gate page="business"><BusinessPage /></Gate>} />
            <Route path="settings" element={<Gate page="settings"><SettingsPage /></Gate>} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
