import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { AlertTriangle, Car, Check, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, History, Home, MapPin, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dayLabel, useCollection, useDB } from '../services/erp';
import { assignDriver, driversOf, needsReplan, planFor, replan, tripContext, unassignDriver } from '../services/driverOps';
import { lateText, STAGE_INFO, stageIndex, suggestDriver, TRIP_STAGES, tripStatus } from '../services/trips';
import type { Trip } from '../services/trips';
import { formatTime } from '../services/bookingMessages';
import { driverLoginUrl } from '../services/driverAccounts';
import { Empty, Kpi, Modal, PageHeader, Panel, Pill } from '../components/shared/ui';

const t12 = (hhmm: string) => formatTime(hhmm, false);
const ON_ROAD = ['to_pickup', 'onboard', 'to_return', 'return_onboard'];

/** The office view of every driver's day: who still needs a driver, where each ride is, and what is late. */
export const DriverBoardPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const actor = user?.name || 'Office';
    const db = useDB();
    const { items: allTrips } = useCollection('trips', companyId);
    const { items: homes } = useCollection('accommodations', companyId);
    const drivers = useMemo(() => driversOf(db, companyId), [db, companyId]);

    const [now, setNow] = useState(() => new Date());
    useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
    const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const shift = (n: number) => setDate(d => format(addDays(parseISO(d), n), 'yyyy-MM-dd'));

    const bookings = db.bookings
        .filter(b => b.companyId === companyId && b.date === date && !['cancelled', 'declined'].includes(b.status as string))
        .sort((a, b) => a.time.localeCompare(b.time));
    const trips = allTrips.filter(t => t.date === date && bookings.some(b => b.id === t.bookingId));
    const tripOf = (bookingId: string) => trips.find(t => t.bookingId === bookingId);
    const unassigned = bookings.filter(b => !tripOf(b.id));

    const late = trips.filter(t => tripStatus(t, now).late);
    const onRoad = trips.filter(t => ON_ROAD.includes(t.stage));
    const done = trips.filter(t => t.stage === 'returned');

    // The suggestion for each booking that still needs a driver, counting the ones just suggested above it
    const suggestions = useMemo(() => {
        const ids = drivers.map(d => d.id);
        const load = trips.map(t => ({ driverId: t.driverId }));
        const out: Record<string, string> = {};
        unassigned.forEach(b => { const d = suggestDriver(ids, load); if (d) { out[b.id] = d; load.push({ driverId: d }); } });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drivers, trips.length, unassigned.length, date]);
    const [picked, setPicked] = useState<Record<string, string>>({});
    const choiceFor = (bookingId: string) => picked[bookingId] ?? suggestions[bookingId] ?? '';

    const assign = (bookingId: string, driverId: string) => {
        const b = bookings.find(x => x.id === bookingId);
        if (!b || !driverId) return;
        assignDriver(db, b, driverId, actor, drivers.find(d => d.id === driverId)?.vehicleId);
    };
    const assignAll = () => unassigned.forEach(b => assign(b.id, choiceFor(b.id)));
    const [history, setHistory] = useState<Trip | null>(null);
    const [linkCopied, setLinkCopied] = useState(false);

    const lanes = [
        ...drivers.map(d => ({ id: d.id, name: d.name, vehicle: d.vehicle, trips: trips.filter(t => t.driverId === d.id) })),
        ...(trips.some(t => !drivers.some(d => d.id === t.driverId)) ? [{ id: '?', name: 'Driver no longer in the team', vehicle: undefined, trips: trips.filter(t => !drivers.some(d => d.id === t.driverId)) }] : []),
    ];

    return (
        <div className="pg">
            <PageHeader title="Drivers" subtitle="Give each booking a driver, then follow every ride live: picking up, at the client, collecting, back home.">
                <button type="button" className="btn btn-secondary" onClick={() => { void navigator.clipboard.writeText(driverLoginUrl(companyId)); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1600); }}>
                    {linkCopied ? <Check size={15} /> : <Copy size={15} />} {linkCopied ? 'Copied' : 'Copy driver login link'}
                </button>
                <Link to="/driver" className="btn btn-secondary"><Smartphone size={15} /> Open the driver app</Link>
            </PageHeader>

            <div className="toolbar" style={{ alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => shift(-1)} aria-label="Previous day"><ChevronLeft size={15} /></button>
                <input type="date" className="input-field" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Day" style={{ width: 170 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => shift(1)} aria-label="Next day"><ChevronRight size={15} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))}>Today</button>
                <span className="tiny">{dayLabel(date)}</span>
            </div>

            <div className="kpis">
                <Kpi label="Rides" value={trips.length} hint={`${bookings.length} bookings this day`} />
                <Kpi label="On the road now" value={onRoad.length} icon={<Car size={16} />} />
                <Kpi label="Late" value={late.length} tone={late.length ? 'bad' : undefined} hint={late.length ? 'See the red rides below' : 'Everything on time'} />
                <Kpi label="Back home" value={done.length} tone={done.length && done.length === trips.length ? 'good' : undefined} />
                <Kpi label="Need a driver" value={unassigned.length} tone={unassigned.length ? 'warn' : undefined} />
            </div>

            {drivers.length === 0 && (
                <Panel title="Add your first driver">
                    <p className="tiny" style={{ margin: 0 }}>
                        Add your drivers in <Link to="/app/settings">Settings, Drivers</Link>: each one signs in with a phone number and a password, then give them a vehicle in <Link to="/app/resources">Zones and supplies, Vehicles</Link>.
                        Set where each cleaner lives in Zones and supplies, Accommodations.
                    </p>
                </Panel>
            )}

            {unassigned.length > 0 && drivers.length > 0 && (
                <Panel title={`Needs a driver (${unassigned.length})`} subtitle="We suggest the least busy driver. Change it if you want, then assign."
                    actions={<button className="btn btn-primary btn-sm" onClick={assignAll} disabled={unassigned.some(b => !choiceFor(b.id))}>Assign all</button>}>
                    <div className="stack" style={{ gap: 0 }}>
                        {unassigned.map(b => {
                            const ctx = tripContext(db, homes, { bookingId: b.id });
                            const plan = planFor(db, b);
                            return (
                                <div key={b.id} className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ minWidth: 200, flex: 1 }}>
                                        <b style={{ fontWeight: 600 }}>{t12(b.time)} · {ctx.clientName}</b>
                                        <div className="tiny">{ctx.cleanerName} · leave {t12(plan.leaveAt)}, collect {t12(plan.pickupAt)}</div>
                                        {!b.cleanerId && <div className="tiny tone-bad">No cleaner on this booking yet</div>}
                                        {b.cleanerId && !ctx.home && <div className="tiny tone-warn">No accommodation set for {ctx.cleanerName}</div>}
                                    </div>
                                    <div className="toolbar">
                                        <select className="input-field" value={choiceFor(b.id)} onChange={e => setPicked(p => ({ ...p, [b.id]: e.target.value }))} aria-label={`Driver for ${ctx.clientName}`}>
                                            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.vehicle ? '' : ' (no vehicle)'}</option>)}
                                        </select>
                                        <button className="btn btn-primary btn-sm" onClick={() => assign(b.id, choiceFor(b.id))}>Assign</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            )}

            {lanes.map(lane => (
                <Panel key={lane.id} title={lane.name} subtitle={`${lane.vehicle || 'No vehicle assigned'} · ${lane.trips.length} ride${lane.trips.length === 1 ? '' : 's'}`}>
                    {lane.trips.length === 0 ? <Empty>No rides this day.</Empty> : (
                        <div className="stack" style={{ gap: 0 }}>
                            {[...lane.trips].sort((a, b) => a.leaveAt.localeCompare(b.leaveAt)).map(t => {
                                const ctx = tripContext(db, homes, t);
                                const st = tripStatus(t, now);
                                const moved = needsReplan(db, t, ctx.booking);
                                return (
                                    <div key={t.id} className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', ...(st.late ? { background: 'var(--color-danger-bg)', borderRadius: 12, padding: '0.75rem' } : {}) }}>
                                        <div style={{ minWidth: 220, flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <b style={{ fontWeight: 600 }}>{ctx.cleanerName} → {ctx.clientName}</b>
                                                {t.stage === 'returned' ? <Pill tone="good">Back home</Pill>
                                                    : st.late ? <Pill tone="bad"><AlertTriangle size={11} /> Late {lateText(st.minutesLate)}</Pill>
                                                    : t.stage === 'dropped' ? <Pill tone="warn">Cleaning</Pill>
                                                    : t.stage === 'scheduled' ? <Pill>Planned</Pill>
                                                    : <Pill tone="info">{STAGE_INFO[t.stage].label}</Pill>}
                                            </div>
                                            <div className="tiny" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                                                <span><Home size={11} /> {ctx.home?.name || 'No accommodation'}</span>
                                                <span><MapPin size={11} /> {ctx.clientAddress || 'No address'}</span>
                                            </div>
                                            <div className="tiny" style={{ marginTop: 4 }}>
                                                <Clock size={11} /> Leave {t12(t.leaveAt)} · At client {t12(t.arriveBy)} · Collect {t12(t.pickupAt)} · Home {t12(t.returnBy)}
                                            </div>
                                            {st.next && <div className="tiny" style={{ marginTop: 2 }}>Next: <b style={{ fontWeight: 600 }}>{STAGE_INFO[st.next].label}</b> by {t12(st.due)}</div>}
                                            <div style={{ display: 'flex', gap: 3, marginTop: 8, maxWidth: 260 }} aria-label={`Step ${stageIndex(t.stage)} of 6`}>
                                                {TRIP_STAGES.slice(1).map((s, i) => (
                                                    <span key={s} title={STAGE_INFO[s].label} style={{ flex: 1, height: 5, borderRadius: 3, background: i < stageIndex(t.stage) ? 'var(--color-success)' : 'var(--color-border)' }} />
                                                ))}
                                            </div>
                                            {moved && (
                                                <div className="tiny tone-warn" style={{ marginTop: 6 }}>
                                                    The booking time changed. <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }} onClick={() => ctx.booking && replan(db, t, ctx.booking)}><RefreshCw size={11} /> Update the ride times</button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="toolbar">
                                            <select className="input-field" value={t.driverId} onChange={e => ctx.booking && assignDriver(db, ctx.booking, e.target.value, actor, drivers.find(d => d.id === e.target.value)?.vehicleId)} aria-label="Change driver">
                                                {!drivers.some(d => d.id === t.driverId) && <option value={t.driverId}>Unknown driver</option>}
                                                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                            <button className="btn btn-secondary btn-sm" onClick={() => setHistory(t)} aria-label="Ride history"><History size={14} /></button>
                                            <button className="btn btn-secondary btn-sm" aria-label="Remove the driver" onClick={() => { if (confirm('Remove the driver from this booking? The ride and its steps are deleted.')) unassignDriver(t, actor); }}><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Panel>
            ))}

            <Modal open={!!history} onClose={() => setHistory(null)} title="Ride history" width={520}>
                {history && <TripHistory trip={allTrips.find(x => x.id === history.id) || history} />}
            </Modal>
        </div>
    );
};

const TripHistory: React.FC<{ trip: Trip }> = ({ trip }) => (
    <div className="stack" style={{ gap: 0 }}>
        {trip.events.length === 0 && <Empty>The driver has not started this ride yet.</Empty>}
        {trip.events.map((e, i) => (
            <div key={i} className="row">
                <div>
                    <b style={{ fontWeight: 600 }}>{STAGE_INFO[e.stage].label}</b>
                    <div className="tiny">{format(new Date(e.at), 'd MMM, h:mm a')}{e.by ? ` · ${e.by}` : ''}</div>
                </div>
                {e.lat !== undefined && e.lng !== undefined && (
                    <a className="btn btn-secondary btn-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}><ExternalLink size={13} /> Where</a>
                )}
            </div>
        ))}
    </div>
);
