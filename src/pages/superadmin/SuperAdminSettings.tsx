import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { DB_KEY, isCloud } from '../../services/backend';
import { getDB, logAudit, saveDB, seedRealisticDemoData } from '../../services/mockDb';
import { getSyncStats, hydrate } from '../../services/replicate';
import { useDB } from '../../services/erp';
import type { PlatformBroadcast, PlatformSettings } from '../../types';
import { Field, PageHeader, Panel, Pill } from '../../components/shared/ui';

function patchSettings(patch: Partial<PlatformSettings>) {
    const db = getDB();
    db.platformSettings = { platformName: 'CleanBase', supportEmail: '', currency: 'QAR', maintenanceMode: false, ...(db.platformSettings || {}), ...patch };
    saveDB(db);
}

export const SuperAdminSettings: React.FC = () => {
    const { user, changePassword } = useAuth();
    const db = useDB();
    const ps = db.platformSettings;
    const [notice, setNotice] = useState('');
    const say = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 3500); };

    const [identity, setIdentity] = useState({ platformName: '', supportEmail: '', currency: 'QAR', maintenanceMode: false });
    const [bMessage, setBMessage] = useState('');
    const [bType, setBType] = useState<PlatformBroadcast['type']>('info');
    const [bActive, setBActive] = useState(false);
    const [admin, setAdmin] = useState({ name: user?.name || '', password: '', confirm: '' });
    const [syncing, setSyncing] = useState(false);

    // Fill the forms once when the settings first arrive.
    const loaded = Boolean(ps);
    useEffect(() => {
        if (!ps) return;
        setIdentity({ platformName: ps.platformName || '', supportEmail: ps.supportEmail || '', currency: ps.currency || 'QAR', maintenanceMode: !!ps.maintenanceMode });
        setBMessage(ps.broadcast?.message || ''); setBType(ps.broadcast?.type || 'info'); setBActive(!!ps.broadcast?.active);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded]);

    const saveIdentity = (e: React.FormEvent) => {
        e.preventDefault();
        patchSettings(identity);
        logAudit(`Platform settings saved${identity.maintenanceMode ? ' (maintenance mode ON)' : ''}`, 'Platform settings', identity.maintenanceMode ? 'warning' : 'info');
        say('Platform settings saved.');
    };
    const saveBroadcast = (e: React.FormEvent) => {
        e.preventDefault();
        patchSettings({ broadcast: { id: `bcast-${Date.now()}`, message: bMessage.trim(), type: bType, active: bActive && !!bMessage.trim(), createdAt: new Date().toISOString() } });
        logAudit(bActive ? 'Published a platform announcement' : 'Turned the platform announcement off', 'Announcement', 'info');
        say(bActive ? 'Announcement is live for every tenant.' : 'Announcement saved and hidden.');
    };
    const saveAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (admin.password && admin.password.length < 8) return alert('Choose a password with at least 8 characters.');
        if (admin.password !== admin.confirm) return alert('The two passwords do not match.');
        const d = getDB();
        const me = d.users.find(u => u.id === user?.id);
        if (me && admin.name.trim()) { me.name = admin.name.trim(); saveDB(d); }
        if (admin.password && !(await changePassword(admin.password))) return;
        logAudit('Updated own account details', 'Security', 'security');
        setAdmin(a => ({ ...a, password: '', confirm: '' }));
        say(admin.password ? 'Name and password updated.' : 'Name updated.');
    };

    const stats = getSyncStats();
    const resync = async () => {
        setSyncing(true);
        try { await hydrate(); say('Reloaded everything from the database.'); } catch (e) { alert(`Could not reach the database: ${(e as Error).message}`); }
        setSyncing(false);
    };
    const backup = () => {
        const blob = new Blob([JSON.stringify(getDB(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `cleanbase-backup-${format(new Date(), 'yyyy-MM-dd')}.json`; a.click(); URL.revokeObjectURL(url);
        logAudit('Downloaded a full data backup', 'Backup', 'info');
    };
    const preview = { info: ['#e8f1fb', '#0a4f9b'], warning: ['#fff1d6', '#7a3d00'], promo: ['#f5f5f7', '#1d1d1f'], alert: ['#fdeceb', '#a30011'] }[bType];

    return (
        <div className="pg">
            <PageHeader title="Platform settings" subtitle="Your platform's identity, the announcement every tenant sees, your own account, and the health of the database connection.">
                {notice && <Pill tone="good">{notice}</Pill>}
            </PageHeader>

            <div className="grid2e">
                <Panel title="Platform" subtitle="Shown in emails and on tenant screens">
                    <form onSubmit={saveIdentity} className="stack">
                        <div className="frow">
                            <Field label="Platform name" half><input value={identity.platformName} onChange={e => setIdentity({ ...identity, platformName: e.target.value })} /></Field>
                            <Field label="Currency" half><input value={identity.currency} onChange={e => setIdentity({ ...identity, currency: e.target.value })} /></Field>
                            <Field label="Support email"><input type="email" value={identity.supportEmail} onChange={e => setIdentity({ ...identity, supportEmail: e.target.value })} /></Field>
                            <Field label="Maintenance mode" hint="Shows a notice to every tenant. Nobody is locked out.">
                                <select value={identity.maintenanceMode ? 'on' : 'off'} onChange={e => setIdentity({ ...identity, maintenanceMode: e.target.value === 'on' })}>
                                    <option value="off">Off</option><option value="on">On: show a maintenance notice</option>
                                </select>
                            </Field>
                        </div>
                        <div><button className="btn btn-primary" type="submit">Save</button></div>
                    </form>
                </Panel>

                <Panel title="Announcement" subtitle="A banner at the top of every tenant dashboard">
                    <form onSubmit={saveBroadcast} className="stack">
                        <div className="frow">
                            <Field label="Message"><textarea value={bMessage} maxLength={240} onChange={e => setBMessage(e.target.value)} placeholder="Scheduled maintenance on Friday from 2 to 3 AM" /></Field>
                            <Field label="Style" half>
                                <select value={bType} onChange={e => setBType(e.target.value as PlatformBroadcast['type'])}>
                                    <option value="info">Information</option><option value="warning">Warning</option><option value="alert">Alert</option><option value="promo">Plain</option>
                                </select>
                            </Field>
                            <Field label="Visible" half><select value={bActive ? 'yes' : 'no'} onChange={e => setBActive(e.target.value === 'yes')}><option value="yes">Show to tenants</option><option value="no">Hidden</option></select></Field>
                        </div>
                        {bMessage && <div style={{ background: preview[0], color: preview[1], padding: '0.5rem 1rem', borderRadius: 10, fontSize: '0.8125rem', textAlign: 'center' }} aria-label="Preview">{bMessage}</div>}
                        <div><button className="btn btn-primary" type="submit">Save announcement</button></div>
                    </form>
                </Panel>
            </div>

            <div className="grid2e">
                <Panel title="Your account" subtitle={user?.email}>
                    <form onSubmit={saveAdmin} className="stack">
                        <div className="frow">
                            <Field label="Display name"><input value={admin.name} onChange={e => setAdmin({ ...admin, name: e.target.value })} /></Field>
                            <Field label="New password" half hint="At least 8 characters. Leave empty to keep the current one."><input type="password" autoComplete="new-password" value={admin.password} onChange={e => setAdmin({ ...admin, password: e.target.value })} /></Field>
                            <Field label="Repeat new password" half><input type="password" autoComplete="new-password" value={admin.confirm} onChange={e => setAdmin({ ...admin, confirm: e.target.value })} /></Field>
                        </div>
                        <div><button className="btn btn-primary" type="submit">Update account</button></div>
                    </form>
                </Panel>

                <Panel title="Database connection" subtitle={isCloud ? 'Live data from Supabase' : 'Local demo mode: data lives in this browser only'}>
                    <div className="stack">
                        <div className="row" style={{ padding: 0 }}><span>Mode</span><Pill tone={isCloud ? 'good' : 'warn'}>{isCloud ? 'Cloud' : 'Local demo'}</Pill></div>
                        <div className="row" style={{ padding: 0 }}><span>Live updates</span><Pill tone={stats.realtime ? 'good' : undefined}>{stats.realtime ? 'Connected' : isCloud ? 'Not connected' : 'Not used'}</Pill></div>
                        <div className="row" style={{ padding: 0 }}><span>Changes waiting to save</span><b className={stats.pending ? 'tone-warn' : ''} style={{ fontWeight: 600 }}>{stats.pending}</b></div>
                        <div className="row" style={{ padding: 0 }}><span>Last sync</span><span className="muted">{stats.lastSyncAt ? format(new Date(stats.lastSyncAt), 'HH:mm:ss') : 'Not yet'}</span></div>
                        <div className="tiny">Rows this browser holds: {['companies', 'users', 'bookings', 'clients', 'staff', 'invoices', 'platformPayments', 'auditLogs'].map(k => `${k} ${stats.counts[k] ?? 0}`).join(', ')}</div>
                        <div className="toolbar">
                            {isCloud && <button className="btn btn-secondary" onClick={resync} disabled={syncing}>{syncing ? 'Reloading...' : 'Reload from database'}</button>}
                            <button className="btn btn-secondary" onClick={backup}>Download backup (JSON)</button>
                        </div>
                    </div>
                </Panel>
            </div>

            {!isCloud && (
                <Panel title="Demo tools" subtitle="Only in local demo mode">
                    <div className="toolbar">
                        <button className="btn btn-secondary" onClick={() => { seedRealisticDemoData(); say('Added demo tenants.'); }}>Add demo tenants</button>
                        <button className="btn btn-danger" onClick={() => { if (confirm('Erase all local demo data and start fresh?')) { localStorage.removeItem(DB_KEY); window.location.reload(); } }}>Erase demo data</button>
                    </div>
                </Panel>
            )}
        </div>
    );
};
