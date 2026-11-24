import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Clock, Star, Wallet } from 'lucide-react';
import { brandVars } from '../services/branding';
import { STRINGS } from '../services/storeI18n';
import { useStoreLang } from '../services/useStoreLang';
import { useAppViewport } from '../services/useAppViewport';
import { StoreHeader } from '../components/store/StoreHeader';
import { isCloud, sb } from '../services/backend';
import {
    addDaysStr, checkRequest, dayHours, daySlots, localRequestBooking, localStoreData, nextFreeDay, zonedNow,
} from '../services/store';
import type { StoreData, StoreRequest } from '../services/store';
import { isSignedInHere, track } from '../services/storeInsights';
import type { StoreStep } from '../services/storeInsights';
import '../store.css';

type Step = 'service' | 'cleaner' | 'time' | 'details' | 'done';
const STEP_IDS = ['service', 'cleaner', 'time', 'details'] as const;
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
    const [err, setErr] = useState('');                      // kept in English; shown through t.error()

    // Language: English or Arabic (right to left). Remembered on this device.
    const [lang, switchLang] = useStoreLang();
    useAppViewport();                       // no pinch zoom or sideways drift on a phone: it behaves like an app
    const t = STRINGS[lang];
    const rtl = lang === 'ar';
    const fmt = useCallback((d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(STRINGS[lang].dateLocale, { ...o, timeZone: 'UTC' }), [lang]);
    const longDay = (d: string) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
    const shortDay = (d: string) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
    const monthName = (ym: string) => fmt(`${ym}-01`, { month: 'long', year: 'numeric' });
    const hours = (m: number) => t.duration(m);

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
        const cells: { date: string; open: boolean; booked: boolean }[] = Array.from({ length: lead }, () => ({ date: '', open: false, booked: false }));
        for (let i = 0; i < count; i++) {
            const d = addDaysStr(first, i);
            // Every day from today on stays selectable; its times show which are free and which are not
            const open = d >= now.date && d <= lastDay && dayHours(data.rules, d) !== null;                 // closed weekdays stay greyed out
            // Booked: an open day on which nobody is free (booked, away, or kept for a subscription), not a day whose times have only passed
            const sl = open ? daySlots(data, serviceId, cleanerId, d, now) : [];
            cells.push({ date: d, open, booked: sl.length > 0 && !sl.some(x => x.free) && sl.some(x => x.reason === 'taken') });
        }
        return cells;
    }, [data, month, serviceId, cleanerId, now, lastDay]);
    const slots = useMemo(() => (data && date ? daySlots(data, serviceId, cleanerId, date, now) : []), [data, serviceId, cleanerId, date, now]);
    const anyFree = slots.some(s => s.free);

    // A cleaner who is booked, away or kept for a subscription is shown as not available: nothing free at all, or nothing in the next two weeks.
    // She can still be chosen when she is free later, so the client can book that day.
    const SOON_DAYS = 14;
    const soonEnd = now.date ? addDaysStr(now.date, SOON_DAYS) : '';       // empty until the page data has loaded
    const notNow = (id: string) => { const f = nextFree[id]; return !f || (!!soonEnd && f > soonEnd); };

    const pickService = (id: string) => { mark('service'); setServiceId(id); setCleanerId(''); setDate(''); setTime(''); setErr(''); setStep('cleaner'); };
    const pickCleaner = (id: string) => {
        mark('cleaner');
        setCleanerId(id); setDate(''); setTime(''); setErr('');
        // The calendar always opens on the current month. The first free day is selected when it is in that month;
        // when it is further away, a button below the calendar takes the client there.
        const first = nextFree[id];
        const current = now.date.slice(0, 7);
        setMonth(current);
        if (first && first.slice(0, 7) === current) setDate(first);
        setStep('time');
    };
    const pickTime = (tm: string, ids: string[]) => {
        if (!data) return;
        // "Any available": give the job to the free cleaner with the fewest jobs that day
        const jobs = (id: string) => data.busy.filter(b => b.cleanerId === id && b.date === date).length;
        mark('time');
        setTime(tm); setAssigned(cleanerId === 'any' ? [...ids].sort((a, b) => jobs(a) - jobs(b))[0] : cleanerId); setErr('');
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
        if (/taken|too soon|away|working hours|too far|cleaner is not|closed on that day/i.test(message)) {
            void load(); setTime(''); setStep('time');
        }
        setErr(message.endsWith('.') ? message : `${message}.`);
    };

    // The company's own look: logo in the header, colours through CSS variables
    const brand = useMemo(() => brandVars({ primary: data?.company.primaryColor, accent: data?.company.accentColor }), [data]) as React.CSSProperties;
    useEffect(() => { if (data?.company.name) document.title = t.pageTitle(data.company.name); }, [data?.company.name, t]);
    useEffect(() => { document.documentElement.lang = lang; return () => { document.documentElement.lang = 'en'; }; }, [lang]);
    const Next = rtl ? ChevronLeft : ChevronRight;
    const Prev = rtl ? ChevronRight : ChevronLeft;
    // The back button: one step back, keeping what the client already chose
    const PREVIOUS: Partial<Record<Step, 'service' | 'cleaner' | 'time'>> = { cleaner: 'service', time: 'cleaner', details: 'time' };
    const backStep = PREVIOUS[step];
    const BackButton = backStep ? (
        <button type="button" className="st-back" onClick={() => { setErr(''); setStep(backStep); }} aria-label={t.backTo(t.steps[backStep])}>
            <Prev size={18} /> {t.back}
        </button>
    ) : null;
    const sep = rtl ? '، ' : ', ';

    const header = (
        <StoreHeader name={data?.company.name || t.bookingFallback} logo={data?.company.logo} tagline={data?.company.tagline || t.tagline}
            langButton={t.langButton} langOf={rtl ? 'en' : 'ar'} onLang={switchLang} />
    );
    const footer = <footer className="st-foot">{t.footer}</footer>;
    const shell = { className: 'st', style: brand, dir: rtl ? 'rtl' : 'ltr', lang } as const;

    if (data === undefined) return <div {...shell}>{header}<main className="st-main"><p className="st-muted">{t.loading}</p></main></div>;
    if (data === null) {
        return (
            <div {...shell}>{header}
                <main className="st-main"><div className="st-panel st-center"><h1>{t.inactiveTitle}</h1><p className="st-lead">{t.inactiveText}</p></div></main>
                {footer}
            </div>
        );
    }

    if (step === 'done') {
        return (
            <div {...shell}>{header}
                <main className="st-main">
                    <div className="st-panel st-center">
                        <span className="st-check"><Check size={30} strokeWidth={3} /></span>
                        <h1>{t.sent}</h1>
                        <p className="st-lead">{t.thanks(form.name.trim().split(' ')[0] || '', data.company.name)}</p>
                    </div>
                    {service && date && time && (
                        <div className="st-panel">
                            <div className="st-sum">
                                <span>{t.summaryService}</span><b>{service.name}</b>
                                <span>{t.summaryWhen}</span><b>{longDay(date)}{sep}<bdi dir="ltr">{time}</bdi></b>
                                <span>{t.summaryCleaner}</span><b>{cleanerName(assigned) || t.assignedByCompany}</b>
                                <span>{t.summaryPrice}</span><b>{money(service.price)} {t.currency}</b>
                            </div>
                        </div>
                    )}
                    <div><button className="st-btn" onClick={() => { setStep('service'); setServiceId(''); setCleanerId(''); setDate(''); setTime(''); setForm({ name: '', phone: '', address: '', notes: '', website: '' }); void load(); }}>{t.bookAnother}</button></div>
                </main>
                {footer}
            </div>
        );
    }

    const order: Step[] = ['service', 'cleaner', 'time', 'details'];
    const reached = (s: Step) => order.indexOf(s) < order.indexOf(step);
    const minMonth = now.date.slice(0, 7), maxMonth = lastDay.slice(0, 7);

    // The booking so far, beside the steps on wide screens and under them on a phone (hidden there until something is chosen)
    const side = step !== 'details';
    const todayHours = dayHours(data.rules, now.date);
    const aside = side ? (
        <aside className="st-side">
            <p className="st-note"><Clock size={16} /> {todayHours ? t.openToday(todayHours.start, todayHours.end) : t.closedToday}</p>
            <p className="st-note"><Wallet size={16} /> {t.nothingToPay}</p>
        </aside>
    ) : null;

    return (
        <div {...shell}>
            {header}
            <main className={`st-main ${side ? 'st-has-side' : ''}`}>
                <div className="st-flow">
                <nav className="st-steps" aria-label={t.stepsLabel}>
                    {STEP_IDS.map(id => (
                        <button key={id} type="button" className={`st-step ${step === id ? 'on' : reached(id) ? 'done' : ''}`}
                            disabled={!reached(id)} aria-current={step === id ? 'step' : undefined} onClick={() => setStep(id)}>
                            <span className="st-step-bar" />
                            <span className="st-step-label">{t.steps[id]}</span>
                        </button>
                    ))}
                </nav>

                {step === 'service' && (
                    <>
                        <div><h1>{t.chooseService}</h1><p className="st-lead">{t.perVisit}</p></div>
                        {data.services.length === 0 ? <div className="st-panel st-center st-muted">{t.noServices}</div> : (
                            <div className="st-grid">
                                {data.services.map(s => (
                                    <button key={s.id} type="button" className={`st-card st-svc ${serviceId === s.id ? 'sel' : ''}`} onClick={() => pickService(s.id)}>
                                        <span className="st-svc-top">
                                            <b>{s.name}</b>
                                            <span className="st-price">{money(s.price)}<small>{t.currency}</small></span>
                                        </span>
                                        {s.description && <span className="st-muted st-desc">{s.description}</span>}
                                        <span className="st-svc-foot">
                                            <span className="st-dur"><Clock size={15} /> {hours(s.durationMinutes)}</span>
                                            <span className="st-pick">{t.select} <Next size={16} /></span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {step === 'cleaner' && service && (
                    <>
                        {BackButton}
                        <div><h1>{t.chooseCleaner}</h1><p className="st-lead">{t.cleanerLead(service.name, hours(service.durationMinutes))}</p></div>
                        <div className="st-grid">
                            <button type="button" className={`st-card ${cleanerId === 'any' ? 'sel' : ''} ${nextFree.any ? '' : 'off'}`} disabled={!nextFree.any} onClick={() => pickCleaner('any')}>
                                <span className="st-who"><b>{t.anyCleaner}</b>{!nextFree.any && <span className="st-badge off">{t.notAvailable}</span>}</span>
                                <span className="st-muted">{nextFree.any ? t.firstFree(shortDay(nextFree.any)) : t.fullyBooked}</span>
                            </button>
                            {data.cleaners.map(c => (
                                <button key={c.id} type="button" className={`st-card ${cleanerId === c.id ? 'sel' : ''} ${notNow(c.id) ? 'off' : ''}`} disabled={!nextFree[c.id]} onClick={() => pickCleaner(c.id)}>
                                    <span className="st-who">
                                        <span className="st-av">{c.photo ? <img src={c.photo} alt="" /> : c.name.charAt(0).toUpperCase()}</span>
                                        <span>
                                            <b>{c.name}</b>
                                            {c.rating ? <span className="st-muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Star size={13} fill="#ff9f0a" color="#ff9f0a" /> {c.rating.toFixed(1)}</span> : null}
                                        </span>
                                        {notNow(c.id) && <span className="st-badge off">{t.notAvailable}</span>}
                                    </span>
                                    <span className="st-muted">{nextFree[c.id] ? t.nextFree(shortDay(nextFree[c.id]!)) : t.fullyBooked}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {step === 'time' && service && (
                    <>
                        {BackButton}
                        <div><h1>{t.pickTime}</h1><p className="st-lead">{t.timeLead(service.name, cleanerId === 'any' ? t.anyoneWho : cleanerName(cleanerId))}</p></div>
                        {err && <p className="st-err" role="alert">{t.error(err)}</p>}
                        <div className="st-panel">
                            <div className="st-cal-h">
                                <button type="button" className="st-nav" onClick={() => shiftMonth(-1)} disabled={month <= minMonth} aria-label={t.prevMonth}>{rtl ? '›' : '‹'}</button>
                                <b>{month && monthName(month)}</b>
                                <button type="button" className="st-nav" onClick={() => shiftMonth(1)} disabled={month >= maxMonth} aria-label={t.nextMonth}>{rtl ? '‹' : '›'}</button>
                            </div>
                            <div className="st-cal" role="grid">
                                {t.weekdays.map(w => <div key={w} className="wd">{w}</div>)}
                                {days.map((c, i) => {
                                    // For a cleaner who is not available now: booked days get a red border, the first free day a green one
                                    const flag = notNow(cleanerId) && cleanerId !== '';
                                    const isBooked = flag && c.booked;
                                    const isFirst = flag && !!nextFree[cleanerId] && c.date === nextFree[cleanerId];
                                    return c.date ? (
                                    <button key={c.date} type="button" className={`st-day ${date === c.date ? 'sel' : ''} ${c.date === now.date ? 'today' : ''} ${isBooked ? 'booked' : ''} ${isFirst ? 'first' : ''}`} disabled={!c.open}
                                        aria-label={`${longDay(c.date)}${c.open ? '' : t.dayNotAvailable}${isBooked ? `, ${t.dayBooked}` : ''}${isFirst ? `, ${t.dayFirstFree}` : ''}`} aria-pressed={date === c.date}
                                        onClick={() => { setDate(c.date); setTime(''); setErr(''); }}>{Number(c.date.slice(8))}</button>
                                ) : <span key={`b${i}`} className="st-day blank" />;
                                })}
                            </div>
                            {notNow(cleanerId) && cleanerId !== '' && days.some(c => c.booked) && (
                                <p className="st-muted st-legend st-cal-legend"><span className="st-dot red" /> {t.dayBooked} <span className="st-dot green" /> {t.dayFirstFree}</p>
                            )}
                        </div>
                        {!date && nextFree[cleanerId] && (
                            <button type="button" className="st-btn ghost" onClick={() => { const d = nextFree[cleanerId]!; setMonth(d.slice(0, 7)); setDate(d); setTime(''); setErr(''); }}>
                                {t.nextFree(shortDay(nextFree[cleanerId]!))}
                            </button>
                        )}
                        {date && (
                            <div className="st-panel">
                                <b className="st-day-title">{longDay(date)}</b>
                                {slots.length === 0 ? <p className="st-muted">{t.noTimes}</p> : (
                                    <>
                                        {!anyFree && <p className="st-muted" style={{ margin: '6px 0 0' }}>{t.nothingFree}</p>}
                                        <div className="st-times" dir="ltr">
                                            {slots.map(s => (
                                                <button key={s.time} type="button" className={`st-time ${time === s.time ? 'sel' : ''}`} disabled={!s.free}
                                                    title={s.free ? undefined : s.reason === 'past' ? t.tipPast : t.tipTaken}
                                                    onClick={() => pickTime(s.time, s.cleanerIds)}>{s.time}</button>
                                            ))}
                                        </div>
                                        {slots.some(s => !s.free) && <p className="st-muted st-legend"><span className="st-dot" /> {t.legend}</p>}
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}

                {step === 'details' && service && (
                    <>
                        {BackButton}
                        <div><h1>{t.yourDetails}</h1><p className="st-lead">{t.detailsLead}</p></div>
                        <div className="st-panel st-sum-panel">
                            <div className="st-sum">
                                <span>{t.summaryService}</span><b>{service.name}{sep}{hours(service.durationMinutes)}</b>
                                <span>{t.summaryWhen}</span><b>{longDay(date)}{sep}<bdi dir="ltr">{time}</bdi></b>
                                <span>{t.summaryCleaner}</span><b>{cleanerName(assigned)}</b>
                                <span>{t.summaryPrice}</span><b>{money(service.price)} {t.currency}</b>
                            </div>
                        </div>
                        <form className="st-panel st-form" onSubmit={submit}>
                            <label>{t.fullName}<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} autoComplete="name" /></label>
                            <label>{t.phone}<input type="tel" dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required placeholder="+974 5555 1234" maxLength={40} autoComplete="tel" /></label>
                            <label>{t.address}<input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} required minLength={3} maxLength={300} placeholder={t.addressHint} autoComplete="street-address" /></label>
                            <label>{t.notes}<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={500} rows={3} placeholder={t.notesHint} /></label>
                            <div className="st-trap" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></label></div>
                            {err && <p className="st-err" role="alert">{t.error(err)}</p>}
                            <div className="st-bar">
                                <button type="button" className="st-btn ghost" onClick={() => setStep('time')}>{t.changeTime}</button>
                                <button type="submit" className="st-btn" disabled={sending}>{sending ? t.sending : t.send}</button>
                            </div>
                            <p className="st-muted" style={{ margin: 0 }}>{t.nothingToPay}</p>
                        </form>
                    </>
                )}
                </div>
                {aside}
            </main>
            {footer}
        </div>
    );
};
