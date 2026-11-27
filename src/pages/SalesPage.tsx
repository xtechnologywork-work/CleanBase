import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, ArrowRight, MessageCircle, Plus, Printer } from 'lucide-react';
import {
    addItem, dayLabel, escHtml, fmt, fmt0, LEAD_STAGES, logActivity, mutateDB, nextNumber, printHtml, removeItem, today, updateItem, useCollection, useDB,
} from '../services/erp';
import type { InvoiceItem, Lead, Quote } from '../services/erp';
import { addDays, format, parseISO } from 'date-fns';
import { CrudTable, Empty, Field, FormModal, Kpi, Modal, PageHeader, Panel, Pill, Table, Tabs } from '../components/shared/ui';
import type { FieldDef } from '../components/shared/ui';

type Tab = 'leads' | 'quotes' | 'promos';

export const SalesPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const [tab, setTab] = useState<Tab>('leads');
    return (
        <div className="pg">
            <PageHeader title="Leads, quotes and promotions" subtitle="Turn enquiries into booked work and see what each channel is worth." />
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'leads', label: 'Leads' }, { id: 'quotes', label: 'Quotes' }, { id: 'promos', label: 'Promotions' }]} />
            {tab === 'leads' && <LeadsTab companyId={companyId} />}
            {tab === 'quotes' && <QuotesTab companyId={companyId} />}
            {tab === 'promos' && <PromosTab companyId={companyId} />}
        </div>
    );
};

/* -------------------------------- leads --------------------------------- */

const LEAD_FIELDS: FieldDef[] = [
    { name: 'name', label: 'Name', required: true, half: true },
    { name: 'phone', label: 'Phone', type: 'tel', half: true },
    { name: 'source', label: 'Source', type: 'select', required: true, half: true, options: ['Instagram', 'WhatsApp', 'Website', 'Google', 'Referral', 'Walk-in', 'Other'].map(v => ({ value: v, label: v })) },
    { name: 'value', label: 'Expected value (QAR)', type: 'number', half: true },
    { name: 'interest', label: 'Interested in', required: true },
    { name: 'notes', label: 'Notes', type: 'textarea' },
];

const LeadsTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const { user } = useAuth();
    const db = useDB();
    const { items } = useCollection('leads', companyId);
    const [editing, setEditing] = useState<Lead | 'new' | null>(null);
    const move = (l: Lead, dir: 1 | -1) => {
        const i = LEAD_STAGES.indexOf(l.stage) + dir;
        if (i < 0 || i >= LEAD_STAGES.length) return;
        updateItem('leads', l.id, { stage: LEAD_STAGES[i] });
        logActivity(companyId, user?.name || 'Owner', `Moved lead to ${LEAD_STAGES[i]}`, l.name);
    };
    const toClient = (l: Lead) => {
        if (db.clients.some(c => c.companyId === companyId && c.name === l.name)) return alert('A client with this name already exists.');
        mutateDB(d => { d.clients.push({ id: `cl-${Date.now()}`, companyId, name: l.name, phone: l.phone, address: '', totalSpent: 0, createdAt: new Date().toISOString() }); });
        logActivity(companyId, user?.name || 'Owner', 'Converted lead to client', l.name);
        alert(`${l.name} is now a client.`);
    };
    const open = items.filter(l => ['new', 'contacted', 'quoted'].includes(l.stage));
    const won = items.filter(l => l.stage === 'won').length, lost = items.filter(l => l.stage === 'lost').length;
    const bySource = Object.entries(items.reduce<Record<string, { n: number; won: number }>>((a, l) => {
        a[l.source] ||= { n: 0, won: 0 }; a[l.source].n++; if (l.stage === 'won') a[l.source].won++; return a;
    }, {})).sort((a, b) => b[1].n - a[1].n);
    return (
        <div className="stack">
            <div className="kpis">
                <Kpi label="Open leads" value={open.length} hint={`${fmt0(open.reduce((s, l) => s + l.value, 0))} QAR in the pipeline`} />
                <Kpi label="Won" value={won} hint={`${fmt0(items.filter(l => l.stage === 'won').reduce((s, l) => s + l.value, 0))} QAR`} />
                <Kpi label="Lost" value={lost} />
                <Kpi label="Conversion rate" value={won + lost ? Math.round((won / (won + lost)) * 100) : 0} unit="%" hint="Won out of closed leads" />
            </div>
            <div><button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> Add lead</button></div>
            <div className="kanban">
                {LEAD_STAGES.map(stage => {
                    const col = items.filter(l => l.stage === stage);
                    return (
                        <div className="kcol" key={stage}>
                            <h4><span>{stage}</span><span className="muted">{col.length}</span></h4>
                            {col.map(l => (
                                <div className="kcard" key={l.id}>
                                    <b>{l.name}</b>
                                    <span className="muted">{l.interest}</span>
                                    <span className="tiny">{l.source}{l.value ? ` · ${fmt0(l.value)} QAR` : ''}</span>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                        <button className="btn btn-ghost btn-sm" aria-label="Move back" disabled={stage === 'new'} onClick={() => move(l, -1)}><ArrowLeft size={13} /></button>
                                        <button className="btn btn-ghost btn-sm" aria-label="Move forward" disabled={stage === 'lost'} onClick={() => move(l, 1)}><ArrowRight size={13} /></button>
                                        {l.phone && <a className="btn btn-ghost btn-sm" aria-label="WhatsApp" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}><MessageCircle size={13} /></a>}
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(l)}>Edit</button>
                                        {stage === 'won' && <button className="btn btn-primary btn-sm" onClick={() => toClient(l)}>Make client</button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
            <Panel title="Where leads come from" subtitle="Conversion by source">
                {bySource.length === 0 ? <Empty>No leads yet.</Empty> : bySource.map(([s, v]) => (
                    <div className="row" key={s}><span>{s}</span><span className="muted">{v.n} {v.n === 1 ? 'lead' : 'leads'} · {v.won} won · {Math.round((v.won / v.n) * 100)}%</span></div>
                ))}
            </Panel>
            <FormModal open={editing !== null} title={editing === 'new' ? 'Add lead' : 'Edit lead'} fields={LEAD_FIELDS}
                initial={editing && editing !== 'new' ? { ...editing } : { source: 'WhatsApp', value: 0 }} onClose={() => setEditing(null)}
                onSubmit={v => {
                    const data = { name: v.name, phone: v.phone, source: v.source, interest: v.interest, notes: v.notes, value: Number(v.value) || 0 };
                    if (editing === 'new') addItem('leads', companyId, { ...data, stage: 'new' });
                    else if (editing) updateItem('leads', editing.id, data);
                    setEditing(null);
                }} />
            {items.length > 0 && <div className="tiny">To remove a lead, move it to Lost, or <button className="btn btn-ghost btn-sm" onClick={() => {
                const lostOnes = items.filter(l => l.stage === 'lost'); if (lostOnes.length && confirm(`Delete ${lostOnes.length} lost leads?`)) lostOnes.forEach(l => removeItem('leads', l.id));
            }}>delete all lost leads</button></div>}
        </div>
    );
};

/* -------------------------------- quotes -------------------------------- */

const QuotesTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const { user } = useAuth();
    const db = useDB();
    const { items } = useCollection('quotes', companyId);
    const [creating, setCreating] = useState(false);
    const [converting, setConverting] = useState<Quote | null>(null);
    const total = (q: Quote) => Math.max(0, q.items.reduce((s, i) => s + i.qty * i.price, 0) - q.discount);

    const setStatus = (q: Quote, status: Quote['status']) => {
        updateItem('quotes', q.id, { status });
        logActivity(companyId, user?.name || 'Owner', `Quote ${status}`, q.number);
    };
    const print = (q: Quote) => printHtml(`Quote ${q.number}`, `<h1>Quote ${escHtml(q.number)}</h1><p class="muted">Valid until ${dayLabel(q.validUntil)}</p>
        <p><b>${escHtml(q.customerName)}</b><br>${escHtml(q.address)}<br>${escHtml(q.phone)}</p>
        <table><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>
        ${q.items.map(i => `<tr><td>${escHtml(i.description)}</td><td class="r">${escHtml(i.qty)}</td><td class="r">${fmt(i.price)}</td><td class="r">${fmt(i.qty * i.price)}</td></tr>`).join('')}</table>
        ${q.discount ? `<div class="tot"><span>Discount</span><span>-${fmt(q.discount)}</span></div>` : ''}<div class="tot big"><span>Total QAR</span><span>${fmt(total(q))}</span></div>`);

    return (
        <div className="stack">
            <div className="kpis">
                <Kpi label="Open quotes" value={items.filter(q => q.status === 'draft' || q.status === 'sent').length} hint={`${fmt0(items.filter(q => q.status === 'sent').reduce((s, q) => s + total(q), 0))} QAR sent`} />
                <Kpi label="Accepted" value={items.filter(q => q.status === 'accepted').length} />
                <Kpi label="Acceptance rate" value={items.filter(q => q.status === 'accepted' || q.status === 'declined').length ? Math.round((items.filter(q => q.status === 'accepted').length / items.filter(q => q.status === 'accepted' || q.status === 'declined').length) * 100) : 0} unit="%" />
            </div>
            <div><button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New quote</button></div>
            <Panel title="Quotes">
                <Table rows={[...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))} empty="No quotes yet." cols={[
                    { key: 'n', header: 'Quote', render: q => <b style={{ fontWeight: 600 }}>{q.number}</b> },
                    { key: 'c', header: 'Customer', render: q => q.customerName },
                    { key: 'v', header: 'Valid until', render: q => dayLabel(q.validUntil) },
                    { key: 't', header: 'Total', align: 'r', render: q => `${fmt(total(q))} QAR` },
                    { key: 's', header: 'Status', render: q => <Pill tone={q.status === 'accepted' ? 'good' : q.status === 'declined' ? 'bad' : q.status === 'sent' ? 'info' : undefined}>{q.status}</Pill> },
                    { key: 'a', header: '', align: 'r', render: q => (
                        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {q.status === 'draft' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(q, 'sent')}>Mark sent</button>}
                            {q.status === 'sent' && <><button className="btn btn-primary btn-sm" onClick={() => setConverting(q)}>Accept and book</button><button className="btn btn-secondary btn-sm" onClick={() => setStatus(q, 'declined')}>Declined</button></>}
                            <button className="btn btn-ghost btn-sm" aria-label="Print quote" onClick={() => print(q)}><Printer size={14} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Delete this quote?')) removeItem('quotes', q.id); }}>Delete</button>
                        </span>) },
                ]} />
            </Panel>
            <NewQuote open={creating} onClose={() => setCreating(false)} companyId={companyId} numbers={items.map(q => q.number)} />
            <Modal open={!!converting} title="Accept quote and create booking" onClose={() => setConverting(null)}>
                {converting && <ConvertForm q={converting} total={total(converting)} companyId={companyId} services={db.services.filter(s => s.companyId === companyId)}
                    onDone={() => { setStatus(converting, 'accepted'); setConverting(null); }} />}
            </Modal>
        </div>
    );
};

const ConvertForm: React.FC<{ q: Quote; total: number; companyId: string; services: { id: string; name: string }[]; onDone: () => void }> = ({ q, total, companyId, services, onDone }) => {
    const db = useDB();
    const [date, setDate] = useState(format(addDays(parseISO(today()), 3), 'yyyy-MM-dd'));
    const [time, setTime] = useState('09:00');
    const [serviceId, setServiceId] = useState(services[0]?.id || '');
    return (
        <div className="stack">
            <div className="frow">
                <Field label="Service" half><select value={serviceId} onChange={e => setServiceId(e.target.value)}>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                <Field label="Price (QAR)" half><input value={fmt(total)} readOnly /></Field>
                <Field label="Date" half><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
                <Field label="Time" half><input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
            </div>
            <div className="tiny">A client named {q.customerName} is created if none exists. The booking starts as confirmed with no cleaner.</div>
            <div className="modal-f" style={{ padding: 0 }}>
                <button className="btn btn-primary" disabled={!serviceId} onClick={() => {
                    let clientId = db.clients.find(c => c.companyId === companyId && c.name === q.customerName)?.id;
                    mutateDB(d => {
                        if (!clientId) { clientId = `cl-${Date.now()}`; d.clients.push({ id: clientId, companyId, name: q.customerName, phone: q.phone, address: q.address, totalSpent: 0, createdAt: new Date().toISOString() }); }
                        d.bookings.push({ id: `bk-${Date.now()}`, companyId, clientId, serviceId, date, time, address: q.address, price: total, status: 'confirmed', paymentStatus: 'unpaid', createdAt: new Date().toISOString() });
                    });
                    onDone();
                }}>Create booking</button>
            </div>
        </div>
    );
};

const NewQuote: React.FC<{ open: boolean; onClose: () => void; companyId: string; numbers: string[] }> = ({ open, onClose, companyId, numbers }) => {
    const db = useDB();
    const [f, setF] = useState({ customerName: '', phone: '', address: '', validUntil: format(addDays(new Date(), 14), 'yyyy-MM-dd'), discount: '0' });
    const [lines, setLines] = useState<InvoiceItem[]>([]);
    const services = db.services.filter(s => s.companyId === companyId);
    const total = Math.max(0, lines.reduce((s, i) => s + i.qty * i.price, 0) - Number(f.discount || 0));
    return (
        <Modal open={open} onClose={onClose} title="New quote" width={620}
            footer={<button className="btn btn-primary" onClick={() => {
                if (!f.customerName || !lines.length) return alert('Add a customer name and at least one line.');
                addItem('quotes', companyId, { number: nextNumber('QT', numbers), ...f, discount: Number(f.discount) || 0, items: lines, status: 'draft' });
                setLines([]); setF({ ...f, customerName: '', phone: '', address: '' }); onClose();
            }}>Save quote</button>}>
            <div className="frow">
                <Field label="Customer name" half><input value={f.customerName} onChange={e => setF({ ...f, customerName: e.target.value })} /></Field>
                <Field label="Phone" half><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
                <Field label="Address"><input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
                <Field label="Valid until" half><input type="date" value={f.validUntil} onChange={e => setF({ ...f, validUntil: e.target.value })} /></Field>
                <Field label="Discount (QAR)" half><input type="number" value={f.discount} onChange={e => setF({ ...f, discount: e.target.value })} /></Field>
            </div>
            <div>
                <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Lines</b>
                {lines.map((l, i) => (
                    <div className="frow" key={i} style={{ marginTop: 8, flexWrap: 'nowrap' }}>
                        <input className="input-field" style={{ flex: 3 }} value={l.description} placeholder="Description" onChange={e => setLines(lines.map((x, n) => n === i ? { ...x, description: e.target.value } : x))} />
                        <input className="input-field" style={{ flex: 1 }} type="number" min={1} value={l.qty} onChange={e => setLines(lines.map((x, n) => n === i ? { ...x, qty: Number(e.target.value) } : x))} />
                        <input className="input-field" style={{ flex: 1 }} type="number" step="any" value={l.price} onChange={e => setLines(lines.map((x, n) => n === i ? { ...x, price: Number(e.target.value) } : x))} />
                        <button className="btn btn-ghost btn-sm" aria-label="Remove line" onClick={() => setLines(lines.filter((_, n) => n !== i))}>×</button>
                    </div>
                ))}
                <div className="toolbar" style={{ marginTop: 8 }}>
                    <select className="input-field" value="" onChange={e => { const s = services.find(x => x.id === e.target.value); if (s) setLines([...lines, { description: s.name, qty: 1, price: s.price }]); }}>
                        <option value="">Add a service line</option>{services.map(s => <option key={s.id} value={s.id}>{s.name} ({fmt(s.price)} QAR)</option>)}
                    </select>
                    <button className="btn btn-secondary btn-sm" onClick={() => setLines([...lines, { description: '', qty: 1, price: 0 }])}><Plus size={13} /> Custom line</button>
                </div>
            </div>
            <div className="row" style={{ border: 0 }}><b style={{ fontWeight: 600 }}>Total</b><b style={{ fontWeight: 600 }}>{fmt(total)} QAR</b></div>
        </Modal>
    );
};

/* ------------------------------- promotions ------------------------------ */

const PromosTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const db = useDB();
    const fields: FieldDef[] = [
        { name: 'code', label: 'Code', required: true, half: true, placeholder: 'WELCOME10' },
        { name: 'type', label: 'Type', type: 'select', required: true, half: true, options: [{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Fixed amount off' }] },
        { name: 'value', label: 'Value', type: 'number', required: true, half: true },
        { name: 'maxUses', label: 'Maximum uses', type: 'number', required: true, half: true },
        { name: 'expiry', label: 'Expires', type: 'date', required: true, half: true },
        { name: 'active', label: 'Active', type: 'select', required: true, half: true, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
        { name: 'referrerClientId', label: 'Referral from client (optional)', type: 'select', options: db.clients.filter(c => c.companyId === companyId).map(c => ({ value: c.id, label: c.name })), hint: 'Link a code to the client who shared it to track referrals' },
    ];
    return (
        <Panel title="Promo and referral codes" subtitle="Apply a code when you create an invoice. Each use is counted.">
            <CrudTable collection="promos" companyId={companyId} noun="promo code" addLabel="Add promo code" fields={fields} defaults={{ type: 'percent', value: 10, maxUses: 100, used: 0, active: 'true', expiry: format(addDays(new Date(), 90), 'yyyy-MM-dd') }}
                cols={[
                    { key: 'code', header: 'Code', render: p => <b style={{ fontWeight: 600 }}>{p.code}</b> },
                    { key: 'v', header: 'Discount', render: p => p.type === 'percent' ? `${p.value}%` : `${fmt(p.value)} QAR` },
                    { key: 'u', header: 'Used', render: p => `${p.used} of ${p.maxUses}` },
                    { key: 'r', header: 'Referrer', render: p => db.clients.find(c => c.id === p.referrerClientId)?.name || '-' },
                    { key: 'e', header: 'Expires', render: p => dayLabel(p.expiry) },
                    { key: 's', header: 'Status', render: p => { const on = String(p.active) !== 'false' && p.expiry >= today() && p.used < p.maxUses; return <Pill tone={on ? 'good' : undefined}>{on ? 'Live' : 'Off'}</Pill>; } },
                ]} />
        </Panel>
    );
};
