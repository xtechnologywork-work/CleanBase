import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, ChevronRight, Camera, Plus, Trash2 } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import {
    addItem, findConflict, fmt, logActivity, minutesToTime, mutateDB, newChecklist, staffName, toMinutes, today,
    uid, updateItem, useCollection, useDB, zoneForAddress, reservedMessage, cleanersOf,
} from '../services/erp';
import type { JobMeta } from '../services/erp';
import type { Booking } from '../types';
import { deletePhoto, uploadPhoto } from '../services/photos';
import { PhotoImg } from '../components/shared/PhotoImg';
import { Empty, Field, Kpi, Modal, Pill, Panel, PageHeader } from '../components/shared/ui';

export const DispatchPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const db = useDB();
    const { items: metas } = useCollection('jobMeta', companyId);
    const { items: zones } = useCollection('zones', companyId);
    const [date, setDate] = useState(today());
    const [openId, setOpenId] = useState<string | null>(null);

    const jobs = db.bookings.filter(b => b.companyId === companyId && b.date === date).sort((a, b) => a.time.localeCompare(b.time));
    const cleaners = db.staff.filter(s => s.companyId === companyId && ['cleaner', 'staff'].includes(db.users.find(u => u.id === s.userId)?.role || ''));
    const dur = (b: Booking) => db.services.find(s => s.id === b.serviceId)?.durationMinutes || 120;
    const svc = (b: Booking) => db.services.find(s => s.id === b.serviceId)?.name || 'Service';
    const client = (b: Booking) => db.clients.find(c => c.id === b.clientId)?.name || 'Guest';
    const unassigned = jobs.filter(j => !j.cleanerId && j.status !== 'cancelled');
    const active = jobs.filter(j => j.status !== 'cancelled');

    const chip = (b: Booking) => {
        const cls = b.status === 'completed' ? 'done' : b.status === 'in_progress' ? 'prog' : b.status === 'cancelled' ? 'cancel' : '';
        const meta = metas.find(m => m.bookingId === b.id);
        const zone = zones.find(z => z.id === meta?.zoneId) || zoneForAddress(b.address, zones);
        return (
            <button key={b.id} className={`jobchip ${cls}`} onClick={() => setOpenId(b.id)}>
                <b style={{ fontWeight: 600 }}>{b.time} to {minutesToTime(toMinutes(b.time) + dur(b))} · {client(b)}</b>
                <span>{svc(b)}{zone ? ` · ${zone.name}` : ''}</span>
            </button>
        );
    };

    const open = jobs.find(j => j.id === openId) || db.bookings.find(b => b.id === openId) || null;

    return (
        <div className="pg">
            <PageHeader title="Dispatch board" subtitle="Who is doing what, today and any day. Open a job to assign, start, finish and record the work.">
                <div className="toolbar">
                    <button className="btn btn-secondary btn-sm" onClick={() => setDate(format(addDays(parseISO(date), -1), 'yyyy-MM-dd'))} aria-label="Previous day"><ChevronLeft size={16} /></button>
                    <input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" />
                    <button className="btn btn-secondary btn-sm" onClick={() => setDate(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))} aria-label="Next day"><ChevronRight size={16} /></button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setDate(today())}>Today</button>
                </div>
            </PageHeader>

            <div className="kpis">
                <Kpi label="Jobs" value={active.length} hint={format(parseISO(date), 'EEEE d MMMM')} />
                <Kpi label="Unassigned" value={unassigned.length} tone={unassigned.length ? 'bad' : undefined} hint="Need a cleaner" />
                <Kpi label="In progress" value={active.filter(j => j.status === 'in_progress').length} />
                <Kpi label="Completed" value={active.filter(j => j.status === 'completed').length} hint={`${fmt(active.filter(j => j.status === 'completed').reduce((s, j) => s + j.price, 0), 0)} QAR`} />
            </div>

            <div className="grid3">
                <Panel title="Unassigned" subtitle={`${unassigned.length} jobs waiting`}>
                    <div className="stack" style={{ gap: 8 }}>
                        {unassigned.length === 0 ? <Empty>Everything is assigned.</Empty> : unassigned.map(chip)}
                    </div>
                </Panel>
                {cleaners.map(c => {
                    const mine = jobs.filter(j => j.cleanerId === c.id && j.status !== 'cancelled');
                    const minutes = mine.reduce((s, j) => s + dur(j), 0);
                    return (
                        <Panel key={c.id} title={staffName(db, c.id)} subtitle={`${mine.length} jobs · ${(minutes / 60).toFixed(1)} hours booked`}>
                            <div className="stack" style={{ gap: 8 }}>
                                {mine.length === 0 ? <Empty>Free all day.</Empty> : mine.map(chip)}
                                <div className="bar" title="Share of an 8 hour day"><i style={{ width: `${Math.min(100, (minutes / 480) * 100)}%`, background: minutes > 480 ? 'var(--color-danger)' : undefined }} /></div>
                            </div>
                        </Panel>
                    );
                })}
            </div>
            {cleaners.length === 0 && <Empty>Add cleaners under Cleaners to see them on the board.</Empty>}

            {open && <JobModal booking={open} companyId={companyId} onClose={() => setOpenId(null)} />}
        </div>
    );
};

/* ------------------------------ job modal ------------------------------ */

const JobModal: React.FC<{ booking: Booking; companyId: string; onClose: () => void }> = ({ booking: b, companyId, onClose }) => {
    const { user } = useAuth();
    const db = useDB();
    const { items: metas } = useCollection('jobMeta', companyId);
    const { items: zones } = useCollection('zones', companyId);
    const { items: vehicles } = useCollection('vehicles', companyId);
    const { items: supplies } = useCollection('supplies', companyId);
    const { items: usage } = useCollection('supplyUsage', companyId);
    const [newTask, setNewTask] = useState('');
    const [supplyId, setSupplyId] = useState('');
    const [qty, setQty] = useState('1');

    const meta = metas.find(m => m.bookingId === b.id);
    useEffect(() => {
        if (!meta) addItem('jobMeta', companyId, { bookingId: b.id, checklist: newChecklist(), notes: '', photosBefore: [], photosAfter: [], zoneId: zoneForAddress(b.address, zones)?.id });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meta?.id]);

    const actor = user?.name || 'Owner';
    const client = db.clients.find(c => c.id === b.clientId);
    const service = db.services.find(s => s.id === b.serviceId);
    const duration = service?.durationMinutes || 120;
    const cleaners = cleanersOf(db, companyId);
    const patchMeta = (p: Partial<JobMeta>) => meta && updateItem('jobMeta', meta.id, p);
    const patchBooking = (p: Partial<Booking>) => mutateDB(d => { const t = d.bookings.find(x => x.id === b.id); if (t) Object.assign(t, p); });

    const assign = (cleanerId: string) => {
        if (cleanerId) {
            const kept = reservedMessage(db, companyId, cleanerId, b.date, b.clientId, b.subscriptionId);
            if (kept) { alert(kept); return; }
            const clash = findConflict(db, companyId, cleanerId, b.date, b.time, duration, b.id);
            if (clash && !confirm(`${staffName(db, cleanerId)} already has a job at ${clash.time} that overlaps. Assign anyway?`)) return;
        }
        patchBooking({ cleanerId: cleanerId || undefined, status: cleanerId && b.status === 'pending' ? 'confirmed' : b.status });
        logActivity(companyId, actor, cleanerId ? `Assigned ${staffName(db, cleanerId)}` : 'Unassigned cleaner', `${client?.name} ${b.date} ${b.time}`);
    };
    const reschedule = (date: string, time: string) => {
        if (b.cleanerId) {
            const kept = reservedMessage(db, companyId, b.cleanerId, date, b.clientId, b.subscriptionId);
            if (kept) { alert(kept); return; }
            const clash = findConflict(db, companyId, b.cleanerId, date, time, duration, b.id);
            if (clash && !confirm('This overlaps another job for the same cleaner. Move anyway?')) return;
        }
        patchBooking({ date, time });
        logActivity(companyId, actor, `Rescheduled job to ${date} ${time}`, client?.name);
    };
    const setStatus = (status: Booking['status']) => {
        patchBooking({ status });
        if (status === 'in_progress') patchMeta({ startedAt: new Date().toISOString() });
        if (status === 'completed') patchMeta({ finishedAt: new Date().toISOString(), startedAt: meta?.startedAt || new Date().toISOString() });
        logActivity(companyId, actor, `Marked job ${status.replace('_', ' ')}`, `${client?.name} ${b.date}`);
    };
    const addPhoto = async (which: 'photosBefore' | 'photosAfter', file?: File) => {
        if (!file || !meta) return;
        try { patchMeta({ [which]: [...meta[which], await uploadPhoto(file, companyId, b.id)] } as Partial<JobMeta>); } catch { alert('Could not upload that photo.'); }
    };
    const logSupply = () => {
        const s = supplies.find(x => x.id === supplyId); const q = Number(qty);
        if (!s || !(q > 0)) return;
        addItem('supplyUsage', companyId, { supplyId: s.id, qty: q, date: b.date, bookingId: b.id });
        updateItem('supplies', s.id, { stock: Math.max(0, s.stock - q) });
        setQty('1');
    };
    const jobUsage = usage.filter(u => u.bookingId === b.id);
    const done = meta?.checklist.filter(c => c.done).length || 0;

    return (
        <Modal open onClose={onClose} title={`${client?.name || 'Job'} · ${service?.name || ''}`} width={720}
            footer={<>
                {b.status === 'cancelled' ? <button className="btn btn-secondary" onClick={() => setStatus('confirmed')}>Reinstate</button> : <button className="btn btn-secondary" onClick={() => { if (confirm('Cancel this job?')) setStatus('cancelled'); }}>Cancel job</button>}
                {(b.status === 'pending' || b.status === 'confirmed') && <button className="btn btn-primary" onClick={() => setStatus('in_progress')}>Start job</button>}
                {b.status === 'in_progress' && <button className="btn btn-primary" onClick={() => setStatus('completed')}>Finish job</button>}
                {b.status === 'completed' && <button className="btn btn-secondary" onClick={() => setStatus('in_progress')}>Reopen</button>}
            </>}>
            <div className="row" style={{ border: 0, padding: 0 }}>
                <div><div>{b.address || client?.address || 'No address'}</div><div className="sub">{client?.phone} · {fmt(b.price)} QAR · {Math.round(duration / 60 * 10) / 10} hours</div></div>
                <Pill tone={b.status === 'completed' ? 'good' : b.status === 'in_progress' ? 'warn' : b.status === 'cancelled' ? 'bad' : 'info'}>{b.status.replace('_', ' ')}</Pill>
            </div>

            <div className="frow">
                <Field label="Cleaner" half>
                    <select value={b.cleanerId || ''} onChange={e => assign(e.target.value)}>
                        <option value="">Unassigned</option>
                        {cleaners.map(c => <option key={c.id} value={c.id}>{staffName(db, c.id)}</option>)}
                    </select>
                </Field>
                <Field label="Vehicle" half>
                    <select value={meta?.vehicleId || ''} onChange={e => patchMeta({ vehicleId: e.target.value || undefined })}>
                        <option value="">None</option>
                        {vehicles.filter(v => v.status === 'active').map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
                    </select>
                </Field>
                <Field label="Date" half><input type="date" value={b.date} onChange={e => reschedule(e.target.value, b.time)} /></Field>
                <Field label="Start time" half><input type="time" value={b.time} onChange={e => reschedule(b.date, e.target.value)} /></Field>
                <Field label="Zone" half hint={!meta?.zoneId ? 'Detected from the address when it matches a zone' : undefined}>
                    <select value={meta?.zoneId || ''} onChange={e => patchMeta({ zoneId: e.target.value || undefined })}>
                        <option value="">No zone</option>
                        {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                </Field>
                <Field label="Payment" half>
                    <select value={b.paymentStatus} onChange={e => patchBooking({ paymentStatus: e.target.value as Booking['paymentStatus'] })}>
                        <option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="overdue">Overdue</option>
                    </select>
                </Field>
            </div>

            {(meta?.startedAt || meta?.finishedAt) && (
                <div className="tiny">
                    {meta.startedAt && `Started ${format(parseISO(meta.startedAt), 'HH:mm')}`}
                    {meta.finishedAt && ` · Finished ${format(parseISO(meta.finishedAt), 'HH:mm')} · Took ${Math.max(1, Math.round((new Date(meta.finishedAt).getTime() - new Date(meta.startedAt || meta.finishedAt).getTime()) / 60000))} min`}
                </div>
            )}

            <div>
                <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Checklist ({done} of {meta?.checklist.length || 0})</b>
                {meta?.checklist.map(c => (
                    <div className="check" key={c.id}>
                        <input type="checkbox" checked={c.done} id={c.id} onChange={e => patchMeta({ checklist: meta.checklist.map(x => x.id === c.id ? { ...x, done: e.target.checked } : x) })} />
                        <label htmlFor={c.id} style={{ flex: 1, textDecoration: c.done ? 'line-through' : undefined, color: c.done ? 'var(--color-text-tertiary)' : undefined }}>{c.text}</label>
                        <button className="btn btn-ghost btn-sm" aria-label="Remove task" onClick={() => patchMeta({ checklist: meta.checklist.filter(x => x.id !== c.id) })}><Trash2 size={13} /></button>
                    </div>
                ))}
                <div className="toolbar" style={{ marginTop: 6 }}>
                    <input className="input-field" style={{ flex: 1 }} placeholder="Add a task" value={newTask} onChange={e => setNewTask(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newTask.trim() && meta) { patchMeta({ checklist: [...meta.checklist, { id: uid('ck'), text: newTask.trim(), done: false }] }); setNewTask(''); } }} />
                    <button className="btn btn-secondary btn-sm" onClick={() => { if (newTask.trim() && meta) { patchMeta({ checklist: [...meta.checklist, { id: uid('ck'), text: newTask.trim(), done: false }] }); setNewTask(''); } }}><Plus size={13} /> Add</button>
                </div>
            </div>

            <Field label="Job notes"><textarea value={meta?.notes || ''} placeholder="Access details, special requests, issues found" onChange={e => patchMeta({ notes: e.target.value })} /></Field>

            <div className="grid2e">
                {(['photosBefore', 'photosAfter'] as const).map(w => (
                    <div key={w}>
                        <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{w === 'photosBefore' ? 'Before photos' : 'After photos'}</b>
                        <div className="photos" style={{ marginTop: 8 }}>
                            {meta?.[w].map((src, i) => (
                                <PhotoImg key={i} src={src} alt={`${w === 'photosBefore' ? 'Before' : 'After'} ${i + 1}`} title="Click to remove" style={{ cursor: 'pointer' }}
                                    onClick={() => { if (confirm('Remove this photo?')) { void deletePhoto(src); patchMeta({ [w]: meta[w].filter((_, n) => n !== i) } as Partial<JobMeta>); } }} />
                            ))}
                            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}><Camera size={14} /> Add
                                <input type="file" accept="image/*" hidden onChange={e => { addPhoto(w, e.target.files?.[0]); e.target.value = ''; }} />
                            </label>
                        </div>
                    </div>
                ))}
            </div>

            <div>
                <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Supplies used</b>
                {jobUsage.map(u => <div className="row" key={u.id}><span>{supplies.find(s => s.id === u.supplyId)?.name || 'Supply'}</span><span className="muted">{u.qty} {supplies.find(s => s.id === u.supplyId)?.unit}</span></div>)}
                <div className="toolbar" style={{ marginTop: 8 }}>
                    <select className="input-field" value={supplyId} onChange={e => setSupplyId(e.target.value)}>
                        <option value="">Choose supply</option>
                        {supplies.map(s => <option key={s.id} value={s.id}>{s.name} ({s.stock} left)</option>)}
                    </select>
                    <input className="input-field" style={{ width: 80, minWidth: 0 }} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} aria-label="Quantity" />
                    <button className="btn btn-secondary btn-sm" onClick={logSupply} disabled={!supplyId}>Log usage</button>
                </div>
            </div>
        </Modal>
    );
};
