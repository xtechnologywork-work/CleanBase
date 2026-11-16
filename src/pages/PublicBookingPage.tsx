import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { isCloud, sb } from '../services/backend';
import {
    addDaysStr, checkRequest, localRequestBooking, localStoreData, nextFreeDay, slotsOn, zonedNow,
} from '../services/store';
import type { StoreData, StoreRequest } from '../services/store';
import { isSignedInHere, track } from '../services/storeInsights';
import type { StoreStep } from '../services/storeInsights';
import '../store.css';

type Step = 'service' | 'cleaner' | 'time' | 'details' | 'done';
const STEPS: { id: Step; label: string }[] = [
    { id: 'service', label: '1. Service' }, { id: 'cleaner', label: '2. Cleaner' }, { id: 'time', label: '3. Date and time' }, { id: 'details', label: '4. Your details' },
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const hours = (m: number) => (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`);
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** The company's public booking store. Reached from /book?c=<company> (or /store/<company>). No login. */
export const PublicBookingPage: React.FC = () => {
    const [params] = useSearchParams();
    const { companyId: fromPath } = useParams();
    const companyId = params.get('c') || fromPath || '';

    const [data, setData] = useState<StoreData | null | undefined>(undefined);   // undefined = loading, null = link not active
    const [step, setStep] = useState<Step>('service');
    const [serviceId, setServiceId] = useState('');
    const [cleanerId, setCleanerId] = useState('');          // a cleaner id, or 'any'
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [assigned, setAssigned] = useState('');            // the cleaner who will come
    const [month, setMonth] = useState('');
    const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '', website: '' });
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        if (!companyId) { setData(null); return; }
        if (isCloud) {
            const { data: d, error } = await sb().rpc('public_store', { p_company: companyId });
            setData(error || !d ? null : (d as StoreData));
        } else {
            setData(localStoreData(companyId));
        }
    }, [companyId]);
    useEffect(() => { void load(); }, [load]);

    // Insights: count this visit (not when the owner or team is signed in here), keep it "active" while the page is open
    const [counting, setCounting] = useState(false);
    useEffect(() => {
        if (!data) return;
        let alive = true, timer = 0;
        void isSignedInHere().then(me => {
            if (!alive || me) return;
            setCounting(true);
            track(companyId, 'view');
            timer = window.setInterval(() => { if (document.visibilityState === 'visible') track(companyId, 'view'); }, 60_000);
        });
        return () => { alive = false; window.clearInterval(timer); };
    }, [data, companyId]);
    const mark = useCallback((st: StoreStep) => { if (counting) track(companyId, st); }, [counting, companyId]);

    const now = useMemo(() => (data ? zonedNow(data.rules.timezone) : { date: '', minutes: 0 }), [data]);
    const service = data?.services.find(s => s.id === serviceId);
    const cleanerName = (id: string) => data?.cleaners.find(c => c.id === id)?.name || '';
    const lastDay = data ? addDaysStr(now.date, data.rules.bookingDays) : '';

    // Next free day for every cleaner, for the chosen service
    const nextFree = useMemo(() => {
        const out: Record<string, string | null> = {};
        if (!data || !serviceId) return out;
        out.any = nextFreeDay(data, serviceId, 'any');
        data.cleaners.forEach(c => { out[c.id] = nextFreeDay(data, serviceId, c.id); });
        return out;
    }, [data, serviceId]);

    // The month grid, Monday first
    const days = useMemo(() => {
        if (!data || !month || !serviceId || !cleanerId) return [];
        const first = `${month}-01`;
        const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
        const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
        const cells: { date: string; open: boolean }[] = Array.from({ length: lead }, () => ({ date: '', open: false }));
        for (let i = 0; i < count; i++) {
            const d = addDaysStr(first, i);
            cells.push({ date: d, open: d >= now.date && d <= lastDay && slotsOn(data, serviceId, cleanerId, d, now).length > 0 });
        }
        return cells;
    }, [data, month, serviceId, cleanerId, now, lastDay]);
    const slots = useMemo(() => (data && date ? slotsOn(data, serviceId, cleanerId, date, now) : []), [data, serviceId, cleanerId, date, now]);

    const pickService = (id: string) => { mark('service'); setServiceId(id); setCleanerId(''); setDate(''); setTime(''); setErr(''); setStep('cleaner'); };
    const pickCleaner = (id: string) => {
        mark('cleaner');
        setCleanerId(id); setDate(''); setTime(''); setErr('');
        const first = nextFree[id];
        setMonth((first || now.date).slice(0, 7));
        if (first) setDate(first);
        setStep('time');
    };
    const pickTime = (t: string, ids: string[]) => {
        if (!data) return;
        // "Any available": give the job to the free cleaner with the fewest jobs that day
        const jobs = (id: string) => data.busy.filter(b => b.cleanerId === id && b.date === date).length;
        mark('time');
        setTime(t); setAssigned(cleanerId === 'any' ? [...ids].sort((a, b) => jobs(a) - jobs(b))[0] : cleanerId); setErr('');
        setStep('details');
    };
    const shiftMonth = (n: number) => {
        const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n);
        setMonth(d.toISOString().slice(0, 7)); setDate(''); setTime('');
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!data) return;
        if (form.website) { setStep('done'); return; }      // filled only by bots
        const req: StoreRequest = { serviceId, cleanerId: assigned, date, time, name: form.name, phone: form.phone, address: form.address, notes: form.notes };
        const problem = checkRequest(data, req);
        if (problem) return taken(problem);
        mark('details');
        setSending(true); setErr('');
        let error = '';
        if (isCloud) {
            const { error: e2 } = await sb().rpc('public_request_booking', {
                p_company: companyId, p_service: serviceId, p_cleaner: assigned, p_date: date, p_time: time,
                p_name: form.name.trim(), p_phone: form.phone.trim(), p_address: form.address.trim(), p_notes: form.notes.trim(),
            });
            error = e2?.message || '';
        } else {
            const r = localRequestBooking(companyId, req);
            error = r.ok ? '' : r.error || 'Something went wrong.';
        }
        setSending(false);
        if (error) return taken(error);
        mark('request');
        setStep('done');
    };
    // A time problem sends the client back to pick another time, with fresh availability
    const taken = (message: string) => {
        if (/taken|too soon|away|working hours|too far|cleaner is not/i.test(message)) {
            void load(); setTime(''); setStep('time');
        }
        setErr(message.endsWith('.') ? message : `${message}.`);
    };

    const header = (
        <header className="st-top">
            <div className="st-top-in">
                <div className="st-co">{data?.company.name || 'Booking'}<small>Book a cleaning online</small></div>
            </div>
        </header>
    );
    const footer = <footer className="st-foot">Bookings by CleanBase</footer>;

    if (data === undefined) return <div className="st">{header}<main className="st-main"><p className="st-muted">Loading...</p></main></div>;
    if (data === null) {
        return (
            <div className="st">{header}
                <main className="st-main"><div className="st-panel st-center"><h1>This booking link is not active</h1><p className="st-lead">Please check the link, or ask the company for their booking link.</p></div></main>
                {footer}
            </div>
        );
    }

    if (step === 'done') {
        return (
            <div className="st">{header}
                <main className="st-main">
                    <div className="st-panel st-center">
                        <h1>Request sent</h1>
                        <p className="st-lead">Thank you{form.name ? `, ${form.name.trim().split(' ')[0]}` : ''}. {data.company.name} will confirm your booking soon. This time is kept for you while they review it.</p>
                    </div>
                    {service && date && time && (
                        <div className="st-panel">
                            <div className="st-sum">
                                <span>Service</span><b>{service.name}</b>
                                <span>When</span><b>{longDay(date)}, {time}</b>
                                <span>Cleaner</span><b>{cleanerName(assigned) || 'Assigned by the company'}</b>
                                <span>Price</span><b>{money(service.price)} QAR</b>
                            </div>
                        </div>
                    )}
                    <div><button className="st-btn" onClick={() => { setStep('service'); setServiceId(''); setCleanerId(''); setDate(''); setTime(''); setForm({ name: '', phone: '', address: '', notes: '', website: '' }); void load(); }}>Book another</button></div>
                </main>
                {footer}
            </div>
        );
    }

    const order: Step[] = ['service', 'cleaner', 'time', 'details'];
    const reached = (s: Step) => order.indexOf(s) < order.indexOf(step);
    const minMonth = now.date.slice(0, 7), maxMonth = lastDay.slice(0, 7);

    return (
        <div className="st">
            {header}
            <main className="st-main">
                <nav className="st-steps" aria-label="Steps">
                    {STEPS.map(s => (
                        <button key={s.id} type="button" className={`st-step ${step === s.id ? 'on' : reached(s.id) ? 'done' : ''}`}
                            disabled={!reached(s.id)} aria-current={step === s.id ? 'step' : undefined} onClick={() => setStep(s.id)}>{s.label}</button>
                    ))}
                </nav>

                {step === 'service' && (
                    <>
                        <div><h1>Choose a service</h1><p className="st-lead">Prices are per visit.</p></div>
                        {data.services.length === 0 ? <div className="st-panel st-center st-muted">No services are open for online booking right now.</div> : (
                            <div className="st-grid">
                                {data.services.map(s => (
                                    <button key={s.id} type="button" className={`st-card ${serviceId === s.id ? 'sel' : ''}`} onClick={() => pickService(s.id)}>
                                        <b>{s.name}</b>
                                        {s.description && <span className="st-muted">{s.description}</span>}
                                        <span className="st-price">{money(s.price)}<small>QAR</small></span>
                                        <span className="st-muted">{hours(s.durationMinutes)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {step === 'cleaner' && service && (
                    <>
                        <div><h1>Choose your cleaner</h1><p className="st-lead">{service.name}, {hours(service.durationMinutes)}. Pick someone you know, or let us choose.</p></div>
                        <div className="st-grid">
                            <button type="button" className={`st-card ${cleanerId === 'any' ? 'sel' : ''}`} disabled={!nextFree.any} onClick={() => pickCleaner('any')}>
                                <b>Any available cleaner</b>
                                <span className="st-muted">{nextFree.any ? `First free day: ${shortDay(nextFree.any)}` : 'Fully booked for now'}</span>
                            </button>
                            {data.cleaners.map(c => (
                                <button key={c.id} type="button" className={`st-card ${cleanerId === c.id ? 'sel' : ''}`} disabled={!nextFree[c.id]} onClick={() => pickCleaner(c.id)}>
                                    <span className="st-who">
                                        <span className="st-av">{c.photo ? <img src={c.photo} alt="" /> : c.name.charAt(0).toUpperCase()}</span>
                                        <span>
                                            <b>{c.name}</b>
                                            {c.rating ? <span className="st-muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Star size={13} fill="#ff9f0a" color="#ff9f0a" /> {c.rating.toFixed(1)}</span> : null}
                                        </span>
                                    </span>
                                    <span className="st-muted">{nextFree[c.id] ? `Next free: ${shortDay(nextFree[c.id]!)}` : 'Not available'}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {step === 'time' && service && (
                    <>
                        <div><h1>Pick a date and time</h1><p className="st-lead">{service.name} with {cleanerId === 'any' ? 'any available cleaner' : cleanerName(cleanerId)}. Only free times are shown.</p></div>
                        {err && <p className="st-err" role="alert">{err}</p>}
                        <div className="st-panel">
                            <div className="st-cal-h">
                                <button type="button" className="st-nav" onClick={() => shiftMonth(-1)} disabled={month <= minMonth} aria-label="Previous month">‹</button>
                                <b>{month && monthName(month)}</b>
                                <button type="button" className="st-nav" onClick={() => shiftMonth(1)} disabled={month >= maxMonth} aria-label="Next month">›</button>
                            </div>
                            <div className="st-cal" role="grid">
                                {WEEKDAYS.map(w => <div key={w} className="wd">{w}</div>)}
                                {days.map((c, i) => c.date ? (
                                    <button key={c.date} type="button" className={`st-day ${date === c.date ? 'sel' : ''} ${c.date === now.date ? 'today' : ''}`} disabled={!c.open}
                                        aria-label={`${longDay(c.date)}${c.open ? '' : ', not available'}`} aria-pressed={date === c.date}
                                        onClick={() => { setDate(c.date); setTime(''); setErr(''); }}>{Number(c.date.slice(8))}</button>
                                ) : <span key={`b${i}`} className="st-day blank" />)}
                            </div>
                        </div>
                        {date && (
                            <div className="st-panel">
                                <b style={{ fontWeight: 600 }}>{longDay(date)}</b>
                                {slots.length === 0 ? <p className="st-muted">No free time on this day. Choose another day.</p> : (
                                    <div className="st-times">
                                        {slots.map(s => <button key={s.time} type="button" className={`st-time ${time === s.time ? 'sel' : ''}`} onClick={() => pickTime(s.time, s.cleanerIds)}>{s.time}</button>)}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {step === 'details' && service && (
                    <>
                        <div><h1>Your details</h1><p className="st-lead">So the company can confirm and find your home.</p></div>
                        <div className="st-panel">
                            <div className="st-sum">
                                <span>Service</span><b>{service.name}, {hours(service.durationMinutes)}</b>
                                <span>When</span><b>{longDay(date)}, {time}</b>
                                <span>Cleaner</span><b>{cleanerName(assigned)}</b>
                                <span>Price</span><b>{money(service.price)} QAR</b>
                            </div>
                        </div>
                        <form className="st-panel st-form" onSubmit={submit}>
                            <label>Full name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} autoComplete="name" /></label>
                            <label>Phone (WhatsApp)<input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required placeholder="+974 5555 1234" maxLength={40} autoComplete="tel" /></label>
                            <label>Address<input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} required minLength={3} maxLength={300} placeholder="Area, building, apartment" autoComplete="street-address" /></label>
                            <label>Notes (optional)<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={500} rows={3} placeholder="Gate code, pets, what to focus on" /></label>
                            <div className="st-trap" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></label></div>
                            {err && <p className="st-err" role="alert">{err}</p>}
                            <div className="st-bar">
                                <button type="button" className="st-btn ghost" onClick={() => setStep('time')}>Change time</button>
                                <button type="submit" className="st-btn" disabled={sending}>{sending ? 'Sending...' : 'Send booking request'}</button>
                            </div>
                            <p className="st-muted" style={{ margin: 0 }}>Nothing to pay now. The company confirms your booking first.</p>
                        </form>
                    </>
                )}
            </main>
            {footer}
        </div>
    );
};
