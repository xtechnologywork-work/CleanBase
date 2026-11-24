import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { cleanersOf, dayLabel, findConflict, getSettings, logActivity, mutateDB, readCollection, staffName, useCollection, useDB, waDigits, reservedMessage } from '../../services/erp';
import { storeLink, toMin, zonedNow } from '../../services/store';
import { reasonArabic, renderMessage, whatsappUrl } from '../../services/bookingMessages';
import type { MessageVars } from '../../services/bookingMessages';
import type { Booking } from '../../types';
import { Panel, Pill } from '../shared/ui';

const DECLINE_REASONS = ['Fully booked at that time', 'Cleaner not available', 'Outside our service area', 'Service not available', 'Other'];

/**
 * Requests from the booking store (and any other pending booking). The time stays reserved until the owner accepts or declines.
 * Accepting confirms it; declining cancels it and frees the time.
 */
export const BookingRequests: React.FC<{ companyId: string; actor: string; onChange?: () => void }> = ({ companyId, actor, onChange }) => {
    const db = useDB();
    useCollection('leave', companyId);
    const settings = getSettings(companyId);
    const now = zonedNow(settings.timezone || '');
    const [cleanerFor, setCleanerFor] = useState<Record<string, string>>({});
    const [declining, setDeclining] = useState<{ id: string; reason: string; note: string } | null>(null);
    const [done, setDone] = useState<{ id: string; kind: 'accepted' | 'declined' }[]>([]);

    const pending = db.bookings.filter(b => b.companyId === companyId && b.status === 'pending')
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const staff = cleanersOf(db, companyId);
    const client = (b: Booking) => db.clients.find(c => c.id === b.clientId);
    const service = (b: Booking) => db.services.find(s => s.id === b.serviceId);
    const dur = (b: Booking) => service(b)?.durationMinutes || 120;
    const passed = (b: Booking) => b.date < now.date || (b.date === now.date && toMin(b.time) < now.minutes);
    const chosen = (b: Booking) => cleanerFor[b.id] ?? b.cleanerId ?? '';
    const away = (cleanerId: string, date: string) => readCollection('leave', companyId).some(l => l.staffId === cleanerId && l.status === 'approved' && l.start <= date && date <= l.end);
    const problem = (b: Booking): string => {
        const c = chosen(b);
        if (passed(b)) return 'This time has already passed. Decline it, or agree a new time with the client and edit the booking.';
        if (!c) return 'Choose a cleaner before accepting.';
        if (away(c, b.date)) return `${staffName(db, c)} is on leave that day.`;
        const kept = reservedMessage(db, companyId, c, b.date, b.clientId, b.subscriptionId);
        if (kept) return kept;
        const clash = findConflict(db, companyId, c, b.date, b.time, dur(b), b.id);
        return clash ? `${staffName(db, c)} already has a ${clash.status === 'pending' ? 'request' : 'job'} at ${clash.time} that day.` : '';
    };

    const vars = (b: Booking): MessageVars => ({
        name: client(b)?.name || '', service: service(b)?.name || '', date: b.date, time: b.time, cleaner: staffName(db, b.cleanerId) || '',
        company: db.companies.find(c => c.id === companyId)?.name || '', address: b.address || '',
    });
    const declinedText = (b: Booking) => renderMessage(settings.tplDeclined, {
        ...vars(b), link: storeLink(companyId), reason: b.cancelReason || '', reasonAr: reasonArabic(b.cancelReason || ''),
    });
    const whatsapp = (b: Booking, text: string) => {
        const to = waDigits(client(b)?.phone || '');
        if (!to) { alert('This client has no phone number saved.'); return; }
        window.open(whatsappUrl(to, text), '_blank', 'noopener');
    };

    const accept = (b: Booking) => {
        const p = problem(b);
        if (p) { alert(p); return; }
        const c = chosen(b);
        mutateDB(d => { const x = d.bookings.find(r => r.id === b.id); if (x) { x.status = 'confirmed'; x.cleanerId = c; x.decidedAt = new Date().toISOString(); } });
        logActivity(companyId, actor, 'Accepted a booking request', `${client(b)?.name || ''} ${b.date} ${b.time}`);
        setDone(d => [{ id: b.id, kind: 'accepted' }, ...d]);
        onChange?.();
    };
    const decline = () => {
        if (!declining) return;
        const b = db.bookings.find(x => x.id === declining.id);
        if (!b) return;
        if (declining.reason === 'Other' && !declining.note.trim()) { alert('Write the reason.'); return; }
        const reason = declining.reason === 'Other' ? declining.note.trim() : declining.reason + (declining.note.trim() ? `. ${declining.note.trim()}` : '');
        mutateDB(d => { const x = d.bookings.find(r => r.id === b.id); if (x) { x.status = 'cancelled'; x.cancelReason = reason; x.decidedAt = new Date().toISOString(); } });
        logActivity(companyId, actor, 'Declined a booking request', `${client(b)?.name || ''}: ${reason}`);
        setDone(d => [{ id: b.id, kind: 'declined' }, ...d]);
        setDeclining(null);
        onChange?.();
    };

    const answered = done.map(x => ({ ...x, b: db.bookings.find(r => r.id === x.id) })).filter(x => x.b).slice(0, 3);
    if (!pending.length && !answered.length) return null;

    return (
        <div style={{ marginBottom: '1.5rem' }}>
            <Panel title={`Booking requests (${pending.length})`} subtitle="Sent by clients from your booking store. The time stays reserved for them until you accept or decline.">
                <div className="stack">
                    {answered.map(({ id, kind, b }) => (
                        <div key={`done-${id}`} className={`issue ${kind === 'accepted' ? 'low' : 'medium'}`}>
                            <b>{kind === 'accepted' ? 'Accepted' : 'Declined'}: {client(b!)?.name}, {dayLabel(b!.date)} at {b!.time}</b>
                            <div className="toolbar">
                                <button className="btn btn-primary btn-sm" onClick={() => whatsapp(b!, kind === 'accepted'
                                    ? renderMessage(settings.tplConfirmation, vars(b!))
                                    : declinedText(b!))}>
                                    <MessageCircle size={14} /> {kind === 'accepted' ? 'Send confirmation on WhatsApp' : 'Tell the client on WhatsApp'}
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setDone(d => d.filter(x => x.id !== id))}>Dismiss</button>
                            </div>
                        </div>
                    ))}
                    {pending.map(b => {
                        const p = problem(b);
                        const c = client(b);
                        return (
                            <div key={b.id} className={`issue ${passed(b) ? 'high' : 'low'}`} style={{ gap: '0.6rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                    <div>
                                        <b>{c?.name || 'Client'}</b> <span className="tiny">{c?.phone}</span>
                                        <div className="tiny">{service(b)?.name || 'Service'} · {dayLabel(b.date)} at {b.time} · {Math.round(dur(b) / 6) / 10}h · {b.price} QAR</div>
                                        <div className="tiny">{b.address}</div>
                                        {b.notes && <div className="tiny" style={{ fontStyle: 'italic' }}>"{b.notes}"</div>}
                                    </div>
                                    {passed(b) ? <Pill tone="bad">Time passed</Pill> : b.source === 'store' ? <Pill tone="info">From your store</Pill> : <Pill tone="warn">Pending</Pill>}
                                </div>
                                <div className="toolbar">
                                    <select className="input-field" value={chosen(b)} onChange={e => setCleanerFor({ ...cleanerFor, [b.id]: e.target.value })} aria-label="Cleaner" style={{ minWidth: 180 }}>
                                        <option value="">Choose a cleaner</option>
                                        {staff.map(s => { const kept = !!reservedMessage(db, companyId, s.id, b.date, b.clientId, b.subscriptionId); return <option key={s.id} value={s.id} disabled={kept}>{staffName(db, s.id)}{s.id === b.cleanerId ? (b.source === 'store' ? ' (asked for)' : ' (assigned)') : ''}{kept ? ' (kept for a subscription)' : ''}</option>; })}
                                    </select>
                                    <button className="btn btn-primary btn-sm" disabled={!!p} title={p || undefined} onClick={() => accept(b)}>Accept</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setDeclining({ id: b.id, reason: DECLINE_REASONS[0], note: '' })}>Decline</button>
                                </div>
                                {p && <div className="tiny" style={{ color: 'var(--color-danger)' }}>{p}</div>}
                                {declining?.id === b.id && (
                                    <div className="toolbar">
                                        <select className="input-field" value={declining.reason} onChange={e => setDeclining({ ...declining, reason: e.target.value })} aria-label="Reason">
                                            {DECLINE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                        <input className="input-field" placeholder={declining.reason === 'Other' ? 'Write the reason' : 'Note (optional)'} value={declining.note} onChange={e => setDeclining({ ...declining, note: e.target.value })} aria-label="Note" />
                                        <button className="btn btn-primary btn-sm" style={{ background: 'var(--color-danger)' }} onClick={decline}>Decline request</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setDeclining(null)}>Back</button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Panel>
        </div>
    );
};
