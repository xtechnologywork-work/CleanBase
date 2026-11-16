import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, MessageCircle, Phone, Plus, Trash2 } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import {
    addItem, dayLabel, fmt, fmt0, invoiceState, invoiceTotal, invoicePaid, staffName, uid, updateItem, useCollection, useDB,
    clientLifetimePaid,
} from '../services/erp';
import type { ClientMeta } from '../services/erp';
import { Empty, Field, Kpi, PageHeader, Panel, Pill, Table, Tabs } from '../components/shared/ui';

export const ClientProfilePage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const db = useDB();
    const { items: metas } = useCollection('clientMeta', companyId);
    const { items: invoices } = useCollection('invoices', companyId);
    const { items: payments } = useCollection('payments', companyId);
    const { items: complaints } = useCollection('complaints', companyId);
    const [tab, setTab] = useState<'history' | 'properties' | 'notes' | 'billing'>('history');
    const [prop, setProp] = useState({ label: '', address: '', notes: '' });

    const client = db.clients.find(c => c.id === id && c.companyId === companyId);
    if (!client) return <div className="pg"><Empty>Client not found. <Link to="/app/clients">Back to clients</Link></Empty></div>;

    const meta: ClientMeta | undefined = metas.find(m => m.clientId === client.id);
    const saveMeta = (patch: Partial<ClientMeta>) => {
        if (meta) updateItem('clientMeta', meta.id, patch);
        else addItem('clientMeta', companyId, { clientId: client.id, properties: [], notes: '', tags: '', ...patch });
    };

    const bookings = db.bookings.filter(b => b.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date));
    const done = bookings.filter(b => b.status === 'completed');
    const lifetime = clientLifetimePaid(companyId, client.id);
    const mine = invoices.filter(i => i.clientId === client.id);
    const balance = mine.reduce((s, i) => ['sent', 'partial', 'overdue'].includes(invoiceState(i, payments)) ? s + invoiceTotal(i) - invoicePaid(i, payments) : s, 0)
        + done.filter(b => b.paymentStatus !== 'paid' && !mine.some(i => i.bookingIds.includes(b.id))).reduce((s, b) => s + b.price, 0);
    const dates = done.map(b => b.date).sort();
    const interval = dates.length > 1 ? differenceInDays(parseISO(dates[dates.length - 1]), parseISO(dates[0])) / (dates.length - 1) : 0;
    const svc = (sid: string) => db.services.find(s => s.id === sid)?.name || 'Service';
    const next = bookings.filter(b => b.date >= new Date().toISOString().slice(0, 10) && b.status !== 'cancelled' && b.status !== 'completed').sort((a, b) => a.date.localeCompare(b.date))[0];

    return (
        <div className="pg">
            <PageHeader title={client.name} subtitle={`${client.address || 'No address'} · ${client.phone || 'No phone'}`}>
                <button className="btn btn-secondary" onClick={() => navigate('/app/clients')}><ArrowLeft size={15} /> Clients</button>
                {client.phone && <a className="btn btn-secondary" href={`tel:${client.phone}`}><Phone size={15} /> Call</a>}
                {client.phone && <a className="btn btn-primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}><MessageCircle size={15} /> WhatsApp</a>}
            </PageHeader>

            <div className="kpis">
                <Kpi label="Lifetime value" value={fmt0(lifetime)} unit="QAR" hint={`paid, ${done.length} completed jobs`} />
                <Kpi label="Owes you" value={fmt0(balance)} unit="QAR" tone={balance > 0 ? 'warn' : undefined} />
                <Kpi label="Books every" value={interval ? Math.round(interval) : '-'} unit={interval ? 'days' : undefined} hint={dates.length ? `Last job ${dayLabel(dates[dates.length - 1])}` : 'No jobs yet'} />
                <Kpi label="Next visit" value={next ? dayLabel(next.date) : 'None'} hint={next ? `${next.time} · ${svc(next.serviceId)}` : 'Nothing scheduled'} />
            </div>

            {meta?.tags && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{meta.tags.split(',').map(t => <Pill key={t} tone="info">{t.trim()}</Pill>)}</div>}

            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'history', label: 'Job history' }, { id: 'billing', label: 'Invoices' }, { id: 'properties', label: 'Properties' }, { id: 'notes', label: 'Notes and preferences' }]} />

            {tab === 'history' && (
                <Panel title="Every job">
                    <Table rows={bookings} empty="No jobs yet." cols={[
                        { key: 'd', header: 'Date', render: b => `${dayLabel(b.date)} ${b.time}` },
                        { key: 's', header: 'Service', render: b => svc(b.serviceId) },
                        { key: 'c', header: 'Cleaner', render: b => staffName(db, b.cleanerId) || 'Unassigned' },
                        { key: 'st', header: 'Status', render: b => <Pill tone={b.status === 'completed' ? 'good' : b.status === 'cancelled' ? 'bad' : 'info'}>{b.status.replace('_', ' ')}</Pill> },
                        { key: 'p', header: 'Payment', render: b => <Pill tone={b.paymentStatus === 'paid' ? 'good' : 'warn'}>{b.paymentStatus}</Pill> },
                        { key: 'a', header: 'Price', align: 'r', render: b => `${fmt(b.price)} QAR` },
                    ]} />
                </Panel>
            )}
            {tab === 'billing' && (
                <Panel title="Invoices">
                    <Table rows={mine} empty="No invoices for this client." cols={[
                        { key: 'n', header: 'Invoice', render: i => i.number }, { key: 'd', header: 'Issued', render: i => dayLabel(i.issueDate) },
                        { key: 't', header: 'Total', align: 'r', render: i => `${fmt(invoiceTotal(i))} QAR` },
                        { key: 's', header: 'Status', render: i => { const s = invoiceState(i, payments); return <Pill tone={s === 'paid' ? 'good' : s === 'overdue' ? 'bad' : undefined}>{s}</Pill>; } },
                    ]} />
                </Panel>
            )}
            {tab === 'properties' && (
                <Panel title="Properties" subtitle="Clients with more than one address, such as a home and an office">
                    {(meta?.properties || []).map(p => (
                        <div className="row" key={p.id}>
                            <div><b style={{ fontWeight: 600 }}>{p.label}</b><div>{p.address}</div>{p.notes && <div className="sub">{p.notes}</div>}</div>
                            <button className="btn btn-ghost btn-sm" aria-label="Remove property" onClick={() => saveMeta({ properties: (meta?.properties || []).filter(x => x.id !== p.id) })}><Trash2 size={14} /></button>
                        </div>
                    ))}
                    {!(meta?.properties || []).length && <Empty>No extra properties yet.</Empty>}
                    <div className="frow" style={{ marginTop: 12 }}>
                        <Field label="Label" half><input value={prop.label} placeholder="Home, Office, Villa" onChange={e => setProp({ ...prop, label: e.target.value })} /></Field>
                        <Field label="Address" half><input value={prop.address} onChange={e => setProp({ ...prop, address: e.target.value })} /></Field>
                        <Field label="Access notes"><input value={prop.notes} placeholder="Gate code, parking, pets" onChange={e => setProp({ ...prop, notes: e.target.value })} /></Field>
                    </div>
                    <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => {
                        if (!prop.label || !prop.address) return;
                        saveMeta({ properties: [...(meta?.properties || []), { id: uid('pr'), ...prop }] }); setProp({ label: '', address: '', notes: '' });
                    }}><Plus size={15} /> Add property</button>
                </Panel>
            )}
            {tab === 'notes' && (
                <Panel title="Notes and preferences">
                    <div className="frow">
                        <Field label="Preferred cleaner" half>
                            <select value={meta?.preferredCleanerId || ''} onChange={e => saveMeta({ preferredCleanerId: e.target.value || undefined })}>
                                <option value="">No preference</option>
                                {db.staff.filter(s => s.companyId === companyId).map(s => <option key={s.id} value={s.id}>{staffName(db, s.id)}</option>)}
                            </select>
                        </Field>
                        <Field label="Tags" half hint="Comma separated, for example VIP, weekly"><input value={meta?.tags || ''} onChange={e => saveMeta({ tags: e.target.value })} /></Field>
                        <Field label="Notes"><textarea value={meta?.notes || ''} placeholder="Products to avoid, special requests, anything the team should know" onChange={e => saveMeta({ notes: e.target.value })} /></Field>
                    </div>
                    {complaints.filter(c => c.clientId === client.id).length > 0 && (
                        <div style={{ marginTop: 12 }}><b style={{ fontWeight: 600 }}>Complaints from this client</b>
                            {complaints.filter(c => c.clientId === client.id).map(c => <div className="row" key={c.id}><span>{c.subject}</span><Pill tone={c.status === 'resolved' ? 'good' : 'warn'}>{c.status}</Pill></div>)}
                        </div>
                    )}
                </Panel>
            )}
        </div>
    );
};
