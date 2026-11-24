import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays } from 'date-fns';
import {
    AlertTriangle, ArrowRight, Car, CheckCircle2, Clock, Home, Languages, LogOut, MapPin, MessageCircle, Navigation, Phone, RotateCcw, Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDB } from '../../services/erp';
import {
    canUndo, currentStop, groupRides, mapsLink, STAGE_INFO, stageIndex, stopsOf, TRIP_STAGES, tripStatus,
} from '../../services/trips';
import type { Stop, Trip, TripStage } from '../../services/trips';
import { driversOf, pressStep, tripContext, undoStep } from '../../services/driverOps';
import { driverUpdateMessage, formatTime, whatsappDigits, whatsappUrl } from '../../services/bookingMessages';
import { DRIVER_STRINGS, isolate, lateLabel, listNames } from '../../services/driverI18n';
import type { DriverLang, DriverStrings } from '../../services/driverI18n';
import { useDriverLang } from '../../services/useDriverLang';
import { useAppViewport } from '../../services/useAppViewport';
import { PhotoImg } from '../../components/shared/PhotoImg';
import '../../driver.css';

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const stopKey = (s: Stop) => `${s.trip.id}:${s.leg}`;

/** Steps the driver does once for everyone riding together: leaving, everyone in the car, everyone home. */
const SHARED: TripStage[] = ['to_pickup', 'onboard', 'returned'];

type Ctx = ReturnType<typeof tripContext> & { cleanerName: string; clientName: string };

/** The driver's phone screen: what to do now, one big button, and the day below it. English or Arabic. */
export const DriverApp: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const db = useDB();
    const companyId = user?.companyId || '';
    const { items: allTrips } = useCollection('trips', companyId);
    const { items: homes } = useCollection('accommodations', companyId);
    const [lang, toggleLang] = useDriverLang();
    useAppViewport();
    const T = DRIVER_STRINGS[lang];
    const ar = lang === 'ar';
    const t12 = (time: string) => formatTime(time, ar);
    const iso = (s: string) => isolate(s, lang);

    // The clock moves the "late" flags along without anyone touching the screen
    const [now, setNow] = useState(() => new Date());
    useEffect(() => { const id = setInterval(() => setNow(new Date()), 20_000); return () => clearInterval(id); }, []);

    const isDriver = user?.role === 'driver';
    const drivers = useMemo(() => driversOf(db, companyId), [db, companyId]);
    const [asDriver, setAsDriver] = useState('');
    const me = db.staff.find(s => s.companyId === companyId && s.userId === user?.id);
    const driverId = isDriver ? me?.id || '' : asDriver || drivers[0]?.id || '';
    const driverName = drivers.find(d => d.id === driverId)?.name || user?.name || '';
    const vehicle = drivers.find(d => d.id === driverId)?.vehicle;

    const [day, setDay] = useState<'today' | 'tomorrow'>('today');
    const today = localDay(now);
    const date = day === 'today' ? today : localDay(addDays(now, 1));

    const trips = useMemo(() => allTrips.filter(t => {
        if (t.driverId !== driverId) return false;
        const b = db.bookings.find(x => x.id === t.bookingId);
        if (!b || b.status === 'cancelled') return false;
        // today also shows rides from earlier days that were never finished, so nothing is forgotten
        return t.date === date || (day === 'today' && t.date < today && t.stage !== 'returned');
    }), [allTrips, driverId, db.bookings, date, day, today]);

    const stops = useMemo(() => stopsOf(trips), [trips]);
    const [focusKey, setFocusKey] = useState('');
    const focus = stops.find(s => stopKey(s) === focusKey && !s.done) || currentStop(trips);

    // The helper's fallbacks ("No cleaner assigned", "Client") are English: show the chosen language instead
    const ctxOf = (t: Pick<Trip, 'bookingId'>): Ctx => {
        const c = tripContext(db, homes, t);
        return { ...c, cleanerName: c.cleaner ? c.cleanerName : T.noCleaner, clientName: c.client?.name || T.client };
    };
    // Everyone who rides with the focused cleaner for this step
    const riders: Trip[] = useMemo(() => {
        if (!focus) return [];
        const next = TRIP_STAGES[stageIndex(focus.trip.stage) + 1];
        if (!next || !SHARED.includes(next)) return [focus.trip];
        const same = stops.filter(s => !s.done && s.leg === focus.leg && s.trip.stage === focus.trip.stage);
        const group = groupRides(same, t => tripContext(db, homes, t).home?.id || '').find(g => g.some(s => s.trip.id === focus.trip.id));
        return (group || [focus]).map(s => s.trip);
    }, [focus, stops, homes, db]);

    const [toast, setToast] = useState('');
    const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 2600); };
    const actor = user?.name || 'Driver';
    const press = () => {
        if (!riders.length) return;
        const next = TRIP_STAGES[stageIndex(riders[0].stage) + 1];
        pressStep(riders, actor);
        if (navigator.vibrate) navigator.vibrate(30);
        say(`${T.stages[next].label} · ${t12(hhmm(new Date()))}`);
        setFocusKey('');
    };
    const undoable = trips.filter(t => canUndo(t, now)).sort((a, b) => (b.events.at(-1)?.at || '').localeCompare(a.events.at(-1)?.at || ''))[0];

    const done = trips.filter(t => t.stage === 'returned').length;
    const late = trips.filter(t => tripStatus(t, now).late).length;

    // a driver signs out to the sign in page of their own company
    const signOut = () => { logout(); navigate(companyId ? `/driver/login?c=${encodeURIComponent(companyId)}` : '/login'); };

    return (
        <div className="dv" dir={ar ? 'rtl' : 'ltr'} lang={lang}>
            <header className="dv-top">
                <div className="dv-row">
                    <div className="dv-hello">{isDriver ? T.hello : T.driverView}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type="button" className="dv-lang" onClick={toggleLang} aria-label={T.langAria} lang={ar ? 'en' : 'ar'}><Languages size={16} /> {T.langButton}</button>
                        {isDriver
                            ? <button type="button" className="dv-icon" onClick={signOut} aria-label={T.signOut}><LogOut size={18} className="dv-flip" /></button>
                            : <button type="button" className="dv-icon" onClick={() => navigate('/app/drivers')} aria-label={T.backToBoard}><ArrowRight size={18} className="dv-back" /></button>}
                    </div>
                </div>
                <div className="dv-row" style={{ marginTop: 2 }}>
                    <div style={{ minWidth: 0 }}>
                        <div className="dv-name">{driverName}</div>
                        {vehicle && <div className="dv-hello" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Car size={13} /> {vehicle}</div>}
                    </div>
                    <div className="dv-clock" aria-label={T.timeNow}>{t12(hhmm(now))}</div>
                </div>
                {!isDriver && drivers.length > 0 && (
                    <select className="dv-pick" value={driverId} onChange={e => { setAsDriver(e.target.value); setFocusKey(''); }} aria-label={T.seeDayOf}>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                )}
                <div className="dv-seg" role="group" aria-label={T.dayGroup}>
                    <button type="button" aria-pressed={day === 'today'} onClick={() => { setDay('today'); setFocusKey(''); }}>{T.today}</button>
                    <button type="button" aria-pressed={day === 'tomorrow'} onClick={() => { setDay('tomorrow'); setFocusKey(''); }}>{T.tomorrow}</button>
                </div>
            </header>

            <main className="dv-main">
                {!driverId ? (
                    <div className="dv-empty">
                        <Users size={34} color="#6e6e73" />
                        <b>{isDriver ? T.notLinkedTitle : T.noDriversTitle}</b>
                        <p>{isDriver ? T.notLinkedText : T.noDriversText}</p>
                    </div>
                ) : trips.length === 0 ? (
                    <div className="dv-empty">
                        <CheckCircle2 size={36} color="#248a3d" />
                        <b>{T.noRidesTitle(day === 'tomorrow')}</b>
                        <p>{T.noRidesText}</p>
                    </div>
                ) : (
                    <>
                        <div className="dv-stats">
                            <div className="dv-stat"><b>{trips.length}</b><span>{T.rides}</span></div>
                            <div className="dv-stat"><b>{done}</b><span>{T.done}</span></div>
                            <div className={`dv-stat${late ? ' is-late' : ''}`}><b>{late}</b><span>{T.late}</span></div>
                        </div>

                        {focus
                            ? <NowCard stop={focus} riders={riders} now={now} lang={lang} T={T} ctxOf={ctxOf} db={db} onPress={press} preview={day !== 'today'} />
                            : <div className="dv-empty"><CheckCircle2 size={36} color="#248a3d" /><b>{T.allDoneTitle}</b><p>{T.allDoneText}</p></div>}
                        {undoable && (
                            <button type="button" className="dv-undo" onClick={() => { undoStep(undoable); say(T.stepUndone); }}>
                                <RotateCcw size={13} style={{ verticalAlign: '-2px' }} /> {T.undoStep(T.stages[undoable.stage].label)}
                            </button>
                        )}

                        <div className="dv-h">{day === 'today' ? T.yourDay : T.tomorrowHeading}</div>
                        <div className="dv-list">
                            {stops.map(s => {
                                const c = ctxOf(s.trip);
                                const st = tripStatus(s.trip, now);
                                const lateHere = !s.done && st.late && STAGE_INFO[st.next || 'returned'].leg === s.leg;
                                const chip = s.done ? <span className="dv-chip done">{T.chipDone}</span>
                                    : lateHere ? <span className="dv-chip late">{T.chipLate}</span>
                                    : s.active && s.trip.stage !== 'scheduled' && s.trip.stage !== 'dropped' ? <span className="dv-chip">{T.stages[s.trip.stage].short}</span>
                                    : s.leg === 'back' && s.trip.stage === 'dropped' ? <span className="dv-chip wait">{T.chipCleaning}</span>
                                    : <span className="dv-chip off">{T.chipPlanned}</span>;
                                const from = s.leg === 'out' ? (c.home?.name || T.noAccommodation) : (c.clientAddress || c.clientName);
                                return (
                                    <button key={stopKey(s)} type="button" className={`dv-item${s.done ? ' is-done' : ''}`} aria-current={focus && stopKey(focus) === stopKey(s) ? 'true' : undefined}
                                        onClick={() => setFocusKey(stopKey(s))} disabled={s.done}>
                                        <span className="dv-time">{t12(s.time).replace(' ', ' ')}</span>
                                        <span className={`dv-leg${s.leg === 'back' ? ' back' : ''}`} aria-hidden="true">{s.leg === 'out' ? <Car size={17} /> : <Home size={17} />}</span>
                                        <span className="grow">
                                            <b>{s.leg === 'out' ? T.outTitle(iso(c.cleanerName), iso(c.clientName)) : T.backTitle(iso(c.cleanerName))}</b>
                                            <small>{T.fromPlace(iso(from))}{s.trip.date !== date ? ` · ${s.trip.date}` : ''}</small>
                                        </span>
                                        {chip}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </main>
            {toast && <div className="dv-toast" role="status">{toast}</div>}
        </div>
    );
};

/* ------------------------------ the card of what to do now ------------------------------ */

const NowCard: React.FC<{
    stop: Stop; riders: Trip[]; now: Date; lang: DriverLang; T: DriverStrings; db: ReturnType<typeof useDB>;
    ctxOf: (t: Pick<Trip, 'bookingId'>) => Ctx; onPress: () => void; preview?: boolean;
}> = ({ stop, riders, now, lang, T, db, ctxOf, onPress, preview }) => {
    const trip = stop.trip;
    const ctx = ctxOf(trip);
    const st = tripStatus(trip, now);
    const next = st.next;
    if (!next) return null;
    const ar = lang === 'ar';
    const t12 = (time: string) => formatTime(time, ar);
    const iso = (s: string) => isolate(s, lang);
    const people = riders.map(t => ctxOf(t));
    const names = people.map(p => p.cleanerName);
    const plural = riders.length > 1;
    const home = ctx.home;
    const waiting = next === 'to_return' && !st.late;
    const showLate = st.late && !preview;
    const homeStep = next === 'to_pickup' || next === 'onboard' || next === 'returned';

    // What the step is about and where to drive
    let title = '', place = '', target = '';
    const homePlace = home ? `${home.name} · ${home.address}` : T.noAccommodation;
    const homeTarget = home ? mapsLink(home.address, home.mapUrl) : '';
    if (next === 'to_pickup' || next === 'onboard') {
        title = T.pickUp(listNames(names, lang)); place = homePlace; target = homeTarget;
    } else if (next === 'dropped') {
        title = T.take(iso(ctx.cleanerName), iso(ctx.clientName)); place = ctx.clientAddress; target = mapsLink(ctx.clientAddress);
    } else if (next === 'to_return' || next === 'return_onboard') {
        title = T.collect(iso(ctx.cleanerName), iso(ctx.clientName)); place = ctx.clientAddress; target = mapsLink(ctx.clientAddress);
    } else {
        title = T.bringHome(listNames(names, lang)); place = homePlace; target = homeTarget;
    }

    const action = next === 'onboard' || next === 'return_onboard'
        ? (plural ? T.everyoneInCar : T.stages[next].action)
        : next === 'to_pickup' && plural ? T.goingToPickUpMany(riders.length) : T.stages[next].action;

    const clientDigits = whatsappDigits(ctx.client?.phone || '');
    const company = db.companies.find(c => c.id === trip.companyId)?.name || '';
    const msg = (kind: 'on_the_way' | 'arrived') => whatsappUrl(clientDigits, driverUpdateMessage(kind, { name: ctx.clientName, cleaner: ctx.cleanerName.split(' ')[0], company, time: trip.arriveBy }));
    const missingHome = people.filter(p => !p.home).map(p => p.cleanerName);

    return (
        <section className={`dv-now${showLate ? ' is-late' : ''}`} aria-label={T.kickerNow}>
            <div className="dv-kicker">
                {showLate ? <AlertTriangle size={15} /> : stop.leg === 'out' ? <Car size={15} /> : <Home size={15} />}
                {preview ? T.kickerFirst : st.late ? T.kickerLate(lateLabel(st.minutesLate, lang)) : waiting ? T.kickerCleaning : T.kickerNow}
            </div>
            <h1 className="dv-title">{title}</h1>
            <div className="dv-place"><MapPin size={14} style={{ verticalAlign: '-2px' }} /> {place ? iso(place) : T.noAddress}</div>
            <div className={`dv-due${showLate ? ' is-late' : ''}`}><Clock size={14} /> {T.dueBy(T.stages[next].label, t12(st.due))}</div>

            <div className="dv-steps" aria-label={T.stepAria(stageIndex(trip.stage))}>
                {TRIP_STAGES.slice(1).map((s, i) => <i key={s} className={i < stageIndex(trip.stage) ? 'on' : i === stageIndex(trip.stage) ? 'cur' : ''} />)}
            </div>

            <div className="dv-people">
                {people.map((p, i) => (
                    <div key={riders[i].id} className="dv-person">
                        <span className="dv-avatar">{p.cleaner?.photo ? <PhotoImg src={p.cleaner.photo} alt="" /> : p.cleanerName.charAt(0).toUpperCase()}</span>
                        <span className="grow"><b>{p.cleanerName}</b><small>{T.personLine(iso(p.clientName), t12(riders[i].arriveBy), t12(riders[i].pickupAt))}</small></span>
                        {p.cleaner?.phone && <a className="dv-icon" href={`tel:${p.cleaner.phone}`} aria-label={T.call(p.cleanerName)}><Phone size={17} /></a>}
                    </div>
                ))}
            </div>

            {missingHome.length > 0 && homeStep && <div className="dv-note">{T.noHomeFor(listNames(missingHome, lang))}</div>}
            {home?.notes && homeStep && <div className="dv-note" style={{ background: '#eef4ff', color: '#0058b0' }}>{home.notes}</div>}

            <div className="dv-tools">
                {target && <a className="dv-tool" href={target} target="_blank" rel="noopener noreferrer"><Navigation size={20} /> {T.navigate}</a>}
                {(next === 'dropped' || next === 'to_return' || next === 'return_onboard') && ctx.client?.phone && (
                    <a className="dv-tool" href={`tel:${ctx.client.phone}`}><Phone size={20} /> {T.callClient}</a>
                )}
                {next === 'dropped' && clientDigits && <a className="dv-tool" href={msg('on_the_way')} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> {T.onTheWay}</a>}
                {next === 'dropped' && clientDigits && <a className="dv-tool" href={msg('arrived')} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> {T.arrived}</a>}
            </div>

            {!preview && (
                <button type="button" className={`dv-go${next === 'returned' ? ' is-done' : ''}`} onClick={onPress}>
                    {next === 'returned' ? <CheckCircle2 size={22} /> : <ArrowRight size={22} className="dv-flip" />} {action}
                </button>
            )}
            {preview && <div className="dv-note" style={{ background: '#eef4ff', color: '#0058b0' }}>{T.tomorrowNote}</div>}
        </section>
    );
};
