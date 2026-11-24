/* -------------------------------------------------------------------------- */
/*  Drivers. Each booking gets one trip with two legs:                         */
/*    out:  accommodation -> client      (take the cleaner to the job)         */
/*    back: client -> accommodation      (bring the cleaner home)              */
/*  The driver moves the trip through seven steps, one big button at a time.  */
/*  Everything here is plain logic, so it is tested without a browser.        */
/* -------------------------------------------------------------------------- */

export const TRIP_STAGES = ['scheduled', 'to_pickup', 'onboard', 'dropped', 'to_return', 'return_onboard', 'returned'] as const;
export type TripStage = typeof TRIP_STAGES[number];

export interface TripEvent {
    stage: TripStage;
    /** ISO date and time the step was pressed */
    at: string;
    /** who pressed it */
    by?: string;
    /** where the phone was, when the driver allowed location */
    lat?: number; lng?: number;
}

export interface Trip {
    id: string; companyId: string; createdAt: string;
    bookingId: string;
    /** staff id of the driver */
    driverId: string;
    vehicleId?: string;
    /** yyyy-MM-dd, the booking date */
    date: string;
    /** HH:mm plan, worked out when the trip is created */
    leaveAt: string; arriveBy: string; pickupAt: string; returnBy: string;
    travelMinutes: number;
    stage: TripStage;
    events: TripEvent[];
    note?: string;
}

export type Leg = 'out' | 'back';

export const STAGE_INFO: Record<TripStage, { label: string; action: string; short: string; leg: Leg | 'none' | 'done' }> = {
    scheduled: { label: 'Scheduled', action: '', short: 'Planned', leg: 'none' },
    to_pickup: { label: 'Going to pick up', action: "I'm going to pick up", short: 'Going', leg: 'out' },
    onboard: { label: 'Cleaner in the car', action: 'Cleaner is in the car', short: 'In car', leg: 'out' },
    dropped: { label: 'Dropped at client', action: 'Dropped at the client', short: 'At client', leg: 'out' },
    to_return: { label: 'Going back to collect', action: "I'm going to collect", short: 'Collecting', leg: 'back' },
    return_onboard: { label: 'Cleaner back in the car', action: 'Cleaner is in the car', short: 'In car', leg: 'back' },
    returned: { label: 'Back home', action: 'Back at the accommodation', short: 'Done', leg: 'done' },
};

export const stageIndex = (s: TripStage) => TRIP_STAGES.indexOf(s);
export const nextStage = (s: TripStage): TripStage | null => TRIP_STAGES[stageIndex(s) + 1] ?? null;
export const prevStage = (s: TripStage): TripStage | null => (stageIndex(s) > 0 ? TRIP_STAGES[stageIndex(s) - 1] : null);
/** 0 to 1, for progress bars */
export const progressOf = (s: TripStage) => stageIndex(s) / (TRIP_STAGES.length - 1);

/* ------------------------------ times ------------------------------ */

const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
const fromMin = (n: number) => { const c = Math.max(0, Math.min(23 * 60 + 59, Math.round(n))); return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`; };
export const addMinutes = (t: string, m: number) => fromMin(toMin(t) + m);

/** The plan of a trip from the booking time, how long the service takes and how long the road takes. */
export function planTimes(bookingTime: string, serviceMinutes: number, travelMinutes: number) {
    const travel = Math.max(0, Math.round(travelMinutes || 0));
    const service = Math.max(0, Math.round(serviceMinutes || 0));
    return {
        leaveAt: addMinutes(bookingTime, -travel),
        arriveBy: fromMin(toMin(bookingTime)),
        pickupAt: addMinutes(bookingTime, service),
        returnBy: addMinutes(bookingTime, service + travel),
        travelMinutes: travel,
    };
}

/** The time a step should be done by. */
export function dueOf(t: Pick<Trip, 'leaveAt' | 'arriveBy' | 'pickupAt' | 'returnBy'>, stage: TripStage): string {
    switch (stage) {
        case 'to_pickup': return addMinutes(t.leaveAt, -10);
        case 'onboard': return t.leaveAt;
        case 'dropped': return t.arriveBy;
        case 'to_return': return addMinutes(t.pickupAt, -10);
        case 'return_onboard': return t.pickupAt;
        case 'returned': return t.returnBy;
        default: return t.leaveAt;
    }
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** A few minutes of grace before a step counts as late */
export const GRACE_MINUTES = 5;

/** What the driver must do next on this trip, by when, and whether it is late. */
export function tripStatus(t: Trip, now: Date) {
    const next = nextStage(t.stage);
    if (!next) return { next: null, due: '', late: false, minutesLate: 0, done: true };
    const due = dueOf(t, next);
    const today = localDay(now);
    let minutesLate = 0;
    if (t.date < today) minutesLate = 24 * 60;                         // a trip from an earlier day that never finished
    else if (t.date === today) minutesLate = Math.max(0, toMin(localTime(now)) - toMin(due));
    return { next, due, late: minutesLate > GRACE_MINUTES, minutesLate, done: false };
}

/** "12 min", "1h 05m", or "a day" for a ride left unfinished on an earlier day. */
export const lateText = (minutes: number) =>
    minutes >= 24 * 60 ? 'a day' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

/** Move a trip one step forward. Steps are never skipped. */
export function advance(t: Trip, by: string, at: Date, loc?: { lat: number; lng: number }): Trip {
    const next = nextStage(t.stage);
    if (!next) return t;
    const ev: TripEvent = { stage: next, at: at.toISOString(), by };
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) { ev.lat = Math.round(loc.lat * 1e5) / 1e5; ev.lng = Math.round(loc.lng * 1e5) / 1e5; }
    return { ...t, stage: next, events: [...(t.events || []), ev] };
}

/** The last step can be undone for a short while, for a button pressed by mistake. */
export const UNDO_SECONDS = 90;
export function canUndo(t: Trip, now: Date): boolean {
    const last = (t.events || [])[t.events.length - 1];
    return !!last && last.stage === t.stage && now.getTime() - new Date(last.at).getTime() <= UNDO_SECONDS * 1000;
}
export function undo(t: Trip): Trip {
    const prev = prevStage(t.stage);
    if (!prev) return t;
    return { ...t, stage: prev, events: (t.events || []).slice(0, -1) };
}

/* ------------------------------ the driver's day ------------------------------ */

export interface Stop { trip: Trip; leg: Leg; time: string; done: boolean; active: boolean }

/** Every leg of the day as a stop, in time order: take the cleaner at leaveAt, bring them back at pickupAt. */
export function stopsOf(trips: Trip[]): Stop[] {
    const out: Stop[] = [];
    trips.forEach(t => {
        const i = stageIndex(t.stage);
        out.push({ trip: t, leg: 'out', time: t.leaveAt, done: i >= stageIndex('dropped'), active: i < stageIndex('dropped') });
        out.push({ trip: t, leg: 'back', time: addMinutes(t.pickupAt, -10), done: i >= stageIndex('returned'), active: i >= stageIndex('dropped') && i < stageIndex('returned') });
    });
    return out.sort((a, b) => a.time.localeCompare(b.time) || (a.leg === b.leg ? 0 : a.leg === 'out' ? -1 : 1));
}

/** The one thing to do now: the earliest unfinished stop, preferring a trip already under way. */
export function currentStop(trips: Trip[]): Stop | null {
    const open = stopsOf(trips).filter(s => !s.done);
    const moving = open.find(s => s.active && s.trip.stage !== 'scheduled' && s.trip.stage !== 'dropped');
    return moving || open[0] || null;
}

/**
 * Cleaners leaving the same accommodation at about the same time ride together:
 * group the outbound legs by accommodation when they start within `windowMin` minutes of the group's first one.
 */
export function groupRides<T extends { trip: Trip; time: string }>(stops: T[], placeOf: (t: Trip) => string, windowMin = 15): T[][] {
    const groups: T[][] = [];
    [...stops].sort((a, b) => a.time.localeCompare(b.time)).forEach(s => {
        const place = placeOf(s.trip);
        const g = place ? groups.find(x => placeOf(x[0].trip) === place && Math.abs(toMin(x[0].time) - toMin(s.time)) <= windowMin) : undefined;
        if (g) g.push(s); else groups.push([s]);
    });
    return groups;
}

/** The driver with the fewest trips that day, among those who can drive (ties: the first in the list). */
export function suggestDriver(driverIds: string[], tripsThatDay: Pick<Trip, 'driverId'>[]): string | null {
    if (!driverIds.length) return null;
    const load = (id: string) => tripsThatDay.filter(t => t.driverId === id).length;
    return [...driverIds].sort((a, b) => load(a) - load(b))[0];
}

/** Google Maps directions to an address (or an exact map link when one is saved). */
export function mapsLink(address: string, mapUrl?: string): string {
    if (mapUrl && /^https:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]+)/i.test(mapUrl)) return mapUrl;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || '')}`;
}
