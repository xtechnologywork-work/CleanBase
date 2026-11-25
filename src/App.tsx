import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { SuperAdminLayout } from './components/layout/SuperAdminLayout';
import { LoginPage } from './pages/LoginPage';

/** Each page is downloaded the first time it is opened, so the first screen loads fast (customers on the booking page never download the dashboard). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = <M extends Record<string, ComponentType<any>>>(load: () => Promise<M>, name: keyof M) =>
  lazy(() => load().then(m => ({ default: m[name] })));

const LandingPage = page(() => import('./pages/LandingPage'), 'LandingPage');
const RegisterPage = page(() => import('./pages/RegisterPage'), 'RegisterPage');
const TermsPage = page(() => import('./pages/LegalPages'), 'TermsPage');
const PrivacyPage = page(() => import('./pages/LegalPages'), 'PrivacyPage');
const ForgotPasswordPage = page(() => import('./pages/PasswordResetPages'), 'ForgotPasswordPage');
const ResetPasswordPage = page(() => import('./pages/PasswordResetPages'), 'ResetPasswordPage');
const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage');
const BookingsPage = page(() => import('./pages/BookingsPage'), 'BookingsPage');
const ClientsPage = page(() => import('./pages/ClientsPage'), 'ClientsPage');
const StaffPage = page(() => import('./pages/StaffPage'), 'StaffPage');
const ServicesPage = page(() => import('./pages/ServicesPage'), 'ServicesPage');
const PublicBookingPage = page(() => import('./pages/PublicBookingPage'), 'PublicBookingPage');
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage');
const LockedPage = page(() => import('./pages/LockedPage'), 'LockedPage');
const SuperAdminOverview = page(() => import('./pages/superadmin/SuperAdminOverview'), 'SuperAdminOverview');
const SuperAdminTenants = page(() => import('./pages/superadmin/SuperAdminTenants'), 'SuperAdminTenants');
const SuperAdminAnalyticsPage = page(() => import('./pages/superadmin/SuperAdminAnalytics'), 'SuperAdminAnalytics');
const SuperAdminAuditLogs = page(() => import('./pages/superadmin/SuperAdminAuditLogs'), 'SuperAdminAuditLogs');
const SuperAdminSettings = page(() => import('./pages/superadmin/SuperAdminSettings'), 'SuperAdminSettings');
const SuperAdminBilling = page(() => import('./pages/superadmin/SuperAdminBilling'), 'SuperAdminBilling');
const AnalyticsPage = page(() => import('./pages/AnalyticsPage'), 'AnalyticsPage');
const SubscriptionsPage = page(() => import('./pages/SubscriptionsPage'), 'SubscriptionsPage');
const ClientPortalPage = page(() => import('./pages/portal/ClientPortalPage'), 'ClientPortalPage');
const InvoicesPage = page(() => import('./pages/InvoicesPage'), 'InvoicesPage');
const ExpensesPage = page(() => import('./pages/ExpensesPage'), 'ExpensesPage');
const DispatchPage = page(() => import('./pages/DispatchPage'), 'DispatchPage');
const ResourcesPage = page(() => import('./pages/ResourcesPage'), 'ResourcesPage');
const TeamHubPage = page(() => import('./pages/TeamHubPage'), 'TeamHubPage');
const SalesPage = page(() => import('./pages/SalesPage'), 'SalesPage');
const QualityPage = page(() => import('./pages/QualityPage'), 'QualityPage');
const ClientProfilePage = page(() => import('./pages/ClientProfilePage'), 'ClientProfilePage');
const ReportsPage = page(() => import('./pages/ReportsPage'), 'ReportsPage');
const ActivityPage = page(() => import('./pages/ActivityPage'), 'ActivityPage');
const BusinessPage = page(() => import('./pages/BusinessPage'), 'BusinessPage');
const AiManagerPage = page(() => import('./pages/AiManagerPage'), 'AiManagerPage');
const ReviewPage = page(() => import('./pages/ReviewPage'), 'ReviewPage');
const DriverApp = page(() => import('./pages/driver/DriverApp'), 'DriverApp');
const DriverLogin = page(() => import('./pages/driver/DriverLogin'), 'DriverLogin');
const DriverBoardPage = page(() => import('./pages/DriverBoardPage'), 'DriverBoardPage');

const PageLoading = () => (
  <div role="status" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.9375rem' }}>Loading...</div>
);

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SyncStatus } from './components/shared/SyncStatus';
import { SheetKeys } from './components/shared/SheetKeys';
import { can, firstAllowed } from './services/permissions';
import { DRIVER_COMPANY_KEY } from './services/driverAccounts';
import type { PageKey } from './services/permissions';

const ProtectedRoute = ({ children, requireRole, forbidRole, allowLocked }: { children: React.ReactNode, requireRole?: 'superadmin', forbidRole?: 'superadmin', allowLocked?: boolean }) => {
  const { user, isAuthenticated, isImpersonating } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // The platform admin may open a company that is still waiting for approval or suspended, to help it
  if (user?.status === 'locked' && !allowLocked && !isImpersonating) return <Navigate to="/locked" replace />;
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

/** The driver app. A signed-out driver goes back to the sign in page of their company (remembered on this phone), never to the owner's login. */
const DriverGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isAuthenticated, isImpersonating } = useAuth();
  let saved = '';
  try { saved = localStorage.getItem(DRIVER_COMPANY_KEY) || ''; } catch { /* storage blocked */ }
  const loginFor = (c: string) => (c ? `/driver/login?c=${encodeURIComponent(c)}` : '/login');
  if (!isAuthenticated) return <Navigate to={loginFor(saved)} replace />;
  if (user?.role === 'superadmin') return <Navigate to="/admin" replace />;
  if (user?.status === 'locked' && !isImpersonating) return <Navigate to={user.role === 'driver' ? loginFor(user.companyId || saved) : '/locked'} replace />;
  return <Gate page="drive">{children}</Gate>;
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
        <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/book" element={<PublicBookingPage />} />
          <Route path="/store/:companyId" element={<PublicBookingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/portal" element={<ClientPortalPage />} />
          <Route path="/review/:token" element={<ReviewPage />} />
          <Route path="/driver/login" element={<DriverLogin />} />
          <Route path="/driver" element={<DriverGate><DriverApp /></DriverGate>} />
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
            <Route path="drivers" element={<Gate page="drivers"><DriverBoardPage /></Gate>} />
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
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
