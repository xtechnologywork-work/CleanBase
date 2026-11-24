import React, { Suspense, useMemo, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, Building2, CreditCard, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck } from 'lucide-react';
import '../../erp.css';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { isCloud } from '../../services/backend';
import { useDB } from '../../services/erp';
import { buildTenants } from '../../services/platform';
import { Brand } from '../shared/Brand';

export const SuperAdminLayout: React.FC = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const db = useDB();
    const [navOpen, setNavOpen] = useState(false);              // phones: the menu slides in
    const tenants = useMemo(() => buildTenants(db), [db]);
    const pending = tenants.filter(t => t.state === 'pending').length;
    const renew = tenants.filter(t => t.state === 'active' && t.license === 'expired').length;

    const items: { to: string; label: string; icon: React.ReactNode; badge?: number; tone?: string; end?: boolean }[] = [
        { to: '/admin/overview', label: 'Overview', icon: <LayoutDashboard size={17} /> },
        { to: '/admin/tenants', label: 'Tenants', icon: <Building2 size={17} />, badge: pending, tone: '#ff9f0a' },
        { to: '/admin/billing', label: 'Billing', icon: <CreditCard size={17} />, badge: renew, tone: 'var(--color-danger)' },
        { to: '/admin/analytics', label: 'Analytics', icon: <BarChart3 size={17} /> },
        { to: '/admin/audit-logs', label: 'Audit log', icon: <ShieldCheck size={17} /> },
        { to: '/admin/settings', label: 'Platform settings', icon: <Settings size={17} /> },
    ];

    const link = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.625rem 0.875rem',
        borderRadius: 'var(--radius-md)', fontSize: '0.9375rem', fontWeight: isActive ? 600 : 400, textDecoration: 'none',
        background: isActive ? 'var(--color-accent-light)' : 'transparent', color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        transition: 'background-color 0.2s var(--ease), color 0.2s var(--ease)',
    });

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            {navOpen && <div className="app-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
            <aside id="admin-nav" className={`app-side${navOpen ? ' open' : ''}`}
                onClick={e => { if ((e.target as HTMLElement).closest('a,button')) setNavOpen(false); }}
                style={{ width: 'var(--sidebar-width)', background: 'var(--color-bg-surface)', padding: '1.5rem 0.875rem', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '0 0.5rem', marginBottom: '1.75rem' }}>
                    <Brand size={22} />
                    <div className="tiny" style={{ marginTop: 6 }}>Platform admin</div>
                </div>
                <nav aria-label="Platform admin" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
                    {items.map(i => (
                        <NavLink key={i.to} to={i.to} style={link} end={i.end}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>{i.icon}{i.label}</span>
                            {!!i.badge && (
                                <span aria-label={`${i.badge} need attention`} style={{ background: i.tone, color: '#fff', fontSize: '0.75rem', fontWeight: 600, borderRadius: 9999, minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
                                    {i.badge}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>
                <div style={{ paddingTop: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', marginBottom: '0.5rem', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-body)' }}>
                        <span className="avatar-sq" style={{ borderRadius: '50%', background: 'var(--color-text-primary)' }}>{(user?.name || user?.email || 'S').charAt(0).toUpperCase()}</span>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{user?.name || 'Platform admin'}</div>
                            <div className="tiny" style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{user?.email}</div>
                        </div>
                    </div>
                    <button
                        onClick={() => { logout(); navigate('/login'); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', width: '100%', padding: '0.6rem 0.875rem', border: 0, borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--color-danger)', fontSize: '0.9375rem', fontWeight: 600, textAlign: 'left' }}
                        className="hover-bg-subtle"
                    >
                        <LogOut size={17} /> Sign out
                    </button>
                </div>
            </aside>

            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: 'var(--color-bg-body)' }}>
                <header className="app-header" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', flexShrink: 0, gap: '1rem' }}>
                    <button type="button" className="app-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open the menu" aria-controls="admin-nav" aria-expanded={navOpen}>
                        <Menu size={20} />
                    </button>
                    <span className="pill" style={{ background: isCloud ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', color: isCloud ? 'var(--color-success)' : 'var(--color-warning)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} aria-hidden="true" />
                        {isCloud ? 'Connected to Supabase' : 'Local demo mode'}
                    </span>
                    <span className="tiny" style={{ fontSize: '0.875rem' }}>{format(new Date(), 'EEEE d MMMM yyyy')}</span>
                </header>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 2rem 2.5rem' }}>
                    <Suspense fallback={<div role="status" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Loading...</div>}>
                        <Outlet />
                    </Suspense>
                </div>
            </main>
        </div>
    );
};
