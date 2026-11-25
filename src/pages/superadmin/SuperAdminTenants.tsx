import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { isCloud } from '../../services/backend';
import { logAudit } from '../../services/mockDb';
import { dayLabel, downloadCsv, fmt0, useDB } from '../../services/erp';
import {
    approveTenant, buildTenants, deletePlatformPayment, deleteTenant, extendLicense, licenseText, PLAN_DEFAULT_MRR, PLAN_LABEL,
    platformTotals, provisionTenant, suspendTenant, updateTenant,
} from '../../services/platform';
import type { Plan, Tenant } from '../../services/platform';
import { Field, Kpi, Modal, PageHeader, Panel, Pill, Table, Tabs } from '../../components/shared/ui';
import { planChoices, SELLABLE } from '../../services/plans';
import { PaymentModal } from '../../components/superadmin/PaymentModal';
import { PasswordModal } from '../../components/superadmin/PasswordModal';
import type { User } from '../../types';

type Tab = 'all' | 'active' | 'pending' | 'suspended' | 'expiring';
type Sort = 'newest' | 'mrr' | 'activity';

const STATE_PILL: Record<Tenant['state'], { tone?: 'good' | 'bad' | 'warn' | 'info'; label: string }> = {
    active: { tone: 'good', label: 'Active' }, pending: { tone: 'warn', label: 'Waiting for approval' },
    suspended: { tone: 'bad', label: 'Suspended' }, 'no-owner': { tone: 'bad', label: 'No owner' },
};
export const LicensePill: React.FC<{ t: Tenant }> = ({ t }) => (
    <Pill tone={t.license === 'ok' ? 'good' : t.license === 'soon' ? 'warn' : t.license === 'expired' ? 'bad' : undefined}>{licenseText(t)}</Pill>
);

export const SuperAdminTenants: React.FC = () => {
    const navigate = useNavigate();
    const { impersonateTenant } = useAuth();
    const db = useDB();
    const tenants = useMemo(() => buildTenants(db), [db]);
    const totals = platformTotals(tenants, db);

    const [tab, setTab] = useState<Tab>('all');
    const [q, setQ] = useState('');
    const [plan, setPlan] = useState<'all' | Plan>('all');
    const [sort, setSort] = useState<Sort>('newest');
    const [openId, setOpenId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [copied, setCopied] = useState('');

    const rows = useMemo(() => tenants
        .filter(t => tab === 'all' || (tab === 'expiring' ? t.state === 'active' && (t.license === 'soon' || t.license === 'expired') : t.state === tab))
        .filter(t => plan === 'all' || t.plan === plan)
        .filter(t => !q || `${t.company.name} ${t.company.id} ${t.owner?.email || ''} ${t.owner?.name || ''}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => sort === 'mrr' ? b.mrr - a.mrr
            : sort === 'activity' ? (b.usage.lastActivity || '').localeCompare(a.usage.lastActivity || '')
            : b.company.createdAt.localeCompare(a.company.createdAt)),
        [tenants, tab, plan, q, sort]);

    const enter = (t: Tenant) => {
        if (!t.owner) return alert('This company has no owner account to open.');
        impersonateTenant(t.owner);
        logAudit(`Opened the workspace of ${t.company.name}`, t.company.name, 'security');
        navigate('/app');
    };
    const copy = (text: string) => { void navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 1500); };
    const open = tenants.find(t => t.company.id === openId) || null;

    return (
        <div className="pg">
            <PageHeader title="Tenants" subtitle="Every cleaning company on the platform: approve access, set plans and license dates, watch usage, and step into a workspace to help.">
                <button className="btn btn-secondary" onClick={() => downloadCsv('tenants.csv', rows.map(t => ({
                    Company: t.company.name, CompanyId: t.company.id, Plan: PLAN_LABEL[t.plan], MRR: t.mrr, Owner: t.owner?.name || '', Email: t.owner?.email || '',
                    Status: STATE_PILL[t.state].label, LicenseUntil: t.licenseUntil || '', Staff: t.usage.staff, Clients: t.usage.clients, Jobs30d: t.usage.jobs30d,
                    Revenue30d: t.usage.revenue30d, Created: t.company.createdAt.slice(0, 10),
                })))}>Export CSV</button>
                <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Provision customer</button>
            </PageHeader>

            <div className="kpis">
                <Kpi label="Tenants" value={totals.total} hint={`${totals.active} active`} />
                <Kpi label="Waiting for approval" value={totals.pending} tone={totals.pending ? 'warn' : undefined} hint={totals.pending ? 'They cannot use the app yet' : 'Nobody waiting'} />
                <Kpi label="Monthly recurring revenue" value={fmt0(totals.mrr)} unit="QAR" hint={`${fmt0(totals.arr)} QAR a year`} />
                <Kpi label="Licenses to renew" value={totals.expiring + totals.expired} tone={totals.expired ? 'bad' : totals.expiring ? 'warn' : undefined}
                    hint={`${totals.expired} expired, ${totals.expiring} within 7 days`} />
            </div>

            <Panel actions={<>
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--color-text-tertiary)' }} />
                    <input className="input-field" style={{ paddingLeft: 30 }} placeholder="Search company, owner or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search tenants" />
                </div>
                <select className="input-field" value={plan} onChange={e => setPlan(e.target.value as typeof plan)} aria-label="Plan">
                    <option value="all">All plans</option>{(Object.keys(PLAN_LABEL) as Plan[]).map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                </select>
                <select className="input-field" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort">
                    <option value="newest">Newest first</option><option value="mrr">Highest MRR</option><option value="activity">Most recent activity</option>
                </select>
            </>}>
                <div style={{ marginBottom: 14 }}>
                    <Tabs value={tab} onChange={setTab} tabs={[
                        { id: 'all', label: `All (${tenants.length})` }, { id: 'active', label: `Active (${totals.active})` },
                        { id: 'pending', label: `Waiting (${totals.pending})` }, { id: 'suspended', label: `Suspended (${totals.suspended})` },
                        { id: 'expiring', label: `Renewals (${totals.expiring + totals.expired})` },
                    ]} />
                </div>
                <Table
                    rows={rows.map(t => ({ id: t.company.id, t }))}
                    empty={tenants.length ? 'No tenants match these filters.' : 'No tenants yet. Provision a customer or wait for people to sign up.'}
                    onRowClick={r => setOpenId(r.id)}
                    cols={[
                        { key: 'c', header: 'Company', render: ({ t }) => (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="avatar-sq">{(t.company.name || '?').charAt(0).toUpperCase()}</span>
                                <div><b style={{ fontWeight: 600 }}>{t.company.name || 'Unnamed company'}</b><div className="tiny">{t.company.id}</div></div>
                            </div>) },
                        { key: 'p', header: 'Plan', render: ({ t }) => <div><Pill tone="info">{PLAN_LABEL[t.plan]}</Pill><div className="tiny" style={{ marginTop: 4 }}>{fmt0(t.mrr)} QAR / month</div></div> },
                        { key: 'o', header: 'Owner', render: ({ t }) => t.owner ? (
                            <div>
                                <div>{t.owner.name}</div>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', marginLeft: -6 }} aria-label={`Copy ${t.owner.email}`}
                                    onClick={e => { e.stopPropagation(); copy(t.owner!.email); }}>
                                    {t.owner.email} {copied === t.owner.email ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                                {t.company.phone && <a className="tiny" href={`tel:${t.company.phone}`} onClick={e => e.stopPropagation()} style={{ display: 'block' }}>{t.company.phone}</a>}
                            </div>) : <span className="tiny">No owner</span> },
                        { key: 'u', header: 'Usage', render: ({ t }) => (
                            <div className="tiny" style={{ color: 'var(--color-text-secondary)' }}>
                                {t.usage.staff} staff · {t.usage.clients} clients<br />{t.usage.jobs30d} jobs, {fmt0(t.usage.revenue30d)} QAR (30 days)
                            </div>) },
                        { key: 's', header: 'Status', render: ({ t }) => <Pill tone={STATE_PILL[t.state].tone}>{STATE_PILL[t.state].label}</Pill> },
                        { key: 'l', header: 'License', render: ({ t }) => <LicensePill t={t} /> },
                        { key: 'a', header: '', align: 'r', render: ({ t }) => (
                            <span style={{ display: 'inline-flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                                {t.state === 'active'
                                    ? <button className="btn btn-secondary btn-sm" onClick={() => { if (confirm(`Suspend ${t.company.name}? Everyone in this company loses access.`)) suspendTenant(t.company.id); }}>Suspend</button>
                                    : t.state !== 'no-owner' && <button className="btn btn-primary btn-sm" onClick={() => approveTenant(t.company.id)}>{t.state === 'pending' ? 'Approve' : 'Reactivate'}</button>}
                                <button className="btn btn-secondary btn-sm" onClick={() => enter(t)} aria-label={`Open workspace of ${t.company.name}`}><Eye size={14} /> Open</button>
                            </span>) },
                    ]}
                />
            </Panel>

            <Modal open={!!open} onClose={() => setOpenId(null)} title={open?.company.name || 'Tenant'} width={820}>
                {open && <TenantDetail key={open.company.id} t={open} tenants={tenants} onEnter={() => enter(open)} onDeleted={() => setOpenId(null)} />}
            </Modal>
            <Provision open={adding} onClose={() => setAdding(false)} />
        </div>
    );
};

/* ------------------------------ detail ------------------------------ */

const TenantDetail: React.FC<{ t: Tenant; tenants: Tenant[]; onEnter: () => void; onDeleted: () => void }> = ({ t, tenants, onEnter, onDeleted }) => {
    const [name, setName] = useState(t.company.name || '');
    const [ownerName, setOwnerName] = useState(t.owner?.name || '');
    const [plan, setPlan] = useState<Plan>(t.plan);
    const [mrr, setMrr] = useState(String(t.mrr));
    const [license, setLicense] = useState(t.licenseUntil || '');
    const [notes, setNotes] = useState(t.notes);
    const [saved, setSaved] = useState(false);
    const [paying, setPaying] = useState(false);
    const [confirmName, setConfirmName] = useState('');
    const [pwFor, setPwFor] = useState<User | null>(null);

    const save = () => {
        if (!name.trim()) return alert('The company needs a name.');
        updateTenant(t.company.id, {
            name: name.trim(), subscriptionPlan: plan, monthlyRevenue: Number(mrr) || 0, licenseUntil: license || undefined, adminNotes: notes,
        }, ownerName);
        setSaved(true); setTimeout(() => setSaved(false), 2000);
    };
    const stat = (label: string, v: React.ReactNode) => <div className="kpi" style={{ background: 'var(--color-bg-body)', padding: '0.9rem 1rem' }}><div className="kpi-l"><span>{label}</span></div><div className="kpi-v" style={{ fontSize: '1.25rem' }}>{v}</div></div>;

    return (
        <div className="stack">
            <div className="row" style={{ border: 0, padding: 0 }}>
                <div><div className="tiny">{t.company.id} · Joined {dayLabel(t.company.createdAt.slice(0, 10))}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <Pill tone={STATE_PILL[t.state].tone}>{STATE_PILL[t.state].label}</Pill><LicensePill t={t} />
                    </div></div>
                <div className="toolbar">
                    {t.state === 'active'
                        ? <button className="btn btn-secondary" onClick={() => { if (confirm(`Suspend ${t.company.name}? Everyone in this company loses access.`)) suspendTenant(t.company.id); }}>Suspend</button>
                        : t.state !== 'no-owner' && <button className="btn btn-primary" onClick={() => approveTenant(t.company.id)}>{t.state === 'pending' ? 'Approve' : 'Reactivate'}</button>}
                    <button className="btn btn-secondary" onClick={onEnter}><Eye size={15} /> Open workspace</button>
                </div>
            </div>

            <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))' }}>
                {stat('Staff', t.usage.staff)}{stat('Clients', t.usage.clients)}{stat('Bookings', t.usage.bookings)}
                {stat('Jobs, 30 days', t.usage.jobs30d)}{stat('Revenue, 30 days', `${fmt0(t.usage.revenue30d)}`)}{stat('Lifetime GMV', `${fmt0(t.usage.gmvAll)}`)}
            </div>
            <div className="tiny">Last activity: {t.usage.lastActivity ? format(parseISO(t.usage.lastActivity), 'd MMM yyyy, HH:mm') : 'none yet'}</div>

            <div>
                <b style={{ fontWeight: 600 }}>Plan, license and details</b>
                <div className="frow" style={{ marginTop: 10 }}>
                    <Field label="Company name" half><input value={name} onChange={e => setName(e.target.value)} /></Field>
                    <Field label="Owner name" half><input value={ownerName} onChange={e => setOwnerName(e.target.value)} disabled={!t.owner} /></Field>
                    <Field label="Owner email" half hint="Changed by the owner from their own account"><input value={t.owner?.email || ''} readOnly /></Field>
                    <Field label="Contact number" half hint="Given at sign up"><input value={t.company.phone || 'Not given'} readOnly /></Field>
                    <Field label="Plan" half>
                        <select value={plan} onChange={e => { const p = e.target.value as Plan; setPlan(p); setMrr(String(PLAN_DEFAULT_MRR[p])); }}>
                            {planChoices(t.plan).map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                        </select>
                    </Field>
                    <Field label="Monthly price (QAR)" half><input type="number" step="any" value={mrr} onChange={e => setMrr(e.target.value)} /></Field>
                    <Field label="License valid until" half hint="After this date the tenant is flagged for renewal">
                        <input type="date" value={license} onChange={e => setLicense(e.target.value)} />
                    </Field>
                    <div className="fld"><div className="toolbar">
                        {[1, 3, 12].map(m => <button key={m} type="button" className="btn btn-secondary btn-sm" onClick={() => setLicense(extendLicense(t.company.id, m))}>+{m} month{m > 1 ? 's' : ''}</button>)}
                        <span className="tiny">Quick extend from today or the current end date</span>
                    </div></div>
                    <Field label="Private notes"><textarea value={notes} placeholder="Only you see this: contract terms, contact preferences, reminders" onChange={e => setNotes(e.target.value)} /></Field>
                </div>
                <button className="btn btn-primary" onClick={save}>{saved ? 'Saved' : 'Save changes'}</button>
            </div>

            <div>
                <b style={{ fontWeight: 600 }}>Team ({t.team.length})</b>
                <Table rows={t.team} empty="No people in this company." cols={[
                    { key: 'n', header: 'Name', render: u => u.name }, { key: 'e', header: 'Email', render: u => u.email },
                    { key: 'r', header: 'Role', render: u => <span style={{ textTransform: 'capitalize' }}>{u.role.replace('companyadmin', 'owner')}</span> },
                    { key: 's', header: 'Access', render: u => <Pill tone={u.status === 'active' || !u.status ? 'good' : 'bad'}>{u.status === 'locked' ? 'Locked' : 'Active'}</Pill> },
                    { key: 'pw', header: '', align: 'r', render: u => <button className="btn btn-secondary btn-sm" onClick={() => setPwFor(u)}>Set password</button> },
                ]} />
            </div>

            <div>
                <div className="row" style={{ border: 0, padding: 0 }}>
                    <b style={{ fontWeight: 600 }}>Payments ({t.payments.length}, {fmt0(t.paidTotal)} QAR in total)</b>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPaying(true)}><Plus size={13} /> Record payment</button>
                </div>
                <Table rows={t.payments} empty="No payments recorded yet." cols={[
                    { key: 'd', header: 'Date', render: p => dayLabel(p.date) }, { key: 'a', header: 'Amount', align: 'r', render: p => `${fmt0(p.amount)} QAR` },
                    { key: 'm', header: 'Method', render: p => p.method }, { key: 'mo', header: 'Months', align: 'r', render: p => p.months || '-' },
                    { key: 'r', header: 'Reference', render: p => p.reference || '-' },
                    { key: 'x', header: '', align: 'r', render: p => <button className="btn btn-ghost btn-sm" aria-label="Delete payment" onClick={() => { if (confirm('Delete this payment record? The license date is not changed.')) deletePlatformPayment(p.id); }}><Trash2 size={13} /></button> },
                ]} />
            </div>

            <div style={{ background: 'var(--color-danger-bg)', padding: '1rem', borderRadius: 14 }}>
                <b style={{ fontWeight: 600 }} className="tone-bad">Delete this tenant</b>
                <div className="tiny" style={{ margin: '4px 0 10px' }}>Removes the company, its people and all of its bookings, clients, invoices and other records. Photos in storage stay. This cannot be undone. Type the company name to confirm.</div>
                <div className="toolbar">
                    <input className="input-field" value={confirmName} placeholder={t.company.name} onChange={e => setConfirmName(e.target.value)} aria-label="Type the company name to confirm" />
                    <button className="btn btn-danger" disabled={confirmName.trim() !== (t.company.name || '').trim() || !confirmName.trim()} onClick={() => { deleteTenant(t.company.id); onDeleted(); }}>Delete forever</button>
                </div>
            </div>
            <PaymentModal open={paying} onClose={() => setPaying(false)} tenants={tenants} tenantId={t.company.id} />
            <PasswordModal person={pwFor} onClose={() => setPwFor(null)} />
        </div>
    );
};

/* ------------------------------ provision ------------------------------ */

const Provision: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const db = useDB();
    const [f, setF] = useState({ companyName: '', ownerName: '', email: '', plan: 'pro' as Plan, mrr: '500', trialDays: '14' });
    const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const email = f.email.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('Enter a valid email address.');
        if (db.users.some(u => u.email.toLowerCase() === email)) return alert('That email already belongs to someone on the platform.');
        provisionTenant({ companyName: f.companyName, ownerName: f.ownerName, email, plan: f.plan, mrr: Number(f.mrr) || 0, trialDays: Number(f.trialDays) || 0 });
        if (isCloud) alert('Tenant created. Ask the owner to open the sign-in page, choose Create an account, tap "My company invited me", and sign up with this email. They are linked to this company automatically.');
        setF({ companyName: '', ownerName: '', email: '', plan: 'pro', mrr: '500', trialDays: '14' });
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} title="Provision a customer" width={560}>
            <form onSubmit={submit} className="stack">
                <div className="frow">
                    <Field label="Company name"><input value={f.companyName} onChange={e => set('companyName', e.target.value)} required /></Field>
                    <Field label="Owner name" half><input value={f.ownerName} onChange={e => set('ownerName', e.target.value)} required /></Field>
                    <Field label="Owner email" half><input type="email" value={f.email} onChange={e => set('email', e.target.value)} required /></Field>
                    <Field label="Plan" half>
                        <select value={f.plan} onChange={e => { const p = e.target.value as Plan; setF(prev => ({ ...prev, plan: p, mrr: String(PLAN_DEFAULT_MRR[p]) })); }}>
                            {SELLABLE.map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                        </select>
                    </Field>
                    <Field label="Monthly price (QAR)" half><input type="number" step="any" value={f.mrr} onChange={e => set('mrr', e.target.value)} /></Field>
                    <Field label="License length (days)" half hint="License ends after this many days"><input type="number" min="0" value={f.trialDays} onChange={e => set('trialDays', e.target.value)} /></Field>
                </div>
                <div className="tiny">{isCloud ? 'The owner then signs up with this email to get access.' : 'Demo mode: the owner can sign in with this email and any password.'}</div>
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Create tenant</button>
                </div>
            </form>
        </Modal>
    );
};

