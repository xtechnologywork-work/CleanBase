import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    LayoutDashboard, CalendarDays, Users, Briefcase, Settings, UsersRound, Bell, BarChart3, Repeat, LogOut,
    Truck, Target, Star, Sparkles, ClipboardCheck, Receipt, Wallet, FileBarChart, Package, History, SlidersHorizontal
} from 'lucide-react';
import { can } from '../../services/permissions';
import type { PageKey } from '../../services/permissions';
import { getDB, saveDB } from '../../services/mockDb';
import { dayLabel, useDB } from '../../services/erp';
import type { Notification, Company } from '../../types';
import { Brand } from '../shared/Brand';
import { planName } from '../../services/plans';

const NAV_GROUPS: { label: string; items: { key: PageKey; to: string; label: string; title: string; icon: React.ReactNode }[] }[] = [
    { label: 'Today', items: [
        { key: 'overview', to: '/app', label: 'Overview', title: 'Overview', icon: <LayoutDashboard size={16} /> },
        { key: 'ai', to: '/app/ai', label: 'AI Manager', title: 'AI Manager', icon: <Sparkles size={16} /> },
        { key: 'dispatch', to: '/app/dispatch', label: 'Dispatch board', title: 'Dispatch board', icon: <Truck size={16} /> },
        { key: 'bookings', to: '/app/bookings', label: 'Bookings', title: 'Bookings', icon: <CalendarDays size={16} /> },
    ] },
    { label: 'Customers', items: [
        { key: 'clients', to: '/app/clients', label: 'Clients', title: 'Clients', icon: <Users size={16} /> },
        { key: 'sales', to: '/app/sales', label: 'Leads and quotes', title: 'Leads and quotes', icon: <Target size={16} /> },
        { key: 'subscriptions', to: '/app/subscriptions', label: 'Contracts', title: 'Contracts', icon: <Repeat size={16} /> },
        { key: 'quality', to: '/app/quality', label: 'Quality', title: 'Quality', icon: <Star size={16} /> },
    ] },
    { label: 'Team', items: [
        { key: 'staff', to: '/app/staff', label: 'Cleaners', title: 'Cleaners', icon: <UsersRound size={16} /> },
        { key: 'team', to: '/app/team', label: 'Team hub', title: 'Team hub', icon: <ClipboardCheck size={16} /> },
        { key: 'services', to: '/app/services', label: 'Services', title: 'Services', icon: <Briefcase size={16} /> },
        { key: 'resources', to: '/app/resources', label: 'Zones and supplies', title: 'Zones, vehicles and supplies', icon: <Package size={16} /> },
    ] },
    { label: 'Money', items: [
        { key: 'invoices', to: '/app/invoices', label: 'Invoices', title: 'Invoices and payments', icon: <Receipt size={16} /> },
        { key: 'expenses', to: '/app/expenses', label: 'Expenses', title: 'Expenses', icon: <Wallet size={16} /> },
        { key: 'reports', to: '/app/reports', label: 'Reports', title: 'Reports', icon: <FileBarChart size={16} /> },
        { key: 'analytics', to: '/app/analytics', label: 'Analytics', title: 'Analytics', icon: <BarChart3 size={16} /> },
    ] },
    { label: 'Business', items: [
        { key: 'activity', to: '/app/activity', label: 'Activity log', title: 'Activity log', icon: <History size={16} /> },
        { key: 'business', to: '/app/business', label: 'Business rules', title: 'Business rules', icon: <SlidersHorizontal size={16} /> },
    ] },
];

export const Layout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout, isImpersonating, stopImpersonating } = useAuth();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const live = useDB();
    const broadcast = live.platformSettings?.broadcast;
    const maintenance = !!live.platformSettings?.maintenanceMode;
    const liveCompany = live.companies.find(c => c.id === user?.companyId);
    const licenseDays = liveCompany?.licenseUntil ? Math.round((new Date(liveCompany.licenseUntil).getTime() - Date.now()) / 86400000) : null;
    const [company, setCompany] = useState<Company | null>(null);

    const handleReturnToSuperAdmin = () => {
        stopImpersonating();
        navigate('/admin/tenants');
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    useEffect(() => {
        const db = getDB();
        if (user?.companyId) {
            const foundCo = db.companies.find(c => c.id === user.companyId);
            setCompany(foundCo || null);

            const loadNotifications = () => {
                const currentDb = getDB();
                setNotifications((currentDb.notifications || []).filter(n => n.companyId === user.companyId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            };
            loadNotifications();
            const interval = setInterval(loadNotifications, 5000);
            return () => clearInterval(interval);
        }
    }, [user?.companyId]);

    const markAsRead = (id: string) => {
        const db = getDB();
        const notification = db.notifications?.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            saveDB(db);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    const navItemStyle = (path: string) => {
        const active = path === '/app' ? location.pathname === '/app' : location.pathname === path || location.pathname.startsWith(path + '/');
        return {
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            fontWeight: active ? 600 : 400,
            fontSize: '0.875rem',
            transition: 'all 0.15s ease',
            textDecoration: 'none',
            backgroundColor: active ? 'var(--color-accent-light)' : 'transparent',
            color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)'
        };
    };

    // Breadcrumb title
    const getPageTitle = () => {
        const p = location.pathname;
        if (p === '/app/settings') return 'Settings and team';
        if (p.startsWith('/app/clients/')) return 'Client profile';
        const hit = NAV_GROUPS.flatMap(g => g.items).find(i => i.to === p);
        return hit?.title || 'Dashboard';
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Impersonation Banner */}
            {isImpersonating && (
                <div style={{
                    backgroundColor: '#1d1d1f', color: '#ededf0', padding: '0.45rem 1.25rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    zIndex: 100, borderBottom: '1px solid #333336', fontSize: '0.75rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ backgroundColor: '#0066cc', color: '#FFF', padding: '0.1rem 0.6rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.75rem' }}>Impersonating</span>
                        <span>Viewing workspace as <strong>{company?.name || user?.name}</strong> ({user?.email})</span>
                    </div>
                    <button
                        onClick={handleReturnToSuperAdmin}
                        style={{
                            backgroundColor: '#333336', color: '#FFF', border: 'none', borderRadius: '4px',
                            padding: '0.25rem 0.65rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        Exit Impersonation →
                    </button>
                </div>
            )}

            {/* Broadcast Banner */}
            {broadcast && broadcast.active && (
                <div style={{
                    backgroundColor: broadcast.type === 'alert' ? '#fdeceb' : broadcast.type === 'promo' ? '#f5f5f7' : '#e8f1fb',
                    color: broadcast.type === 'alert' ? '#a30011' : broadcast.type === 'promo' ? '#1d1d1f' : '#0058b0',
                    padding: '0.4rem 1.25rem', fontSize: '0.75rem', borderBottom: '1px solid var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500
                }}>
                    <span>{broadcast.message}</span>
                </div>
            )}

            {/* Maintenance and license notices */}
            {maintenance && !isImpersonating && (
                <div role="status" style={{ backgroundColor: '#fff1d6', color: '#7a3d00', padding: '0.45rem 1.25rem', fontSize: '0.8125rem', textAlign: 'center', fontWeight: 500 }}>
                    CleanBase is in maintenance mode. You can keep working, but some features may be slow for a short while.
                </div>
            )}
            {user?.role === 'companyadmin' && licenseDays !== null && licenseDays <= 7 && (
                <div role="status" style={{ backgroundColor: licenseDays < 0 ? '#fdeceb' : '#fff1d6', color: licenseDays < 0 ? '#a30011' : '#7a3d00', padding: '0.45rem 1.25rem', fontSize: '0.8125rem', textAlign: 'center', fontWeight: 500 }}>
                    {licenseDays < 0
                        ? `Your license ended on ${dayLabel(liveCompany!.licenseUntil!)}. Contact CleanBase to renew so access is not interrupted.`
                        : `Your license ends on ${dayLabel(liveCompany!.licenseUntil!)} (${licenseDays} day${licenseDays === 1 ? '' : 's'} left). Contact CleanBase to renew.`}
                </div>
            )}

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Minimalist SaaS Sidebar */}
                <aside style={{
                    width: 'var(--sidebar-width)',
                    backgroundColor: 'var(--color-bg-surface)',
                    padding: '1.5rem 0.875rem',
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0
                }}>
                    {/* Brand & Workspace Pill */}
                    <div style={{ padding: '0 0.5rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                            <Brand size={20} />
                        </div>

                        {/* Workspace Selector / Company Name */}
                        <div style={{
                            padding: '0.55rem 0.75rem', backgroundColor: 'var(--color-bg-body)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {company?.name || 'My Cleaning Co'}
                                </div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>
                                    {planName(company?.subscriptionPlan)}
                                </div>
                            </div>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-success)', flexShrink: 0 }} />
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav aria-label="Main" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, overflowY: 'auto' }}>
                        {NAV_GROUPS.map((g, gi) => {
                            const visible = g.items.filter(i => can(user?.role, i.key));
                            if (!visible.length) return null;
                            return (
                                <React.Fragment key={g.label}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-tertiary)', padding: gi === 0 ? '0.25rem 0.75rem 0.25rem' : '0.875rem 0.75rem 0.25rem' }}>
                                        {g.label}
                                    </div>
                                    {visible.map(i => (
                                        <Link key={i.key} to={i.to} style={navItemStyle(i.to)} aria-current={navItemStyle(i.to).fontWeight === 600 ? 'page' : undefined}>
                                            {i.icon}
                                            <span>{i.label}</span>
                                        </Link>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </nav>

                    {/* Footer / Account */}
                    <div style={{ marginTop: 'auto', paddingTop: '0.875rem' }}>
                        {can(user?.role, 'settings') && (
                            <Link to="/app/settings" style={{ ...navItemStyle('/app/settings'), marginBottom: '0.25rem' }}>
                                <Settings size={16} />
                                <span>Settings</span>
                            </Link>
                        )}

                        <button
                            onClick={handleLogout}
                            style={{
                                ...navItemStyle('#'),
                                cursor: 'pointer', width: '100%', border: 'none', textAlign: 'left',
                                color: 'var(--color-text-tertiary)'
                            }}
                            className="hover-bg-subtle"
                        >
                            <LogOut size={16} />
                            <span>Sign out</span>
                        </button>
                    </div>
                </aside>

                {/* Main Content Viewport */}
                <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', backgroundColor: 'var(--color-bg-body)' }}>
                    {/* Header */}
                    <header style={{
                        height: '64px',
                        backgroundColor: 'var(--color-bg-body)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 1.75rem',
                        flexShrink: 0
                    }}>
                        {/* Breadcrumbs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                            <span style={{ color: 'var(--color-text-tertiary)' }}>{company?.name || 'Workspace'}</span>
                            <span style={{ color: 'var(--color-text-tertiary)' }}>/</span>
                            <span style={{ fontWeight: 600, fontSize: '1.0625rem', letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>{getPageTitle()}</span>
                        </div>

                        {/* Right Area: Notifications & User */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {/* Notification Bell */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowNotifications(!showNotifications)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.35rem', display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}
                                    title="Notifications"
                                >
                                    <Bell size={18} />
                                    {unreadCount > 0 && (
                                        <span style={{
                                            position: 'absolute', top: '2px', right: '2px',
                                            backgroundColor: 'var(--color-accent)', width: '7px', height: '7px',
                                            borderRadius: '50%'
                                        }} />
                                    )}
                                </button>

                                {/* Notification Menu */}
                                {showNotifications && (
                                    <div className="card" style={{
                                        position: 'absolute', top: '100%', right: '0', width: '300px', maxHeight: '360px',
                                        overflowY: 'auto', zIndex: 50, padding: '0.875rem', marginTop: '0.5rem',
                                        boxShadow: 'var(--shadow-lg)'
                                    }}>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>
                                            Notifications
                                        </div>
                                        {notifications.length === 0 ? (
                                            <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem', textAlign: 'center', padding: '1rem 0' }}>No notifications</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {notifications.map(n => (
                                                    <div
                                                        key={n.id}
                                                        onClick={() => markAsRead(n.id)}
                                                        style={{
                                                            padding: '0.5rem', borderRadius: 'var(--radius-xs)',
                                                            backgroundColor: n.read ? 'transparent' : 'var(--color-bg-subtle)',
                                                            cursor: 'pointer', fontSize: '0.75rem'
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: n.read ? 500 : 600, color: 'var(--color-text-primary)' }}>{n.title}</div>
                                                        <div style={{ color: 'var(--color-text-secondary)', marginTop: '0.15rem' }}>{n.message}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            

                            {/* User Profile Info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    backgroundColor: 'var(--color-primary)', color: '#FFF',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontWeight: 600
                                }}>
                                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                    {user?.name}
                                </span>
                            </div>
                        </div>
                    </header>

                    {/* Page Content Viewport */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem' }}>
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};
