import React, { useState } from 'react';
import { Copy, Eye, EyeOff, ExternalLink, MessageCircle, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fmt, logActivity, mutateDB, useDB } from '../services/erp';
import { storeLink } from '../services/store';
import { bookingLinkMessage, whatsappShareUrl } from '../services/bookingMessages';
import type { Service } from '../types';
import { Empty, Field, Kpi, Modal, PageHeader, Panel, Pill } from '../components/shared/ui';
import { StoreInsights } from '../components/store/StoreInsights';

const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};
interface Form { name: string; description: string; price: string; hours: string; minutes: string; online: boolean }
const blank: Form = { name: '', description: '', price: '', hours: '', minutes: '', online: true };

export const ServicesPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const actor = user?.name || 'Owner';
    const canEdit = user?.role === 'superadmin' || user?.role === 'companyadmin' || user?.role === 'manager';
    const db = useDB();
    const [q, setQ] = useState('');
    const [editing, setEditing] = useState<Service | 'new' | null>(null);
    const [copied, setCopied] = useState(false);

    const services = db.services.filter(s => s.companyId === companyId).sort((a, b) => a.name.localeCompare(b.name));
    const shown = services.filter(s => s.online !== false);
    const requests = db.bookings.filter(b => b.companyId === companyId && b.status === 'pending').length;
    const link = storeLink(companyId);
    const company = db.companies.find(c => c.id === companyId);
    const list = services.filter(s => `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()));

    const copy = () => { void navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); };
    const share = () => window.open(whatsappShareUrl(bookingLinkMessage(company?.name || '', link)), '_blank', 'noopener');

    const toggle = (s: Service) => {
        mutateDB(d => { const x = d.services.find(r => r.id === s.id); if (x) x.online = s.online === false; });
        logActivity(companyId, actor, s.online === false ? 'Showed a service in the booking store' : 'Hid a service from the booking store', s.name);
    };
    const remove = (s: Service) => {
        const used = db.bookings.some(b => b.serviceId === s.id) || db.subscriptions.some(x => x.serviceId === s.id);
        if (used) { alert(`${s.name} is used by bookings or subscriptions, so it cannot be deleted. Hide it from the store instead.`); return; }
        if (!confirm(`Delete ${s.name}?`)) return;
        mutateDB(d => { d.services = d.services.filter(r => r.id !== s.id); });
        logActivity(companyId, actor, 'Deleted a service', s.name);
    };

    return (
        <div className="pg">
            <PageHeader title="Services" subtitle="What you sell, at what price and how long it takes. Shown services appear in your online booking store.">
                {canEdit && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> Add service</button>}
            </PageHeader>

            <Panel title="Your booking store" subtitle="Send this link to clients. They see your services, choose a cleaner and a free time, and send a request you accept under Bookings.">
                <div className="stack">
                    <div style={{ background: 'var(--color-bg-body)', borderRadius: 12, padding: '0.75rem 1rem', wordBreak: 'break-all', fontWeight: 600 }}>{link}</div>
                    <div className="toolbar">
                        <button className="btn btn-primary btn-sm" onClick={copy}><Copy size={14} /> {copied ? 'Copied' : 'Copy link'}</button>
                        <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open store</a>
                        <button className="btn btn-secondary btn-sm" onClick={share}><MessageCircle size={14} /> Share on WhatsApp</button>
                    </div>
                </div>
            </Panel>

            {companyId && <StoreInsights companyId={companyId} />}

            <div className="kpis">
                <Kpi label="Services" value={services.length} />
                <Kpi label="Shown in the store" value={shown.length} tone={services.length && !shown.length ? 'warn' : undefined} hint={shown.length ? `${services.length - shown.length} hidden` : 'Clients see nothing to book'} />
                <Kpi label="Requests waiting" value={requests} tone={requests ? 'warn' : undefined} hint={requests ? 'Accept or decline them under Bookings' : 'Nothing to answer'} />
                <Kpi label="Average price" value={fmt(services.length ? services.reduce((a, s) => a + s.price, 0) / services.length : 0, 0)} unit="QAR" />
            </div>

            <Panel title="All services" actions={<div className="toolbar"><Search size={15} color="var(--color-text-tertiary)" /><input className="input-field" placeholder="Search services" value={q} onChange={e => setQ(e.target.value)} aria-label="Search services" /></div>}>
                {list.length === 0 ? <Empty>{services.length ? 'No service matches your search.' : 'No services yet. Add the cleanings you offer, with a price and a duration.'}</Empty> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                        {list.map(s => (
                            <div key={s.id} className="issue" style={{ gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <div><b>{s.name}</b><div className="tiny">{s.description || 'No description'}</div></div>
                                    <div style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(s.price)} <span className="tiny">QAR</span></div>
                                </div>
                                <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                                    <span className="tiny">{formatDuration(s.durationMinutes)}</span>
                                    {s.online === false ? <Pill>Hidden from store</Pill> : <Pill tone="good">In the store</Pill>}
                                </div>
                                {canEdit && (
                                    <div className="toolbar">
                                        <button className="btn btn-secondary btn-sm" onClick={() => toggle(s)}>{s.online === false ? <><Eye size={14} /> Show in store</> : <><EyeOff size={14} /> Hide</>}</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}><Pencil size={14} /> Edit</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => remove(s)} aria-label={`Delete ${s.name}`}><Trash2 size={14} /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            {editing && <ServiceForm key={editing === 'new' ? 'new' : editing.id} existing={editing === 'new' ? undefined : editing} companyId={companyId} actor={actor} onClose={() => setEditing(null)} />}
        </div>
    );
};

const ServiceForm: React.FC<{ existing?: Service; companyId: string; actor: string; onClose: () => void }> = ({ existing, companyId, actor, onClose }) => {
    const [f, setF] = useState<Form>(() => existing ? {
        name: existing.name, description: existing.description || '', price: String(existing.price),
        hours: String(Math.floor(existing.durationMinutes / 60) || ''), minutes: String(existing.durationMinutes % 60 || ''), online: existing.online !== false,
    } : blank);
    const [err, setErr] = useState('');
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const price = Number(f.price), total = (parseInt(f.hours || '0', 10) || 0) * 60 + (parseInt(f.minutes || '0', 10) || 0);
        if (f.name.trim().length < 2) return setErr('Give the service a name.');
        if (f.price === '' || !Number.isFinite(price) || price < 0) return setErr('Enter the price, for example 120.');
        if (total < 15 || total > 24 * 60) return setErr('The duration must be between 15 minutes and 24 hours.');
        const data = { name: f.name.trim(), description: f.description.trim(), price, durationMinutes: total, online: f.online };
        mutateDB(d => {
            if (existing) { const x = d.services.find(s => s.id === existing.id); if (x) Object.assign(x, data); }
            else d.services.push({ id: `service-${Date.now()}`, companyId, createdAt: new Date().toISOString(), ...data });
        });
        logActivity(companyId, actor, existing ? 'Updated a service' : 'Added a service', data.name);
        onClose();
    };
    return (
        <Modal open title={existing ? 'Edit service' : 'Add service'} onClose={onClose}>
            <form className="stack" onSubmit={submit}>
                <div className="frow">
                    <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="Deep cleaning" /></Field>
                    <Field label="Description" hint="Shown to clients in the booking store"><textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="What is included" /></Field>
                    <Field label="Price, QAR" half><input type="number" min="0" step="any" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} required /></Field>
                    <Field label="Hours" half><input type="number" min="0" max="24" value={f.hours} onChange={e => setF({ ...f, hours: e.target.value })} placeholder="2" /></Field>
                    <Field label="Minutes" half><input type="number" min="0" max="59" step="5" value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} placeholder="30" /></Field>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9375rem' }}>
                    <input type="checkbox" checked={f.online} onChange={e => setF({ ...f, online: e.target.checked })} /> Show in the online booking store
                </label>
                <div className="tiny">The duration decides which times clients can pick: a 5 hour service only fits where the cleaner is free for 5 hours.</div>
                {err && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{err}</p>}
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save</button>
                </div>
            </form>
        </Modal>
    );
};
